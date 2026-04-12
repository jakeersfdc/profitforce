import { NextResponse } from 'next/server';
import { generateSignal } from '../../../lib/engine/SignalEngine';
import { getHistorical } from '../../../lib/stockUtils';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const [signal, hist] = await Promise.all([
      generateSignal(symbol),
      getHistorical(symbol, undefined, undefined, '1d'),
    ]);
    return NextResponse.json({ signal, hist });
  } catch (e) {
    console.error('signal route error', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
