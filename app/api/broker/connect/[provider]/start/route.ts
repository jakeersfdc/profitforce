/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { randomBytes } from "crypto";
import { getBroker, isBrokerProvider } from "@/lib/execution/brokers/registry";
import { saveOAuthState } from "@/lib/execution/brokers/store";
import { vaultReady } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";

function originFrom(req: Request) {
  return process.env.NEXT_PUBLIC_APP_ORIGIN || new URL(req.url).origin;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!vaultReady()) {
    return NextResponse.json({ error: "vault_not_configured", hint: "Set ENCRYPTION_KEY (base64 32-byte) in env" }, { status: 500 });
  }

  const { provider } = await ctx.params;
  if (!isBrokerProvider(provider)) {
    return NextResponse.json({ error: "unknown_broker", provider }, { status: 400 });
  }
  const broker = getBroker(provider);

  const origin = originFrom(req);
  const redirectUri = `${origin}/api/broker/connect/${provider}/callback`;
  const url = new URL(req.url);
  const returnUrl = url.searchParams.get("returnUrl") || "/dashboard";

  if (broker.authMode.kind === "manual") {
    // Front-end will POST creds directly to /callback. Just hand back the field schema.
    return NextResponse.json({
      provider,
      mode: "manual",
      fields: broker.authMode.fields,
      submitUrl: `/api/broker/connect/${provider}/callback`,
    });
  }

  const state = randomBytes(24).toString("hex");
  await saveOAuthState({ state, clerkId: userId, provider, returnUrl });
  let loginUrl: string;
  try {
    loginUrl = broker.authMode.loginUrl({ clerkId: userId, state, redirectUri });
  } catch (e: any) {
    return NextResponse.json({ error: "broker_not_configured", details: String(e?.message || e) }, { status: 500 });
  }
  return NextResponse.json({ provider, mode: "oauth", loginUrl, state });
}
