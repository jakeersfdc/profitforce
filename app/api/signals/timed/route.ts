import { NextResponse } from 'next/server';
import {
  getActiveSignalTiming,
  generateAllTimedSignals,
  generateTimedSignal,
} from '../../../../lib/engine/TimedSignalScheduler';

/**
 * GET /api/signals/timed (also available at /api/timed)
 * Returns high-confidence signals for the current market hour
 *
 * Query params:
 *   - symbol: Optional, get signal for specific symbol
 *   - all: If true, generate for full watchlist (default if symbol not provided)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    const getAll = url.searchParams.get('all') === 'true' || !symbol;

    const timing = getActiveSignalTiming();
    if (!timing) {
      return NextResponse.json(
        {
          signals: [],
          note: 'No active market hour signal window right now. Next: 9:30 AM (Market Open)',
          nextTiming: '09:30 IST',
        },
        { status: 200 }
      );
    }

    const signals: Awaited<ReturnType<typeof generateAllTimedSignals>> = [];
    if (symbol) {
      const signal = await generateTimedSignal(symbol, timing);
      if (signal) signals.push(signal);
    } else if (getAll) {
      const allSignals = await generateAllTimedSignals(timing);
      signals.push(...allSignals);
    }

    return NextResponse.json({
      timing,
      signals,
      count: signals.length,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[/api/timed] Error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
