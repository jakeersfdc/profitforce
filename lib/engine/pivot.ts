/**
 * Pivot Point Calculation Module
 * ═══════════════════════════════════════════════════════════════════════════
 * Professional trader-grade pivot calculations using multiple methodologies:
 * - Standard Pivot (Floor Trader) - Most common, works for all instruments
 * - Camarilla Pivots - Tighter ranges, good for range traders
 * - Fibonacci Pivots - Used for longer-term analysis
 * 
 * Default: Standard Pivot (most suitable for Indian markets)
 */

import { PivotZones, PriceZone, OHLCV } from './types';

export type PivotMethod = 'standard' | 'camarilla' | 'fibonacci';

/**
 * Calculate pivot zones from OHLCV data
 * Uses the previous day's OHLC (most recent daily candle)
 */
export function calculatePivotZones(
  ohlcv: OHLCV,
  method: PivotMethod = 'standard'
): PivotZones {
  const { high, low, close } = ohlcv;

  switch (method) {
    case 'camarilla':
      return camarillaPivots(high, low, close);
    case 'fibonacci':
      return fibonacciPivots(high, low, close);
    case 'standard':
    default:
      return standardPivots(high, low, close);
  }
}

/**
 * Standard Pivot (Floor Trader's Pivot)
 * Most widely used across Indian markets (NSE, F&O)
 * PP = (H + L + C) / 3
 * R1 = (2 × PP) - L
 * R2 = PP + (H - L)
 * S1 = (2 × PP) - H
 * S2 = PP - (H - L)
 */
function standardPivots(high: number, low: number, close: number): PivotZones {
  const pp = (high + low + close) / 3;
  const hl = high - low;

  return {
    pp,
    r1: 2 * pp - low,
    r2: pp + hl,
    s1: 2 * pp - high,
    s2: pp - hl,
    daysHigh: high,
    daysLow: low,
  };
}

/**
 * Camarilla Pivots
 * Tighter than Standard, good for intraday choppy markets
 * Used by professional floor traders
 */
function camarillaPivots(high: number, low: number, close: number): PivotZones {
  const range = high - low;
  const pp = (high + low + close) / 3;

  return {
    pp,
    r1: close + (range * 0.275),
    r2: close + (range * 0.55),
    s1: close - (range * 0.275),
    s2: close - (range * 0.55),
    daysHigh: high,
    daysLow: low,
  };
}

/**
 * Fibonacci Pivots
 * Uses Fibonacci ratios (0.382, 0.618, 1.0)
 * Good for swing trading and position sizing
 */
function fibonacciPivots(high: number, low: number, close: number): PivotZones {
  const range = high - low;
  const pp = (high + low + close) / 3;

  return {
    pp,
    r1: pp + (range * 0.382),
    r2: pp + (range * 0.618),
    s1: pp - (range * 0.382),
    s2: pp - (range * 0.618),
    daysHigh: high,
    daysLow: low,
  };
}

/**
 * Determine which zone the current price is in
 * Returns one of 6 zones for heatmap scoring
 */
export function getPriceZone(price: number, zones: PivotZones): PriceZone {
  if (price > zones.r2) return 'ABOVE_R2';
  if (price >= zones.r1) return 'R1_TO_R2';
  if (price >= zones.pp) return 'PP_TO_R1';
  if (price >= zones.s1) return 'S1_TO_PP';
  if (price >= zones.s2) return 'S2_TO_S1';
  return 'BELOW_S2';
}

/**
 * Get zone score for confluence calculation
 * Returns -3 to +2 (excluding ABOVE_R2 which is -2 for overbought)
 */
export function getZoneScore(zone: PriceZone): number {
  const scores: Record<PriceZone, number> = {
    BELOW_S2: -3,      // Bearish
    S2_TO_S1: -2,      // Bearish
    S1_TO_PP: -1,      // Slightly bearish
    PP_TO_R1: 1,       // Slightly bullish
    R1_TO_R2: 2,       // Bullish
    ABOVE_R2: -2,      // Overbought = pullback risk
  };

  return scores[zone];
}

/**
 * Calculate distance from pivot point (as percentage)
 * Used for No-Trade Zone detection
 */
export function distanceFromPivot(price: number, pp: number): number {
  return Math.abs((price - pp) / pp) * 100;
}

/**
 * Check if price is in the immediate pivot band (No-Trade Zone)
 * NTZ is when price is between S1-R1 AND within 0.3% of PP
 */
export function isInNoTradeZone(
  price: number,
  zones: PivotZones,
  thresholdPct: number = 0.3
): boolean {
  const pricePct = distanceFromPivot(price, zones.pp);
  return price > zones.s1 && price < zones.r1 && pricePct < thresholdPct;
}

/**
 * Get pivot statistics for the day
 * Useful for understanding market structure
 */
export function getPivotStats(zones: PivotZones) {
  const r1Range = zones.r2 - zones.r1;
  const r1ToR2 = ((zones.r2 - zones.r1) / zones.pp) * 100;
  const s1ToS2 = ((zones.s1 - zones.s2) / zones.pp) * 100;
  const ppRange = ((zones.pp - zones.s1) / zones.pp) * 100;

  return {
    totalRange: zones.daysHigh - zones.daysLow,
    resistanceDistance: r1ToR2,
    supportDistance: s1ToS2,
    ppDistance: ppRange,
    pivotSpread: zones.r2 - zones.s2,
  };
}

/**
 * Format pivot zones for display
 */
export function formatPivots(zones: PivotZones): string {
  return `
    R2: ${zones.r2.toFixed(2)}
    R1: ${zones.r1.toFixed(2)}
    PP: ${zones.pp.toFixed(2)}
    S1: ${zones.s1.toFixed(2)}
    S2: ${zones.s2.toFixed(2)}
  `.trim();
}
