'use client'
import React, { useEffect, useState } from 'react';
import { useAuth, SafeSignInButton } from '@/components/AuthProvider';

type UserRow = { id: number; clerk_id: string; email?: string; is_subscriber: boolean; created_at?: string };

export default function AdminSubscribersPage() {
  const { isLoaded, user } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/subscribers', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed');
      setRows(json.data || []);
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoaded && user) load();
  }, [isLoaded, user]);

  async function toggle(row: UserRow) {
    try {
      const res = await fetch('/api/admin/subscribers', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clerk_id: row.clerk_id, is_subscriber: !row.is_subscriber }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed');
      load();
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Subscribers (Admin)</h1>
      {!isLoaded ? <div>Loading…</div> : !user ? (
        <div>
          <p>You must sign in as an admin user to manage subscribers.</p>
          <SafeSignInButton mode="modal"><button className="mt-2 px-4 py-2 bg-blue-600 text-white rounded">Sign In</button></SafeSignInButton>
        </div>
      ) : (
        <div>
        <div style={{ marginBottom: 12 }}>
          <strong>Signed in as:</strong> {user?.firstName || 'Admin'}
        </div>

        {loading && <div>Loading…</div>}
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Clerk ID</th>
              <th>Email</th>
              <th>Subscriber</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #ddd' }}>
                <td style={{ padding: 8 }}>{r.clerk_id}</td>
                <td style={{ padding: 8 }}>{r.email}</td>
                <td style={{ padding: 8 }}>{r.is_subscriber ? 'Yes' : 'No'}</td>
                <td style={{ padding: 8 }}>
                  <button onClick={() => toggle(r)}>{r.is_subscriber ? 'Revoke' : 'Grant'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
