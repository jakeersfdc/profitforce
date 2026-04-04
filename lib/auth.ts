import { Client } from 'pg';

export async function isSubscriber(userId: string): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return true; // allow by default when no DB configured
  try {
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    const res = await client.query('SELECT is_subscriber FROM users WHERE clerk_id = $1 LIMIT 1', [userId]);
    await client.end();
    if (res.rows && res.rows[0]) return !!res.rows[0].is_subscriber;
  } catch (e) {
    console.error('isSubscriber check failed', e);
  }
  return false;
}

export function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  const admins = process.env.ADMIN_USERS || '';
  if (!admins) return false;
  const list = admins.split(',').map(s => s.trim()).filter(Boolean);
  return list.includes(userId);
}
