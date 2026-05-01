/**
 * GET /api/strategy/snapshot?symbol=&interval=
 *
 * Lightweight, public-readable endpoint used by the chart modal:
 *  • Pulls history once.
 *  • Runs every registered strategy on the most-recent bar and returns the
 *    action + reason (no positions, no trades — pure verdict).
 *  • Returns the Gann fan projection for overlaying on the chart.
 *
 * Subscriber gating intentionally not applied: this only reveals data the
 * user already gets from /api/history + signal preview.
 */
import { NextResponse } from "next/server";
import { getHistorical } from "@/lib/stockUtils";
import { STRATEGIES } from "@/lib/strategy/strategies";
import { projectGannFan } from "@/lib/strategy/gann";
import { segmentFor } from "@/lib/risk/CostModel";
import type { Bar, StrategyContext, StrategySignal } from "@/lib/strategy/Strategy";

export const dynamic = "force-dynamic";

interface HistRow {
  date?: string | Date;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol");
    const interval = url.searchParams.get("interval") ?? "1d";
    if (!symbol) {
      return NextResponse.json({ error: "symbol_required" }, { status: 400 });
    }

    // GIFT NIFTY (^GNIFTY) is not on Yahoo — proxy to NIFTY 50 spot for strategy backtest
    // (GIFT NIFTY closely tracks NIFTY 50 plus overnight global cue, so signal direction transfers).
    const histSymbol = symbol === "^GNIFTY" ? "^NSEI" : symbol;
    const hist = (await getHistorical(histSymbol, undefined, undefined, interval)) as HistRow[];
    if (!Array.isArray(hist) || hist.length < 30) {
      return NextResponse.json({
        symbol,
        interval,
        bars: 0,
        gannFan: null,
        verdicts: [],
        error: "insufficient_history",
      });
    }

    const bars: Bar[] = hist
      .map((h) => ({
        date: typeof h.date === "string" ? h.date.slice(0, 10) : new Date(h.date as Date).toISOString().slice(0, 10),
        open: Number(h.open ?? 0),
        high: Number(h.high ?? 0),
        low: Number(h.low ?? 0),
        close: Number(h.close ?? 0),
        volume: Number(h.volume ?? 0),
      }))
      .filter((b) => Number.isFinite(b.close) && b.close > 0);

    const lastIdx = bars.length - 1;
    const segment = segmentFor(symbol, { intraday: false });

    const verdicts: Array<{
      id: string;
      name: string;
      action: StrategySignal["action"];
      stopLoss?: number;
      target?: number;
      confidence?: number;
      reason?: string;
    }> = [];

    for (const s of Object.values(STRATEGIES)) {
      const ctx: StrategyContext = {
        symbol,
        segment,
        capital: 100000,
        position: { qty: 0, avgPrice: 0 },
        bars,
        i: lastIdx,
      };
      let result: StrategySignal;
      try {
        result = s.step(ctx);
      } catch (e) {
        result = { action: "HOLD", reason: e instanceof Error ? e.message : "error" };
      }
      verdicts.push({
        id: s.id,
        name: s.name,
        action: result.action,
        stopLoss: result.stopLoss,
        target: result.target,
        confidence: result.confidence,
        reason: result.reason,
      });
    }

    const gannFan = projectGannFan(bars, 10);
    const lastBar = bars[lastIdx];
    return NextResponse.json({
      symbol,
      interval,
      bars: bars.length,
      lastClose: lastBar.close,
      lastDate: lastBar.date,
      verdicts,
      gannFan,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[strategy/snapshot]", msg);
    return NextResponse.json({ error: msg, verdicts: [], gannFan: null }, { status: 500 });
  }
}
