/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBroker, isBrokerProvider } from "@/lib/execution/brokers/registry";
import { getConnection, getDefaultBroker } from "@/lib/execution/brokers/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  let provider = url.searchParams.get("provider");
  if (!provider || !isBrokerProvider(provider)) provider = (await getDefaultBroker(userId)) || "profitforce";
  if (!isBrokerProvider(provider)) return NextResponse.json({ error: "unknown_broker" }, { status: 400 });

  const broker = getBroker(provider);
  let creds: Record<string, unknown>;
  if (provider === "profitforce") {
    creds = { clerkId: userId };
  } else {
    const conn = await getConnection(userId, provider);
    if (!conn || conn.status !== "active") return NextResponse.json({ error: "broker_not_connected" }, { status: 412 });
    creds = conn.credentials;
  }
  if (!broker.getHoldings) return NextResponse.json({ provider, holdings: [] });
  try {
    const holdings = await broker.getHoldings(creds);
    return NextResponse.json({ provider, holdings });
  } catch (e: any) {
    return NextResponse.json({ provider, error: String(e?.message || e) }, { status: 502 });
  }
}
