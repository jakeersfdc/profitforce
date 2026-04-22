import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBrokerConfig, setBrokerConfig } from "@/lib/brokerCreds";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { broker } = await req.json();
  if (!["alpaca", "zerodha", "angel", "upstox", "dhan", "profitforce"].includes(broker)) {
    return NextResponse.json({ error: "Invalid broker" }, { status: 400 });
  }
  await setBrokerConfig(userId, { broker });
  return NextResponse.json({ ok: true, broker });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = await getBrokerConfig(userId);
  return NextResponse.json({ broker: cfg.broker || "alpaca" });
}
