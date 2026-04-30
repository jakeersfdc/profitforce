/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/strategy/backtest
 *   { strategyId | "all", symbol, startDate?, endDate?, startingCapital?, riskPerTrade? }
 *
 * GET /api/strategy/backtest → list strategies
 *
 * When strategyId === "all" (or omitted), every registered strategy runs in
 * parallel against the same bar series and the response also includes a
 * Gann fan projection for the chart.
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isSubscriber } from "@/lib/auth";
import { runBacktest, type BacktestSummary } from "@/lib/strategy/Backtester";
import { listStrategies, getStrategy, STRATEGIES } from "@/lib/strategy/strategies";
import { projectGannFan } from "@/lib/strategy/gann";
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
  if (!body?.symbol) {
    return NextResponse.json({ error: "symbol_required" }, { status: 400 });
  }
  const strategyId = body.strategyId ? String(body.strategyId) : "all";

  const hist = await getHistorical(String(body.symbol), body.startDate, body.endDate);
  if (!Array.isArray(hist) || hist.length < 30) {
    return NextResponse.json({ error: "insufficient_history", count: Array.isArray(hist) ? hist.length : 0 }, { status: 400 });
  }
  const bars = hist
    .map((h: any) => ({
      date: typeof h.date === "string" ? h.date.slice(0, 10) : new Date(h.date).toISOString().slice(0, 10),
      open: Number(h.open), high: Number(h.high), low: Number(h.low), close: Number(h.close),
      volume: Number(h.volume ?? 0),
    }))
    .filter((b) => Number.isFinite(b.close));

  const startingCapital = body.startingCapital ? Number(body.startingCapital) : undefined;
  const riskPerTrade = body.riskPerTrade ? Number(body.riskPerTrade) : undefined;
  const intraday = !!body.intraday;
  const symbol = String(body.symbol);

  const gannFan = projectGannFan(bars, 10);
  const priceSeries = bars.slice(-180).map((b) => ({
    date: b.date, open: b.open, high: b.high, low: b.low, close: b.close,
  }));

  if (strategyId === "all") {
    const results: Record<string, BacktestSummary> = {};
    for (const s of Object.values(STRATEGIES)) {
      results[s.id] = runBacktest({
        symbol, bars, strategy: s, startingCapital, riskPerTrade, intraday,
      });
    }
    const ensemble = buildEnsemble(results, startingCapital ?? 100000);
    return NextResponse.json({
      mode: "all",
      symbol,
      bars: priceSeries,
      gannFan,
      results,
      ensemble,
    });
  }

  const strategy = getStrategy(strategyId);
  if (!strategy) return NextResponse.json({ error: "unknown_strategy" }, { status: 404 });

  const result = runBacktest({
    symbol, bars, strategy, startingCapital, riskPerTrade, intraday,
  });
  return NextResponse.json({
    mode: "single",
    symbol,
    bars: priceSeries,
    gannFan,
    result,
  });
}

/**
 * Equal-capital ensemble: each strategy runs on its own slice of capital,
 * results combined. This is conservative — the alternative (vote-based
 * single execution path) loses information from non-correlated edges.
 */
function buildEnsemble(
  results: Record<string, BacktestSummary>,
  startingCapital: number
): {
  startingCapital: number;
  endingCapital: number;
  totalNetPnl: number;
  roiPct: number;
  closedTrades: number;
  winRate: number;
  avgSharpe: number | null;
  perStrategyAllocation: Record<string, number>;
} {
  const ids = Object.keys(results);
  const slice = startingCapital / Math.max(1, ids.length);
  let endCap = 0;
  let totalNet = 0;
  let totalTrades = 0;
  let totalWins = 0;
  let sharpeSum = 0;
  let sharpeCount = 0;
  const allocation: Record<string, number> = {};
  for (const id of ids) {
    const r = results[id];
    // scale results to the ensemble slice
    const scale = slice / r.startingCapital;
    const scaledNet = r.totalNetPnl * scale;
    endCap += slice + scaledNet;
    totalNet += scaledNet;
    totalTrades += r.closedTrades;
    totalWins += r.wins;
    if (typeof r.sharpe === "number") {
      sharpeSum += r.sharpe;
      sharpeCount += 1;
    }
    allocation[id] = round(slice);
  }
  return {
    startingCapital: round(startingCapital),
    endingCapital: round(endCap),
    totalNetPnl: round(totalNet),
    roiPct: round(((endCap - startingCapital) / startingCapital) * 100),
    closedTrades: totalTrades,
    winRate: totalTrades ? round((totalWins / totalTrades) * 100) : 0,
    avgSharpe: sharpeCount ? round(sharpeSum / sharpeCount) : null,
    perStrategyAllocation: allocation,
  };
}

function round(n: number): number { return Number(n.toFixed(2)); }
