import { NextResponse } from 'next/server';

const { stripe, recordSubscription } = require('../../../../lib/billing/stripe');
const rawBody = async (req: Request) => {
  const buf = await req.arrayBuffer();
  return Buffer.from(buf);
};

export async function POST(req: Request) {
  // expects STRIPE_WEBHOOK_SECRET in env
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const bodyBuf = await rawBody(req);
    const sig = req.headers.get('stripe-signature') || '';
    if (!stripe || !webhookSecret) return NextResponse.json({ error: 'stripe not configured' }, { status: 400 });
    let event;
    try {
      event = stripe.webhooks.constructEvent(bodyBuf, sig, webhookSecret);
    } catch (err) {
      return NextResponse.json({ error: 'webhook signature mismatch' }, { status: 400 });
    }

    // handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // session.client_reference_id could contain userId
      const userId = session.client_reference_id || session.customer_email || 'unknown';
      // record subscription with basic info
      await recordSubscription(userId, { stripeSession: session, expiresAt: null });
    }

    // handle invoice.payment_succeeded -> mark active
    if (event.type === 'invoice.payment_succeeded') {
      const inv = event.data.object;
      const userId = inv.customer_email || 'unknown';
      await recordSubscription(userId, { stripeInvoice: inv, expiresAt: null });
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
