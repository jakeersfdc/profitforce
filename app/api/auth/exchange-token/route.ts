import { NextResponse } from 'next/server';
import { Client } from 'pg';
import jwt from 'jsonwebtoken';

function getDbClient() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not configured');
  return new Client({ connectionString: dbUrl });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { token } = body || {};
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 });

  const client = getDbClient();
  await client.connect();
  try {
    const res = await client.query('SELECT token, clerk_id, used, expires_at FROM one_time_tokens WHERE token = $1 LIMIT 1', [token]);
    if (!res.rows || res.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
    }
    const row = res.rows[0];
    if (row.used) {
      await client.end();
      return NextResponse.json({ error: 'token_used' }, { status: 400 });
    }
    const expires = new Date(row.expires_at);
    if (expires.getTime() < Date.now()) {
      await client.end();
      return NextResponse.json({ error: 'token_expired' }, { status: 400 });
    }

    // mark used
    await client.query('UPDATE one_time_tokens SET used = TRUE WHERE token = $1', [token]);
    await client.end();

    const clerkId = row.clerk_id;
    const jwtSecret = process.env.JWT_SECRET || process.env.INFERENCE_JWT_SECRET || 'dev-secret';
    const payload = { sub: clerkId, iat: Math.floor(Date.now() / 1000) };
    const signed = jwt.sign(payload, jwtSecret, { expiresIn: '7d' });

    return NextResponse.json({ token: signed, clerk_id: clerkId });
  } catch (e) {
    await client.end();
    return NextResponse.json({ error: 'db_error', details: String(e) }, { status: 500 });
  }
}
