import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isBrokerProvider } from "@/lib/execution/brokers/registry";
import { disconnect } from "@/lib/execution/brokers/store";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { provider } = await ctx.params;
  if (!isBrokerProvider(provider)) return NextResponse.json({ error: "unknown_broker" }, { status: 400 });
  await disconnect(userId, provider);
  return NextResponse.json({ ok: true });
}
