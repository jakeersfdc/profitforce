import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchQuote } from '@/lib/stockUtils';
import { getBrokerConfig } from '@/lib/brokerCreds';
import { placePFOrder } from '@/lib/profitforceAccount';

export async function POST(req: Request) {
  try {
    const { userId: clerkUserId } = await auth();
    // Allow unauthenticated users for paper trades
    const body = await req.json();
    const { symbol, qty, side, type = 'market', price, dryRun } = body;

    if (!symbol || !qty || !side) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 });
    }

    const userId = clerkUserId || 'anonymous';
    const isPaper = !clerkUserId || !!dryRun;

    // Get real-time price: try server fetch, fall back to client-provided price
    let realPrice = null;
    try {
      const quoteData = await fetchQuote(symbol);
      if (quoteData.price > 0) realPrice = quoteData.price;
    } catch (e) {
      console.error('Quote fetch error:', e);
    }
    // Fall back to the price the client sent (from its own live feed)
    if (!realPrice && price) realPrice = Number(price);
    if (!realPrice) {
      return NextResponse.json({ error: 'Could not fetch current price. Try again.' }, { status: 503 });
    }

    const order: Record<string, unknown> = {
      id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      symbol,
      qty: Number(qty),
      side: String(side).toUpperCase(),
      type,
      price: realPrice,
      filledPrice: realPrice,
      fillPrice: realPrice,
      filledQty: Number(qty),
      amount: realPrice * Number(qty),
      createdAt: new Date().toISOString(),
      executedAt: new Date().toISOString(),
      status: 'filled',
      source: isPaper ? 'paper' : 'live',
      dryRun: isPaper,
    };

    // If user is authenticated and has DB configured, persist to DB
    if (clerkUserId) {
      try {
        const db: any = await import('@/lib/db/index.js');
        if (db.pool) {
          await db.insertOrder(order);
          await db.appendLedger(order);
        }
      } catch (dbErr) {
        console.error('DB write (non-fatal):', dbErr);
        // Continue — order still executed
      }
    }

    // For live mode with broker, route to selected broker
    if (!isPaper) {
      try {
        const { isActiveSubscription } = await import('@/lib/auth/subscription.js') as any;
        const subOk = await isActiveSubscription(userId);
        if (!subOk) {
          return NextResponse.json({ error: 'Active subscription required for live trading' }, { status: 402 });
        }
        // Fetch user's broker config (selection + creds) from Clerk privateMetadata
        const cfg = await getBrokerConfig(userId);
        const broker = cfg.broker || 'alpaca';
        let brokerRes;
        if (broker === 'profitforce') {
          // Self-hosted virtual broker — fills against user's Clerk-stored ledger
          const pf = await placePFOrder(userId, {
            symbol,
            qty: Number(qty),
            side: String(side).toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
            price: realPrice,
            type,
            clientOrderId: order.id as string,
          });
          if (!pf.ok) throw new Error(`ProfitForce rejected: ${pf.order.reason}`);
          brokerRes = { broker: 'profitforce', orderId: pf.order.id, funds: pf.account.funds, raw: pf.order };
        } else if (broker === 'alpaca') {
          const { placeAlpacaOrder } = await import('@/lib/execution/alpacaAdapter.js') as any;
          brokerRes = await placeAlpacaOrder({ symbol, qty, side, type, price: realPrice, clientOrderId: order.id });
        } else if (broker === 'zerodha') {
          const { placeZerodhaOrder } = await import('@/lib/execution/zerodhaAdapter.js') as any;
          brokerRes = await placeZerodhaOrder({ symbol, qty, side, type, price: realPrice, clientOrderId: order.id, creds: cfg.zerodha || {}, exchange: body.exchange, product: body.product });
        } else if (broker === 'angel') {
          const { placeAngelOrder } = await import('@/lib/execution/angelAdapter.js') as any;
          brokerRes = await placeAngelOrder({ symbol, qty, side, type, price: realPrice, clientOrderId: order.id, creds: cfg.angel || {}, exchange: body.exchange, symboltoken: body.symboltoken, producttype: body.producttype });
        } else if (broker === 'upstox') {
          const { placeUpstoxOrder } = await import('@/lib/execution/upstoxAdapter.js') as any;
          brokerRes = await placeUpstoxOrder({ symbol, qty, side, type, price: realPrice, clientOrderId: order.id, creds: cfg.upstox || {}, instrumentKey: body.instrumentKey, product: body.product });
        } else if (broker === 'dhan') {
          const { placeDhanOrder } = await import('@/lib/execution/dhanAdapter.js') as any;
          brokerRes = await placeDhanOrder({ symbol, qty, side, type, price: realPrice, clientOrderId: order.id, creds: cfg.dhan || {}, securityId: body.securityId, exchangeSegment: body.exchangeSegment, productType: body.productType });
        } else {
          throw new Error('Unknown broker');
        }
        order.status = 'submitted';
        order.broker = broker;
        order.brokerResponse = brokerRes;
      } catch (brokerErr: any) {
        console.error('Broker error (falling back to paper):', brokerErr);
        order.source = 'paper';
        order.dryRun = true;
        order.status = 'filled';
        order.brokerError = String(brokerErr?.message || brokerErr);
      }
    }

    return NextResponse.json({ ok: true, order });
  } catch (e: any) {
    console.error('Order error:', e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
