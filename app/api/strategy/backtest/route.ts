/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/strategy/backtest
 *   { strategyId, symbol, startDate?, endDate?, startingCapital?, riskPerTrade? }
 *
 * GET /api/strategy/backtest → list strategies
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isSubscriber } from "@/lib/auth";
import { runBacktest } from "@/lib/strategy/Backtester";
import { listStrategies, getStrategy } from "@/lib/strategy/strategies";
import { getHistorical } from "@/lib/stockUtils";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ strategies: listStrategies() });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (process.env.ALLOW_PUBLIC_BACKTEST !== "1") {
    const ok = await isSubscriber(userId).catch(() => false);
    if (!ok) return NextResponse.json({ error: "subscription required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as any;
  if (!body?.symbol || !body?.strategyId) {
    return NextResponse.json({ error: "symbol_and_strategyId_required" }, { status: 400 });
  }
  const strategy = getStrategy(String(body.strategyId));
  if (!strategy) return NextResponse.json({ error: "unknown_strategy" }, { status: 404 });

  const hist = await getHistorical(String(body.symbol), body.startDate, body.endDate);
  if (!Array.isArray(hist) || hist.length < 30) {
    return NextResponse.json({ error: "insufficient_history", count: Array.isArray(hist) ? hist.length : 0 }, { status: 400 });
  }
  const bars = hist.map((h: any) => ({
    date: typeof h.date === "string" ? h.date.slice(0, 10) : new Date(h.date).toISOString().slice(0, 10),
    open: Number(h.open), high: Number(h.high), low: Number(h.low), close: Number(h.close),
    volume: Number(h.volume ?? 0),
  })).filter((b) => Number.isFinite(b.close));

  const result = runBacktest({
    symbol: String(body.symbol),
    bars,
    strategy,
    startingCapital: body.startingCapital ? Number(body.startingCapital) : undefined,
    riskPerTrade: body.riskPerTrade ? Number(body.riskPerTrade) : undefined,
    intraday: !!body.intraday,
  });
  return NextResponse.json({ result });
}
