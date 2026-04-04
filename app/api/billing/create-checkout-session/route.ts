import { NextResponse } from 'next/server';

const { createCheckoutSession } = require('../../../../lib/billing/stripe');

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { priceId, successUrl, cancelUrl, customerEmail } = body;
    if (!priceId) return NextResponse.json({ error: 'missing priceId' }, { status: 400 });
    const session = await createCheckoutSession({ priceId, successUrl, cancelUrl, customerEmail });
    return NextResponse.json({ ok: true, url: session.url, id: session.id });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
