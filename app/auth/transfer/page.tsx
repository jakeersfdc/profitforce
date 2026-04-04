'use client'
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TransferPage() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function create() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/create-one-time-token', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed');
      setDeepLink(json.deep_link || null);
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { create(); }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Mobile Sign-In Transfer</h1>
      <p>This page will create a one-time token to sign into the mobile app. Open the link on your phone, or scan the QR code shown.</p>
      {loading && <div>Creating token…</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {deepLink && (
        <div>
          <p>Open this link on mobile:</p>
          <a href={deepLink}>{deepLink}</a>
          <p style={{ marginTop: 12 }}>Or scan the QR code (mobile browsers only)</p>
        </div>
      )}
    </div>
  );
}
