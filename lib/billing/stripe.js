const Stripe = require('stripe');
const fs = require('fs').promises;
const path = require('path');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_KEY ? Stripe(STRIPE_KEY) : null;

const SUB_PATH = path.join(process.cwd(), 'data', 'subscriptions.json');

async function _ensure() {
  await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
  try { await fs.access(SUB_PATH); } catch (e) { await fs.writeFile(SUB_PATH, '[]'); }
}

async function recordSubscription(userId, data) {
  await _ensure();
  // if DB configured, insert into subscriptions table
  try {
    const db = require('../db');
    if (db.pool) {
      await db.pool.query(
        'INSERT INTO subscriptions(user_id, active, started_at, expires_at, payload) VALUES($1,$2,$3,$4,$5)',
        [userId, true, new Date().toISOString(), data.expiresAt || null, JSON.stringify(data)]
      );
      return;
    }
  } catch (e) {
    // fallback to file
  }

  const raw = await fs.readFile(SUB_PATH, 'utf-8');
  const arr = JSON.parse(raw || '[]');
  const entry = { userId, active: true, startedAt: new Date().toISOString(), expiresAt: data.expiresAt || null, stripe: data };
  arr.push(entry);
  await fs.writeFile(SUB_PATH, JSON.stringify(arr, null, 2));
}

async function createCheckoutSession({ priceId, successUrl, cancelUrl, customerEmail }) {
  if (!stripe) throw new Error('Stripe not configured');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: customerEmail,
  });
  return session;
}

module.exports = { createCheckoutSession, recordSubscription, stripe };
