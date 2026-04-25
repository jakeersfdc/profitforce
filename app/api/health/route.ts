import { NextResponse } from "next/server";
import { checkEnv } from "@/lib/envCheck";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health  → liveness + dependency snapshot.
 *
 * Returns 200 always (so uptime monitors don't flap during minor outages),
 * but body.status reflects degraded subsystems. For a strict liveness check
 * use ?strict=1 — that returns 503 when DB is unreachable or required env is
 * missing.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const strict = url.searchParams.get("strict") === "1";

  const env = checkEnv();
  const startedAt = Date.now();

  // DB ping — only if DATABASE_URL is set
  let db: { ok: boolean; latencyMs?: number; error?: string } = { ok: false };
  if (process.env.DATABASE_URL) {
    try {
      const mod = await import("@/lib/db/index.js") as { pool?: { query: (sql: string) => Promise<unknown> } };
      const t0 = Date.now();
      await mod.pool?.query("SELECT 1");
      db = { ok: true, latencyMs: Date.now() - t0 };
    } catch (e) {
      db = { ok: false, error: String((e as Error)?.message ?? e) };
    }
  } else {
    db = { ok: false, error: "DATABASE_URL not set" };
  }

  const status = env.ok && db.ok ? "ok" : env.missingRequired.length > 0 || !db.ok ? "degraded" : "ok";
  const body = {
    status,
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "dev",
    region: process.env.VERCEL_REGION ?? "local",
    deployedAt: process.env.VERCEL_GIT_COMMIT_DATE ?? null,
    uptimeMs: process.uptime ? Math.floor(process.uptime() * 1000) : null,
    env: {
      ok: env.ok,
      missingRequired: env.missingRequired,
      missingOptional: env.missingOptional,
    },
    db,
    checkedInMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  };

  if (strict && status !== "ok") {
    return NextResponse.json(body, { status: 503 });
  }
  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
