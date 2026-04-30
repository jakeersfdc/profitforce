/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { place } from "@/lib/oms/OrderRouter";
import type { BrokerProvider } from "@/lib/execution/brokers/types";
import { isBrokerProvider } from "@/lib/execution/brokers/registry";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.symbol || !body.side || !body.qty) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const provider: BrokerProvider | undefined =
    body.provider && isBrokerProvider(body.provider) ? body.provider : undefined;

  const res = await place({
    clerkId: userId,
    provider,
    symbol: String(body.symbol),
    exchange: body.exchange,
    side: body.side === "SELL" ? "SELL" : "BUY",
    qty: Number(body.qty),
    type: body.type ?? "MARKET",
    price: body.price != null ? Number(body.price) : undefined,
    triggerPrice: body.triggerPrice != null ? Number(body.triggerPrice) : undefined,
    product: body.product ?? "INTRADAY",
    validity: body.validity ?? "DAY",
    clientOrderId: body.clientOrderId,
    stopLoss: body.stopLoss != null ? Number(body.stopLoss) : undefined,
    isOption: !!body.isOption,
    isFuture: !!body.isFuture,
    strategyId: body.strategyId,
    signalId: body.signalId,
    simulatedLtp: body.simulatedLtp != null ? Number(body.simulatedLtp) : undefined,
    acknowledgeRisk: !!body.acknowledgeRisk,
    meta: body.meta,
  });

  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
