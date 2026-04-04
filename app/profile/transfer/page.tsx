'use client'
import React, { useEffect, useState } from 'react';

export default function ProfileTransfer() {
  const [deep, setDeep] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/create-one-time-token', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed');
      setDeep(json.deep_link || null);
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { create(); }, []);

  return (
    <div style={{ padding: 24 }}>
      <h2>Sign in on Mobile</h2>
      <p>Open the link on your mobile to transfer your session into the mobile app.</p>
      {loading && <div>Creating token…</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {deep && (
        <div>
          <p><a href={deep}>{deep}</a></p>
          <img alt="QR" src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(deep)}`} />
        </div>
      )}
    </div>
  );
}
