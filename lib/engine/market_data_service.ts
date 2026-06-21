/**
 * Market Data Service - Integration with Broker APIs and TradingView
 * Fetches OHLCV data for real-time signal generation
 */

import { OHLCV } from './types';

export interface DataSourceConfig {
  source: 'tradingview' | 'broker' | 'mock';
  symbol: string;
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | 'daily';
  lookback?: number;
}

/**
 * Fetch historical OHLCV data from TradingView
 * Note: This is a mock implementation
 * Real implementation would use TradingView API or broker APIs
 */
export async function fetchMarketData(config: DataSourceConfig): Promise<OHLCV[]> {
  try {
    if (config.source === 'mock') {
      return generateMockData(config.symbol, config.lookback || 100);
    }

    if (config.source === 'tradingview') {
      // TODO: Implement TradingView API integration
      return generateMockData(config.symbol, config.lookback || 100);
    }

    if (config.source === 'broker') {
      // TODO: Implement broker API integration (Zerodha, Angel, etc.)
      return generateMockData(config.symbol, config.lookback || 100);
    }

    throw new Error('Unknown data source');
  } catch (error) {
    console.error(`Error fetching market data for ${config.symbol}:`, error);
    return [];
  }
}

/**
 * Generate mock market data for testing
 */
function generateMockData(symbol: string, count: number): OHLCV[] {
  const data: OHLCV[] = [];
  let basePrice = 20000; // NIFTY base price
  const now = Date.now();
  const interval = 5 * 60 * 1000; // 5-minute candles

  for (let i = count; i > 0; i--) {
    const change = (Math.random() - 0.5) * 200; // ±100 price change
    const open = basePrice;
    const close = basePrice + change;
    const high = Math.max(open, close) + Math.random() * 100;
    const low = Math.min(open, close) - Math.random() * 100;
    const volume = Math.floor(Math.random() * 1000000) + 500000;

    data.push({
      time: now - i * interval,
      open,
      high,
      low,
      close,
      volume,
    });

    basePrice = close;
  }

  return data;
}

/**
 * Cache for market data to reduce API calls
 */
const dataCache = new Map<string, { data: OHLCV[]; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

export async function fetchMarketDataCached(config: DataSourceConfig): Promise<OHLCV[]> {
  const cacheKey = `${config.source}:${config.symbol}:${config.interval}`;
  const cached = dataCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await fetchMarketData(config);
  dataCache.set(cacheKey, { data, timestamp: Date.now() });

  return data;
}

/**
 * Stream market data (for real-time updates)
 */
export async function* streamMarketData(
  config: DataSourceConfig,
  interval: number = 5000
): AsyncGenerator<OHLCV[], void, unknown> {
  while (true) {
    const data = await fetchMarketDataCached(config);
    if (data.length > 0) {
      yield data;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
