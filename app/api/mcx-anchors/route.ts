import { NextResponse } from "next/server";

/**
 * MCX anchor endpoint.
 *
 * The app has no direct MCX data feed. To make commodity prices ACCURATE,
 * an operator (or a scheduled job with broker-API access) should POST
 * current MCX LTPs here. Reads are public and cached aggressively.
 *
 * POST  /api/mcx-anchors  { anchors: { GOLD:{inr:150218, usd:3305}, ... } }
 *   Header: x-admin-key must match ADMIN_API_KEY
 *
 * GET   /api/mcx-anchors
 *   → { anchors, updatedAt }
 *
 * The anchors are held in-process. For multi-instance deployments, wire
 * them into the existing Postgres layer (lib/db/*).
 */

type Anchor = { inr: number; usd: number };
type AnchorsById = Partial<Record<"GOLD" | "SILVER" | "CRUDE" | "BRENT" | "NATGAS" | "COPPER", Anchor>>;

// Module-level cache (survives across requests on the same server instance).
const g = globalThis as unknown as { __mcxAnchors?: { anchors: AnchorsById; updatedAt: string } };
if (!g.__mcxAnchors) {
  // Bootstrap from env vars so a fresh instance isn't completely empty.
  const bootstrap: AnchorsById = {};
  const pairs: Array<[keyof AnchorsById, string, string]> = [
    ["GOLD",   "NEXT_PUBLIC_MCX_GOLD_ANCHOR",   "NEXT_PUBLIC_MCX_ANCHOR_USD_GOLD"],
    ["SILVER", "NEXT_PUBLIC_MCX_SILVER_ANCHOR", "NEXT_PUBLIC_MCX_ANCHOR_USD_SILVER"],
    ["CRUDE",  "NEXT_PUBLIC_MCX_CRUDE_ANCHOR",  "NEXT_PUBLIC_MCX_ANCHOR_USD_CRUDE"],
    ["BRENT",  "NEXT_PUBLIC_MCX_BRENT_ANCHOR",  "NEXT_PUBLIC_MCX_ANCHOR_USD_BRENT"],
    ["NATGAS", "NEXT_PUBLIC_MCX_NATGAS_ANCHOR", "NEXT_PUBLIC_MCX_ANCHOR_USD_NATGAS"],
    ["COPPER", "NEXT_PUBLIC_MCX_COPPER_ANCHOR", "NEXT_PUBLIC_MCX_ANCHOR_USD_COPPER"],
  ];
  for (const [id, inrKey, usdKey] of pairs) {
    const inr = Number(process.env[inrKey]);
    const usd = Number(process.env[usdKey]);
    if (Number.isFinite(inr) && inr > 0 && Number.isFinite(usd) && usd > 0) {
      bootstrap[id] = { inr, usd };
    }
  }
  g.__mcxAnchors = { anchors: bootstrap, updatedAt: new Date().toISOString() };
}

export async function GET() {
  return NextResponse.json(g.__mcxAnchors, {
    headers: {
      // Browser cache: 30s. Operators updating anchors want near-realtime.
      "Cache-Control": "public, max-age=30, s-maxage=30",
    },
  });
}

export async function POST(req: Request) {
  const adminKey = process.env.ADMIN_API_KEY;
  const incoming = req.headers.get("x-admin-key");
  if (!adminKey || incoming !== adminKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { anchors?: AnchorsById };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const incomingAnchors = body?.anchors ?? {};
  const merged: AnchorsById = { ...(g.__mcxAnchors?.anchors ?? {}) };
  for (const [id, a] of Object.entries(incomingAnchors)) {
    if (!a || typeof a !== "object") continue;
    const inr = Number(a.inr);
    const usd = Number(a.usd);
    if (Number.isFinite(inr) && inr > 0 && Number.isFinite(usd) && usd > 0) {
      merged[id as keyof AnchorsById] = { inr, usd };
    }
  }
  g.__mcxAnchors = { anchors: merged, updatedAt: new Date().toISOString() };
  return NextResponse.json(g.__mcxAnchors);
}
