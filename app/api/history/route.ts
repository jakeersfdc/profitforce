import { NextResponse } from 'next/server';
import { getHistorical } from '../../../lib/stockUtils';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    const interval = url.searchParams.get('interval') ?? '1d';
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });
    const hist = await getHistorical(symbol, start || undefined, end || undefined, interval);
    return NextResponse.json({ symbol, hist });
  } catch (e) {
    console.error('history route error', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
