/**
 * Bridge: SignalEngine.Signal → OMS order.
 *
 * Use when the existing SignalEngine emits a Signal and we want to act on it
 * automatically (subject to the user's risk profile + kill-switch).
 *
 *   - HOLD / NEUTRAL → no-op
 *   - BUY / SELL → market order with stop-loss carried through to RiskEngine
 *   - EXIT → flatten current position
 *
 * If the user's profile has auto_execute=false this still records the signal
 * in oms_signals (audit trail) but does not place any order.
 */
import { randomUUID } from "crypto";
import type { Signal } from "./SignalEngine";
import { q } from "@/lib/oms/db";
import { appendAudit } from "@/lib/audit/AuditLog";
import { getRiskProfile } from "@/lib/risk/RiskEngine";
import { place } from "@/lib/oms/OrderRouter";
import type { BrokerProvider } from "@/lib/execution/brokers/types";

export interface AutoExecOptions {
  clerkId: string;
  signal: Signal;
  provider?: BrokerProvider;       // default = paper (profitforce)
  product?: "INTRADAY" | "DELIVERY";
  /** Caller may override; otherwise computed from risk profile. */
  qty?: number;
  /** If true, treat as F&O option (strike from fnoRecommendation). */
  useFno?: boolean;
}

export interface AutoExecResult {
  ok: boolean;
  acted: boolean;
  signalId: string;
  orderId?: string;
  reason?: string;
  error?: string;
}

export async function autoExecuteSignal(opts: AutoExecOptions): Promise<AutoExecResult> {
  const { clerkId, signal } = opts;
  const signalId = `sig_${Date.now()}_${randomUUID().slice(0, 6)}`;

  // Persist signal regardless of whether we act
  await q(
    `INSERT INTO oms_signals (id, clerk_id, strategy_id, symbol, side, entry, stop, target, confidence, payload, acted)
     VALUES ($1,$2,'signal_engine',$3,$4,$5,$6,$7,$8,$9,FALSE)`,
    [
      signalId, clerkId, signal.symbol, signal.signal,
      signal.entryPrice ?? 0,
      signal.stopLoss ?? null,
      signal.targetPrice ?? null,
      signal.confidence ?? null,
      signal as unknown as Record<string, unknown>,
    ]
  );
  await appendAudit({
    clerkId, category: "SIGNAL", action: signal.signal, refId: signalId,
    payload: { symbol: signal.symbol, action: signal.signal, confidence: signal.confidence },
  });

  if (signal.signal === "HOLD") {
    return { ok: true, acted: false, signalId, reason: "hold" };
  }

  const profile = await getRiskProfile(clerkId);
  if (!profile.auto_execute) {
    return { ok: true, acted: false, signalId, reason: "auto_execute_off" };
  }

  // Compute side and qty
  let side: "BUY" | "SELL";
  let symbol = signal.symbol;
  let isOption = false;

  if (opts.useFno && signal.fnoRecommendation && signal.fnoRecommendation.type) {
    isOption = true;
    side = signal.fnoRecommendation.type === "BUY_PUT" ? "BUY" : "BUY"; // long premium for both
    // The actual option tradingsymbol must be supplied by caller (broker-specific format).
    // We fall back to a synthetic display string to log the intent.
    symbol = `${signal.symbol}__${signal.fnoRecommendation.strike}${signal.fnoRecommendation.type === "BUY_PUT" ? "PE" : "CE"}`;
  } else if (signal.signal === "EXIT") {
    const posRow = await q<{ net_qty: number }>(
      `SELECT net_qty FROM oms_positions WHERE clerk_id=$1 AND symbol=$2`,
      [clerkId, signal.symbol]
    );
    const netQty = posRow.rows[0]?.net_qty ?? 0;
    if (netQty === 0) {
      return { ok: true, acted: false, signalId, reason: "flat_no_exit_needed" };
    }
    side = netQty > 0 ? "SELL" : "BUY";
  } else {
    side = signal.signal === "BUY" ? "BUY" : "SELL";
  }

  const entry = Number(signal.entryPrice ?? 0);
  const stop = signal.stopLoss != null ? Number(signal.stopLoss) : undefined;
  const qty = opts.qty ?? sizeFromRisk(profile.capital, profile.risk_per_trade_pct, entry, stop);
  if (qty <= 0) return { ok: true, acted: false, signalId, reason: "qty_zero" };

  const orderRes = await place({
    clerkId,
    provider: opts.provider,
    symbol,
    side,
    qty,
    type: "MARKET",
    product: opts.product ?? "INTRADAY",
    stopLoss: stop,
    isOption,
    strategyId: "signal_engine",
    signalId,
    simulatedLtp: entry || undefined,
    acknowledgeRisk: true,
  });

  await q(`UPDATE oms_signals SET acted=TRUE, order_id=$1 WHERE id=$2`, [orderRes.orderId, signalId]);
  return {
    ok: orderRes.ok,
    acted: true,
    signalId,
    orderId: orderRes.orderId,
    error: orderRes.error,
  };
}

function sizeFromRisk(capital: number, riskPct: number, entry: number, stop?: number): number {
  if (!entry || entry <= 0) return 0;
  if (!stop) return Math.floor((capital * riskPct * 20) / entry);
  const perShare = Math.abs(entry - stop) || 1e-6;
  return Math.floor((capital * riskPct) / perShare);
}
