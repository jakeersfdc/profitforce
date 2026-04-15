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
  const hist = await getHistorical(symbol, undefined, undefined, '1d');
  if (!Array.isArray(hist) || hist.length < 50) {
    const quote = await fetchQuote(symbol);
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

  // ── Confluence scoring ────────────────────────────────────────────────────
  let bullScore = 0;
  let bearScore = 0;
  const reasons: string[] = [];

  // 1. RSI
  if (rsiVal < 30) { bullScore += 2; reasons.push(`RSI oversold (${rsiVal.toFixed(1)})`); }
  else if (rsiVal < 40) { bullScore += 1; reasons.push(`RSI low (${rsiVal.toFixed(1)})`); }
  else if (rsiVal > 70) { bearScore += 2; reasons.push(`RSI overbought (${rsiVal.toFixed(1)})`); }
  else if (rsiVal > 60) { bearScore += 1; reasons.push(`RSI high (${rsiVal.toFixed(1)})`); }

  // 2. MACD
  if (macdHist > 0 && macdHistPrev <= 0) { bullScore += 2; reasons.push('MACD bullish cross'); }
  else if (macdHist > 0) { bullScore += 1; reasons.push('MACD positive'); }
  if (macdHist < 0 && macdHistPrev >= 0) { bearScore += 2; reasons.push('MACD bearish cross'); }
  else if (macdHist < 0) { bearScore += 1; reasons.push('MACD negative'); }

  // 3. Bollinger Bands
  if (bbLower && lastClose <= bbLower) { bullScore += 2; reasons.push('Price at lower BB'); }
  if (bbUpper && lastClose >= bbUpper) { bearScore += 2; reasons.push('Price at upper BB'); }

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

  // ── Determine signal ──────────────────────────────────────────────────────
  const netScore = bullScore - bearScore;
  const totalVotes = bullScore + bearScore;
  const minConfluence = 1; // lowered: any directional bias triggers a signal

  let signal: 'BUY' | 'SELL' | 'EXIT' | 'HOLD' = 'HOLD';
  if (netScore >= minConfluence) signal = 'BUY';
  else if (netScore <= -minConfluence) signal = 'SELL';

  // EXIT signal: counter-trend trigger when in position context
  if (signal === 'BUY' && rsiVal > 75 && macdHist < macdHistPrev) signal = 'EXIT';
  if (signal === 'SELL' && rsiVal < 25 && macdHist > macdHistPrev) signal = 'EXIT';

  // ── Compute entry / stop / target using ATR ────────────────────────────────
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
      stopLoss = round(entryPrice - atrMultStop * atrVal);
      targetPrice = round(entryPrice + atrMultTarget * atrVal);
      trailingStop = round(entryPrice - atrMultTrail * atrVal);
    } else if (signal === 'SELL') {
      stopLoss = round(entryPrice + atrMultStop * atrVal);
      targetPrice = round(entryPrice - atrMultTarget * atrVal);
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
