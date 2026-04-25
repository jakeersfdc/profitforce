import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { Client } from 'pg';

const stripe = new Stripe(process.env.STRIPE_SECRET || '', { apiVersion: '2022-11-15' });

function getDbClient() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not configured');
  return new Client({ connectionString: dbUrl });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured — rejecting webhook');
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 });
  }
  const buf = await req.arrayBuffer();
  const raw = Buffer.from(buf);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, req.headers.get('stripe-signature') || '', secret);
  } catch (err: any) {
    return NextResponse.json({ error: 'invalid_webhook', details: String(err.message || err) }, { status: 400 });
  }

  const typ = event.type;

  // Idempotency: skip if we have already processed this event id.
  // Failures here should not block delivery; Stripe will retry on non-2xx.
  try {
    const idClient = getDbClient();
    await idClient.connect();
    try {
      await idClient.query(
        `CREATE TABLE IF NOT EXISTS stripe_events (
           event_id TEXT PRIMARY KEY,
           type TEXT NOT NULL,
           received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`
      );
      const ins = await idClient.query(
        'INSERT INTO stripe_events (event_id, type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
        [event.id, typ]
      );
      if (ins.rowCount === 0) {
        return NextResponse.json({ received: true, duplicate: true });
      }
    } finally {
      await idClient.end();
    }
  } catch (e) {
    console.warn('stripe webhook idempotency check failed (continuing):', e);
  }

  try {
    if (typ === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string | undefined;
      let clerkId: string | undefined = undefined;
      // try to resolve clerk_id from customer metadata
      if (customerId) {
        const cust = await stripe.customers.retrieve(customerId);
        // @ts-ignore
        clerkId = (cust as any).metadata?.clerk_id;
      }

      // if clerkId exists, mark user subscribed and store stripe customer id in metadata
      if (clerkId) {
        const client = getDbClient();
        await client.connect();
        try {
          await client.query(
            `INSERT INTO users (clerk_id, email, is_subscriber, metadata) VALUES ($1,$2,TRUE, jsonb_build_object('stripe_customer',$3)) ON CONFLICT (clerk_id) DO UPDATE SET is_subscriber = TRUE, email = COALESCE(EXCLUDED.email, users.email), metadata = jsonb_set(COALESCE(users.metadata, '{}'::jsonb), '{stripe_customer}', to_jsonb($3::text), true)`
            , [clerkId, session.customer_details?.email || null, customerId]
          );

          // Store/update subscription record with plan info
          const subscriptionId = session.subscription as string | undefined;
          let plan = 'pro'; // default
          if (subscriptionId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subscriptionId);
              plan = (sub.metadata as any)?.plan || 'pro';
            } catch {}
          }
          if (subscriptionId) {
            await client.query(
              `INSERT INTO subscriptions (clerk_id, stripe_customer_id, stripe_subscription_id, plan, status, expires_at) VALUES ($1, $2, $3, $4, 'active', NOW() + INTERVAL '30 days') ON CONFLICT (clerk_id) DO UPDATE SET stripe_customer_id = $2, stripe_subscription_id = $3, plan = $4, status = 'active', expires_at = NOW() + INTERVAL '30 days', updated_at = NOW()`,
              [clerkId, customerId, subscriptionId, plan]
            );
          }
        } finally {
          await client.end();
        }
      }
    }

    if (typ === 'invoice.payment_failed') {
      // optionally mark user as unsubscribed or notify
    }

    if (typ === 'customer.subscription.deleted' || typ === 'invoice.payment_failed') {
      // keep logic minimal: find customer -> clerk_id -> set is_subscriber false
      const data = event.data.object as any;
      const customerId = data.customer as string | undefined;
      if (customerId) {
        const cust = await stripe.customers.retrieve(customerId);
        // @ts-ignore
        const clerkId = cust.metadata?.clerk_id;
        if (clerkId) {
          const client = getDbClient();
          await client.connect();
          try {
            await client.query('UPDATE users SET is_subscriber = FALSE WHERE clerk_id = $1', [clerkId]);
            await client.query(
              `UPDATE subscriptions SET status = $2, updated_at = NOW() WHERE clerk_id = $1`,
              [clerkId, typ === 'customer.subscription.deleted' ? 'cancelled' : 'payment_failed']
            );
          } finally {
            await client.end();
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'handler_error', details: String(e.message || e) }, { status: 500 });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
