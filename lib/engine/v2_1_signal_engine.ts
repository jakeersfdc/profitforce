/**
 * NIFTY PRO Trading System v2.1 Signal Engine
 * Ichimoku Cloud + Stochastic RSI + ROC Momentum Analysis
 * Automatic 0-11 Point Signal Scoring System
 */

import { OHLCV } from './types';

export interface SignalData {
  symbol: string;
  timestamp: Date;
  price: number;
  bullScore: number;
  bearScore: number;
  signalStatus: 'BUY' | 'SELL' | 'NO_TRADE' | 'NEUTRAL';
  confidence: number; // 0-100%
  indicators: {
    ichimoku: IchimokuStatus;
    stochRSI: StochRSIStatus;
    roc: ROCStatus;
    rsi: RSIStatus;
    macd: MACDStatus;
    volume: string;
    vix: string;
  };
  targets?: {
    t1: number;
    t2: number;
    t3: number;
  };
  stopLoss?: number;
}

interface IchimokuStatus {
  status: string;
  score: number; // ±3
  tenkan: number;
  kijun: number;
  senkouA: number;
  senkouB: number;
  cloudColor: 'GREEN' | 'RED' | 'YELLOW';
}

interface StochRSIStatus {
  status: string;
  score: number; // ±2
  kLine: number;
  dLine: number;
}

interface ROCStatus {
  status: string;
  score: number; // ±2
  value: number;
}

interface RSIStatus {
  value: number;
  score: number; // ±1
}

interface MACDStatus {
  line: number;
  signal: number;
  histogram: number;
  score: number; // ±1
}

export class V2_1SignalEngine {
  private readonly ICHIMOKU_TENKAN = 9;
  private readonly ICHIMOKU_KIJUN = 26;
  private readonly ICHIMOKU_SENKOU = 52;
  private readonly STOCH_RSI_LENGTH = 14;
  private readonly STOCH_RSI_SMOOTH = 3;
  private readonly ROC_LENGTH = 9;
  private readonly ROC_STRONG_THRESHOLD = 1.5;
  private readonly RSI_LENGTH = 14;
  private readonly RSI_OVERBOUGHT = 70;
  private readonly RSI_OVERSOLD = 30;

  /**
   * Generate complete signal based on OHLCV data
   */
  generateSignal(candles: OHLCV[]): SignalData {
    if (candles.length < this.ICHIMOKU_SENKOU + 10) {
      return this.getNeutralSignal(candles[candles.length - 1]);
    }

    const current = candles[candles.length - 1];
    const ichimoku = this.getIchimokuStatus(candles);
    const stochRSI = this.getStochRSIStatus(candles);
    const roc = this.getROCStatus(candles);
    const rsi = this.getRSIStatus(candles);
    const macd = this.getMACDStatus(candles);

    const bullScore = this.calculateBullScore(ichimoku, stochRSI, roc, rsi, macd);
    const bearScore = this.calculateBearScore(ichimoku, stochRSI, roc, rsi, macd);

    const signalStatus = this.determineSignalStatus(bullScore, bearScore);
    const confidence = Math.max(Math.abs(bullScore), Math.abs(bearScore)) * 10;

    return {
      symbol: 'NSE:NIFTY',
      timestamp: new Date(current.time),
      price: current.close,
      bullScore,
      bearScore,
      signalStatus,
      confidence: Math.min(confidence, 100),
      indicators: {
        ichimoku,
        stochRSI,
        roc,
        rsi,
        macd,
        volume: this.getVolumeStatus(candles),
        vix: this.getVIXStatus(),
      },
      targets: this.calculateTargets(candles),
      stopLoss: this.calculateStopLoss(candles, bullScore > bearScore),
    };
  }

  /**
   * Ichimoku Cloud System (9/26/52)
   */
  private getIchimokuStatus(candles: OHLCV[]): IchimokuStatus {
    const tenkan = this.calculateTenkan(candles);
    const kijun = this.calculateKijun(candles);
    const senkouA = (tenkan + kijun) / 2;
    const senkouB = this.calculateSenkouB(candles);

    const current = candles[candles.length - 1];
    const cloudTop = Math.max(senkouA, senkouB);
    const cloudBot = Math.min(senkouA, senkouB);

    let status = 'Neutral';
    let score = 0;
    let cloudColor: 'GREEN' | 'RED' | 'YELLOW' = 'YELLOW';

    // Cloud color and trend
    if (senkouA > senkouB) {
      cloudColor = 'GREEN';
    } else if (senkouA < senkouB) {
      cloudColor = 'RED';
    }

    // Price position vs cloud
    if (current.close > cloudTop && cloudColor === 'GREEN') {
      status = 'Bull Cloud';
      score = 3;
    } else if (current.close < cloudBot && cloudColor === 'RED') {
      status = 'Bear Cloud';
      score = -3;
    } else if (current.close > cloudTop && cloudColor === 'RED') {
      status = 'TK Bull Cross';
      score = 2;
    } else if (current.close < cloudBot && cloudColor === 'GREEN') {
      status = 'TK Bear Cross';
      score = -2;
    } else if (current.close >= cloudBot && current.close <= cloudTop) {
      status = 'In Cloud';
      score = -1;
    }

    return { status, score, tenkan, kijun, senkouA, senkouB, cloudColor };
  }

  private calculateTenkan(candles: OHLCV[]): number {
    const slice = candles.slice(-this.ICHIMOKU_TENKAN);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    return (high + low) / 2;
  }

  private calculateKijun(candles: OHLCV[]): number {
    const slice = candles.slice(-this.ICHIMOKU_KIJUN);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    return (high + low) / 2;
  }

  private calculateSenkouB(candles: OHLCV[]): number {
    const slice = candles.slice(-this.ICHIMOKU_SENKOU);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    return (high + low) / 2;
  }

  /**
   * Stochastic RSI (K/D Lines)
   */
  private getStochRSIStatus(candles: OHLCV[]): StochRSIStatus {
    const rsis = this.calculateRSI(candles, this.STOCH_RSI_LENGTH);
    const stochK = this.calculateStochastic(rsis, 14);
    const stochD = this.calculateSMA(stochK.slice(-this.STOCH_RSI_SMOOTH), this.STOCH_RSI_SMOOTH);
    const kLine = stochK[stochK.length - 1];
    const dLine = stochD[stochD.length - 1];

    let status = 'Neutral';
    let score = 0;

    if (kLine < 20 && dLine < 20) {
      status = 'Oversold';
      score = 2;
    } else if (kLine > 80 && dLine > 80) {
      status = 'Overbought';
      score = -2;
    } else if (kLine > dLine && stochK[stochK.length - 2] <= stochD[stochD.length - 2]) {
      status = 'Bull Cross';
      score = 1;
    } else if (kLine < dLine && stochK[stochK.length - 2] >= stochD[stochD.length - 2]) {
      status = 'Bear Cross';
      score = -1;
    }

    return { status, score, kLine, dLine };
  }

  /**
   * Rate of Change (ROC) - 9 period
   */
  private getROCStatus(candles: OHLCV[]): ROCStatus {
    const current = candles[candles.length - 1].close;
    const past = candles[candles.length - 1 - this.ROC_LENGTH].close;
    const roc = ((current - past) / past) * 100;

    let status = 'Momentum Dead';
    let score = 0;

    if (roc > this.ROC_STRONG_THRESHOLD) {
      status = 'Strong Bullish';
      score = 2;
    } else if (roc < -this.ROC_STRONG_THRESHOLD) {
      status = 'Strong Bearish';
      score = -2;
    } else if (roc > 0.3) {
      status = 'Weak Bullish';
      score = 1;
    } else if (roc < -0.3) {
      status = 'Weak Bearish';
      score = -1;
    }

    return { status, score, value: roc };
  }

  /**
   * RSI (14 period)
   */
  private getRSIStatus(candles: OHLCV[]): RSIStatus {
    const rsi = this.calculateRSI(candles, this.RSI_LENGTH);
    const value = rsi[rsi.length - 1];
    let score = 0;

    if (value > this.RSI_OVERBOUGHT) {
      score = -1;
    } else if (value < this.RSI_OVERSOLD) {
      score = 1;
    }

    return { value, score };
  }

  /**
   * MACD (12/26/9)
   */
  private getMACDStatus(candles: OHLCV[]): MACDStatus {
    const closes = candles.map(c => c.close);
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);

    const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
    const macdValues = [];
    for (let i = 0; i < ema12.length; i++) {
      macdValues.push(ema12[i] - ema26[i]);
    }
    const signalLine = this.calculateSMA(macdValues, 9)[macdValues.length - 1];
    const histogram = macdLine - signalLine;

    let score = 0;
    if (histogram > 0) {
      score = 1;
    } else if (histogram < 0) {
      score = -1;
    }

    return { line: macdLine, signal: signalLine, histogram, score };
  }

  /**
   * Calculate Bull Score (0-11)
   */
  private calculateBullScore(
    ichimoku: IchimokuStatus,
    stochRSI: StochRSIStatus,
    roc: ROCStatus,
    rsi: RSIStatus,
    macd: MACDStatus
  ): number {
    let score = 0;
    score += Math.max(0, ichimoku.score); // ±3
    score += Math.max(0, stochRSI.score); // ±2
    score += Math.max(0, roc.score); // ±2
    score += Math.max(0, rsi.score); // ±1
    score += Math.max(0, macd.score); // ±1
    return Math.max(0, score);
  }

  /**
   * Calculate Bear Score (-11 to 0)
   */
  private calculateBearScore(
    ichimoku: IchimokuStatus,
    stochRSI: StochRSIStatus,
    roc: ROCStatus,
    rsi: RSIStatus,
    macd: MACDStatus
  ): number {
    let score = 0;
    score += Math.min(0, ichimoku.score);
    score += Math.min(0, stochRSI.score);
    score += Math.min(0, roc.score);
    score += Math.min(0, rsi.score);
    score += Math.min(0, macd.score);
    return Math.min(0, score);
  }

  /**
   * Determine final signal status
   */
  private determineSignalStatus(bullScore: number, bearScore: number): 'BUY' | 'SELL' | 'NO_TRADE' | 'NEUTRAL' {
    if (bullScore >= 3) return 'BUY';
    if (bearScore <= -3) return 'SELL';
    if (Math.abs(bullScore) < 2 && Math.abs(bearScore) < 2) return 'NO_TRADE';
    return 'NEUTRAL';
  }

  /**
   * Helper: RSI Calculation
   */
  private calculateRSI(candles: OHLCV[], period: number): number[] {
    const closes = candles.map(c => c.close);
    const changes: number[] = [];

    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    const gains = changes.map(c => (c > 0 ? c : 0));
    const losses = changes.map(c => (c < 0 ? -c : 0));

    const avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
    const avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;

    const rsi: number[] = [];
    let prevAvgGain = avgGain;
    let prevAvgLoss = avgLoss;

    for (let i = period; i < changes.length; i++) {
      const currentAvgGain = (prevAvgGain * (period - 1) + (changes[i] > 0 ? changes[i] : 0)) / period;
      const currentAvgLoss = (prevAvgLoss * (period - 1) + (changes[i] < 0 ? -changes[i] : 0)) / period;

      const rs = currentAvgGain / (currentAvgLoss || 0.0001);
      rsi.push(100 - 100 / (1 + rs));

      prevAvgGain = currentAvgGain;
      prevAvgLoss = currentAvgLoss;
    }

    return rsi;
  }

  /**
   * Helper: Stochastic Calculation
   */
  private calculateStochastic(values: number[], period: number): number[] {
    const stoch: number[] = [];

    for (let i = period - 1; i < values.length; i++) {
      const slice = values.slice(i - period + 1, i + 1);
      const high = Math.max(...slice);
      const low = Math.min(...slice);
      const k = ((values[i] - low) / (high - low + 0.0001)) * 100;
      stoch.push(k);
    }

    return stoch;
  }

  /**
   * Helper: EMA Calculation
   */
  private calculateEMA(values: number[], period: number): number[] {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);

    let sma = values.slice(0, period).reduce((a, b) => a + b) / period;
    ema.push(sma);

    for (let i = period; i < values.length; i++) {
      sma = (values[i] - sma) * multiplier + sma;
      ema.push(sma);
    }

    return ema;
  }

  /**
   * Helper: SMA Calculation
   */
  private calculateSMA(values: number[], period: number): number[] {
    const sma: number[] = [];

    for (let i = period - 1; i < values.length; i++) {
      const avg = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      sma.push(avg);
    }

    return sma;
  }

  /**
   * Helper: Volume Status
   */
  private getVolumeStatus(candles: OHLCV[]): string {
    const volumes = candles.slice(-20).map(c => c.volume);
    const avgVolume = volumes.reduce((a, b) => a + b) / volumes.length;
    const currentVolume = candles[candles.length - 1].volume;

    if (currentVolume > avgVolume * 1.5) return 'Strong';
    if (currentVolume < avgVolume * 0.7) return 'Weak';
    return 'Normal';
  }

  /**
   * Helper: VIX Status (mock for now)
   */
  private getVIXStatus(): string {
    return 'Neutral'; // TODO: Integrate real VIX data
  }

  /**
   * Calculate targets
   */
  private calculateTargets(candles: OHLCV[]): { t1: number; t2: number; t3: number } {
    const atr = this.calculateATR(candles, 14);
    const current = candles[candles.length - 1].close;

    return {
      t1: current + atr,
      t2: current + atr * 2,
      t3: current + atr * 3,
    };
  }

  /**
   * Calculate stop loss
   */
  private calculateStopLoss(candles: OHLCV[], isBuy: boolean): number {
    const lows = candles.slice(-3).map(c => c.low);
    const highs = candles.slice(-3).map(c => c.high);

    return isBuy ? Math.min(...lows) : Math.max(...highs);
  }

  /**
   * Helper: ATR Calculation
   */
  private calculateATR(candles: OHLCV[], period: number): number {
    const trs: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trs.push(tr);
    }

    return trs.slice(-period).reduce((a, b) => a + b) / period;
  }

  /**
   * Neutral signal fallback
   */
  private getNeutralSignal(candle: OHLCV): SignalData {
    return {
      symbol: 'NSE:NIFTY',
      timestamp: new Date(candle.time),
      price: candle.close,
      bullScore: 0,
      bearScore: 0,
      signalStatus: 'NEUTRAL',
      confidence: 0,
      indicators: {
        ichimoku: { status: 'Insufficient Data', score: 0, tenkan: 0, kijun: 0, senkouA: 0, senkouB: 0, cloudColor: 'YELLOW' },
        stochRSI: { status: 'Neutral', score: 0, kLine: 50, dLine: 50 },
        roc: { status: 'Neutral', score: 0, value: 0 },
        rsi: { value: 50, score: 0 },
        macd: { line: 0, signal: 0, histogram: 0, score: 0 },
        volume: 'Normal',
        vix: 'Normal',
      },
    };
  }
}
