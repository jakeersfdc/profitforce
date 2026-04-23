/**
 * SignalEngine — Core automated trading signal engine.
 * Generates BUY/SELL/EXIT signals using a multi-indicator confluence system:
 *   RSI(14), MACD(12,26,9), Bollinger Bands(20,2), VWAP, EMA(9/21/50/200),
 *   SuperTrend(10,3), ADX(14), ATR(14), Volume Profile, OBV
 *
 * Signals are generated only when 3+ indicators agree (confluence).
 * Each signal includes: entry, stop-loss, target, trailing-stop, confidence score.
 */

import { getHistorical, fetchQuote, suggestOptionStrikes } from '../stockUtils';

// ── Indicator helpers ─────────────────────────────────────────────────────────

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

function rsi(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  let gainSum = 0, lossSum = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { result.push(null); continue; }
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    if (i <= period) {
      gainSum += gain; lossSum += loss;
      if (i < period) { result.push(null); continue; }
      const avgGain = gainSum / period;
      const avgLoss = lossSum / period;
      result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    } else {
      const prevAvgGain = gainSum / period;
      const prevAvgLoss = lossSum / period;
      gainSum = (prevAvgGain * (period - 1) + gain);
      lossSum = (prevAvgLoss * (period - 1) + loss);
      const avgGain = gainSum / period;
      const avgLoss = lossSum / period;
      result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
  }
  return result;
}

function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

function bollingerBands(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] == null) { upper.push(null); lower.push(null); continue; }
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mid[i]!) ** 2;
    const stdDev = Math.sqrt(variance / period);
    upper.push(mid[i]! + mult * stdDev);
    lower.push(mid[i]! - mult * stdDev);
  }
  return { upper, mid, lower };
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const tr: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { tr.push(highs[i] - lows[i]); continue; }
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  return sma(tr, period);
}

function adx(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 0; i < highs.length; i++) {
    if (i === 0) { plusDM.push(0); minusDM.push(0); continue; }
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const atrArr = atr(highs, lows, closes, period);
  const smoothPlusDM = sma(plusDM, period);
  const smoothMinusDM = sma(minusDM, period);
  const dx: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    const a = atrArr[i], sp = smoothPlusDM[i], sm = smoothMinusDM[i];
    if (a == null || sp == null || sm == null || a === 0) { dx.push(null); continue; }
    const plusDI = (sp / a) * 100;
    const minusDI = (sm / a) * 100;
    const sum = plusDI + minusDI;
    dx.push(sum === 0 ? 0 : Math.abs(plusDI - minusDI) / sum * 100);
  }
  return sma(dx.map(v => v ?? 0), period);
}

function superTrend(highs: number[], lows: number[], closes: number[], period = 10, multiplier = 3) {
  const atrArr = atr(highs, lows, closes, period);
  const trend: ('up' | 'down')[] = [];
  const stLine: (number | null)[] = [];
  let prevUpper = 0, prevLower = 0;

  for (let i = 0; i < closes.length; i++) {
    const a = atrArr[i];
    if (a == null) { trend.push('up'); stLine.push(null); continue; }
    const basicUpper = (highs[i] + lows[i]) / 2 + multiplier * a;
    const basicLower = (highs[i] + lows[i]) / 2 - multiplier * a;
    const finalUpper = (i > 0 && basicUpper < prevUpper && closes[i - 1] > prevUpper) ? prevUpper : basicUpper;
    const finalLower = (i > 0 && basicLower > prevLower && closes[i - 1] < prevLower) ? prevLower : basicLower;

    if (i === 0) {
      trend.push('up');
      stLine.push(finalLower);
    } else if (trend[i - 1] === 'up') {
      if (closes[i] < finalLower) { trend.push('down'); stLine.push(finalUpper); }
      else { trend.push('up'); stLine.push(finalLower); }
    } else {
      if (closes[i] > finalUpper) { trend.push('up'); stLine.push(finalLower); }
      else { trend.push('down'); stLine.push(finalUpper); }
    }
    prevUpper = finalUpper;
    prevLower = finalLower;
  }
  return { trend, stLine };
}

function obv(closes: number[], volumes: number[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) result.push(result[i - 1] + volumes[i]);
    else if (closes[i] < closes[i - 1]) result.push(result[i - 1] - volumes[i]);
    else result.push(result[i - 1]);
  }
  return result;
}

function vwap(highs: number[], lows: number[], closes: number[], volumes: number[]): number[] {
  const result: number[] = [];
  let cumVol = 0, cumTP = 0;
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumVol += volumes[i];
    cumTP += tp * volumes[i];
    result.push(cumVol > 0 ? cumTP / cumVol : tp);
  }
  return result;
}

// ── Signal types ──────────────────────────────────────────────────────────────

// ── Support & Resistance helpers ──────────────────────────────────────────────

/** Classic Pivot Points (Standard/Floor) from previous day OHLC */
function pivotPoints(high: number, low: number, close: number) {
  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const s1 = 2 * pp - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  const r3 = high + 2 * (pp - low);
  const s3 = low - 2 * (high - pp);
  return { pp, r1, r2, r3, s1, s2, s3 };
}

/** Fibonacci retracement levels from a swing range */
function fibLevels(swingHigh: number, swingLow: number) {
  const range = swingHigh - swingLow;
  return {
    fib236: swingHigh - range * 0.236,
    fib382: swingHigh - range * 0.382,
    fib500: swingHigh - range * 0.500,
    fib618: swingHigh - range * 0.618,
    fib786: swingHigh - range * 0.786,
  };
}

/** Detect swing highs and lows (local peaks/troughs using left/right window) */
function swingHighsLows(highs: number[], lows: number[], window = 5) {
  const swingHighs: { index: number; price: number }[] = [];
  const swingLows: { index: number; price: number }[] = [];

  for (let i = window; i < highs.length - window; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= window; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
    }
    if (isHigh) swingHighs.push({ index: i, price: highs[i] });
    if (isLow) swingLows.push({ index: i, price: lows[i] });
  }

  return { swingHighs, swingLows };
}

/** Find nearest support and resistance levels from swing points */
function findSupportResistance(
  price: number,
  highs: number[],
  lows: number[],
  closes: number[],
) {
  const n = closes.length;
  const prevHigh = highs[n - 2];
  const prevLow = lows[n - 2];
  const prevClose = closes[n - 2];

  // 1. Pivot points from previous bar
  const pivots = pivotPoints(prevHigh, prevLow, prevClose);

  // 2. Swing highs/lows (use last 60 bars with a 3-bar window for more frequent pivots)
  const lookback = Math.min(n, 60);
  const hSlice = highs.slice(-lookback);
  const lSlice = lows.slice(-lookback);
  const { swingHighs, swingLows } = swingHighsLows(hSlice, lSlice, 3);

  // 3. Fibonacci levels from 20-day swing range
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const fibs = fibLevels(recentHigh, recentLow);

  // Collect all resistance levels above current price
  const rawResistance = [
    pivots.r1, pivots.r2, pivots.r3,
    fibs.fib236, fibs.fib382,
    ...swingHighs.map(s => s.price),
  ].filter(l => l > price * 1.001); // at least 0.1% above price

  // Collect all support levels below current price
  const rawSupport = [
    pivots.s1, pivots.s2, pivots.s3,
    fibs.fib618, fibs.fib786,
    ...swingLows.map(s => s.price),
  ].filter(l => l < price * 0.999); // at least 0.1% below price

  // Sort and deduplicate (merge levels within 0.3% of each other)
  const dedup = (levels: number[], ascending: boolean): number[] => {
    const sorted = [...levels].sort((a, b) => ascending ? a - b : b - a);
    const result: number[] = [];
    for (const l of sorted) {
      if (result.length === 0 || Math.abs(l - result[result.length - 1]) / price > 0.003) {
        result.push(l);
      }
    }
    return result;
  };

  const resistanceLevels = dedup(rawResistance, true).slice(0, 3);   // nearest 3 resistance
  const supportLevels = dedup(rawSupport, false).slice(0, 3);        // nearest 3 support

  return {
    pivots,
    fibs,
    resistanceLevels,
    supportLevels,
    swingHigh: recentHigh,
    swingLow: recentLow,
  };
}

export interface Signal {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'EXIT' | 'HOLD';
  entryPrice: number;
  stopLoss: number | null;
  targetPrice: number | null;
  trailingStop: number | null;
  strength: number;      // 0-100
  confidence: number;    // 0.0-1.0
  reason: string;
  indicators: Record<string, any>;
  timestamp: string;
  fnoRecommendation?: FnORecommendation | null;
}

export interface FnORecommendation {
  type: 'BUY_CALL' | 'BUY_PUT' | 'SELL_CALL' | 'SELL_PUT' | 'IRON_CONDOR' | 'STRADDLE' | 'STRANGLE' | 'NONE';
  strike: number | null;
  expiry: string | null;
  premium: number | null;
  delta: number | null;
  reason: string;
}

// ── Main signal generator ─────────────────────────────────────────────────────

export async function generateSignal(symbol: string): Promise<Signal> {
  const [histRaw, liveQuoteEarly] = await Promise.all([
    getHistorical(symbol, undefined, undefined, '1d'),
    fetchQuote(symbol),
  ]);

  // Splice today's live bar into the historical series so every indicator
  // (RSI, MACD, Bollinger, EMA, SuperTrend, ADX, ATR, VWAP, OBV) reflects
  // the CURRENT market instead of yesterday's close. This is the difference
  // between "feels stale" and "matches what a trader sees on screen".
  const hist = Array.isArray(histRaw) ? [...histRaw] : [];
  const liveQ = liveQuoteEarly as {
    price?: number;
    dayHigh?: number;
    dayLow?: number;
    dayOpen?: number;
    volume?: number;
  } | null;
  const ltp = Number(liveQ?.price ?? 0);
  if (ltp > 0 && hist.length > 0) {
    const last = hist[hist.length - 1];
    const lastDate = last?.date ? new Date(last.date) : null;
    const today = new Date();
    const sameDay = lastDate &&
      lastDate.getUTCFullYear() === today.getUTCFullYear() &&
      lastDate.getUTCMonth() === today.getUTCMonth() &&
      lastDate.getUTCDate() === today.getUTCDate();
    const dayHigh = Number(liveQ?.dayHigh ?? ltp);
    const dayLow = Number(liveQ?.dayLow ?? ltp);
    const dayOpen = Number(liveQ?.dayOpen ?? last?.open ?? ltp);
    const dayVol = Number(liveQ?.volume ?? last?.volume ?? 0);
    if (sameDay) {
      // Update today's bar with the latest LTP + day high/low/volume.
      hist[hist.length - 1] = {
        ...last,
        high: Math.max(Number(last.high ?? 0), dayHigh, ltp),
        low: Math.min(Number(last.low ?? Number.MAX_VALUE), dayLow, ltp),
        close: ltp,
        volume: Math.max(Number(last.volume ?? 0), dayVol),
      };
    } else {
      // Today's bar missing entirely — append it.
      hist.push({
        date: today.toISOString(),
        open: dayOpen,
        high: Math.max(dayHigh, ltp, dayOpen),
        low: Math.min(dayLow > 0 ? dayLow : ltp, ltp, dayOpen),
        close: ltp,
        volume: dayVol,
      });
    }
  }

  if (!Array.isArray(hist) || hist.length < 50) {
    const quote = liveQuoteEarly ?? await fetchQuote(symbol);
    return {
      symbol, signal: 'HOLD', entryPrice: quote.price, stopLoss: null, targetPrice: null,
      trailingStop: null, strength: 0, confidence: 0, reason: 'Insufficient data (need 50+ bars)',
      indicators: {}, timestamp: new Date().toISOString(), fnoRecommendation: null
    };
  }

  const closes = hist.map(h => Number(h.close));
  const highs = hist.map(h => Number(h.high));
  const lows = hist.map(h => Number(h.low));
  const volumes = hist.map(h => Number(h.volume));
  const n = closes.length;
  const lastClose = closes[n - 1];
  const prevClose = closes[n - 2];

  // Compute all indicators
  const rsiArr = rsi(closes, 14);
  const rsiVal = rsiArr[n - 1] ?? 50;

  const { macdLine, signalLine, histogram } = macd(closes);
  const macdVal = macdLine[n - 1];
  const macdSig = signalLine[n - 1];
  const macdHist = histogram[n - 1];
  const macdHistPrev = histogram[n - 2];

  const bb = bollingerBands(closes, 20, 2);
  const bbUpper = bb.upper[n - 1];
  const bbLower = bb.lower[n - 1];
  const bbMid = bb.mid[n - 1];

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);

  const st = superTrend(highs, lows, closes, 10, 3);
  const stTrend = st.trend[n - 1];
  const stTrendPrev = st.trend[n - 2];

  const adxArr = adx(highs, lows, closes, 14);
  const adxVal = adxArr[n - 1] ?? 0;

  const atrArr = atr(highs, lows, closes, 14);
  const atrVal = atrArr[n - 1] ?? 0;

  const vwapArr = vwap(highs, lows, closes, volumes);
  const vwapVal = vwapArr[n - 1];

  const obvArr = obv(closes, volumes);
  const obvSlope = obvArr[n - 1] - obvArr[Math.max(0, n - 6)];

  // ── Support & Resistance levels ───────────────────────────────────────────
  const sr = findSupportResistance(lastClose, highs, lows, closes);
  const { pivots, fibs, resistanceLevels, supportLevels } = sr;
  const nearestResistance = resistanceLevels[0] ?? null;
  const nearestSupport = supportLevels[0] ?? null;

  // ── Primary trend context (expert-trader filter) ──────────────────────────
  // A professional technician never buys oversold in a confirmed downtrend
  // and never shorts overbought in a confirmed uptrend. We detect the primary
  // trend from EMA alignment + slope, and use it to veto counter-trend
  // mean-reversion signals ("don't catch a falling knife").
  const emaBull = ema9[n - 1] > ema21[n - 1] && ema21[n - 1] > ema50[n - 1];
  const emaBear = ema9[n - 1] < ema21[n - 1] && ema21[n - 1] < ema50[n - 1];
  const ema50Slope = ema50[n - 1] - ema50[Math.max(0, n - 6)];
  const ema200Slope = ema200[n - 1] - ema200[Math.max(0, n - 11)];
  const longTermBull = lastClose > ema200[n - 1] && ema200Slope >= 0;
  const longTermBear = lastClose < ema200[n - 1] && ema200Slope <= 0;
  const strongUptrend = emaBull && ema50Slope > 0 && longTermBull;
  const strongDowntrend = emaBear && ema50Slope < 0 && longTermBear;

  // Today's candle (price-action) — sharp closes shouldn't be ignored
  const dayChangePct = prevClose > 0 ? (lastClose - prevClose) / prevClose : 0;
  const isSharpDownDay = dayChangePct <= -0.012;  // -1.2%+ is a decisive bear close
  const isSharpUpDay = dayChangePct >= 0.012;
  const isModerateDownDay = dayChangePct <= -0.005;
  const isModerateUpDay = dayChangePct >= 0.005;

  // ── Confluence scoring ────────────────────────────────────────────────────
  let bullScore = 0;
  let bearScore = 0;
  const reasons: string[] = [];

  // 1. RSI — oversold is only a BUY trigger when trend is not actively breaking down.
  //    In a strong downtrend oversold RSI can persist for weeks (falling knife).
  if (rsiVal < 30) {
    if (strongDowntrend || isSharpDownDay) {
      // Oversold within a bear trend / on a red day → no bull credit, actually bearish continuation
      bearScore += 1;
      reasons.push(`RSI oversold in downtrend (${rsiVal.toFixed(1)}) — continuation risk`);
    } else {
      bullScore += 2;
      reasons.push(`RSI oversold (${rsiVal.toFixed(1)})`);
    }
  }
  else if (rsiVal < 40) {
    if (strongDowntrend) {
      // Weak RSI in downtrend is not a bull signal
      reasons.push(`RSI low (${rsiVal.toFixed(1)}) in downtrend`);
    } else {
      bullScore += 1;
      reasons.push(`RSI low (${rsiVal.toFixed(1)})`);
    }
  }
  else if (rsiVal > 70) {
    if (strongUptrend || isSharpUpDay) {
      bullScore += 1;
      reasons.push(`RSI overbought in uptrend (${rsiVal.toFixed(1)}) — momentum`);
    } else {
      bearScore += 2;
      reasons.push(`RSI overbought (${rsiVal.toFixed(1)})`);
    }
  }
  else if (rsiVal > 60) {
    if (strongUptrend) {
      reasons.push(`RSI high (${rsiVal.toFixed(1)}) in uptrend`);
    } else {
      bearScore += 1;
      reasons.push(`RSI high (${rsiVal.toFixed(1)})`);
    }
  }

  // 2. MACD
  if (macdHist > 0 && macdHistPrev <= 0) { bullScore += 2; reasons.push('MACD bullish cross'); }
  else if (macdHist > 0) { bullScore += 1; reasons.push('MACD positive'); }
  if (macdHist < 0 && macdHistPrev >= 0) { bearScore += 2; reasons.push('MACD bearish cross'); }
  else if (macdHist < 0) { bearScore += 1; reasons.push('MACD negative'); }

  // 3. Bollinger Bands — lower-band touch is only bullish if trend isn't breaking down
  if (bbLower && lastClose <= bbLower) {
    if (strongDowntrend || isSharpDownDay) {
      bearScore += 1;
      reasons.push('Price breaking lower BB in downtrend');
    } else {
      bullScore += 2;
      reasons.push('Price at lower BB');
    }
  }
  if (bbUpper && lastClose >= bbUpper) {
    if (strongUptrend || isSharpUpDay) {
      bullScore += 1;
      reasons.push('Price breaking upper BB in uptrend');
    } else {
      bearScore += 2;
      reasons.push('Price at upper BB');
    }
  }

  // 4. EMA alignment
  if (ema9[n - 1] > ema21[n - 1] && ema21[n - 1] > ema50[n - 1]) { bullScore += 2; reasons.push('EMA 9>21>50 aligned'); }
  if (ema9[n - 1] < ema21[n - 1] && ema21[n - 1] < ema50[n - 1]) { bearScore += 2; reasons.push('EMA 9<21<50 aligned'); }
  // Golden/death cross
  if (n > 1 && ema50[n - 1] > ema200[n - 1] && ema50[n - 2] <= ema200[n - 2]) { bullScore += 2; reasons.push('Golden cross (EMA50>200)'); }
  if (n > 1 && ema50[n - 1] < ema200[n - 1] && ema50[n - 2] >= ema200[n - 2]) { bearScore += 2; reasons.push('Death cross (EMA50<200)'); }

  // 5. SuperTrend
  if (stTrend === 'up') { bullScore += 2; reasons.push('SuperTrend UP'); }
  if (stTrend === 'down') { bearScore += 2; reasons.push('SuperTrend DOWN'); }
  if (stTrend === 'up' && stTrendPrev === 'down') { bullScore += 1; reasons.push('SuperTrend flipped UP'); }
  if (stTrend === 'down' && stTrendPrev === 'up') { bearScore += 1; reasons.push('SuperTrend flipped DOWN'); }

  // 6. ADX (trend strength)
  const trending = adxVal > 25;
  if (trending) reasons.push(`Strong trend (ADX ${adxVal.toFixed(1)})`);

  // 7. VWAP
  if (lastClose > vwapVal) { bullScore += 1; reasons.push('Above VWAP'); }
  if (lastClose < vwapVal) { bearScore += 1; reasons.push('Below VWAP'); }

  // 8. OBV momentum
  if (obvSlope > 0) { bullScore += 1; reasons.push('OBV rising'); }
  if (obvSlope < 0) { bearScore += 1; reasons.push('OBV falling'); }

  // 9. Volume confirmation — last bar vs 20-bar avg
  const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volRatio = volumes[n - 1] / (avgVol20 || 1);
  if (volRatio > 1.5) {
    if (lastClose > prevClose) { bullScore += 1; reasons.push(`High volume up (${volRatio.toFixed(1)}x)`); }
    else { bearScore += 1; reasons.push(`High volume down (${volRatio.toFixed(1)}x)`); }
  }

  // 10. Support & Resistance proximity scoring
  //     Only treat support as bullish if it's holding (not in an active breakdown).
  if (nearestSupport) {
    const distToSupport = (lastClose - nearestSupport) / lastClose;
    const breakingSupport = strongDowntrend || isSharpDownDay;
    if (distToSupport >= 0 && distToSupport < 0.01) {
      if (breakingSupport) {
        bearScore += 2;
        reasons.push(`Testing support ₹${round(nearestSupport)} in weak market — breakdown risk`);
      } else {
        bullScore += 2;
        reasons.push(`At support ₹${round(nearestSupport)}`);
      }
    } else if (distToSupport >= 0 && distToSupport < 0.02) {
      if (breakingSupport) {
        bearScore += 1;
        reasons.push(`Near support ₹${round(nearestSupport)} under pressure`);
      } else {
        bullScore += 1;
        reasons.push(`Near support ₹${round(nearestSupport)}`);
      }
    }
  }
  if (nearestResistance) {
    const distToResistance = (nearestResistance - lastClose) / lastClose;
    const breakingResistance = strongUptrend || isSharpUpDay;
    if (distToResistance >= 0 && distToResistance < 0.01) {
      if (breakingResistance) {
        bullScore += 2;
        reasons.push(`Breaking resistance ₹${round(nearestResistance)}`);
      } else {
        bearScore += 2;
        reasons.push(`At resistance ₹${round(nearestResistance)}`);
      }
    } else if (distToResistance >= 0 && distToResistance < 0.02) {
      if (breakingResistance) {
        bullScore += 1;
        reasons.push(`Approaching resistance ₹${round(nearestResistance)} with momentum`);
      } else {
        bearScore += 1;
        reasons.push(`Near resistance ₹${round(nearestResistance)}`);
      }
    }
  }

  // 12. Today's price-action — a decisive daily close is the single most
  //     important short-term signal a technician reads. Ignoring it is how
  //     systems end up "bullish" on a day the market fell hard.
  if (isSharpDownDay) {
    bearScore += 3;
    reasons.push(`Sharp bear close (${(dayChangePct * 100).toFixed(2)}%)`);
  } else if (isModerateDownDay) {
    bearScore += 1;
    reasons.push(`Bear close (${(dayChangePct * 100).toFixed(2)}%)`);
  }
  if (isSharpUpDay) {
    bullScore += 3;
    reasons.push(`Sharp bull close (+${(dayChangePct * 100).toFixed(2)}%)`);
  } else if (isModerateUpDay) {
    bullScore += 1;
    reasons.push(`Bull close (+${(dayChangePct * 100).toFixed(2)}%)`);
  }

  // 13. Candlestick reversal patterns (bullish/bearish engulfing on last bar)
  if (n >= 2) {
    const prevOpen = Number(hist[n - 2].open ?? prevClose);
    const lastOpen = Number(hist[n - 1].open ?? lastClose);
    const prevBearish = prevClose < prevOpen;
    const prevBullish = prevClose > prevOpen;
    const lastBullishCandle = lastClose > lastOpen;
    const lastBearishCandle = lastClose < lastOpen;
    // Bullish engulfing: previous red, current green engulfs previous body
    if (prevBearish && lastBullishCandle && lastOpen <= prevClose && lastClose >= prevOpen) {
      bullScore += 2;
      reasons.push('Bullish engulfing');
    }
    // Bearish engulfing
    if (prevBullish && lastBearishCandle && lastOpen >= prevClose && lastClose <= prevOpen) {
      bearScore += 2;
      reasons.push('Bearish engulfing');
    }
  }

  // 11. Pivot point position
  if (lastClose > pivots.pp) {
    bullScore += 1;
    reasons.push(`Above pivot (₹${round(pivots.pp)})`);
  } else {
    bearScore += 1;
    reasons.push(`Below pivot (₹${round(pivots.pp)})`);
  }

  // ── Determine signal ──────────────────────────────────────────────────────
  const netScore = bullScore - bearScore;
  const totalVotes = bullScore + bearScore;
  const minConfluence = 3; // require 3+ indicator agreement for actionable signal

  let signal: 'BUY' | 'SELL' | 'EXIT' | 'HOLD' = 'HOLD';
  if (netScore >= minConfluence) signal = 'BUY';
  else if (netScore <= -minConfluence) signal = 'SELL';

  // ── Counter-trend veto (expert-trader discipline) ─────────────────────────
  // A BUY on a sharp bear day in a confirmed downtrend with strong ADX is
  // almost always a trap. Downgrade to HOLD instead of issuing a bad signal.
  const strongTrend = adxVal > 25;
  if (signal === 'BUY' && strongDowntrend && strongTrend && isSharpDownDay) {
    signal = 'HOLD';
    reasons.push('VETO: counter-trend BUY on sharp bear day in confirmed downtrend');
  }
  if (signal === 'SELL' && strongUptrend && strongTrend && isSharpUpDay) {
    signal = 'HOLD';
    reasons.push('VETO: counter-trend SELL on sharp bull day in confirmed uptrend');
  }
  // Weaker guard: any BUY on a sharp bear day needs overwhelming confluence
  if (signal === 'BUY' && isSharpDownDay && netScore < minConfluence + 2) {
    signal = 'HOLD';
    reasons.push('VETO: insufficient confluence for BUY on sharp bear day');
  }
  if (signal === 'SELL' && isSharpUpDay && netScore > -(minConfluence + 2)) {
    signal = 'HOLD';
    reasons.push('VETO: insufficient confluence for SELL on sharp bull day');
  }

  // EXIT signal: counter-trend trigger when in position context
  if (signal === 'BUY' && rsiVal > 75 && macdHist < macdHistPrev) signal = 'EXIT';
  if (signal === 'SELL' && rsiVal < 25 && macdHist > macdHistPrev) signal = 'EXIT';

  // ── Compute entry / stop / target using ATR + S/R levels ───────────────────
  // Use live quote price instead of last historical close for accurate entry
  const liveQuote = await fetchQuote(symbol);
  const entryPrice = liveQuote.price > 0 ? liveQuote.price : lastClose;
  let stopLoss: number | null = null;
  let targetPrice: number | null = null;
  let trailingStop: number | null = null;

  if (atrVal > 0 && signal !== 'HOLD') {
    const atrMultStop = 1.5;
    const atrMultTarget = 3.0;
    const atrMultTrail = 2.0;

    if (signal === 'BUY') {
      // Stop loss: use nearest support or ATR-based, whichever is tighter but not too close
      const atrStop = entryPrice - atrMultStop * atrVal;
      if (nearestSupport && nearestSupport < entryPrice) {
        // Place stop just below support (with ATR buffer)
        const srStop = nearestSupport - atrVal * 0.3;
        // Use the higher of the two (tighter stop) but not above entry
        stopLoss = round(Math.max(srStop, atrStop));
      } else {
        stopLoss = round(atrStop);
      }
      // Target: use nearest resistance or ATR-based, whichever is further
      const atrTarget = entryPrice + atrMultTarget * atrVal;
      if (nearestResistance && nearestResistance > entryPrice) {
        // Target at resistance (or ATR target if resistance is too close)
        targetPrice = round(Math.max(nearestResistance, atrTarget));
      } else {
        targetPrice = round(atrTarget);
      }
      trailingStop = round(entryPrice - atrMultTrail * atrVal);
    } else if (signal === 'SELL') {
      // Stop loss: use nearest resistance or ATR-based
      const atrStop = entryPrice + atrMultStop * atrVal;
      if (nearestResistance && nearestResistance > entryPrice) {
        const srStop = nearestResistance + atrVal * 0.3;
        stopLoss = round(Math.min(srStop, atrStop));
      } else {
        stopLoss = round(atrStop);
      }
      // Target: use nearest support or ATR-based
      const atrTarget = entryPrice - atrMultTarget * atrVal;
      if (nearestSupport && nearestSupport < entryPrice) {
        targetPrice = round(Math.min(nearestSupport, atrTarget));
      } else {
        targetPrice = round(atrTarget);
      }
      trailingStop = round(entryPrice + atrMultTrail * atrVal);
    } else {
      // EXIT — just report current price
      stopLoss = null;
      targetPrice = null;
    }
  }

  // ── Strength & confidence ─────────────────────────────────────────────────
  const strength = Math.min(100, Math.round((Math.abs(netScore) / Math.max(totalVotes, 1)) * 100));
  const confidence = Math.min(1.0, Math.abs(netScore) / 10);

  // ── F&O recommendation ────────────────────────────────────────────────────
  let fnoRec: FnORecommendation | null = null;
  if (signal === 'BUY' || signal === 'SELL') {
    // Compute strike prices from entry price
    const tick = entryPrice >= 1000 ? 50 : entryPrice >= 500 ? 25 : 10;
    const strikesData = await suggestOptionStrikes(symbol, entryPrice, tick, 2);
    const strikesList: number[] = (strikesData && 'strikes' in strikesData) ? strikesData.strikes as number[] : [];
    const atm: number = (strikesData && 'atm' in strikesData) ? strikesData.atm as number : Math.round(entryPrice / tick) * tick;
    const atmIdx = strikesList.indexOf(atm) >= 0 ? strikesList.indexOf(atm) : Math.floor(strikesList.length / 2);

    if (signal === 'BUY') {
      // BUY signal → recommend CALL at ATM+1 strike
      const pick = strikesList[Math.min(atmIdx + 1, strikesList.length - 1)] ?? atm;
      fnoRec = { type: 'BUY_CALL', strike: pick, expiry: null, premium: null, delta: null, reason: `Bull signal (${reasons.slice(0, 3).join(', ')})` };
    } else {
      // SELL signal → recommend PUT at ATM-1 strike
      const pick = strikesList[Math.max(atmIdx - 1, 0)] ?? atm;
      fnoRec = { type: 'BUY_PUT', strike: pick, expiry: null, premium: null, delta: null, reason: `Bear signal (${reasons.slice(0, 3).join(', ')})` };
    }
  }

  // Build S/R level strings for display
  const supportStr = supportLevels.slice(0, 3).map(l => `₹${round(l)}`).join(' / ') || '—';
  const resistanceStr = resistanceLevels.slice(0, 3).map(l => `₹${round(l)}`).join(' / ') || '—';
  reasons.push(`S: ${supportStr}`);
  reasons.push(`R: ${resistanceStr}`);

  return {
    symbol,
    signal,
    entryPrice,
    stopLoss,
    targetPrice,
    trailingStop,
    strength,
    confidence,
    reason: reasons.join(' | '),
    indicators: {
      rsi: round(rsiVal), macd: round(macdVal), macdSignal: round(macdSig), macdHist: round(macdHist),
      bbUpper: round(bbUpper), bbMid: round(bbMid), bbLower: round(bbLower),
      ema9: round(ema9[n - 1]), ema21: round(ema21[n - 1]), ema50: round(ema50[n - 1]), ema200: round(ema200[n - 1]),
      superTrend: stTrend, adx: round(adxVal), atr: round(atrVal), vwap: round(vwapVal),
      obvSlope: Math.round(obvSlope), volumeRatio: round(volRatio),
      bullScore, bearScore, netScore,
      pivot: round(pivots.pp), r1: round(pivots.r1), r2: round(pivots.r2), r3: round(pivots.r3),
      s1: round(pivots.s1), s2: round(pivots.s2), s3: round(pivots.s3),
      supportLevels: supportLevels.map(round),
      resistanceLevels: resistanceLevels.map(round),
      fibRetracement: {
        fib236: round(fibs.fib236), fib382: round(fibs.fib382), fib500: round(fibs.fib500),
        fib618: round(fibs.fib618), fib786: round(fibs.fib786),
      },
    },
    timestamp: new Date().toISOString(),
    fnoRecommendation: fnoRec,
  };
}

// ── Parallel market scanner ─────────────────────────────────────────────────

const FNO_SYMBOLS = [
  // NIFTY 50 F&O stocks
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'INFY.NS',
  'HINDUNILVR.NS', 'ITC.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'KOTAKBANK.NS',
  'LT.NS', 'AXISBANK.NS', 'TATAMOTORS.NS', 'MARUTI.NS', 'SUNPHARMA.NS',
  'TITAN.NS', 'ULTRACEMCO.NS', 'BAJFINANCE.NS', 'WIPRO.NS', 'HCLTECH.NS',
  'ONGC.NS', 'NTPC.NS', 'POWERGRID.NS', 'ADANIENT.NS', 'ADANIPORTS.NS',
  'COALINDIA.NS', 'JSWSTEEL.NS', 'TATASTEEL.NS', 'HINDALCO.NS', 'GRASIM.NS',
  'TECHM.NS', 'INDUSINDBK.NS', 'DRREDDY.NS', 'CIPLA.NS', 'APOLLOHOSP.NS',
  'EICHERMOT.NS', 'BAJAJFINSV.NS', 'NESTLEIND.NS', 'BRITANNIA.NS', 'DIVISLAB.NS',
  // Index F&O
  '^NSEI', '^NSEBANK',
];

export async function scanMarket(symbols?: string[]): Promise<Signal[]> {
  const list = symbols ?? FNO_SYMBOLS;
  // scan in batches of 8 for parallelism without overwhelming Yahoo
  const batchSize = 8;
  const results: Signal[] = [];
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(s => generateSignal(s)));
    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
  }
  // sort by strength descending
  results.sort((a, b) => b.strength - a.strength);
  return results;
}

// ── Position monitor for auto-exit ──────────────────────────────────────────

export interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  qty: number;
  stopLoss: number;
  targetPrice: number;
  trailingStop: number;
  highWaterMark: number; // for trailing stop
}

export function checkExit(position: Position, currentPrice: number, atrValue: number): { shouldExit: boolean; reason: string; exitPrice: number } {
  const { side, entryPrice, stopLoss, targetPrice, trailingStop, highWaterMark } = position;

  if (side === 'LONG') {
    // Update trailing stop based on high water mark
    const newTrailing = Math.max(trailingStop, highWaterMark - 2 * atrValue);
    if (currentPrice <= stopLoss) return { shouldExit: true, reason: 'STOP_LOSS', exitPrice: currentPrice };
    if (currentPrice >= targetPrice) return { shouldExit: true, reason: 'TARGET_HIT', exitPrice: currentPrice };
    if (currentPrice <= newTrailing && currentPrice < highWaterMark * 0.98) return { shouldExit: true, reason: 'TRAILING_STOP', exitPrice: currentPrice };
  } else {
    const newTrailing = Math.min(trailingStop, highWaterMark + 2 * atrValue);
    if (currentPrice >= stopLoss) return { shouldExit: true, reason: 'STOP_LOSS', exitPrice: currentPrice };
    if (currentPrice <= targetPrice) return { shouldExit: true, reason: 'TARGET_HIT', exitPrice: currentPrice };
    if (currentPrice >= newTrailing && currentPrice > highWaterMark * 1.02) return { shouldExit: true, reason: 'TRAILING_STOP', exitPrice: currentPrice };
  }

  return { shouldExit: false, reason: '', exitPrice: 0 };
}

function round(v: any): number {
  if (v == null) return 0;
  return Number(Number(v).toFixed(4));
}
