/**
 * PositionTracker — derives running positions from fills.
 *
 * On each fill:
 *   • Net qty: BUY adds, SELL subtracts.
 *   • Avg price: weighted average for adds in the same direction; on flips
 *     the realized P&L pops out and avg resets to the new direction's price.
 *   • Realized P&L: accumulated for the day (resets at start-of-day cron).
 *   • Unrealized P&L: marked to last LTP we have on file.
 *
 * All math uses INTEGER quantities (no fractional shares in NSE/BSE/MCX).
 */
import { q } from "@/lib/oms/db";

export interface FillInput {
  clerkId: string;
  orderId: string;
  symbol: string;
  exchange?: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  fees?: number;
  feeBreakdown?: Record<string, number>;
}

export interface PositionRow {
  symbol: string;
  exchange: string | null;
  netQty: number;
  avgPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  ltp: number | null;
  ltpAt: Date | null;
}

export async function recordFill(f: FillInput): Promise<void> {
  await q(
    `INSERT INTO oms_fills (order_id, clerk_id, symbol, side, qty, price, fees, fee_breakdown)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [f.orderId, f.clerkId, f.symbol, f.side, f.qty, f.price, f.fees ?? 0, f.feeBreakdown ?? {}]
  );
  await q(
    `UPDATE oms_orders
        SET filled_qty = filled_qty + $1,
            avg_fill_price = COALESCE(
              (avg_fill_price * (filled_qty) + $2 * $1) / NULLIF(filled_qty + $1, 0),
              $2
            ),
            status = CASE
              WHEN filled_qty + $1 >= qty THEN 'FILLED'
              ELSE 'PARTIAL'
            END,
            updated_at = NOW(),
            closed_at = CASE
              WHEN filled_qty + $1 >= qty THEN NOW()
              ELSE closed_at
            END
      WHERE id = $3`,
    [f.qty, f.price, f.orderId]
  );

  await applyToPosition(f);
}

async function applyToPosition(f: FillInput): Promise<void> {
  const cur = await q<{
    net_qty: number;
    avg_price: string;
    realized_pnl: string;
  }>(
    `SELECT net_qty, avg_price::text, realized_pnl::text
       FROM oms_positions WHERE clerk_id = $1 AND symbol = $2 AND exchange IS NOT DISTINCT FROM $3`,
    [f.clerkId, f.symbol, f.exchange ?? null]
  );
  const prevQty = cur.rows[0]?.net_qty ?? 0;
  const prevAvg = Number(cur.rows[0]?.avg_price ?? 0);
  let realized = Number(cur.rows[0]?.realized_pnl ?? 0);

  const signedQty = f.side === "BUY" ? f.qty : -f.qty;
  const newQty = prevQty + signedQty;
  let newAvg = prevAvg;

  const fees = f.fees ?? 0;

  if (prevQty === 0) {
    // Opening fresh position
    newAvg = f.price;
    realized -= fees;
  } else if (Math.sign(prevQty) === Math.sign(signedQty)) {
    // Adding to same side
    newAvg = (prevAvg * Math.abs(prevQty) + f.price * Math.abs(signedQty)) / Math.abs(newQty);
    realized -= fees;
  } else {
    // Reducing or flipping
    const closingQty = Math.min(Math.abs(prevQty), Math.abs(signedQty));
    const direction = Math.sign(prevQty); // +1 for long, -1 for short
    // Long close: pnl = (sell - buy) * qty; Short close: pnl = (buy - sell) * qty
    const pnlPerUnit = direction === 1 ? f.price - prevAvg : prevAvg - f.price;
    realized += pnlPerUnit * closingQty - fees;
    if (Math.abs(signedQty) > Math.abs(prevQty)) {
      // Flipped — remainder opens a new position the other way
      newAvg = f.price;
    } else {
      newAvg = prevAvg;
      if (newQty === 0) newAvg = 0;
    }
  }

  await q(
    `INSERT INTO oms_positions (clerk_id, symbol, exchange, net_qty, avg_price, realized_pnl, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6, NOW())
     ON CONFLICT (clerk_id, symbol, exchange) DO UPDATE SET
       net_qty = EXCLUDED.net_qty,
       avg_price = EXCLUDED.avg_price,
       realized_pnl = EXCLUDED.realized_pnl,
       updated_at = NOW()`,
    [f.clerkId, f.symbol, f.exchange ?? null, newQty, round(newAvg), round(realized)]
  );
}

export async function markToMarket(
  clerkId: string,
  ltps: Record<string, number>
): Promise<void> {
  for (const [symbol, ltp] of Object.entries(ltps)) {
    await q(
      `UPDATE oms_positions
          SET ltp = $1,
              ltp_at = NOW(),
              unrealized_pnl = CASE
                WHEN net_qty > 0 THEN (($1 - avg_price) * net_qty)
                WHEN net_qty < 0 THEN ((avg_price - $1) * ABS(net_qty))
                ELSE 0
              END,
              updated_at = NOW()
        WHERE clerk_id = $2 AND symbol = $3`,
      [ltp, clerkId, symbol]
    );
  }
}

export async function getPositions(clerkId: string): Promise<PositionRow[]> {
  const res = await q<{
    symbol: string;
    exchange: string | null;
    net_qty: number;
    avg_price: string;
    realized_pnl: string;
    unrealized_pnl: string;
    ltp: string | null;
    ltp_at: Date | null;
  }>(
    `SELECT symbol, exchange, net_qty, avg_price::text, realized_pnl::text,
            unrealized_pnl::text, ltp::text, ltp_at
       FROM oms_positions WHERE clerk_id = $1 ORDER BY net_qty <> 0 DESC, symbol`,
    [clerkId]
  );
  return res.rows.map((r) => ({
    symbol: r.symbol,
    exchange: r.exchange,
    netQty: r.net_qty,
    avgPrice: Number(r.avg_price),
    realizedPnl: Number(r.realized_pnl),
    unrealizedPnl: Number(r.unrealized_pnl),
    ltp: r.ltp != null ? Number(r.ltp) : null,
    ltpAt: r.ltp_at,
  }));
}

export async function dailyPnL(clerkId: string): Promise<{
  realized: number;
  unrealized: number;
  total: number;
}> {
  const res = await q<{ r: string; u: string }>(
    `SELECT COALESCE(SUM(realized_pnl),0)::text AS r,
            COALESCE(SUM(unrealized_pnl),0)::text AS u
     FROM oms_positions WHERE clerk_id = $1`,
    [clerkId]
  );
  const realized = Number(res.rows[0]?.r ?? 0);
  const unrealized = Number(res.rows[0]?.u ?? 0);
  return { realized, unrealized, total: realized + unrealized };
}

function round(n: number): number {
  return Number(n.toFixed(4));
}
