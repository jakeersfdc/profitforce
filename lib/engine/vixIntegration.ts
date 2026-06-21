/**
 * VIX & Volatility Integration Module
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Works for both indices (India VIX) and crypto (derived volatility)
 * - Dynamic strike selection based on volatility regime
 * - Confluence scoring from volatility
 * - Risk management adjustments
 * 
 * Volatility Regimes:
 * VERY_LOW (< 12)     → Tight, range-bound market
 * LOW (12-18)         → Normal to slightly low
 * NORMAL (18-25)      → Baseline (India VIX ~19-20 typical)
 * HIGH (25-35)        → Elevated volatility
 * CRISIS (> 35)       → Extreme moves, wide stops
 */

export type VolatilityRegime = 'VERY_LOW' | 'LOW' | 'NORMAL' | 'HIGH' | 'CRISIS';

export interface VolatilityData {
  value: number;                    // VIX-like value (0-100)
  regime: VolatilityRegime;
  zScore: number;                   // Distance from 20-day MA
  trendUp: boolean;                 // Volatility increasing
  impliedRange: number;             // Expected daily move %
}

export interface StrikeRecommendation {
  strikeOTM: number;               // Distance OTM in points
  width: number;                   // ±X strikes
  riskAdjustedSL: number;          // SL widened for high vol
  targetAdjustment: number;        // Multiple adjustment
  reason: string;
}

/**
 * Classify volatility regime from VIX-like index
 * Works for: India VIX, Crypto volatility indices, ATR-derived
 */
export function classifyVolatilityRegime(vixValue: number): VolatilityRegime {
  if (vixValue < 12) return 'VERY_LOW';
  if (vixValue < 18) return 'LOW';
  if (vixValue < 25) return 'NORMAL';
  if (vixValue < 35) return 'HIGH';
  return 'CRISIS';
}

/**
 * Calculate strike width recommendation based on volatility
 */
export function getStrikeWidth(vixValue: number): StrikeRecommendation {
  const regime = classifyVolatilityRegime(vixValue);

  const recommendations: Record<VolatilityRegime, StrikeRecommendation> = {
    VERY_LOW: {
      strikeOTM: 1,
      width: 1,
      riskAdjustedSL: 1.0,
      targetAdjustment: 0.9,
      reason: 'Tight market - narrow strikes, tight stops',
    },
    LOW: {
      strikeOTM: 2,
      width: 2,
      riskAdjustedSL: 1.1,
      targetAdjustment: 0.95,
      reason: 'Low volatility - normal strikes',
    },
    NORMAL: {
      strikeOTM: 3,
      width: 3,
      riskAdjustedSL: 1.2,
      targetAdjustment: 1.0,
      reason: 'Normal conditions - standard strikes',
    },
    HIGH: {
      strikeOTM: 5,
      width: 5,
      riskAdjustedSL: 1.4,
      targetAdjustment: 1.1,
      reason: 'High volatility - wider strikes, loose stops',
    },
    CRISIS: {
      strikeOTM: 7,
      width: 7,
      riskAdjustedSL: 1.7,
      targetAdjustment: 1.3,
      reason: 'Extreme conditions - very wide strikes, defensive stops',
    },
  };

  return recommendations[regime];
}

/**
 * Get VIX confluence score contribution
 * Volatility can enhance or reduce signal confidence
 */
export function getVIXConfluenceScore(vixValue: number): {
  score: number;  // -1 to +1
  explanation: string;
} {
  const regime = classifyVolatilityRegime(vixValue);

  const scores: Record<VolatilityRegime, { score: number; explanation: string }> = {
    VERY_LOW: {
      score: -0.5,
      explanation: 'Very low vol = choppy, harder to break levels',
    },
    LOW: {
      score: -0.2,
      explanation: 'Low vol = reduced momentum',
    },
    NORMAL: {
      score: 0,
      explanation: 'Normal vol = baseline conditions',
    },
    HIGH: {
      score: 0.5,
      explanation: 'High vol = increased trending potential',
    },
    CRISIS: {
      score: 1.0,
      explanation: 'Crisis vol = strong directional moves',
    },
  };

  return scores[regime];
}

/**
 * Calculate risk management adjustments for volatility
 */
export function adjustRiskForVolatility(
  baseSL: number,
  entry: number,
  vixValue: number
): {
  adjustedSL: number;
  slWidthPts: number;
  riskAdjusted: boolean;
  explanation: string;
} {
  const recommendation = getStrikeWidth(vixValue);
  const baseSLPts = Math.abs(entry - baseSL);
  const adjustedSLPts = baseSLPts * recommendation.riskAdjustedSL;
  const adjustedSL = entry > baseSL ? entry - adjustedSLPts : entry + adjustedSLPts;
  const riskAdjusted = recommendation.riskAdjustedSL !== 1.0;

  return {
    adjustedSL,
    slWidthPts: adjustedSLPts,
    riskAdjusted,
    explanation: `SL widened ${recommendation.riskAdjustedSL}x for ${recommendation.reason}`,
  };
}

/**
 * Estimate implied daily range based on volatility
 * Useful for: stop loss sizing, target calculation, risk management
 */
export function estimateImpliedRange(
  currentPrice: number,
  vixValue: number,
  symbol: string = 'INDEX'
): {
  impliedRange: number;
  rangePct: number;
  minMove: number;
  maxMove: number;
  explanation: string;
} {
  // General formula: Implied Move ≈ (VIX / 100) × Price × sqrt(days)
  // For crypto: use direct volatility percentage
  
  const isCrypto = symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('XRP');
  
  let rangePct: number;
  
  if (isCrypto) {
    // Crypto tends to be 2-3x more volatile than indices
    rangePct = vixValue * 0.015; // Direct percentage
  } else {
    // Traditional index calculation
    rangePct = (vixValue / 100) * currentPrice * Math.sqrt(1); // 1 day
  }

  const impliedRange = currentPrice * (rangePct / 100);
  const minMove = currentPrice - impliedRange;
  const maxMove = currentPrice + impliedRange;

  return {
    impliedRange,
    rangePct,
    minMove,
    maxMove,
    explanation: `Expected range: ${minMove.toFixed(2)} to ${maxMove.toFixed(2)}`,
  };
}

/**
 * Volatility analysis for confluence
 */
export function analyzeVolatilityTrend(
  currentVIX: number,
  previousVIX: number,
  vixMA20: number
): {
  trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  zscore: number;
  signal: 'STRONG_UP' | 'WEAK_UP' | 'NEUTRAL' | 'WEAK_DOWN' | 'STRONG_DOWN';
} {
  const zScore = (currentVIX - vixMA20) / Math.max(1, Math.abs(vixMA20 * 0.1));
  const change = ((currentVIX - previousVIX) / previousVIX) * 100;
  const trend = currentVIX > previousVIX ? 'INCREASING' : 'DECREASING';

  let signal: 'STRONG_UP' | 'WEAK_UP' | 'NEUTRAL' | 'WEAK_DOWN' | 'STRONG_DOWN' = 'NEUTRAL';

  if (zScore > 1.5) signal = 'STRONG_UP';
  else if (zScore > 0.5) signal = 'WEAK_UP';
  else if (zScore < -1.5) signal = 'STRONG_DOWN';
  else if (zScore < -0.5) signal = 'WEAK_DOWN';

  return {
    trend,
    zscore: zScore,
    signal,
  };
}

/**
 * Derive volatility from ATR (for when VIX data not available, e.g., crypto)
 */
export function deriveVolatilityFromATR(
  atr: number,
  currentPrice: number,
  lookbackDays: number = 20
): VolatilityData {
  // ATR to implied vol: Vol% = (ATR / Price) × sqrt(252/periods) × 100
  const atrPct = (atr / currentPrice) * 100;
  const impliedVol = atrPct * Math.sqrt(252 / lookbackDays);
  
  // Map to VIX-like scale (scale down for easier interpretation)
  const vixLike = Math.min(100, Math.max(0, impliedVol * 0.8));

  return {
    value: vixLike,
    regime: classifyVolatilityRegime(vixLike),
    zScore: 0, // Not available
    trendUp: false, // Not available
    impliedRange: (atr / currentPrice) * 100,
  };
}

/**
 * Format volatility data for display
 */
export function formatVolatility(vol: VolatilityData): string {
  return `
    VIX:      ${vol.value.toFixed(2)}
    Regime:   ${vol.regime}
    Z-Score: ${vol.zScore.toFixed(2)}
    Trend:    ${vol.trendUp ? '📈 UP' : '📉 DOWN'}
    Range:    ±${vol.impliedRange.toFixed(2)}%
  `.trim();
}

/**
 * Color coding for UI display
 */
export function getVIXRegimeColor(regime: VolatilityRegime): string {
  const colors: Record<VolatilityRegime, string> = {
    VERY_LOW: '#0066FF',   // Blue - calm
    LOW: '#00CC00',        // Green - normal low
    NORMAL: '#666666',     // Gray - baseline
    HIGH: '#FF9900',       // Orange - alert
    CRISIS: '#FF0000',     // Red - danger
  };
  return colors[regime];
}

/**
 * Get descriptive label for volatility regime
 */
export function getVIXRegimeLabel(regime: VolatilityRegime): string {
  const labels: Record<VolatilityRegime, string> = {
    VERY_LOW: '🔵 Very Low - Choppy',
    LOW: '🟢 Low - Stable',
    NORMAL: '⚪ Normal - Baseline',
    HIGH: '🟠 High - Alert',
    CRISIS: '🔴 Crisis - Extreme',
  };
  return labels[regime];
}
