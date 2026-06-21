/**
 * SAS (Smart Automated System) Signal API - V2.0 COMPLETE
 * POST /api/signals/sas - Generate SAS signal (all features)
 * GET /api/signals/sas - Fetch signal history
 * 
 * Supports:
 * - Stocks (NSE, BSE)
 * - Indices (NIFTY50, BANKNIFTY, FINNIFTY)
 * - Crypto (BTC, ETH, XRP, SOL, etc.)
 * - F&O instruments
 * - 24/7 trading for crypto
 */

import { NextRequest, NextResponse } from 'next/server';
import { SASEngine } from '@/lib/engine/SASEngine';
import { OHLCV, SASSignal } from '@/lib/engine/types';
import { calculateVolumeProfile } from '@/lib/engine/volumeProfile';
import { deriveVolatilityFromATR } from '@/lib/engine/vixIntegration';
import { fetchMarketDataCached } from '@/lib/engine/market_data_service';
import { SignalLogger } from '@/lib/engine/signal_logger';

const engine = new SASEngine({
  minConfluence: 2,
  ntzThreshold: 5,
  adxMinTrend: 20,
  pricePctToPP: 0.3,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      symbol = 'NIFTY50',
      currentOHLCV,
      previousDayOHLC,
      vpCandles,
      vixValue,
      prevVixValue,
      vixMA20,
      indicators = {},
    } = body;

    // Validate input
    if (!symbol || !currentOHLCV || !previousDayOHLC) {
      return NextResponse.json(
        {
          error: 'Missing required fields: symbol, currentOHLCV, previousDayOHLC',
          example: {
            symbol: 'BTC',
            currentOHLCV: { time: Date.now(), open: 45000, high: 45500, low: 44800, close: 45200, volume: 1000000 },
            previousDayOHLC: { time: Date.now() - 86400000, open: 44500, high: 45800, low: 44200, close: 45000, volume: 1500000 },
            vpCandles: '[array of last 50 OHLCV candles]',
            vixValue: 18.5,
            indicators: { adx: 28, trend: 'UP', rsi: 65, atr: 250 },
          },
        },
        { status: 400 }
      );
    }

    // Generate SAS signal with ALL features (Stage 1 + Stage 2)
    const signal = await engine.generateSignal(
      symbol,
      currentOHLCV,
      previousDayOHLC,
      {
        vpCandles: vpCandles || [],
        vixValue,
        prevVixValue,
        vixMA20,
        indicators,
      }
    );

    // Log signal (non-critical, ignore errors)
    try {
      const logger = new SignalLogger(null);
      await logger.logSignal(signal as any);
    } catch (logError) {
      console.error('Failed to log signal:', logError);
    }

    return NextResponse.json(signal);
  } catch (error) {
    console.error('SAS Signal Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate SAS signal', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const symbol = searchParams.get('symbol') || 'NIFTY50';
    const limit = parseInt(searchParams.get('limit') || '10');
    const assetType = searchParams.get('assetType'); // 'STOCK' | 'INDEX' | 'CRYPTO' | 'FO'

    // Fetch recent signals from database
    let signals: any[] = [];
    try {
      const logger = new SignalLogger(null);
      signals = await logger.getSignalHistory(symbol, limit);
    } catch (error) {
      console.error('Failed to fetch signal history:', error);
      signals = [];
    }

    // Filter by asset type if specified
    if (assetType) {
      signals = signals.filter((s) => {
        if (assetType === 'CRYPTO') {
          return ['BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'LINK', 'AVAX'].some((c) =>
            s.symbol?.includes(c)
          );
        }
        if (assetType === 'INDEX') {
          return ['NIFTY', 'BANKNIFTY', 'FINNIFTY'].some((c) => s.symbol?.includes(c));
        }
        return true;
      });
    }

    return NextResponse.json({
      symbol,
      assetType: assetType || 'ALL',
      count: signals.length,
      signals,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('SAS Signal History Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signal history', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Batch signal generation endpoint
 * POST /api/signals/sas/batch
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbols = [], signals: signalRequests = [] } = body;

    if (signalRequests.length === 0) {
      return NextResponse.json(
        { error: 'No signal requests provided' },
        { status: 400 }
      );
    }

    // Generate signals in parallel
    const results = await Promise.all(
      signalRequests.map((req: any) =>
        engine.generateSignal(
          req.symbol,
          req.currentOHLCV,
          req.previousDayOHLC,
          {
            vpCandles: req.vpCandles,
            vixValue: req.vixValue,
            indicators: req.indicators,
          }
        )
      )
    );

    return NextResponse.json({
      count: results.length,
      signals: results,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Batch Signal Generation Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate batch signals', details: String(error) },
      { status: 500 }
    );
  }
}
