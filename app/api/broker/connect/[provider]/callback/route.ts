/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getBroker, isBrokerProvider } from "@/lib/execution/brokers/registry";
import { consumeOAuthState, upsertConnection, setDefaultBroker, getDefaultBroker } from "@/lib/execution/brokers/store";
import { vaultReady } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";

function originFrom(req: Request) {
  return process.env.NEXT_PUBLIC_APP_ORIGIN || new URL(req.url).origin;
}

async function handle(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
  bodyQuery: Record<string, string>
) {
  if (!vaultReady()) {
    return NextResponse.json({ error: "vault_not_configured" }, { status: 500 });
  }
  const { provider } = await ctx.params;
  if (!isBrokerProvider(provider)) {
    return NextResponse.json({ error: "unknown_broker", provider }, { status: 400 });
  }
  const broker = getBroker(provider);

  // Resolve user. For OAuth callbacks the browser session carries Clerk;
  // for manual flow we still require an authenticated session.
  const { userId: clerkUserId } = await auth();
  let clerkId = clerkUserId;
  let returnUrl: string | null = "/dashboard";

  if (broker.authMode.kind === "oauth") {
    // Some brokers (e.g. Kite) don't round-trip the state parameter — for
    // those we fall back to the Clerk browser session as the user identity.
    const state = bodyQuery.state;
    if (state) {
      const consumed = await consumeOAuthState(state);
      if (!consumed) return NextResponse.json({ error: "invalid_or_expired_state" }, { status: 400 });
      if (consumed.provider !== provider) return NextResponse.json({ error: "state_mismatch" }, { status: 400 });
      clerkId = consumed.clerkId;
      returnUrl = consumed.returnUrl;
    } else if (!clerkId) {
      return NextResponse.json({ error: "missing_state_and_session" }, { status: 401 });
    }
  }

  if (!clerkId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        error: "database_not_configured",
        hint:
          "Postgres database is not provisioned. Add DATABASE_URL in Vercel → Settings → Environment Variables (e.g. provision Neon Postgres from the Vercel Marketplace) and run migrations.",
      },
      { status: 503 }
    );
  }

  const origin = originFrom(req);
  let result;
  try {
    result = await broker.finishConnect({
      clerkId,
      query: bodyQuery,
      redirectUri: `${origin}/api/broker/connect/${provider}/callback`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "connect_failed", provider, details: String(e?.message || e) },
      { status: 400 }
    );
  }

  await upsertConnection({
    clerkId,
    provider,
    accountId: result.accountId,
    accountName: result.accountName,
    credentials: result.credentials,
    expiresAt: result.expiresAt ?? null,
    scope: result.scope ?? null,
    metadata: result.metadata ?? {},
  });

  // First-connected broker becomes default.
  const existing = await getDefaultBroker(clerkId);
  if (!existing) await setDefaultBroker(clerkId, provider);

  if (broker.authMode.kind === "oauth") {
    // Redirect browser back to app.
    return NextResponse.redirect(new URL(returnUrl || "/dashboard", origin));
  }
  return NextResponse.json({ ok: true, provider, accountId: result.accountId, accountName: result.accountName });
}

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const url = new URL(req.url);
  const q: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { q[k] = v; });
  return handle(req, ctx, q);
}

export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(body || {})) q[k] = String(v);
  return handle(req, ctx, q);
}
