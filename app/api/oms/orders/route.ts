/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { q } from "@/lib/oms/db";
import { withOms } from "@/lib/oms/withOms";

export const dynamic = "force-dynamic";

export const GET = withOms(async (req: Request) => {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized", orders: [] }, { status: 401 });
  const url = new URL(req.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
  const status = url.searchParams.get("status");
  const params: any[] = [userId];
  let where = "WHERE clerk_id = $1";
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  params.push(limit);
  const res = await q(
    `SELECT id, provider, broker_order_id, symbol, exchange, side, qty, filled_qty, type,
            product, price, trigger_price, avg_fill_price, status, reject_reason,
            strategy_id, signal_id, paper, created_at, updated_at, closed_at
       FROM oms_orders ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
    params
  );
  return NextResponse.json({ orders: res.rows });
});
