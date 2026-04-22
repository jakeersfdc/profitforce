import { NextResponse } from 'next/server';
import { generateSignal } from '../../../lib/engine/SignalEngine';
import { getHistorical } from '../../../lib/stockUtils';

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

    const [signal, hist] = await Promise.all([
      generateSignal(symbol),
      getHistorical(symbol, undefined, undefined, '1d'),
    ]);
    return NextResponse.json({ signal, hist, compliance: COMPLIANCE });
  } catch (e) {
    console.error('signal route error', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
