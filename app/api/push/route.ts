import { NextResponse } from 'next/server';
import fetch from 'node-fetch';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = body.token;
    const title = body.title ?? 'ProfitForce Alert';
    const message = body.message ?? '';

    // If FCM server key available, forward to FCM
    const FCM_KEY = process.env.FCM_SERVER_KEY;
    if (FCM_KEY) {
      const payload = {
        to: token,
        notification: { title, body: message },
        data: body.data ?? {}
      };
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST', headers: { 'Authorization': `key=${FCM_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const j = await res.json();
      return NextResponse.json({ ok: true, result: j });
    }

    // Otherwise, just log and return success for development
    console.log('Push request (dev):', { token, title, message, data: body.data });
    return NextResponse.json({ ok: true, info: 'dev-logged' });
  } catch (e) {
    console.error('push failed', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
