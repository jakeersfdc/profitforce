import { NextResponse } from 'next/server';
import { generateSignal } from '../../../lib/engine/SignalEngine';
import { suggestOptionStrikes, fetchQuote } from '../../../lib/stockUtils';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    const tick = Number(url.searchParams.get('tick') ?? '50');
    const pads = Number(url.searchParams.get('pads') ?? '2');
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const [sig, liveQuote] = await Promise.all([
      generateSignal(symbol),
      fetchQuote(symbol),
    ]);
    // Use live quote price (not the signal's entryPrice which is last-day close)
    const livePrice = liveQuote.price > 0 ? liveQuote.price : sig.entryPrice;
    const strikes = await suggestOptionStrikes(symbol, livePrice, tick, pads);

    // pick recommendation based on signal
    let recommendation: any = null;
    const strikesList = strikes?.strikes ?? [];
    const atm = strikes?.atm ?? null;
    const defaultIdx = Math.floor(strikesList.length / 2);
    const atmIdx = atm != null && strikesList.length ? (strikesList.indexOf(atm) >= 0 ? strikesList.indexOf(atm) : defaultIdx) : defaultIdx;

    if (sig.signal === 'BUY') {
      const pick = strikesList[Math.min(atmIdx + 1, Math.max(strikesList.length - 1, 0))] ?? null;
      recommendation = { type: 'BUY_CALL', strike: pick, entry: sig.entryPrice, stop: sig.stopLoss, target: sig.targetPrice };
    } else if (sig.signal === 'SELL') {
      const pick = strikesList[Math.max(atmIdx - 1, 0)] ?? null;
      recommendation = { type: 'BUY_PUT', strike: pick, entry: sig.entryPrice, stop: sig.stopLoss, target: sig.targetPrice };
    } else {
      recommendation = { type: 'HOLD', reason: sig.reason };
    }

    return NextResponse.json({ symbol, signal: sig, strikes, recommendation });
  } catch (e) {
    console.error('strikes route error', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
