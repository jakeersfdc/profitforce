/**
 * Volume Profile Analysis Module
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Professional institutional tool for identifying high-probability zones:
 * - POC (Point of Control) - Price with highest volume (institutional reference)
 * - VAH (Value Area High) - Top of 70% volume range
 * - VAL (Value Area Low) - Bottom of 70% volume range
 * - Price Action vs VP levels for confluence
 * 
 * VP is THE most important tool floor traders use for risk assessment
 */

import { OHLCV } from './types';

export interface VolumeProfileData {
  poc: number;            // Point of Control (highest volume price)
  vah: number;            // Value Area High (70%)
  val: number;            // Value Area Low (70%)
  valueAreaPct: number;   // Actual % of volume in value area (target: 70%)
  highVolPrice: number;   // Highest single volume price (same as POC)
  lowVolPrice: number;    // Lowest volume price in range
  totalVolume: number;    // Total volume in profile
  pocVolume: number;      // Volume at POC
}

export interface VolumeProfileScore {
  score: number;          // -2 to +2
  reason: string;
  position: 'ABOVE_VAH' | 'IN_VA' | 'BELOW_VAL' | 'AT_POC';
}

/**
 * Calculate volume profile from OHLCV candles
 * Creates price buckets and aggregates volume
 */
export function calculateVolumeProfile(
  candles: OHLCV[],
  bucketCount: number = 50  // Price precision (higher = finer granularity)
): VolumeProfileData {
  if (candles.length === 0) {
    throw new Error('No candles provided for volume profile');
  }

  // Find price range
  const prices = candles.map((c) => [c.high, c.low]).flat();
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const priceRange = maxPrice - minPrice;

  // Create price buckets
  const bucketSize = priceRange / bucketCount;
  const buckets: Map<number, number> = new Map();

  // Distribute volume to buckets
  candles.forEach((candle) => {
    // Distribute candle volume across its range
    const candleRange = candle.high - candle.low;
    const volumePerPoint = candleRange > 0 ? candle.volume / candleRange : candle.volume;

    for (let price = candle.low; price <= candle.high; price += bucketSize) {
      const bucketPrice = Math.round(price / bucketSize) * bucketSize;
      const currentVol = buckets.get(bucketPrice) || 0;
      buckets.set(bucketPrice, currentVol + volumePerPoint * bucketSize);
    }
  });

  // Sort by volume
  const sortedBuckets = Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1]);

  // Find POC (highest volume)
  const [pocPrice, pocVol] = sortedBuckets[0] || [0, 0];
  const totalVolume = Array.from(buckets.values()).reduce((a, b) => a + b, 0);

  // Calculate 70% Value Area
  let cumulativeVolume = 0;
  const targetVolume = totalVolume * 0.70;
  const valueAreaPrices: number[] = [];

  sortedBuckets.forEach(([price, volume]) => {
    if (cumulativeVolume <= targetVolume) {
      valueAreaPrices.push(price);
      cumulativeVolume += volume;
    }
  });

  const vah = Math.max(...valueAreaPrices);
  const val = Math.min(...valueAreaPrices);
  const valueAreaPct = (cumulativeVolume / totalVolume) * 100;

  return {
    poc: pocPrice,
    vah,
    val,
    valueAreaPct,
    highVolPrice: pocPrice,
    lowVolPrice: Math.min(...prices),
    totalVolume,
    pocVolume: pocVol,
  };
}

/**
 * Score price relative to volume profile levels
 * Helps identify if price is in institutional support/resistance
 */
export function scoreVolumeProfile(
  currentPrice: number,
  vp: VolumeProfileData
): VolumeProfileScore {
  const aboveVAH = currentPrice > vp.vah;
  const belowVAL = currentPrice < vp.val;
  const atPOC = Math.abs(currentPrice - vp.poc) < (vp.vah - vp.val) * 0.05; // Within 5% of POC
  const inVA = currentPrice >= vp.val && currentPrice <= vp.vah;

  if (atPOC) {
    return {
      score: 0,  // Contested zone, reduces conviction
      reason: 'At POC - Institutional reference price (contested)',
      position: 'AT_POC',
    };
  }

  if (aboveVAH) {
    return {
      score: 2,  // Bull breakout - price above value area
      reason: 'Above VAH - Bullish breakout (institution selling)',
      position: 'ABOVE_VAH',
    };
  }

  if (belowVAL) {
    return {
      score: -2,  // Bear breakdown - price below value area
      reason: 'Below VAL - Bearish breakdown (institution buying)',
      position: 'BELOW_VAL',
    };
  }

  if (inVA) {
    return {
      score: 0,  // In fair value range
      reason: 'Inside Value Area - Fair value zone (no edge)',
      position: 'IN_VA',
    };
  }

  return {
    score: 0,
    reason: 'Unknown position',
    position: 'IN_VA',
  };
}

/**
 * Determine if there's a strong volume profile setup
 * Multiple touches of VAH/VAL indicate institutional support/resistance
 */
export function analyzeVPSetup(
  candles: OHLCV[],
  vp: VolumeProfileData
): {
  vahTouches: number;
  valTouches: number;
  pocRejections: number;
  setupStrength: 'WEAK' | 'MODERATE' | 'STRONG';
} {
  const tolerance = (vp.vah - vp.val) * 0.02; // 2% tolerance

  let vahTouches = 0;
  let valTouches = 0;
  let pocRejections = 0;

  candles.forEach((candle) => {
    // VAH touches
    if (candle.high >= vp.vah - tolerance && candle.high <= vp.vah + tolerance) {
      vahTouches++;
    }
    // VAL touches
    if (candle.low >= vp.val - tolerance && candle.low <= vp.val + tolerance) {
      valTouches++;
    }
    // POC rejections (wicks at POC)
    if (
      (candle.high >= vp.poc - tolerance && candle.high <= vp.poc + tolerance && candle.close < vp.poc) ||
      (candle.low >= vp.poc - tolerance && candle.low <= vp.poc + tolerance && candle.close > vp.poc)
    ) {
      pocRejections++;
    }
  });

  const totalSetupCount = vahTouches + valTouches + pocRejections;
  let setupStrength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';

  if (totalSetupCount >= 5) {
    setupStrength = 'STRONG';
  } else if (totalSetupCount >= 3) {
    setupStrength = 'MODERATE';
  }

  return {
    vahTouches,
    valTouches,
    pocRejections,
    setupStrength,
  };
}

/**
 * Format volume profile for display
 */
export function formatVolumeProfile(vp: VolumeProfileData): string {
  return `
    POC:       ${vp.poc.toFixed(2)} (${vp.pocVolume.toFixed(0)} vol)
    VAH (70%): ${vp.vah.toFixed(2)}
    VAL (70%): ${vp.val.toFixed(2)}
    Spread:    ${(vp.vah - vp.val).toFixed(2)} pts
    VA %:      ${vp.valueAreaPct.toFixed(1)}%
  `.trim();
}

/**
 * Get volume profile summary
 */
export function getVPSummary(vp: VolumeProfileData): string {
  const spread = vp.vah - vp.val;
  const spreadPct = (spread / vp.poc) * 100;

  return `VP: POC=${vp.poc.toFixed(0)} VA=${spread.toFixed(0)}pts (${spreadPct.toFixed(1)}%)`;
}

/**
 * Export volume profile for charting
 */
export function exportVPForChart(vp: VolumeProfileData): {
  levels: { price: number; type: 'POC' | 'VAH' | 'VAL'; label: string }[];
} {
  return {
    levels: [
      { price: vp.poc, type: 'POC', label: 'POC' },
      { price: vp.vah, type: 'VAH', label: 'VAH' },
      { price: vp.val, type: 'VAL', label: 'VAL' },
    ],
  };
}
