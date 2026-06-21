/**
 * Crypto Data Service
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Fetches market data for crypto assets from:
 * - Binance API
 * - CoinGecko API (free tier)
 * - Local cache (for rate limiting)
 * 
 * Supported assets:
 * - BTC (Bitcoin)
 * - ETH (Ethereum)
 * - XRP, SOL, ADA, DOGE, LINK, AVAX, MATIC, BNBLVT
 * - 100+ other cryptocurrencies
 */

import { OHLCV } from './types';

interface CryptoPriceData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  timestamp: number;
}

interface CryptoOHLCVData {
  ohlcv: OHLCV;
  volatility: number;
  avgVolume24h: number;
}

// Cache to reduce API calls
const cryptoCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 60000; // 1 minute

/**
 * Binance supported symbols for crypto
 */
export const SUPPORTED_CRYPTO = [
  'BTC',
  'ETH',
  'XRP',
  'SOL',
  'ADA',
  'DOGE',
  'LINK',
  'AVAX',
  'MATIC',
  'BNB',
  'DOT',
  'ATOM',
  'ALGO',
  'FTM',
  'APE',
  'ARB',
  'OP',
  'ARBITRUM',
];

/**
 * Get current crypto price from Binance API
 */
export async function getCryptoPriceFromBinance(symbol: string): Promise<CryptoPriceData> {
  try {
    // Check cache first
    const cacheKey = `price-${symbol}`;
    const cached = cryptoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    const binanceSymbol = `${symbol}USDT`;
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.statusText}`);
    }

    const data = await response.json();

    const priceData: CryptoPriceData = {
      symbol,
      price: parseFloat(data.lastPrice),
      change24h: parseFloat(data.priceChangePercent),
      volume24h: parseFloat(data.quoteAssetVolume),
      marketCap: 0, // Not available from this endpoint
      timestamp: Date.now(),
    };

    // Cache result
    cryptoCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
    return priceData;
  } catch (error) {
    console.error(`Error fetching ${symbol} price:`, error);
    throw error;
  }
}

/**
 * Get OHLCV data from Binance
 * @param symbol Crypto symbol (e.g., 'BTC', 'ETH')
 * @param interval Candle interval (e.g., '1h', '4h', '1d')
 * @param limit Number of candles (default: 100)
 */
export async function getCryptoOHLCVFromBinance(
  symbol: string,
  interval: string = '1h',
  limit: number = 100
): Promise<OHLCV[]> {
  try {
    // Check cache
    const cacheKey = `ohlcv-${symbol}-${interval}`;
    const cached = cryptoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    const binanceSymbol = `${symbol}USDT`;
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error(`Binance OHLCV API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Parse Binance klines format: [time, open, high, low, close, volume, ...]
    const ohlcvData: OHLCV[] = data.map((candle: any[]) => ({
      time: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[7]), // Quote asset volume
    }));

    // Cache result
    cryptoCache.set(cacheKey, { data: ohlcvData, timestamp: Date.now() });
    return ohlcvData;
  } catch (error) {
    console.error(`Error fetching ${symbol} OHLCV:`, error);
    throw error;
  }
}

/**
 * Calculate ATR (Average True Range) for crypto
 * ATR is used instead of VIX for crypto volatility
 */
export function calculateATR(candles: OHLCV[], period: number = 14): number {
  if (candles.length < period) return 0;

  let trSum = 0;

  for (let i = 1; i <= period; i++) {
    const current = candles[candles.length - i];
    const previous = candles[candles.length - i - 1];

    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);

    const tr = Math.max(tr1, tr2, tr3);
    trSum += tr;
  }

  return trSum / period;
}

/**
 * Calculate crypto volatility percentage (ATR-based)
 * Returns volatility as percentage of current price
 */
export function calculateCryptoVolatility(candles: OHLCV[]): number {
  const atr = calculateATR(candles);
  const currentPrice = candles[candles.length - 1].close;

  if (currentPrice === 0) return 0;

  return (atr / currentPrice) * 100;
}

/**
 * Get complete crypto market data with all signals
 */
export async function getCryptoMarketData(
  symbol: string,
  interval: string = '1h'
): Promise<CryptoOHLCVData> {
  const ohlcvCandles = await getCryptoOHLCVFromBinance(symbol, interval);

  if (ohlcvCandles.length === 0) {
    throw new Error(`No OHLCV data found for ${symbol}`);
  }

  const volatility = calculateCryptoVolatility(ohlcvCandles);
  const avgVolume24h = ohlcvCandles.slice(-24).reduce((sum, c) => sum + c.volume, 0) / 24;

  return {
    ohlcv: ohlcvCandles[ohlcvCandles.length - 1],
    volatility,
    avgVolume24h,
  };
}

/**
 * Get price data from CoinGecko (free, no auth required)
 */
export async function getCryptoPriceFromCoinGecko(symbol: string): Promise<CryptoPriceData> {
  try {
    const cacheKey = `cg-price-${symbol}`;
    const cached = cryptoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    const coinId = getCoinGeckoId(symbol);
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/data?ids=${coinId}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.statusText}`);
    }

    const data = await response.json();
    const coinData = data[coinId];

    if (!coinData) {
      throw new Error(`No data found for ${symbol}`);
    }

    const priceData: CryptoPriceData = {
      symbol,
      price: coinData.usd,
      change24h: coinData.usd_24h_change || 0,
      volume24h: coinData.usd_24h_vol || 0,
      marketCap: coinData.usd_market_cap || 0,
      timestamp: Date.now(),
    };

    cryptoCache.set(cacheKey, { data: priceData, timestamp: Date.now() });
    return priceData;
  } catch (error) {
    console.error(`Error fetching ${symbol} price from CoinGecko:`, error);
    throw error;
  }
}

/**
 * Map crypto symbols to CoinGecko IDs
 */
function getCoinGeckoId(symbol: string): string {
  const mapping: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    XRP: 'ripple',
    SOL: 'solana',
    ADA: 'cardano',
    DOGE: 'dogecoin',
    LINK: 'chainlink',
    AVAX: 'avalanche-2',
    MATIC: 'matic-network',
    BNB: 'binancecoin',
    DOT: 'polkadot',
    ATOM: 'cosmos',
    ALGO: 'algorand',
    FTM: 'fantom',
    APE: 'apecoin',
    ARB: 'arbitrum',
    OP: 'optimism',
  };

  return mapping[symbol] || symbol.toLowerCase();
}

/**
 * Clear crypto cache (useful for testing)
 */
export function clearCryptoCache(): void {
  cryptoCache.clear();
}

/**
 * Get cached data if available
 */
export function getCachedData(key: string): any | null {
  const cached = cryptoCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    cryptoCache.delete(key);
    return null;
  }
  return cached.data;
}

/**
 * Batch fetch OHLCV for multiple crypto symbols
 */
export async function getBatchCryptoOHLCV(
  symbols: string[],
  interval: string = '1h'
): Promise<Record<string, OHLCV[]>> {
  const results: Record<string, OHLCV[]> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        results[symbol] = await getCryptoOHLCVFromBinance(symbol, interval);
      } catch (error) {
        console.error(`Failed to fetch ${symbol}:`, error);
        results[symbol] = [];
      }
    })
  );

  return results;
}

/**
 * Stream crypto price updates (WebSocket - advanced feature)
 */
export class CryptoStreamListener {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(
    private symbol: string,
    private onPriceUpdate: (price: number) => void,
    private onError?: (error: Error) => void
  ) {}

  connect() {
    const stream = `${this.symbol.toLowerCase()}usdt@ticker`;
    const wsUrl = `wss://stream.binance.com:9443/ws/${stream}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.onPriceUpdate(parseFloat(data.c));
          this.reconnectAttempts = 0;
        } catch (error) {
          console.error('Error parsing WebSocket data:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.onError?.(new Error('WebSocket error'));
        this.reconnect();
      };

      this.ws.onclose = () => {
        this.reconnect();
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      this.onError?.(error as Error);
    }
  }

  private reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      setTimeout(() => this.connect(), delay);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
