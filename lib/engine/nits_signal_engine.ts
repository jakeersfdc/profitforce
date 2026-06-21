/**
 * NITS (NIFTY Institutional Trading System) Signal Engine
 * TypeScript port of institutional trading strategy
 */

import { OHLCV } from './types';

export interface NITSSignal {
  symbol: string;
  timestamp: number;
  signalStatus: 'BUY' | 'SELL' | 'NO_TRADE';
  marketBias: 'Bullish' | 'Bearish' | 'Neutral';
  orbStatus: 'Breakout Up' | 'Breakout Down' | 'Inside' | 'None';
  vixStatus: 'Low' | 'High' | 'Neutral';
  liquidityStatus: 'SSL Swept' | 'BSL Swept' | 'None';
  volumeStatus: 'Strong' | 'Weak' | 'Normal';
  profileType: 'P' | 'b' | 'D' | 'I' | 'N';
  confidence: number;
  price: number;
  stopLoss: number;
  targets: { t1: number; t2: number; t3: number };
  dailyPOC: number;
  dailyVAH: number;
  dailyVAL: number;
  weeklyPOC: number;
  gapStatus: 'Gap Up' | 'Gap Down' | 'No Gap';
}

export class NITSSignalEngine {
  private dailyHigh: number = 0;
  private dailyLow: number = 0;
  private dailyClose: number = 0;
  private dailyOpen: number = 0;

  private weeklyHigh: number = 0;
  private weeklyLow: number = 0;
  private weeklyClose: number = 0;
  private weeklyOpen: number = 0;

  private orHigh: number = 0;
  private orLow: number = 0;

  private readonly VIX_LOW = 15.0;
  private readonly VIX_HIGH = 25.0;
  private readonly POC_BAND_PCT = 1.0;
  private readonly VOL_PERIOD = 20;
  private readonly VOL_STRONG = 1.3;
  private readonly VOL_WEAK = 0.7;
  private readonly BLOCK_BODY_PCT = 75.0;

  /**
   * Generate NITS signal
   */
  generateSignal(candles: OHLCV[], vixValue: number = 20): NITSSignal {
    if (candles.length < 10) {
      return this.getNullSignal();
    }

    // Update levels
    this.updateDailyLevels(candles);
    this.updateWeeklyLevels(candles);
    this.captureOpeningRange(candles);

    const currentCandle = candles[candles.length - 1];
    const price = currentCandle.close;

    // Calculate all indicators
    const marketBias = this.getMarketBias(candles);
    const orbStatus = this.getORBStatus(price);
    const vixStatus = this.getVIXStatus(vixValue);
    const liquidityStatus = this.getLiquidityStatus(candles);
    const volumeStatus = this.getVolumeStatus(candles);
    const profileType = this.getProfileType(candles);
    const [gapStatus] = this.getGapStatus(candles);

    const buySignal = this.generateBuySignal(
      marketBias,
      orbStatus,
      volumeStatus,
      liquidityStatus,
      candles
    );
    const sellSignal = this.generateSellSignal(
      marketBias,
      orbStatus,
      volumeStatus,
      liquidityStatus,
      candles
    );

    const signalStatus = buySignal ? 'BUY' : sellSignal ? 'SELL' : 'NO_TRADE';

    // Calculate targets and SL
    const [stopLoss, targets] = this.calculateRiskSetup(
      signalStatus,
      candles
    );

    // Calculate POC levels
    const [dailyPOC, dailyVAH, dailyVAL] = this.getDailyPOC();
    const [weeklyPOC] = this.getWeeklyPOC();

    // Calculate confidence
    const confidence = this.calculateConfidence(
      buySignal,
      sellSignal,
      marketBias,
      liquidityStatus,
      volumeStatus
    );

    return {
      symbol: 'NSE:NIFTY',
      timestamp: typeof currentCandle.time === 'number' ? currentCandle.time : (currentCandle.time as Date).getTime(),
      signalStatus,
      marketBias,
      orbStatus,
      vixStatus,
      liquidityStatus,
      volumeStatus,
      profileType,
      confidence,
      price,
      stopLoss,
      targets,
      dailyPOC,
      dailyVAH,
      dailyVAL,
      weeklyPOC,
      gapStatus: gapStatus as any,
    };
  }

  private updateDailyLevels(candles: OHLCV[]): void {
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    // Simple day detection (compare timestamps)
    if (this.dailyHigh === 0) {
      this.dailyHigh = prev.high;
      this.dailyLow = prev.low;
      this.dailyClose = prev.close;
      this.dailyOpen = prev.open;
    }
  }

  private updateWeeklyLevels(candles: OHLCV[]): void {
    if (candles.length >= 5) {
      const prev = candles[candles.length - 5];
      if (this.weeklyHigh === 0) {
        this.weeklyHigh = prev.high;
        this.weeklyLow = prev.low;
        this.weeklyClose = prev.close;
        this.weeklyOpen = prev.open;
      }
    }
  }

  private captureOpeningRange(candles: OHLCV[]): void {
    // Simplified: use first 3 candles as opening range
    if (candles.length >= 3) {
      const orCandles = candles.slice(0, 3);
      this.orHigh = Math.max(...orCandles.map((c) => c.high));
      this.orLow = Math.min(...orCandles.map((c) => c.low));
    }
  }

  private getMarketBias(candles: OHLCV[]): 'Bullish' | 'Bearish' | 'Neutral' {
    const current = candles[candles.length - 1];
    const [dailyPOC, dailyVAH, dailyVAL] = this.getDailyPOC();
    const [weeklyPOC] = this.getWeeklyPOC();

    if (
      current.close > dailyPOC &&
      current.close > weeklyPOC &&
      current.close > this.orHigh
    ) {
      return 'Bullish';
    }

    if (
      current.close < dailyPOC &&
      current.close < weeklyPOC &&
      current.close < this.orLow
    ) {
      return 'Bearish';
    }

    return 'Neutral';
  }

  private getORBStatus(
    price: number
  ): 'Breakout Up' | 'Breakout Down' | 'Inside' | 'None' {
    if (this.orHigh === 0 || this.orLow === 0) return 'None';

    if (price > this.orHigh) return 'Breakout Up';
    if (price < this.orLow) return 'Breakout Down';
    if (price >= this.orLow && price <= this.orHigh) return 'Inside';

    return 'None';
  }

  private getVIXStatus(vixValue: number): 'Low' | 'High' | 'Neutral' {
    if (vixValue < this.VIX_LOW) return 'Low';
    if (vixValue > this.VIX_HIGH) return 'High';
    return 'Neutral';
  }

  private getLiquidityStatus(
    candles: OHLCV[]
  ): 'SSL Swept' | 'BSL Swept' | 'None' {
    if (candles.length < 6) return 'None';

    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 6];

    // SSL Sweep: low breaks below previous low, then closes above
    if (current.low < prev.low && current.close > current.low) {
      return 'SSL Swept';
    }

    // BSL Sweep: high breaks above previous high, then closes below
    if (current.high > prev.high && current.close < current.high) {
      return 'BSL Swept';
    }

    return 'None';
  }

  private getVolumeStatus(candles: OHLCV[]): 'Strong' | 'Weak' | 'Normal' {
    if (candles.length < this.VOL_PERIOD) return 'Normal';

    const recentVolumes = candles.slice(-this.VOL_PERIOD).map((c) => c.volume);
    const avgVol =
      recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const currentVol = candles[candles.length - 1].volume;

    if (currentVol > avgVol * this.VOL_STRONG) return 'Strong';
    if (currentVol < avgVol * this.VOL_WEAK) return 'Weak';
    return 'Normal';
  }

  private getProfileType(
    candles: OHLCV[]
  ): 'P' | 'b' | 'D' | 'I' | 'N' {
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    const atr = this.calculateATR(candles, 14);
    const candleRange = current.high - current.low;
    const trend = current.close - prev.close;

    if (
      trend > 0 &&
      candleRange > atr &&
      current.close > current.open
    ) {
      return 'P'; // Bullish
    }

    if (
      trend < 0 &&
      candleRange > atr &&
      current.close < current.open
    ) {
      return 'b'; // Bearish
    }

    if (candleRange < atr * 0.8) return 'D'; // Balanced
    if (candleRange > atr * 1.2) return 'I'; // Initial Range

    return 'N'; // Neutral
  }

  private getGapStatus(
    candles: OHLCV[]
  ): ['Gap Up' | 'Gap Down' | 'No Gap', number, number] {
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    const gapDiff = current.open - prev.close;

    if (gapDiff > 0) {
      return ['Gap Up', gapDiff, prev.close];
    }

    if (gapDiff < 0) {
      return ['Gap Down', Math.abs(gapDiff), prev.close];
    }

    return ['No Gap', 0, 0];
  }

  private generateBuySignal(
    marketBias: string,
    orbStatus: string,
    volumeStatus: string,
    liquidityStatus: string,
    candles: OHLCV[]
  ): boolean {
    const bullBlock = this.isBullBlockCandle(candles);

    if (
      marketBias === 'Bullish' &&
      orbStatus === 'Breakout Up' &&
      volumeStatus === 'Strong' &&
      liquidityStatus === 'SSL Swept' &&
      bullBlock
    ) {
      return true;
    }

    if (
      marketBias === 'Bullish' &&
      orbStatus === 'Breakout Up' &&
      volumeStatus === 'Strong'
    ) {
      return true;
    }

    return false;
  }

  private generateSellSignal(
    marketBias: string,
    orbStatus: string,
    volumeStatus: string,
    liquidityStatus: string,
    candles: OHLCV[]
  ): boolean {
    const bearBlock = this.isBearBlockCandle(candles);

    if (
      marketBias === 'Bearish' &&
      orbStatus === 'Breakout Down' &&
      volumeStatus === 'Strong' &&
      liquidityStatus === 'BSL Swept' &&
      bearBlock
    ) {
      return true;
    }

    if (
      marketBias === 'Bearish' &&
      orbStatus === 'Breakout Down' &&
      volumeStatus === 'Strong'
    ) {
      return true;
    }

    return false;
  }

  private isBullBlockCandle(candles: OHLCV[]): boolean {
    const current = candles[candles.length - 1];
    const atr = this.calculateATR(candles, 14);
    const candleRange = current.high - current.low;
    const bodySize = current.close - current.open;

    return (
      bodySize > 0 &&
      candleRange > atr &&
      bodySize > (candleRange * this.BLOCK_BODY_PCT) / 100
    );
  }

  private isBearBlockCandle(candles: OHLCV[]): boolean {
    const current = candles[candles.length - 1];
    const atr = this.calculateATR(candles, 14);
    const candleRange = current.high - current.low;
    const bodySize = current.open - current.close;

    return (
      bodySize > 0 &&
      candleRange > atr &&
      bodySize > (candleRange * this.BLOCK_BODY_PCT) / 100
    );
  }

  private calculateRiskSetup(
    signalStatus: string,
    candles: OHLCV[]
  ): [number, { t1: number; t2: number; t3: number }] {
    if (signalStatus === 'NO_TRADE') {
      return [0, { t1: 0, t2: 0, t3: 0 }];
    }

    const current = candles[candles.length - 1];

    if (signalStatus === 'BUY') {
      const stopLoss = Math.min(
        candles[candles.length - 2].low,
        candles[candles.length - 3].low
      );
      const [, dailyVAH] = this.getDailyPOC();
      const [, weeklyVAH] = this.getWeeklyPOC();

      return [
        stopLoss,
        {
          t1: dailyVAH,
          t2: this.dailyHigh,
          t3: weeklyVAH,
        },
      ];
    } else {
      const stopLoss = Math.max(
        candles[candles.length - 2].high,
        candles[candles.length - 3].high
      );
      const [, , dailyVAL] = this.getDailyPOC();
      const [, , weeklyVAL] = this.getWeeklyPOC();

      return [
        stopLoss,
        {
          t1: dailyVAL,
          t2: this.dailyLow,
          t3: weeklyVAL,
        },
      ];
    }
  }

  private getDailyPOC(): [number, number, number] {
    const poc = (this.dailyHigh + this.dailyLow + this.dailyClose) / 3;
    const priceRange = this.dailyHigh - this.dailyLow;
    const vah = poc + (priceRange * this.POC_BAND_PCT) / 100;
    const val = poc - (priceRange * this.POC_BAND_PCT) / 100;

    return [poc, vah, val];
  }

  private getWeeklyPOC(): [number, number, number] {
    const poc = (this.weeklyHigh + this.weeklyLow + this.weeklyClose) / 3;
    const priceRange = this.weeklyHigh - this.weeklyLow;
    const vah = poc + (priceRange * this.POC_BAND_PCT) / 100;
    const val = poc - (priceRange * this.POC_BAND_PCT) / 100;

    return [poc, vah, val];
  }

  private calculateConfidence(
    buySignal: boolean,
    sellSignal: boolean,
    marketBias: string,
    liquidityStatus: string,
    volumeStatus: string
  ): number {
    let confidence = 0;

    if (buySignal || sellSignal) confidence += 50;
    if (marketBias !== 'Neutral') confidence += 20;
    if (liquidityStatus !== 'None') confidence += 15;
    if (volumeStatus === 'Strong') confidence += 15;

    return Math.min(confidence, 100);
  }

  private calculateATR(candles: OHLCV[], period: number = 14): number {
    let sumTR = 0;
    for (let i = Math.max(0, candles.length - period); i < candles.length; i++) {
      const candle = candles[i];
      const prev = i > 0 ? candles[i - 1] : candle;

      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prev.close),
        Math.abs(candle.low - prev.close)
      );
      sumTR += tr;
    }

    return sumTR / Math.min(period, candles.length);
  }

  private getNullSignal(): NITSSignal {
    return {
      symbol: 'NSE:NIFTY',
      timestamp: 0,
      signalStatus: 'NO_TRADE',
      marketBias: 'Neutral',
      orbStatus: 'None',
      vixStatus: 'Neutral',
      liquidityStatus: 'None',
      volumeStatus: 'Normal',
      profileType: 'N',
      confidence: 0,
      price: 0,
      stopLoss: 0,
      targets: { t1: 0, t2: 0, t3: 0 },
      dailyPOC: 0,
      dailyVAH: 0,
      dailyVAL: 0,
      weeklyPOC: 0,
      gapStatus: 'No Gap',
    };
  }
}
