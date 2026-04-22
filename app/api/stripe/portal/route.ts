import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@clerk/nextjs/server';

const stripe = new Stripe(process.env.STRIPE_SECRET || '', { apiVersion: '2022-11-15' });

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET) {
    return NextResponse.json({ error: 'stripe not configured' }, { status: 500 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    // Find Stripe customer by clerk_id metadata
    let customerId: string | null = null;

    // Try DB first
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: dbUrl });
      await client.connect();
      try {
        const res = await client.query(
          `SELECT metadata->>'stripe_customer' as stripe_customer FROM users WHERE clerk_id = $1 LIMIT 1`,
          [userId]
        );
        if (res.rows[0]?.stripe_customer) {
          customerId = res.rows[0].stripe_customer;
        }
      } finally {
        await client.end();
      }
    }

    // Fallback: search Stripe customers
    if (!customerId) {
      const customers = await stripe.customers.list({ limit: 100 });
      const found = customers.data.find(c => (c.metadata as any)?.clerk_id === userId);
      if (found) customerId = found.id;
    }

    if (!customerId) {
      return NextResponse.json({ error: 'no_subscription_found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: body.return_url || `${process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: 'portal_error', details: String(e.message || e) }, { status: 500 });
  }
}
