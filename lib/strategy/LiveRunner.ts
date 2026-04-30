/**
 * LiveRunner — same Strategy code path as Backtester, but emits orders
 * to the OMS instead of simulating fills.
 *
 * Usage (typically from a cron or signal-engine tick):
 *   const result = await runLiveBar({ clerkId, strategyId: "sma_5_20", symbol, bars, ... });
 *
 * If an order is placed, its id is returned. We do NOT poll for fills here —
 * the broker's webhook / poller is responsible for posting fills back via
 * PositionTracker.recordFill().
 */
import type { Bar, StrategyContext } from "./Strategy";
import { getStrategy } from "./strategies";
import { place } from "@/lib/oms/OrderRouter";
import { getRiskProfile } from "@/lib/risk/RiskEngine";
import { segmentFor } from "@/lib/risk/CostModel";
import { q } from "@/lib/oms/db";
import { appendAudit } from "@/lib/audit/AuditLog";
import type { BrokerProvider } from "@/lib/execution/brokers/types";
import { randomUUID } from "crypto";

export interface LiveRunInput {
  clerkId: string;
  strategyId: string;
  symbol: string;
  exchange?: string;
  bars: Bar[];                  // most recent at end; current = bars[bars.length-1]
  provider?: BrokerProvider;    // default = paper
  product?: "INTRADAY" | "DELIVERY";
  isOption?: boolean;
  isFuture?: boolean;
}

export interface LiveRunResult {
  ok: boolean;
  acted: boolean;
  signalId: string;
  signalAction: "BUY" | "SELL" | "EXIT" | "HOLD";
  orderId?: string;
  reason?: string;
  error?: string;
}

export async function runLiveBar(input: LiveRunInput): Promise<LiveRunResult> {
  const strategy = getStrategy(input.strategyId);
  if (!strategy) return { ok: false, acted: false, signalId: "", signalAction: "HOLD", error: "unknown_strategy" };
  if (input.bars.length < (strategy.warmup ?? 21)) {
    return { ok: false, acted: false, signalId: "", signalAction: "HOLD", error: "insufficient_bars" };
  }

  // Read current position so the strategy sees real state.
  const posRes = await q<{ net_qty: number; avg_price: string }>(
    `SELECT net_qty, avg_price::text FROM oms_positions WHERE clerk_id=$1 AND symbol=$2`,
    [input.clerkId, input.symbol]
  );
  const position = {
    qty: posRes.rows[0]?.net_qty ?? 0,
    avgPrice: Number(posRes.rows[0]?.avg_price ?? 0),
  };

  const profile = await getRiskProfile(input.clerkId);
  const intraday = input.product !== "DELIVERY";
  const segment = segmentFor(input.symbol, {
    isOption: input.isOption, isFuture: input.isFuture, intraday,
  });
  const ctx: StrategyContext = {
    symbol: input.symbol,
    segment,
    capital: profile.capital,
    position,
    bars: input.bars,
    i: input.bars.length - 1,
  };

  const sig = strategy.step(ctx);
  const signalId = `sig_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const lastBar = input.bars[input.bars.length - 1];

  await q(
    `INSERT INTO oms_signals (id, clerk_id, strategy_id, symbol, side, entry, stop, target, confidence, payload, acted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE)`,
    [
      signalId, input.clerkId, strategy.id, input.symbol,
      sig.action, lastBar.close, sig.stopLoss ?? null, sig.target ?? null,
      sig.confidence ?? null, sig as unknown as Record<string, unknown>,
    ]
  );
  await appendAudit({
    clerkId: input.clerkId, category: "SIGNAL", action: sig.action, refId: signalId,
    payload: { strategyId: strategy.id, symbol: input.symbol, ...sig },
  });

  if (sig.action === "HOLD") {
    return { ok: true, acted: false, signalId, signalAction: "HOLD", reason: sig.reason };
  }

  // Auto-execute only when the user has opted in.
  if (!profile.auto_execute) {
    return { ok: true, acted: false, signalId, signalAction: sig.action, reason: "auto_execute_off" };
  }

  // Translate signal → order
  const wantSide: "BUY" | "SELL" =
    sig.action === "EXIT"
      ? position.qty > 0 ? "SELL" : "BUY"
      : sig.action;
  const wantQty =
    sig.action === "EXIT"
      ? Math.abs(position.qty)
      : sizeFromRisk(profile.capital, profile.risk_per_trade_pct, lastBar.close, sig.stopLoss);
  if (wantQty <= 0) {
    return { ok: true, acted: false, signalId, signalAction: sig.action, reason: "qty_zero" };
  }

  const orderRes = await place({
    clerkId: input.clerkId,
    provider: input.provider,
    symbol: input.symbol,
    exchange: input.exchange,
    side: wantSide,
    qty: wantQty,
    type: "MARKET",
    product: intraday ? "INTRADAY" : "DELIVERY",
    stopLoss: sig.stopLoss,
    isOption: input.isOption,
    isFuture: input.isFuture,
    strategyId: strategy.id,
    signalId,
    simulatedLtp: lastBar.close,
    acknowledgeRisk: true, // strategy auto-execution implies user pre-acknowledged
  });

  await q(`UPDATE oms_signals SET acted=TRUE, order_id=$1 WHERE id=$2`, [orderRes.orderId, signalId]);

  return {
    ok: orderRes.ok,
    acted: true,
    signalId,
    signalAction: sig.action,
    orderId: orderRes.orderId,
    reason: orderRes.error,
  };
}

function sizeFromRisk(capital: number, riskPct: number, entry: number, stop?: number): number {
  if (!stop) {
    // No stop → cap notional at risk*20× (forces strategy to set a stop in real use)
    return Math.floor((capital * riskPct * 20) / entry);
  }
  const perShare = Math.abs(entry - stop) || 1e-6;
  return Math.floor((capital * riskPct) / perShare);
}
