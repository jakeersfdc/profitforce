'use client'
import React, { useState } from 'react';

export default function CheckoutPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
      if (!priceId) {
        setError('NEXT_PUBLIC_STRIPE_PRICE_ID not set');
        setLoading(false);
        return;
      }
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed');
      if (json.url) {
        window.location.href = json.url;
      } else {
        setError('No session url returned');
      }
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Subscribe</h1>
      <p>Click below to open Stripe Checkout.</p>
      <button onClick={startCheckout} disabled={loading}>{loading ? 'Opening...' : 'Subscribe'}</button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}
