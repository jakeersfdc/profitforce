/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OrderRouter — single funnel for every order in the system.
 *
 *   place(input) → RiskEngine → broker.placeOrder → audit → DB row
 *
 * Behaviour:
 *   • If provider="profitforce" → paper-fill at last price (instant).
 *   • Otherwise loads encrypted creds and calls the real broker adapter.
 *   • All accepted orders are persisted to oms_orders before submission so we
 *     have an audit trail even if the broker call dies.
 *   • Idempotency: pass a clientOrderId; duplicates return the existing row.
 */
import { randomUUID } from "crypto";
import { q } from "@/lib/oms/db";
import { evaluate as evaluateRisk } from "@/lib/risk/RiskEngine";
import { appendAudit } from "@/lib/audit/AuditLog";
import { computeCosts, segmentFor, applySlippage } from "@/lib/risk/CostModel";
import { recordFill } from "@/lib/oms/PositionTracker";
import { getBroker, isBrokerProvider } from "@/lib/execution/brokers/registry";
import { getConnection, getDefaultBroker } from "@/lib/execution/brokers/store";
import type { BrokerProvider, PlaceOrderInput, PlaceOrderResult } from "@/lib/execution/brokers/types";

export interface RouterInput {
  clerkId: string;
  provider?: BrokerProvider;
  symbol: string;
  exchange?: string;
  side: "BUY" | "SELL";
  qty: number;
  type?: "MARKET" | "LIMIT" | "SL" | "SL-M";
  price?: number;
  triggerPrice?: number;
  product?: "INTRADAY" | "DELIVERY" | "MARGIN" | "MTF" | "CO" | "BO";
  validity?: "DAY" | "IOC";
  clientOrderId?: string;
  stopLoss?: number;
  isOption?: boolean;
  isFuture?: boolean;
  strategyId?: string;
  signalId?: string;
  acknowledgeRisk?: boolean;
  /** For paper / simulator only — supplies the LTP used to simulate the fill. */
  simulatedLtp?: number;
  meta?: PlaceOrderInput["meta"];
}

export interface RouterResult {
  ok: boolean;
  orderId: string;
  status: string;
  brokerOrderId?: string;
  paper: boolean;
  error?: string;
  cost?: number;
}

export async function place(input: RouterInput): Promise<RouterResult> {
  // Idempotency
  const orderId = input.clientOrderId || `ord_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const existing = await q<{ id: string; status: string; broker_order_id: string | null; paper: boolean }>(
    "SELECT id, status, broker_order_id, paper FROM oms_orders WHERE id = $1",
    [orderId]
  );
  if (existing.rows[0]) {
    const r = existing.rows[0];
    return { ok: true, orderId: r.id, status: r.status, brokerOrderId: r.broker_order_id ?? undefined, paper: r.paper };
  }

  // Default provider
  let provider: BrokerProvider | null = input.provider && isBrokerProvider(input.provider) ? input.provider : null;
  if (!provider) provider = (await getDefaultBroker(input.clerkId)) || "profitforce";
  const isPaper = provider === "profitforce";

  // Risk gate
  const decision = await evaluateRisk({
    clerkId: input.clerkId,
    symbol: input.symbol,
    side: input.side,
    qty: input.qty,
    price: input.price ?? input.simulatedLtp ?? 0,
    stopLoss: input.stopLoss,
    isOption: input.isOption,
    isFuture: input.isFuture,
    intraday: input.product === "INTRADAY",
  });
  if (!decision.allow) {
    await persistRejected(orderId, input, provider, isPaper, decision.reason || "risk_blocked");
    return {
      ok: false,
      orderId,
      status: "REJECTED",
      paper: isPaper,
      error: decision.reason,
    };
  }

  // Persist as PENDING
  await q(
    `INSERT INTO oms_orders (id, clerk_id, provider, symbol, exchange, side, qty, type,
        product, validity, price, trigger_price, status, strategy_id, signal_id, paper)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'PENDING',$13,$14,$15)`,
    [
      orderId, input.clerkId, provider, input.symbol, input.exchange ?? null, input.side, input.qty,
      input.type ?? "MARKET", input.product ?? "INTRADAY", input.validity ?? "DAY",
      input.price ?? null, input.triggerPrice ?? null, input.strategyId ?? null,
      input.signalId ?? null, isPaper,
    ]
  );
  await q(`INSERT INTO oms_order_events (order_id, status, detail) VALUES ($1,'PENDING','accepted by router')`, [orderId]);
  await appendAudit({
    clerkId: input.clerkId, category: "ORDER", action: "create", refId: orderId,
    payload: { provider, paper: isPaper, ...stripCreds(input) },
  });

  // Paper-fill path: simulate immediate fill with slippage + costs
  if (isPaper) {
    const ltp = input.simulatedLtp ?? input.price ?? 0;
    if (ltp <= 0) {
      await markRejected(orderId, "no_simulated_ltp");
      return { ok: false, orderId, status: "REJECTED", paper: true, error: "no_simulated_ltp" };
    }
    const fillPrice = applySlippage({ price: ltp, side: input.side });
    const seg = segmentFor(input.symbol, {
      isOption: input.isOption, isFuture: input.isFuture,
      intraday: input.product === "INTRADAY",
    });
    const cost = computeCosts({ segment: seg, side: input.side, qty: input.qty, price: fillPrice });
    await q(`UPDATE oms_orders SET status='SUBMITTED', updated_at=NOW() WHERE id=$1`, [orderId]);
    await recordFill({
      clerkId: input.clerkId, orderId, symbol: input.symbol, exchange: input.exchange,
      side: input.side, qty: input.qty, price: fillPrice, fees: cost.total,
      feeBreakdown: cost as unknown as Record<string, number>,
    });
    await appendAudit({
      clerkId: input.clerkId, category: "FILL", action: "paper_fill", refId: orderId,
      payload: { fillPrice, qty: input.qty, cost },
    });
    return { ok: true, orderId, status: "FILLED", paper: true, cost: cost.total };
  }

  // Live path: load creds, call broker
  const conn = await getConnection(input.clerkId, provider);
  if (!conn || conn.status !== "active") {
    await markRejected(orderId, "broker_not_connected");
    return { ok: false, orderId, status: "REJECTED", paper: false, error: "broker_not_connected" };
  }
  const broker = getBroker(provider);

  let result: PlaceOrderResult;
  try {
    result = await broker.placeOrder(conn.credentials, {
      symbol: input.symbol,
      exchange: input.exchange,
      side: input.side,
      qty: input.qty,
      type: input.type ?? "MARKET",
      price: input.price ?? null,
      triggerPrice: input.triggerPrice ?? null,
      product: input.product ?? "INTRADAY",
      validity: input.validity ?? "DAY",
      clientOrderId: orderId,
      meta: input.meta,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await markRejected(orderId, `broker_error: ${msg}`);
    return { ok: false, orderId, status: "ERROR", paper: false, error: msg };
  }

  if (!result.ok) {
    await markRejected(orderId, result.error || result.status);
    return { ok: false, orderId, status: result.status.toUpperCase(), paper: false, error: result.error };
  }

  const newStatus =
    result.status === "filled" ? "FILLED" :
    result.status === "rejected" ? "REJECTED" :
    result.status === "submitted" ? "SUBMITTED" :
    result.status === "pending" ? "OPEN" : "ERROR";

  await q(
    `UPDATE oms_orders SET broker_order_id=$1, status=$2, updated_at=NOW() WHERE id=$3`,
    [result.brokerOrderId ?? null, newStatus, orderId]
  );
  await q(`INSERT INTO oms_order_events (order_id, status, detail) VALUES ($1,$2,$3)`, [
    orderId, newStatus, `broker:${provider}`,
  ]);
  await appendAudit({
    clerkId: input.clerkId, category: "ORDER", action: "submitted", refId: orderId,
    payload: { provider, brokerOrderId: result.brokerOrderId, status: newStatus },
  });

  return {
    ok: true,
    orderId,
    status: newStatus,
    brokerOrderId: result.brokerOrderId,
    paper: false,
  };
}

async function persistRejected(
  orderId: string, input: RouterInput, provider: BrokerProvider, isPaper: boolean, reason: string
) {
  await q(
    `INSERT INTO oms_orders (id, clerk_id, provider, symbol, exchange, side, qty, type,
        product, validity, price, status, reject_reason, strategy_id, signal_id, paper)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'REJECTED',$12,$13,$14,$15)
     ON CONFLICT (id) DO NOTHING`,
    [
      orderId, input.clerkId, provider, input.symbol, input.exchange ?? null, input.side, input.qty,
      input.type ?? "MARKET", input.product ?? "INTRADAY", input.validity ?? "DAY",
      input.price ?? null, reason, input.strategyId ?? null, input.signalId ?? null, isPaper,
    ]
  );
}

async function markRejected(orderId: string, reason: string) {
  await q(
    `UPDATE oms_orders SET status='REJECTED', reject_reason=$1, updated_at=NOW(), closed_at=NOW() WHERE id=$2`,
    [reason, orderId]
  );
  await q(`INSERT INTO oms_order_events (order_id, status, detail) VALUES ($1,'REJECTED',$2)`, [orderId, reason]);
}

function stripCreds(input: RouterInput): RouterInput {
  // Defensive — this object never holds creds, but never log future additions either.
  const clone: any = { ...input };
  delete clone.credentials;
  delete clone.apiKey;
  delete clone.accessToken;
  return clone;
}
