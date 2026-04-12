import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runTradingCycle, monitorPositions, broadcastAlert } from '../../../../lib/engine/AutoTrader';
import { generateSignal } from '../../../../lib/engine/SignalEngine';

/**
 * POST /api/trade/auto — Run one automated trading cycle (scan + enter + exit + alert)
 * GET  /api/trade/auto — Check positions and run exit monitor
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? 'full'; // 'full' | 'scan' | 'monitor'

    if (mode === 'monitor') {
      const exits = await monitorPositions();
      return NextResponse.json({ ok: true, mode: 'monitor', exits });
    }

    if (mode === 'scan') {
      const signal = body.symbol ? await generateSignal(body.symbol) : null;
      if (signal && ['BUY', 'SELL'].includes(signal.signal) && signal.strength >= 50) {
        await broadcastAlert(signal);
      }
      return NextResponse.json({ ok: true, mode: 'scan', signal });
    }

    // Full cycle
    const result = await runTradingCycle();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('auto-trade error', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

    const exits = await monitorPositions();
    // Read current positions
    const fs = require('fs').promises;
    const path = require('path');
    let positions: any[] = [];
    try {
      positions = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'positions.json'), 'utf-8'));
    } catch { positions = []; }

    return NextResponse.json({ ok: true, positions, recentExits: exits });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
