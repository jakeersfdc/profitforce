import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPFAccount, computeEquity, processPendingAgainstQuotes, resetPFAccount, addFundsPF } from "@/lib/profitforceAccount";
import { fetchQuote } from "@/lib/stockUtils";

export const dynamic = "force-dynamic";

// GET → account + MTM snapshot.
// Optional ?symbols=AAA,BBB to override which symbols to price (otherwise just positions).
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const extra = (url.searchParams.get("symbols") ?? "").split(",").map(s => s.trim()).filter(Boolean);

  const acct0 = await getPFAccount(userId);
  const symbols = Array.from(new Set([
    ...Object.keys(acct0.positions ?? {}),
    ...(acct0.pending ?? []).map(p => p.symbol),
    ...extra,
  ]));

  const quotes: Record<string, number> = {};
  await Promise.all(symbols.map(async sym => {
    try {
      const q = await fetchQuote(sym);
      if (q?.price > 0) quotes[sym] = q.price;
    } catch {}
  }));

  // Match pending orders against live quotes (fills SL/target/limit as needed)
  const { filled, account } = await processPendingAgainstQuotes(userId, quotes);
  const snap = computeEquity(account, quotes);

  return NextResponse.json({
    broker: "profitforce",
    account,
    equity: snap,
    quotes,
    filledThisCycle: filled,
  });
}

// DELETE → reset account to starting capital
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await resetPFAccount(userId);
  return NextResponse.json({ ok: true, account });
}

// PATCH → add (or subtract via negative) virtual funds
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount)) return NextResponse.json({ error: "amount required" }, { status: 400 });
  const account = await addFundsPF(userId, amount);
  return NextResponse.json({ ok: true, account });
}
