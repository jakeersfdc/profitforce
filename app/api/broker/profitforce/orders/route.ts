import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPFAccount } from "@/lib/profitforceAccount";

export const dynamic = "force-dynamic";

/**
 * Returns the user's ProfitForce order history. Prefers the Postgres `orders`
 * table (unlimited history) and falls back to Clerk metadata (last 200 orders)
 * when DATABASE_URL is not configured.
 *
 * Query: ?limit=50&offset=0
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  try {
    const db: { pool?: unknown } = await import("@/lib/db/index.js");
    if (db?.pool) {
      const pool = db.pool as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
      const r = await pool.query(
        `SELECT id, symbol, qty, side, type, price, created_at, status, source, broker_response
         FROM orders
         WHERE user_id=$1 AND source='profitforce'
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );
      return NextResponse.json({ source: "db", orders: r.rows });
    }
  } catch {
    // fall through to Clerk
  }

  const acct = await getPFAccount(userId);
  const orders = (acct.orders ?? []).slice().reverse().slice(offset, offset + limit);
  return NextResponse.json({ source: "clerk", orders });
}
