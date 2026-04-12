import { backtestSymbols, backtestWithSignals, backtestWithSignalsV2 } from '@/lib/stockUtils';
import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/clerkServer';
import { isSubscriber } from '../../../lib/auth';

export async function POST(req: Request) {
  try {
    try { await requireUser(); } catch (e) { return NextResponse.json({ error: 'unauthenticated' }, { status: 401 }); }
    const userId = await requireUser();
    if (process.env.ALLOW_PUBLIC_BACKTEST !== '1') {
      const ok = await isSubscriber(userId).catch(() => false);
      if (!ok) return NextResponse.json({ error: 'subscription required' }, { status: 403 });
    }
    const body = await req.json();
    const symbols: string[] = body.symbols ?? [];
    const start: string | undefined = body.startDate;
    const end: string | undefined = body.endDate;
    const mode: string = body.mode ?? 'signal';

    if (!symbols || symbols.length === 0) {
      return NextResponse.json({ error: 'no symbols provided' }, { status: 400 });
    }

    let results;
    if (mode === 'signal') {
      // use improved v2 backtest with capital protection by default
      const startingCapital = body.startingCapital ?? 100000;
      const riskPerTrade = body.riskPerTradePct ?? 0.01;
      results = await backtestWithSignalsV2(symbols, start, end, startingCapital, riskPerTrade);
    } else {
      results = await backtestSymbols(symbols, start, end);
    }
    return NextResponse.json({ results });
  } catch (error) {
    console.error('Backtest route error', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
