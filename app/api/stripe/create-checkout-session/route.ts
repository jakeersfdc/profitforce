import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET || '', { apiVersion: '2022-11-15' });

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET) {
    return NextResponse.json({ error: 'stripe not configured' }, { status: 500 });
  }
  const body = await req.json();
  const { clerk_id, priceId, success_url, cancel_url, email } = body;
  if (!clerk_id || !priceId) return NextResponse.json({ error: 'missing clerk_id or priceId' }, { status: 400 });

  try {
    // find or create customer using metadata.clerk_id
    // list by metadata is not supported in all stripe SDKs; list customers and filter as fallback
    const all = await stripe.customers.list({ limit: 100 });
    const existing = all.data.find(c => (c.metadata as any)?.clerk_id === clerk_id);
    let customer = existing || null;
    if (!customer) {
      customer = await stripe.customers.create({
        metadata: { clerk_id },
        email: email || undefined,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: success_url || `${process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'}/?session=success`,
      cancel_url: cancel_url || `${process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'}/?session=cancel`,
    });

    // persist stripe customer.id into users table metadata for clerk_id
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        const { Client } = await import('pg');
        const client = new Client({ connectionString: dbUrl });
        await client.connect();
        // upsert users row and store stripe_customer in metadata
        await client.query(
          `INSERT INTO users (clerk_id, email, is_subscriber, metadata) VALUES ($1,$2,FALSE, jsonb_build_object('stripe_customer',$3)) ON CONFLICT (clerk_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email), metadata = jsonb_set(COALESCE(users.metadata, '{}'::jsonb), '{stripe_customer}', to_jsonb($3::text), true)`,
          [clerk_id, email || null, customer.id]
        );
        await client.end();
      }
    } catch (e) {
      console.warn('failed to persist stripe customer id', e);
    }

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (e: any) {
    return NextResponse.json({ error: 'stripe_error', details: String(e.message || e) }, { status: 500 });
  }
}
