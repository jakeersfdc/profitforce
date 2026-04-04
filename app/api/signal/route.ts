import { NextResponse } from 'next/server';
import { calculateAISignal, getHistorical } from '../../../lib/stockUtils';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const signal = await calculateAISignal(symbol);
    const hist = await getHistorical(symbol, undefined, undefined, '1d');
    return NextResponse.json({ signal, hist });
  } catch (e) {
    console.error('signal route error', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
