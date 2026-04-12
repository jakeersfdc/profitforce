import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/clerkServer';
import { isAdmin } from '../../../../lib/auth';
import { Client } from 'pg';

function getDbClient() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not configured');
  return new Client({ connectionString: dbUrl });
}

export async function middlewareAuth() {
  const userId = await requireUser();
  if (!isAdmin(userId)) {
    throw new Error('forbidden');
  }
  return userId;
}

export async function GET(req: Request) {
  try {
    await middlewareAuth();
  } catch (e) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const client = getDbClient();
  await client.connect();
  try {
    const res = await client.query('SELECT id, clerk_id, email, is_subscriber, metadata, created_at FROM users ORDER BY created_at DESC');
    await client.end();
    return NextResponse.json({ data: res.rows });
  } catch (e) {
    await client.end();
    return NextResponse.json({ error: 'db_error', details: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await middlewareAuth();
  } catch (e) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { clerk_id, email, is_subscriber } = body;
  if (!clerk_id) return NextResponse.json({ error: 'missing clerk_id' }, { status: 400 });
  const client = getDbClient();
  await client.connect();
  try {
    const res = await client.query(
      `INSERT INTO users (clerk_id, email, is_subscriber, metadata) VALUES ($1, $2, $3, '{}'::jsonb) ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email, is_subscriber = EXCLUDED.is_subscriber RETURNING id, clerk_id, email, is_subscriber`,
      [clerk_id, email || null, !!is_subscriber]
    );
    await client.end();
    return NextResponse.json({ data: res.rows[0] });
  } catch (e) {
    await client.end();
    return NextResponse.json({ error: 'db_error', details: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await middlewareAuth();
  } catch (e) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { clerk_id, is_subscriber } = body;
  if (!clerk_id) return NextResponse.json({ error: 'missing clerk_id' }, { status: 400 });
  const client = getDbClient();
  await client.connect();
  try {
    const res = await client.query('UPDATE users SET is_subscriber = $1 WHERE clerk_id = $2 RETURNING id, clerk_id, email, is_subscriber', [!!is_subscriber, clerk_id]);
    await client.end();
    if (res.rows.length === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ data: res.rows[0] });
  } catch (e) {
    await client.end();
    return NextResponse.json({ error: 'db_error', details: String(e) }, { status: 500 });
  }
}
