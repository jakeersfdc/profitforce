import { NextResponse } from 'next/server';

// Lightweight webhook receiver for Alpaca order events.
// Alpaca supports sending order updates; this route accepts a JSON payload
// containing at minimum { id, status, filled_qty, filled_avg_price }

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // normalize
    const orderId = body?.id || body?.order?.id || null;
    if (!orderId) return NextResponse.json({ error: 'missing order id' }, { status: 400 });

    // update local storage and DB if present
    try {
      const fs = await import('fs');
      const p = require('path').join(process.cwd(), 'data', 'orders.json');
      const raw = fs.readFileSync(p, 'utf-8');
      const orders = JSON.parse(raw || '[]');
      const idx = orders.findIndex((o: any) => o.id === orderId || (o.brokerResponse && o.brokerResponse.id === orderId));
      if (idx >= 0) {
        const o = orders[idx];
        o.status = body.status || body.order?.status || o.status;
        if (body.filled_qty || body.order?.filled_qty) {
          o.filledQty = body.filled_qty || body.order?.filled_qty;
        }
        if (body.filled_avg_price || body.order?.filled_avg_price) {
          o.fillPrice = body.filled_avg_price || body.order?.filled_avg_price;
        }
        o.executedAt = new Date().toISOString();
        fs.writeFileSync(p, JSON.stringify(orders, null, 2));
      }
    } catch (e) {
      // ignore file errors
    }

    // TODO: also update Postgres via lib/db when available
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
