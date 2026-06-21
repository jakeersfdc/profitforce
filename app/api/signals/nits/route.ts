/**
 * API Route: /api/signals/nits (also available at /api/nits)
 * NIFTY Institutional Trading System signal endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { NITSSignalEngine } from '@/lib/engine/nits_signal_engine';
import { OHLCV } from '@/lib/engine/types';

const nitsEngine = new NITSSignalEngine();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { candles = [], vixValue = 20 } = body;

    if (!Array.isArray(candles) || candles.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or empty candles array' },
        { status: 400 }
      );
    }

    // Validate OHLCV structure
    for (const candle of candles) {
      if (
        !('time' in candle) ||
        !('open' in candle) ||
        !('high' in candle) ||
        !('low' in candle) ||
        !('close' in candle) ||
        !('volume' in candle)
      ) {
        return NextResponse.json(
          { error: 'Candles must have OHLCV structure' },
          { status: 400 }
        );
      }
    }

    const signal = nitsEngine.generateSignal(candles as OHLCV[], vixValue);

    return NextResponse.json(
      {
        success: true,
        signal,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('NITS signal generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Signal generation failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Return sample NITS signal
    return NextResponse.json(
      {
        success: true,
        signal: {
          symbol: 'NSE:NIFTY',
          signalStatus: 'BUY',
          marketBias: 'Bullish',
          orbStatus: 'Breakout Up',
          vixStatus: 'Neutral',
          liquidityStatus: 'SSL Swept',
          volumeStatus: 'Strong',
          profileType: 'P',
          confidence: 85,
          price: 19550,
          stopLoss: 19450,
          targets: { t1: 19650, t2: 19750, t3: 19900 },
          dailyPOC: 19550,
          dailyVAH: 19650,
          dailyVAL: 19450,
          weeklyPOC: 19500,
          gapStatus: 'No Gap',
        },
        source: 'sample',
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
