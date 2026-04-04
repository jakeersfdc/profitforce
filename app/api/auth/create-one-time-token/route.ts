import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/clerkServer';
import { Client } from 'pg';
import crypto from 'crypto';

function getDbClient() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not configured');
  return new Client({ connectionString: dbUrl });
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = requireUser();
  } catch (e) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  const client = getDbClient();
  await client.connect();
  try {
    await client.query('INSERT INTO one_time_tokens(token, clerk_id, expires_at) VALUES($1,$2,$3)', [token, userId, expires.toISOString()]);
  } catch (e) {
    await client.end();
    return NextResponse.json({ error: 'db_error', details: String(e) }, { status: 500 });
  }
  await client.end();

  // deep link for mobile
  const scheme = process.env.NEXT_PUBLIC_MOBILE_SCHEME || 'bullforce';
  const deep = `${scheme}://auth?token=${token}`;

  return NextResponse.json({ token, deep_link: deep });
}
