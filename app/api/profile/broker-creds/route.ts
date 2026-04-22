import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBrokerConfig, setBrokerConfig, redactConfig, BrokerConfig } from "@/lib/brokerCreds";

// GET → returns redacted (masked) summary — never raw secrets.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = await getBrokerConfig(userId);
  return NextResponse.json(redactConfig(cfg));
}

// POST → save creds for a specific broker. Body: { broker: "zerodha"|"angel"|"alpaca", creds: {...} }
// Empty string values are treated as "leave unchanged" to allow partial updates.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { broker, creds } = await req.json();
  if (!["zerodha", "angel", "alpaca", "upstox", "dhan"].includes(broker)) {
    return NextResponse.json({ error: "Invalid broker" }, { status: 400 });
  }
  if (!creds || typeof creds !== "object") {
    return NextResponse.json({ error: "Missing creds" }, { status: 400 });
  }
  // Filter out empty strings so user can leave a field blank to keep the existing value
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (typeof v === "string" && v.trim() !== "") clean[k] = v.trim();
  }
  const patch: Partial<BrokerConfig> = { [broker]: clean } as Partial<BrokerConfig>;
  const merged = await setBrokerConfig(userId, patch);
  return NextResponse.json({ ok: true, ...redactConfig(merged) });
}

// DELETE → wipe creds for a broker. Body: { broker }
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { broker } = await req.json();
  if (!["zerodha", "angel", "alpaca", "upstox", "dhan"].includes(broker)) {
    return NextResponse.json({ error: "Invalid broker" }, { status: 400 });
  }
  const current = await getBrokerConfig(userId);
  const next: BrokerConfig = { ...current };
  if (broker === "zerodha") next.zerodha = {};
  if (broker === "angel") next.angel = {};
  if (broker === "alpaca") next.alpaca = {};
  if (broker === "upstox") next.upstox = {};
  if (broker === "dhan") next.dhan = {};
  await setBrokerConfig(userId, next);
  return NextResponse.json({ ok: true });
}
