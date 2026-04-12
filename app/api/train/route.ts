import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { requireUser } from '../../../lib/clerkServer';
import { isSubscriber } from '../../../lib/auth';

export async function POST(req: Request) {
  try {
    try { await requireUser(); } catch (e) { return NextResponse.json({ error: 'unauthenticated' }, { status: 401 }); }
    const userId = await requireUser();
    // subscription gating: allow if no DB configured or if user is subscriber
    if (process.env.ALLOW_PUBLIC_TRAIN !== '1') {
      const subOk = await isSubscriber(userId).catch(() => false);
      if (!subOk) return NextResponse.json({ error: 'subscription required' }, { status: 403 });
    }
    const body = await req.json();
    const symbol: string = body.symbol;
    const start: string | undefined = body.start;
    const end: string | undefined = body.end;
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const script = path.resolve(process.cwd(), 'ml', 'train.py');
    const args = ['--symbol', symbol];
    if (start) args.push('--start', start);
    if (end) args.push('--end', end);

    const py = spawn('python', [script, ...args], { cwd: process.cwd() });

    let out = '';
    let err = '';
    py.stdout.on('data', (d) => { out += d.toString(); });
    py.stderr.on('data', (d) => { err += d.toString(); });

    const exitCode: number = await new Promise((resolve) => {
      py.on('close', (code) => resolve(code ?? 0));
    });

    if (exitCode !== 0) {
      return NextResponse.json({ error: 'training failed', code: exitCode, out, err }, { status: 500 });
    }

    return NextResponse.json({ ok: true, out });
  } catch (e) {
    console.error('train route error', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
