/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unified order placement.
 *
 * POST body:
 * {
 *   provider?: "zerodha" | "upstox" | "angelone" | "dhan" | "profitforce",  // default = user's default broker
 *   symbol: string,
 *   side: "BUY" | "SELL",
 *   qty: number,
 *   type?: "MARKET" | "LIMIT" | "SL" | "SL-M",
 *   price?: number, triggerPrice?: number,
 *   product?: "INTRADAY" | "DELIVERY" | ...,
 *   exchange?: string,
 *   clientOrderId?: string,
 *   meta?: { instrumentKey?, securityId?, symbolToken? },
 *   acknowledgeRisk?: boolean   // required for live brokers
 * }
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBroker, isBrokerProvider } from "@/lib/execution/brokers/registry";
import { getConnection, getDefaultBroker } from "@/lib/execution/brokers/store";
import { guardLiveOrder, RISK_DISCLOSURE_TEXT } from "@/lib/execution/brokers/guard";
import type { PlaceOrderInput, BrokerProvider } from "@/lib/execution/brokers/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  let provider: BrokerProvider | null = body.provider && isBrokerProvider(body.provider) ? body.provider : null;
  if (!provider) provider = (await getDefaultBroker(userId)) || "profitforce";
  if (!isBrokerProvider(provider)) {
    return NextResponse.json({ error: "unknown_broker", provider }, { status: 400 });
  }

  const isLive = provider !== "profitforce";
  const guard = await guardLiveOrder({
    clerkId: userId,
    acknowledgeRisk: !!body.acknowledgeRisk,
    isLive,
  });
  if (!guard.ok) {
    return NextResponse.json({
      error: guard.reason,
      disclosure: RISK_DISCLOSURE_TEXT,
    }, { status: 403 });
  }

  // Validate input.
  const symbol = String(body.symbol || "").trim();
  const side = body.side === "SELL" ? "SELL" : body.side === "BUY" ? "BUY" : null;
  const qty = Number(body.qty);
  if (!symbol || !side || !Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "invalid_order_params" }, { status: 400 });
  }

  const input: PlaceOrderInput = {
    symbol, side, qty,
    type: body.type || "MARKET",
    price: body.price ?? null,
    triggerPrice: body.triggerPrice ?? null,
    product: body.product,
    validity: body.validity,
    exchange: body.exchange,
    clientOrderId: body.clientOrderId,
    meta: body.meta,
  };

  const broker = getBroker(provider);

  // Load credentials for live brokers; paper broker auto-provisions.
  let creds: Record<string, unknown>;
  if (provider === "profitforce") {
    creds = { clerkId: userId };
  } else {
    const conn = await getConnection(userId, provider);
    if (!conn || conn.status !== "active") {
      return NextResponse.json({ error: "broker_not_connected", provider }, { status: 412 });
    }
    if (conn.expiresAt && conn.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "broker_token_expired", provider }, { status: 412 });
    }
    creds = conn.credentials;
  }

  try {
    const result = await broker.placeOrder(creds, input);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, provider, status: "error", error: String(e?.message || e) }, { status: 500 });
  }
}
