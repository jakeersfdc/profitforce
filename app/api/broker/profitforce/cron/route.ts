import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { processPendingAgainstQuotes, type PFAccount } from "@/lib/profitforceAccount";
import { fetchQuote } from "@/lib/stockUtils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron endpoint: scans all users with pending ProfitForce orders, fetches live
 * quotes for their symbols, and triggers any stops/targets/limits whose price
 * conditions are met — even when the user has the app closed.
 *
 * Auth: Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET`.
 * Configure the secret as an env var, and schedule this route in vercel.json.
 */
export async function GET(req: Request) {
  // Vercel Cron sends Authorization header with CRON_SECRET
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  let offset = 0;
  const limit = 100;
  let scanned = 0;
  let matched = 0;
  let totalFilled = 0;
  const errors: string[] = [];

  // Cache quotes per symbol across all users in this run (avoids re-fetching)
  const quoteCache: Record<string, number> = {};
  const getQuote = async (sym: string): Promise<number | null> => {
    if (quoteCache[sym] != null) return quoteCache[sym];
    try {
      const q = await fetchQuote(sym);
      if (q?.price > 0) { quoteCache[sym] = q.price; return q.price; }
    } catch {}
    return null;
  };

  while (true) {
    let page;
    try {
      page = await client.users.getUserList({ limit, offset });
    } catch (e) {
      errors.push(`getUserList@${offset}: ${String((e as Error).message)}`);
      break;
    }
    const users = page.data ?? [];
    if (users.length === 0) break;

    for (const u of users) {
      scanned += 1;
      const acct = ((u.privateMetadata ?? {}) as Record<string, unknown>).pfAccount as PFAccount | undefined;
      if (!acct?.pending || acct.pending.length === 0) continue;

      matched += 1;
      const symbols = Array.from(new Set(acct.pending.map(p => p.symbol)));
      const quotes: Record<string, number> = {};
      await Promise.all(symbols.map(async sym => {
        const p = await getQuote(sym);
        if (p != null) quotes[sym] = p;
      }));

      try {
        const res = await processPendingAgainstQuotes(u.id, quotes);
        totalFilled += res.filled.length;
      } catch (e) {
        errors.push(`${u.id}: ${String((e as Error).message)}`);
      }
    }

    if (users.length < limit) break;
    offset += users.length;
    if (offset > 10_000) break; // safety cap
  }

  return NextResponse.json({
    ok: true,
    scannedUsers: scanned,
    usersWithPendingOrders: matched,
    ordersFilled: totalFilled,
    quoteCacheSize: Object.keys(quoteCache).length,
    errors: errors.slice(0, 20),
    ranAt: new Date().toISOString(),
  });
}
