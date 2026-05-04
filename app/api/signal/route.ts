import { NextResponse } from 'next/server';
import { generateSignal } from '../../../lib/engine/SignalEngine';
import { getHistorical, fetchGiftNifty, fetchQuote } from '../../../lib/stockUtils';

// SEBI-mandated disclosure returned with every research output so that
// downstream consumers (mobile app, third parties) cannot strip it.
const COMPLIANCE = {
  entity: process.env.NEXT_PUBLIC_SEBI_ENTITY_NAME || 'ProfitForce Technologies Pvt Ltd',
  raRegNo: process.env.NEXT_PUBLIC_SEBI_RA_NUMBER || 'INH000000000',
  nature: 'non-individualized research',
  disclaimer:
    'Investments in securities market are subject to market risks. ' +
    'Read all related documents carefully before investing. Past performance is not ' +
    'indicative of future results. No guaranteed returns. ' +
    'This output is non-individualized research and not personal investment advice.',
  grievance: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || 'grievance@profitforce.in',
  scores: 'https://scores.sebi.gov.in',
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    // GIFT NIFTY (^GNIFTY) is not on Yahoo — use NIFTY 50 spot as proxy for signal generation.
    const isGiftNifty = symbol === '^GNIFTY';
    const sigSymbol = isGiftNifty ? '^NSEI' : symbol;
    const [signal, hist] = await Promise.all([
      generateSignal(sigSymbol),
      getHistorical(sigSymbol, undefined, undefined, '1d'),
    ]);

    if (isGiftNifty) {
      // Rescale entry/SL/target/trailing from NIFTY 50 scale to actual GIFT NIFTY price.
      // GIFT NIFTY = NIFTY 50 + overnight global cue, so the *direction* (BUY/SELL/HOLD)
      // and confluence transfer perfectly, but the price levels need scaling so users see
      // GIFT NIFTY-relative entry/stop/target.
      const [gn, nseiQuote] = await Promise.all([fetchGiftNifty(), fetchQuote('^NSEI')]);
      const ratio = gn.price > 0 && nseiQuote.price > 0 ? gn.price / nseiQuote.price : 0;
      if (ratio > 0) {
        signal.symbol = '^GNIFTY';
        signal.entryPrice = round2(signal.entryPrice * ratio);
        if (signal.stopLoss != null) signal.stopLoss = round2(signal.stopLoss * ratio);
        if (signal.targetPrice != null) signal.targetPrice = round2(signal.targetPrice * ratio);
        if (signal.trailingStop != null) signal.trailingStop = round2(signal.trailingStop * ratio);
        signal.reason = `[GIFT NIFTY pre-market cue, NIFTY 50 proxy] ${signal.reason}`;
      } else {
        signal.symbol = '^GNIFTY';
        signal.reason = `[GIFT NIFTY pre-market cue, NIFTY 50 proxy] ${signal.reason}`;
      }
    }

    return NextResponse.json({ signal, hist, compliance: COMPLIANCE });
  } catch (e) {
    console.error('signal route error', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
