import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '@clerk/nextjs/server';

const exec = require('../../../../lib/execution/OrderExecutionManager');
const { isActiveSubscription } = require('../../../../lib/auth/subscription');

export async function POST(req: Request) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { symbol, qty, side, type, price, dryRun } = body;
    const userId = clerkUserId; // always use authenticated user ID
    if (!symbol || !qty || !side) return NextResponse.json({ error: 'missing fields' }, { status: 400 });

    // enforce subscription for live trading
    const isPaper = process.env.PAPER_TRADING === '1' || !!dryRun;
    if (!isPaper) {
      const ok = await isActiveSubscription(userId);
      if (!ok) return NextResponse.json({ error: 'active subscription required for live trading' }, { status: 402 });
    }

    const result = await exec.placeOrder({ id: body.id, userId, symbol, qty, side, type, price, dryRun });
    return NextResponse.json({ ok: true, order: result });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
