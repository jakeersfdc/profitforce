/**
 * API Route: /api/signals/v2.1 (also available at /api/v2.1)
 * Generate trading signals using v2.1 indicator system
 * POST - Generate signal from OHLCV data
 * GET - Return latest signal with auto-fetched data
 */

import { NextRequest, NextResponse } from 'next/server';
import { V2_1SignalEngine } from '@/lib/engine/v2_1_signal_engine';
import { fetchMarketDataCached } from '@/lib/engine/market_data_service';
import { OHLCV } from '@/lib/engine/types';

const engine = new V2_1SignalEngine();
let lastSignal: any = null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { candles, symbol } = body;

    // Validate input
    if (!Array.isArray(candles) || candles.length === 0) {
      return NextResponse.json(
        { error: 'Invalid candles data' },
        { status: 400 }
      );
    }

    // Normalize OHLCV data
    const normalizedCandles: OHLCV[] = candles.map((c: any) => ({
      time: typeof c.time === 'string' ? new Date(c.time).getTime() : c.time,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume) || 0,
    }));

    // Generate signal
    const signal = engine.generateSignal(normalizedCandles);
    lastSignal = signal;

    return NextResponse.json(
      {
        success: true,
        signal,
        timestamp: new Date().toISOString(),
        version: 'v2.1',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Signal generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Signal generation failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Try to get auto-fetched data if no manual signal exists yet
    if (!lastSignal) {
      const symbol = req.nextUrl.searchParams.get('symbol') || 'NIFTY';
      const interval = (req.nextUrl.searchParams.get('interval') || '5m') as any;
      
      const candles = await fetchMarketDataCached({
        source: 'mock',
        symbol,
        interval,
        lookback: 100,
      });

      if (candles.length > 0) {
        lastSignal = engine.generateSignal(candles);
      }
    }

    if (!lastSignal) {
      return NextResponse.json(
        { error: 'No signal available. POST OHLCV data to /api/v2.1' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        signal: lastSignal,
        timestamp: new Date().toISOString(),
        version: 'v2.1',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Signal retrieval error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve signal' },
      { status: 500 }
    );
  }
}
