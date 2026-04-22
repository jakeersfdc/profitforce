import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // No DB — treat as free tier
    return NextResponse.json({ plan: 'free', is_subscriber: false, status: 'inactive' });
  }

  try {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    try {
      // Get user subscriber status
      const userRes = await client.query(
        `SELECT is_subscriber, email, metadata FROM users WHERE clerk_id = $1 LIMIT 1`,
        [userId]
      );
      const user = userRes.rows[0];

      // Get subscription details
      const subRes = await client.query(
        `SELECT plan, status, stripe_subscription_id, expires_at, created_at, updated_at FROM subscriptions WHERE clerk_id = $1 LIMIT 1`,
        [userId]
      );
      const sub = subRes.rows[0];

      if (!user || !user.is_subscriber) {
        return NextResponse.json({
          plan: 'free',
          is_subscriber: false,
          status: 'inactive',
          email: user?.email || null,
        });
      }

      return NextResponse.json({
        plan: sub?.plan || 'pro',
        is_subscriber: true,
        status: sub?.status || 'active',
        expires_at: sub?.expires_at || null,
        subscribed_at: sub?.created_at || null,
        email: user.email,
      });
    } finally {
      await client.end();
    }
  } catch (e: any) {
    console.error('subscription status error', e);
    return NextResponse.json({ plan: 'free', is_subscriber: false, status: 'error' });
  }
}
