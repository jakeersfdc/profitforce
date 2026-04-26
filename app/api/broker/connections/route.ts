import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { listConnections, getDefaultBroker, setDefaultBroker } from "@/lib/execution/brokers/store";
import { listBrokers, isBrokerProvider } from "@/lib/execution/brokers/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [connections, defaultBroker] = await Promise.all([
    listConnections(userId).catch(() => []),
    getDefaultBroker(userId).catch(() => null),
  ]);
  return NextResponse.json({
    available: listBrokers(),
    connections,
    defaultBroker,
  });
}

export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const provider = String(body?.defaultBroker || "");
  if (!isBrokerProvider(provider)) return NextResponse.json({ error: "unknown_broker" }, { status: 400 });
  await setDefaultBroker(userId, provider);
  return NextResponse.json({ ok: true, defaultBroker: provider });
}
