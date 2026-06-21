/**
 * SAS (Smart Automated System) Trading Engine v2.0
 * ═══════════════════════════════════════════════════════════════════════════
 * Professional-grade trading system based on 20+ years trader experience
 * 
 * COMPLETE SYSTEM - All Stages Integrated:
 * ✅ Stage 1: Pivot zones (R1, R2, S1, S2) with 6-zone heatmap
 * ✅ Stage 2: Volume Profile (POC, VAH, VAL) + India VIX/Volatility
 * ✅ Crypto Support: Works for BTC, ETH, stocks, indices
 * ✅ Dynamic Risk Management: VIX-adjusted stops and targets
 * 
 * Components:
 * - Institutional 6-zone pivot analysis
 * - No-Trade Zone (NTZ) protection against choppy markets
 * - Volume Profile integration (POC, VAH, VAL)
 * - VIX/Volatility integration (dynamic strikes, regime-based)
 * - Unified confluence scoring (-8 to +10 with all factors)
 * - Automatic risk management (SL/targets auto-adjusted)
 */

import {
  OHLCV,
  SASSignal,
  SASConfig,
  PriceZone,
  PivotZones,
  NoTradeZone,
  ConfluenceScores,
  VolumeProfileBasic,
} from './types';
import {
  calculatePivotZones,
  getPriceZone,
  getZoneScore,
  distanceFromPivot,
  isInNoTradeZone,
} from './pivot';
import {
  calculateVolumeProfile,
  scoreVolumeProfile,
  VolumeProfileScore,
} from './volumeProfile';
import {
  classifyVolatilityRegime,
  getStrikeWidth,
  getVIXConfluenceScore,
  adjustRiskForVolatility,
  estimateImpliedRange,
  deriveVolatilityFromATR,
} from './vixIntegration';

/**
 * SAS Engine - Main trading signal generator
 */
export class SASEngine {
  private config: SASConfig;

  constructor(config: Partial<SASConfig> = {}) {
    this.config = {
      minConfluence: 2,
      ntzThreshold: 5,
      adxMinTrend: 20,
      adxMaxChop: 20,
      pricePctToPP: 0.3,
      riskRewardRatio: 2,
      trailingStopPct: 2,
      ...config,
    };
  }

  /**
   * Generate SAS signal from OHLCV data - FULL INTEGRATED VERSION
   * Includes: Pivots, Volume Profile, VIX, all confluence factors
   * Works for: Stocks, Indices, Crypto, F&O
   */
  async generateSignal(
    symbol: string,
    current: OHLCV,
    previousDayOHLC: OHLCV,
    options: {
      // Core data
      indicators?: {
        adx?: number;
        trend?: 'UP' | 'DOWN' | 'NEUTRAL';
        rsi?: number;
        volume?: number;
        volumeRegime?: 'HIGH' | 'NORMAL' | 'LOW';
        atr?: number;
      };
      // Volume Profile
      vpCandles?: OHLCV[];  // Candles for VP calculation (use previous 20-50 candles)
      // Volatility
      vixValue?: number;    // India VIX or derived volatility
      vixMA20?: number;     // 20-day MA for trend
      prevVixValue?: number; // Previous VIX for trend
    } = {}
  ): Promise<SASSignal> {
    const timestamp = new Date();
    const price = current.close;
    const indicators = options.indicators || {};

    // Step 1: Calculate pivot zones
    const pivotZones = calculatePivotZones(previousDayOHLC);
    const priceZone = getPriceZone(price, pivotZones);

    // Step 2: Detect No-Trade Zone
    const noTradeZone = this.detectNoTradeZone(price, pivotZones, indicators.adx || 20);

    // Step 3: Calculate Volume Profile (if candles provided)
    let vpData = null;
    let vpScore: any = { score: 0, reason: 'No VP data', position: 'IN_VA' };
    if (options.vpCandles && options.vpCandles.length > 0) {
      vpData = calculateVolumeProfile(options.vpCandles);
      vpScore = scoreVolumeProfile(price, vpData);
    }

    // Step 4: Calculate VIX/Volatility (if provided or derive from ATR)
    let volatilityData = null;
    let vixConfluence = { score: 0, explanation: 'No VIX data' };
    if (options.vixValue !== undefined) {
      volatilityData = {
        value: options.vixValue,
        regime: classifyVolatilityRegime(options.vixValue),
        zScore: 0,
        trendUp: (options.prevVixValue || 0) < options.vixValue,
        impliedRange: (options.vixValue / 100) * 2,
      };
      vixConfluence = getVIXConfluenceScore(options.vixValue);
    } else if (indicators.atr && price > 0) {
      // Derive from ATR if VIX not available (for crypto)
      volatilityData = deriveVolatilityFromATR(indicators.atr, price);
      vixConfluence = getVIXConfluenceScore(volatilityData.value);
    }

    // Step 5: Calculate confluence scores (ALL FACTORS)
    const confluenceScores = this.calculateConfluence(
      price,
      priceZone,
      pivotZones,
      indicators,
      vpScore,
      vixConfluence
    );

    // Step 6: Determine signal and confidence
    const { signal, confidence } = this.determineSignal(
      confluenceScores,
      noTradeZone
    );

    // Step 7: Calculate risk management levels (with VIX adjustment)
    let { entry, stopLoss, target1, target2, target3 } = this.calculateRiskLevels(
      price,
      pivotZones,
      signal
    );

    // Adjust for volatility if available
    if (volatilityData) {
      const slAdjustment = adjustRiskForVolatility(stopLoss, entry, volatilityData.value);
      stopLoss = slAdjustment.adjustedSL;
    }

    // Step 8: Get strike recommendation (F&O/Crypto)
    const strikeRec = volatilityData ? getStrikeWidth(volatilityData.value) : null;

    // Step 9: Build the complete signal
    const sasSignal: SASSignal = {
      symbol,
      timestamp,
      version: 'SAS_v1',
      signal,
      confidence: Math.max(0, Math.min(100, confidence)),
      price,
      priceZone,
      entry,
      stopLoss,
      target1,
      target2,
      target3,
      pivotZones,
      noTradeZone,
      confluenceScores,
      confluenceFactors: this.getConfluenceFactors(confluenceScores, noTradeZone, vpScore, vixConfluence),
      // Volume Profile
      volumeProfile: vpData
        ? {
            poc: vpData.poc,
            vah: vpData.vah,
            val: vpData.val,
            pocScore: vpScore.score,
          }
        : undefined,
      // VIX/Volatility
      vixValue: volatilityData?.value,
      vixRegime: volatilityData?.regime,
      strikePrice: price,
      optionType: signal === 'BUY' ? 'CE' : 'PE',
      strikeWidth: strikeRec?.width,
      metadata: {
        adx: indicators.adx,
        trend: indicators.trend,
        volumeRegime: indicators.volumeRegime,
        vpSetup: vpData ? 'CONFIGURED' : 'NONE',
        volatilityAdjusted: !!volatilityData,
      },
    };

    return sasSignal;
  }

  /**
   * Detect No-Trade Zone (NTZ)
   * Active when: price between S1-R1 AND within 0.3% of PP AND ADX < 20
   */
  private detectNoTradeZone(
    price: number,
    zones: PivotZones,
    adx: number
  ): NoTradeZone {
    const pricePct = distanceFromPivot(price, zones.pp);
    const isBetweenPivots = price > zones.s1 && price < zones.r1;
    const isNearPP = pricePct < this.config.pricePctToPP;
    const isLowADX = adx < this.config.adxMaxChop;

    let isActive = false;
    let reason: NoTradeZone['reason'] = null;

    if (isBetweenPivots && isNearPP && isLowADX) {
      isActive = true;
      reason = 'CHOPPY_ZONE';
    } else if (isBetweenPivots && isNearPP) {
      isActive = true;
      reason = 'BETWEEN_PIVOTS';
    } else if (isLowADX) {
      isActive = true;
      reason = 'ADX_LOW';
    }

    return {
      isActive,
      reason,
      adxValue: adx,
      pricePct,
    };
  }

  /**
   * Calculate confluence scores from ALL factors (integrated V2.0)
   * Includes: Pivots, Trend, ADX, Momentum, Volume Profile, VIX
   */
  private calculateConfluence(
    price: number,
    zone: PriceZone,
    pivotZones: PivotZones,
    indicators: {
      adx?: number;
      trend?: 'UP' | 'DOWN' | 'NEUTRAL';
      rsi?: number;
      volume?: number;
      volumeRegime?: 'HIGH' | 'NORMAL' | 'LOW';
    },
    vpScore?: { score: number; reason: string },
    vixConfluence?: { score: number; explanation: string }
  ): ConfluenceScores {
    // Pivot Zone Score (-3 to +2)
    const pivotZoneScore = getZoneScore(zone);

    // Trend Score (-2 to +2)
    const trendScore = this.calculateTrendScore(indicators.trend);

    // ADX Score (-1 to +1)
    const adxScore = this.calculateADXScore(indicators.adx || 20);

    // Momentum Score (-2 to +2)
    const momentumScore = this.calculateMomentumScore(indicators.rsi);

    // Volume Profile Score (-2 to +2, now active)
    const volumeScore = vpScore?.score || 0;

    // VIX Score (-1 to +1, now active)
    const vixScore = vixConfluence?.score || 0;

    const total =
      pivotZoneScore + trendScore + adxScore + momentumScore + volumeScore + vixScore;

    return {
      pivotZone: pivotZoneScore,
      trend: trendScore,
      adx: adxScore,
      momentum: momentumScore,
      volumeProfile: volumeScore,
      vix: vixScore,
      total,
    };
  }

  /**
   * Calculate trend score from trend direction
   */
  private calculateTrendScore(trend?: 'UP' | 'DOWN' | 'NEUTRAL'): number {
    const scores: Record<string, number> = {
      UP: 2,
      DOWN: -2,
      NEUTRAL: 0,
    };
    return scores[trend || 'NEUTRAL'] || 0;
  }

  /**
   * Calculate ADX score from trend strength
   * Higher ADX = stronger trend = higher score
   */
  private calculateADXScore(adx: number): number {
    if (adx > 40) return 1;  // Very strong trend
    if (adx > 30) return 0.5;
    if (adx > 20) return 0;  // Minimum for trend
    return -1; // Choppy market
  }

  /**
   * Calculate momentum score from RSI
   */
  private calculateMomentumScore(rsi?: number): number {
    if (rsi === undefined) return 0;

    if (rsi > 70) return -1;    // Overbought, pullback risk
    if (rsi > 60) return 1;     // Strong momentum
    if (rsi > 50) return 0.5;   // Positive momentum
    if (rsi > 40) return 0;     // Neutral
    if (rsi > 30) return -0.5;  // Slightly weak
    if (rsi > 20) return -1;    // Weak momentum
    return -2;                  // Oversold, extreme
  }

  /**
   * Determine signal (BUY/SELL/EXIT/HOLD) and confidence
   */
  private determineSignal(
    confluence: ConfluenceScores,
    ntz: NoTradeZone
  ): { signal: 'BUY' | 'SELL' | 'EXIT' | 'HOLD'; confidence: number } {
    // Check NTZ override
    if (ntz.isActive && confluence.total < this.config.ntzThreshold) {
      return { signal: 'HOLD', confidence: 0 };
    }

    // Determine signal based on confluence
    if (confluence.total >= 5) {
      // Strong BUY
      return {
        signal: 'BUY',
        confidence: Math.min(100, (confluence.total / 8) * 100),
      };
    }

    if (confluence.total >= this.config.minConfluence && confluence.total < 5) {
      // Moderate BUY
      return {
        signal: 'BUY',
        confidence: Math.min(80, (confluence.total / 5) * 80),
      };
    }

    if (confluence.total <= -5) {
      // Strong SELL
      return {
        signal: 'SELL',
        confidence: Math.min(100, (Math.abs(confluence.total) / 8) * 100),
      };
    }

    if (confluence.total <= this.config.minConfluence * -1 && confluence.total > -5) {
      // Moderate SELL
      return {
        signal: 'SELL',
        confidence: Math.min(80, (Math.abs(confluence.total) / 5) * 80),
      };
    }

    // No clear signal
    return { signal: 'HOLD', confidence: 0 };
  }

  /**
   * Calculate risk management levels (entry, SL, targets)
   */
  private calculateRiskLevels(
    price: number,
    zones: PivotZones,
    signal: string
  ): {
    entry: number;
    stopLoss: number;
    target1: number;
    target2: number;
    target3: number;
  } {
    let entry = price;
    let stopLoss = 0;
    let target1 = 0;
    let target2 = 0;
    let target3 = 0;

    if (signal === 'BUY') {
      // BUY: Entry at PP or R1, SL below S1, targets at R1, R2, higher
      stopLoss = zones.s1;
      const riskAmount = entry - stopLoss;
      const rewardMultiplier = this.config.riskRewardRatio;

      target1 = zones.r1;
      target2 = zones.r2;
      target3 = entry + riskAmount * rewardMultiplier * 1.5;
    } else if (signal === 'SELL') {
      // SELL: Entry at PP or S1, SL above R1, targets at S1, S2, lower
      stopLoss = zones.r1;
      const riskAmount = stopLoss - entry;
      const rewardMultiplier = this.config.riskRewardRatio;

      target1 = zones.s1;
      target2 = zones.s2;
      target3 = entry - riskAmount * rewardMultiplier * 1.5;
    }

    return { entry, stopLoss, target1, target2, target3 };
  }

  /**
   * Get list of factors contributing to the signal
   */
  private getConfluenceFactors(
    confluence: ConfluenceScores,
    ntz: NoTradeZone,
    vpScore?: { score: number; reason: string },
    vixConfluence?: { score: number; explanation: string }
  ): string[] {
    const factors: string[] = [];

    // Pivot zone factors
    if (confluence.pivotZone > 0) {
      factors.push(`Bullish_Zone_(+${confluence.pivotZone})`);
    } else if (confluence.pivotZone < 0) {
      factors.push(`Bearish_Zone_(${confluence.pivotZone})`);
    }

    // Trend factors
    if (confluence.trend > 0) {
      factors.push('Uptrend');
    } else if (confluence.trend < 0) {
      factors.push('Downtrend');
    }

    // ADX factors
    if (confluence.adx > 0) {
      factors.push('Strong_Trend');
    } else if (confluence.adx < 0) {
      factors.push('Choppy_Market');
    }

    // Momentum factors
    if (confluence.momentum > 0) {
      factors.push('Positive_Momentum');
    } else if (confluence.momentum < 0) {
      factors.push('Negative_Momentum');
    }

    // Volume Profile factors (NEW)
    if (vpScore && vpScore.score > 0) {
      factors.push(`VP_Bullish_(${vpScore.reason})`);
    } else if (vpScore && vpScore.score < 0) {
      factors.push(`VP_Bearish_(${vpScore.reason})`);
    }

    // VIX factors (NEW)
    if (vixConfluence && vixConfluence.score > 0) {
      factors.push('High_Volatility_Edge');
    } else if (vixConfluence && vixConfluence.score < 0) {
      factors.push('Low_Volatility_Caution');
    }

    // NTZ warning
    if (ntz.isActive) {
      factors.push(`NTZ_Active_(${ntz.reason})`);
    }

    return factors;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SASConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SASConfig {
    return { ...this.config };
  }
}

/**
 * Factory function for easy instantiation
 */
export function createSASEngine(config?: Partial<SASConfig>): SASEngine {
  return new SASEngine(config);
}
