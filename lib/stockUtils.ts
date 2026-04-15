"use server";

// Dynamically import and instantiate yahoo-finance2 on the server only.
let _yfClient: any = null;
async function getYahooClient() {
  if (_yfClient) return _yfClient;
  const mod: any = await import('yahoo-finance2');
  // library may export a default factory/class or named YahooFinance
  const YahooFinance = mod.default ?? mod.YahooFinance ?? mod;
  if (typeof YahooFinance === 'function') {
    try {
      // suppress noisy one-time notices from yahoo-finance2 (survey/ripHistorical)
      try {
        _yfClient = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
      } catch (e) {
        // fallback to default constructor if options not supported
        _yfClient = new YahooFinance();
      }
    } catch (e) {
      // if it's already an instance or callable, fall back to using it directly
      _yfClient = YahooFinance;
    }
  } else {
    _yfClient = YahooFinance;
  }
  return _yfClient;
}

const POPULAR_SYMBOLS = [
  '^NSEI', '^BSESN', '^NSEBANK',
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS',
  'SBIN.NS', 'INFY.NS', 'TATAMOTORS.NS', 'LT.NS', 'AXISBANK.NS',
  'HINDUNILVR.NS', 'ITC.NS', 'KOTAKBANK.NS', 'BHARTIARTL.NS'
];

// lightweight in-memory cache for historical queries
const _histCache: Map<string, { ts: number; data: any[] }> = new Map();
const HIST_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// quote cache (1s TTL for near-realtime prices)
const _quoteCache: Map<string, { ts: number; data: any }> = new Map();
const QUOTE_CACHE_TTL = 1 * 1000;

export async function fetchQuote(symbol: string) {
  const cached = _quoteCache.get(symbol);
  if (cached && Date.now() - cached.ts < QUOTE_CACHE_TTL) return cached.data;
  try {
    const yf = await getYahooClient();
    const quote = await yf.quote(symbol);
    const result = {
      symbol,
      price: quote?.regularMarketPrice ?? quote?.currentPrice ?? 0,
      changePercent: quote?.regularMarketChangePercent ?? 0,
    };
    _quoteCache.set(symbol, { ts: Date.now(), data: result });
    return result;
  } catch (error) {
    console.error(`Quote error for ${symbol}:`, error);
    return { symbol, price: 0, changePercent: 0 };
  }
}

export async function getIndexPrices() {
  // include popular India indices and a set of global market indices
  const indices = [
    { id: 'NIFTY', name: 'NIFTY 50', sym: '^NSEI' },
    { id: 'SENSEX', name: 'SENSEX', sym: '^BSESN' },
    { id: 'BANKNIFTY', name: 'BANKNIFTY', sym: '^NSEBANK' },
    { id: 'DOWJ', name: 'DOW JONES', sym: '^DJI' },
    { id: 'SP500', name: 'S&P 500', sym: '^GSPC' },
    { id: 'NASDAQ', name: 'NASDAQ', sym: '^IXIC' },
    { id: 'FTSE', name: 'FTSE 100', sym: '^FTSE' },
    { id: 'NIKKEI', name: 'NIKKEI 225', sym: '^N225' },
    { id: 'HANGSENG', name: 'HANG SENG', sym: '^HSI' },
  ];

  const results = await Promise.all(
    indices.map(async (idx) => {
      const data = await fetchQuote(idx.sym);
      return {
        id: idx.id,
        name: idx.name,
        sym: idx.sym,
        price: data.price,
        change: data.changePercent,
      };
    })
  );
  return results;
}

export async function calculateAISignal(symbol: string) {
  try {
    // prefer using historical OHLC for indicator calculations
    const hist = await getHistorical(symbol, undefined, undefined, '1d');
    if (!Array.isArray(hist) || hist.length < 21) {
      // fallback to quote when insufficient history
      const quote = await fetchQuote(symbol);
      if (quote.price === 0) {
        return { symbol, signal: 'HOLD', entryPrice: 0, stopLoss: null, targetPrice: null, strength: 0, reason: 'Insufficient market data' };
      }
      return { symbol, signal: 'HOLD', entryPrice: quote.price, stopLoss: null, targetPrice: null, strength: 30, reason: 'Insufficient historical data' };
    }

    const closes: number[] = hist.map((h: any) => Number(h.close ?? 0));
    const lows: number[] = hist.map((h: any) => Number(h.low ?? 0));
    const highs: number[] = hist.map((h: any) => Number(h.high ?? 0));
    const lastClose = closes[closes.length - 1];

    const ti = await import('technicalindicators');
    const rsiArr: number[] = ti.RSI.calculate({ period: 14, values: closes });
    const smaShortArr: number[] = ti.SMA.calculate({ period: 5, values: closes });
    const smaLongArr: number[] = ti.SMA.calculate({ period: 20, values: closes });

    if (!rsiArr.length || smaShortArr.length < 2 || smaLongArr.length < 2) {
      return { symbol, signal: 'HOLD', entryPrice: lastClose, stopLoss: null, targetPrice: null, strength: 30, reason: 'Insufficient indicator data' };
    }

    const rsi = rsiArr[rsiArr.length - 1];
    const smaShort = smaShortArr[smaShortArr.length - 1];
    const smaLong = smaLongArr[smaLongArr.length - 1];
    const prevShort = smaShortArr[smaShortArr.length - 2];
    const prevLong = smaLongArr[smaLongArr.length - 2];

    const buySignal = (smaShort > smaLong && prevShort <= prevLong) || (rsi < 30);
    const sellSignal = (smaShort < smaLong && prevShort >= prevLong) || (rsi > 70);

    let signal = 'HOLD';
    if (buySignal) signal = 'BUY';
    else if (sellSignal) signal = 'SELL';

    const entryPrice = lastClose;
    // capital protection parameters
    const MAX_LOSS_PCT = 0.05; // maximum allowed loss per trade (5%)
    const REWARD_RISK = 1.5; // reward:risk multiplier for target
    const MIN_TARGET_PCT = 0.01; // minimum 1% target

    // stop/target defaults
    let stopLoss: number | null = null;
    let targetPrice: number | null = null;

    // stop loss near recent low/high depending on direction
    const recentLow = lows.length ? Math.min(...lows.slice(-5)) : 0;
    const recentHigh = highs.length ? Math.max(...highs.slice(-5)) : 0;

    if (signal === 'BUY') {
      const rawStop = recentLow > 0 ? Math.min(recentLow, entryPrice * 0.99) : entryPrice * 0.99;
      const lossPct = entryPrice > 0 ? (entryPrice - rawStop) / entryPrice : 0;
      const cappedLoss = Math.min(lossPct, MAX_LOSS_PCT);
      stopLoss = Number((entryPrice * (1 - cappedLoss)).toFixed(4));
      const targetPct = Math.max(MIN_TARGET_PCT, Math.min(0.5, REWARD_RISK * cappedLoss));
      targetPrice = Number((entryPrice * (1 + targetPct)).toFixed(4));
    } else if (signal === 'SELL') {
      const rawStop = recentHigh > 0 ? Math.max(recentHigh, entryPrice * 1.01) : entryPrice * 1.01;
      const lossPct = entryPrice > 0 ? (rawStop - entryPrice) / entryPrice : 0;
      const cappedLoss = Math.min(lossPct, MAX_LOSS_PCT);
      stopLoss = Number((entryPrice * (1 + cappedLoss)).toFixed(4));
      const targetPct = Math.max(MIN_TARGET_PCT, Math.min(0.5, REWARD_RISK * cappedLoss));
      targetPrice = Number((entryPrice * (1 - targetPct)).toFixed(4));
    } else {
      // HOLD: don't provide synthetic stop/target — keep null so UI shows as unavailable
      stopLoss = null;
      targetPrice = null;
    }

    // simple strength metric combining RSI extremeness and SMA distance
    const smaDist = Math.abs((smaShort - smaLong) / (smaLong || 1));
    const strength = Math.min(100, Math.round(Math.abs(50 - rsi) + smaDist * 200));

    const reasonParts = [];
    reasonParts.push(`RSI:${rsi.toFixed(1)}`);
    reasonParts.push(`SMA5:${smaShort.toFixed(2)}`);
    reasonParts.push(`SMA20:${smaLong.toFixed(2)}`);
    if (buySignal && rsi < 30) reasonParts.push('Oversold');
    if (buySignal && smaShort > smaLong) reasonParts.push('SMA crossover up');
    if (sellSignal && rsi > 70) reasonParts.push('Overbought');
    if (sellSignal && smaShort < smaLong) reasonParts.push('SMA crossover down');

    return {
      symbol,
      signal,
      entryPrice,
      stopLoss,
      targetPrice,
      strength,
      reason: reasonParts.join(' | '),
    };
  } catch (error) {
    console.error('calculateAISignal error', error);
    return { symbol, signal: 'HOLD', entryPrice: 0, stopLoss: 0, targetPrice: 0, strength: 0, reason: 'Calculation error' };
  }
}

export async function runFullScan(symbols = POPULAR_SYMBOLS) {
  const results = [];
  for (const symbol of symbols) {
    try {
      // quick historical existence check (uses cache) to avoid noisy delisted symbols
      const hist = await getHistorical(symbol, undefined, undefined, '1d');
      if (!Array.isArray(hist) || hist.length === 0) {
        // skip symbols with no history to reduce noise
        console.debug('runFullScan: skipping symbol with no history', symbol);
        continue;
      }
      const signal = await calculateAISignal(symbol);
      results.push(signal);
    } catch (e) {
      console.error('runFullScan error for', symbol, e);
    }
  }
  return results;
}

export async function backtestSymbols(symbols = POPULAR_SYMBOLS, startDate?: string, endDate?: string) {
  const yf = await getYahooClient();
  const results: Array<any> = [];
  for (const symbol of symbols) {
    try {
      const hist = await getHistorical(symbol, startDate, endDate, '1d');
      // hist is array of { date, open, high, low, close, volume }
      if (!Array.isArray(hist) || hist.length < 2) {
        results.push({ symbol, error: 'insufficient historical data' });
        continue;
      }
      const first = hist[0].close ?? hist[0].adjClose ?? hist[0].open;
      const last = hist[hist.length - 1].close ?? hist[hist.length - 1].adjClose ?? hist[hist.length - 1].open;
      const ret = first && last ? ((last - first) / first) * 100 : null;
      results.push({ symbol, start: first ?? null, end: last ?? null, days: hist.length, returnPercent: ret != null ? Number(ret.toFixed(2)) : null });
    } catch (error) {
      console.error('Backtest error for', symbol, error);
      results.push({ symbol, error: String(error) });
    }
  }
  return results;
}

// Signal-driven backtest using simple SMA crossover strategy.
export async function backtestWithSignals(symbols = POPULAR_SYMBOLS, startDate?: string, endDate?: string) {
  const yf = await getYahooClient();
  const results: Array<any> = [];

  // Helper: simple moving average for last n closes
  function sma(values: number[], n: number, idx: number) {
    if (idx - n + 1 < 0) return null;
    let sum = 0;
    for (let i = idx - n + 1; i <= idx; i++) sum += values[i];
    return sum / n;
  }

  for (const symbol of symbols) {
    try {
      const hist = await getHistorical(symbol, startDate, endDate, '1d');
      if (!Array.isArray(hist) || hist.length < 21) {
        results.push({ symbol, error: 'insufficient historical data for signal backtest' });
        continue;
      }

      // extract closes and dates
      const closes: number[] = hist.map((h: any) => Number(h.close ?? h.adjClose ?? h.open ?? 0));
      const dates: string[] = hist.map((h: any) => new Date(h.date).toISOString().slice(0,10));

      let position = 0; // 0 = flat, 1 = long
      let entryPrice = 0;
      const trades: Array<any> = [];

      // run from earliest to latest (hist[0] oldest)
      for (let i = 20; i < closes.length; i++) {
        const smaShort = sma(closes, 5, i);
        const smaLong = sma(closes, 20, i);
        if (smaShort == null || smaLong == null) continue;

        // generate signal: BUY when short > long and previous short <= previous long
        const prevShort = sma(closes, 5, i-1);
        const prevLong = sma(closes, 20, i-1);

        const price = closes[i];

        if (prevShort != null && prevLong != null) {
          const buySignal = (smaShort > smaLong) && (prevShort <= prevLong);
          const sellSignal = (smaShort < smaLong) && (prevShort >= prevLong);

          if (buySignal && position === 0) {
            // enter at this price
            entryPrice = price;
            position = 1;
            trades.push({ type: 'BUY', date: dates[i], price: entryPrice });
          } else if (sellSignal && position === 1) {
            const exitPrice = price;
            const ret = ((exitPrice - entryPrice) / entryPrice) * 100;
            trades.push({ type: 'SELL', date: dates[i], price: exitPrice, ret: Number(ret.toFixed(2)) });
            position = 0;
            entryPrice = 0;
          }
        }
      }

      // if still in position, close at last price
      if (position === 1 && entryPrice > 0) {
        const lastPrice = closes[closes.length -1];
        const ret = ((lastPrice - entryPrice) / entryPrice) * 100;
        trades.push({ type: 'SELL', date: dates[dates.length-1], price: lastPrice, ret: Number(ret.toFixed(2)) });
      }

      // compute summary metrics
      const sellTrades = trades.filter(t => t.type === 'SELL');
      const wins = sellTrades.filter((t:any) => (t.ret ?? 0) > 0).length;
      const losses = sellTrades.length - wins;
      const totalReturn = sellTrades.reduce((acc:any, t:any) => acc + (t.ret ?? 0), 0);
      const avgReturn = sellTrades.length ? Number((totalReturn / sellTrades.length).toFixed(2)) : 0;

      results.push({ symbol, trades, summary: { trades: sellTrades.length, wins, losses, totalReturn: Number(totalReturn.toFixed(2)), avgReturn } });
    } catch (error) {
      console.error('Signal backtest error for', symbol, error);
      results.push({ symbol, error: String(error) });
    }
  }
  return results;
}

// Improved backtest: simulates trades with stop/target, position sizing and capital protection.
export async function backtestWithSignalsV2(symbols = POPULAR_SYMBOLS, startDate?: string, endDate?: string, startingCapital = 100000, riskPerTradePct = 0.01) {
  const yf = await getYahooClient();
  const results: Array<any> = [];

  // helper sma
  function sma(values: number[], n: number, idx: number) {
    if (idx - n + 1 < 0) return null;
    let sum = 0;
    for (let i = idx - n + 1; i <= idx; i++) sum += values[i];
    return sum / n;
  }

  for (const symbol of symbols) {
    try {
      const hist = await getHistorical(symbol, startDate, endDate, '1d');
      if (!Array.isArray(hist) || hist.length < 30) {
        results.push({ symbol, error: 'insufficient historical data for signal backtest' });
        continue;
      }

      const closes: number[] = hist.map((h: any) => Number(h.close ?? h.adjClose ?? h.open ?? 0));
      const highs: number[] = hist.map((h: any) => Number(h.high ?? 0));
      const lows: number[] = hist.map((h: any) => Number(h.low ?? 0));
      const dates: string[] = hist.map((h: any) => new Date(h.date).toISOString().slice(0,10));

      let capital = startingCapital;
      let peakCapital = capital;
      let maxDrawdown = 0;
      const trades: any[] = [];

      let position = 0; // 0 flat, 1 long, -1 short
      let entryPrice = 0;
      let entryIndex = -1;
      let shares = 0;

      // parameters
      const MAX_LOSS_PCT = 0.05; // cap loss per trade
      const REWARD_RISK = 1.5;
      const MIN_TARGET_PCT = 0.01;
      const riskPerTrade = Math.max(1e-6, riskPerTradePct);

      for (let i = 20; i < closes.length - 1; i++) {
        const smaShort = sma(closes, 5, i);
        const smaLong = sma(closes, 20, i);
        if (smaShort == null || smaLong == null) continue;
        const prevShort = sma(closes, 5, i-1);
        const prevLong = sma(closes, 20, i-1);
        if (prevShort == null || prevLong == null) continue;

        const buySignal = (smaShort > smaLong) && (prevShort <= prevLong);
        const sellSignal = (smaShort < smaLong) && (prevShort >= prevLong);

        // if flat and signal -> enter at next day's open if available, else today's close
        if (position === 0 && (buySignal || sellSignal)) {
          const nextDay = hist[i+1];
          const ent = nextDay?.open ?? closes[i];
          entryPrice = ent;
          entryIndex = i+1 <= closes.length-1 ? i+1 : i;

          // compute stop/target similar to calculateAISignal but using recent 5 bars
          const recentLow = Math.min(...lows.slice(Math.max(0,i-4), i+1));
          const recentHigh = Math.max(...highs.slice(Math.max(0,i-4), i+1));

          let stop = null;
          let target = null;
          if (buySignal) {
            const rawStop = recentLow > 0 ? Math.min(recentLow, entryPrice * 0.99) : entryPrice * 0.99;
            const lossPct = entryPrice > 0 ? (entryPrice - rawStop) / entryPrice : 0;
            const cappedLoss = Math.min(lossPct, MAX_LOSS_PCT);
            stop = entryPrice * (1 - cappedLoss);
            const targetPct = Math.max(MIN_TARGET_PCT, Math.min(0.5, REWARD_RISK * cappedLoss));
            target = entryPrice * (1 + targetPct);
            position = 1;
          } else {
            const rawStop = recentHigh > 0 ? Math.max(recentHigh, entryPrice * 1.01) : entryPrice * 1.01;
            const lossPct = entryPrice > 0 ? (rawStop - entryPrice) / entryPrice : 0;
            const cappedLoss = Math.min(lossPct, MAX_LOSS_PCT);
            stop = entryPrice * (1 + cappedLoss);
            const targetPct = Math.max(MIN_TARGET_PCT, Math.min(0.5, REWARD_RISK * cappedLoss));
            target = entryPrice * (1 - targetPct);
            position = -1;
          }

          // position sizing: number of shares such that riskPerTrade% of capital is risked at stop
          const allowableLoss = capital * riskPerTrade;
          const riskPerShare = Math.abs(entryPrice - stop) || 1e-6;
          shares = Math.floor(allowableLoss / riskPerShare);
          if (shares <= 0) {
            // cannot size a trade without risking more than allowable; skip
            position = 0;
            entryPrice = 0;
            entryIndex = -1;
            continue;
          }

          trades.push({ type: position === 1 ? 'BUY' : 'SELL', date: dates[entryIndex], entry: entryPrice, stop: Number(stop.toFixed(4)), target: Number(target.toFixed(4)), shares });
        }

        // If in position, check for stop/target hits or opposite signal to exit
        if (position !== 0 && entryIndex >= 0) {
          // check day i (we start checking from the day after entryIndex)
          const dayIndex = i+1 <= closes.length-1 ? i+1 : i;
          const dayHigh = highs[dayIndex];
          const dayLow = lows[dayIndex];
          const dayDate = dates[dayIndex];

          let exitPrice = null;
          let exitType: string | null = null;

          if (position === 1) {
            // BUY: stop if low <= stop, else target if high >= target
            const lastTrade = trades[trades.length-1];
            const stop = lastTrade.stop;
            const target = lastTrade.target;
            if (dayLow <= stop) {
              exitPrice = stop;
              exitType = 'STOP';
            } else if (dayHigh >= target) {
              exitPrice = target;
              exitType = 'TARGET';
            } else if (i === closes.length - 2) {
              // close at final close
              exitPrice = closes[closes.length -1];
              exitType = 'CLOSE';
            }
          } else if (position === -1) {
            const lastTrade = trades[trades.length-1];
            const stop = lastTrade.stop;
            const target = lastTrade.target;
            if (dayHigh >= stop) {
              exitPrice = stop;
              exitType = 'STOP';
            } else if (dayLow <= target) {
              exitPrice = target;
              exitType = 'TARGET';
            } else if (i === closes.length - 2) {
              exitPrice = closes[closes.length -1];
              exitType = 'CLOSE';
            }
          }

          if (exitPrice != null && exitType) {
            const last = trades[trades.length-1];
            const entryP = last.entry;
            const qty = last.shares;
            const pnl = position === 1 ? (exitPrice - entryP) * qty : (entryP - exitPrice) * qty;
            const pnlPct = entryP ? (pnl / (entryP * qty)) * 100 : 0;
            // apply pnl to capital
            capital = Number((capital + pnl).toFixed(2));
            peakCapital = Math.max(peakCapital, capital);
            maxDrawdown = Math.max(maxDrawdown, Number(((peakCapital - capital) / peakCapital * 100).toFixed(2)));

            // update last trade with exit
            last.exit = Number(exitPrice.toFixed(4));
            last.exitDate = dayDate;
            last.exitType = exitType;
            last.pnl = Number(pnl.toFixed(2));
            last.pnlPct = Number(pnlPct.toFixed(2));

            // reset position
            position = 0;
            entryPrice = 0;
            entryIndex = -1;
            shares = 0;
          }
        }
      }

      // summary
      const closedTrades = trades.filter(t => t.exit != null);
      const wins = closedTrades.filter(t => (t.pnl ?? 0) > 0).length;
      const losses = closedTrades.length - wins;
      const totalPnl = closedTrades.reduce((acc:any, t:any) => acc + (t.pnl ?? 0), 0);
      const roi = Number(((capital - startingCapital) / startingCapital * 100).toFixed(2));

      results.push({ symbol, startingCapital, endingCapital: capital, roi, trades, summary: { closedTrades: closedTrades.length, wins, losses, totalPnl: Number(totalPnl.toFixed(2)), maxDrawdown } });
    } catch (error) {
      console.error('Signal backtest v2 error for', symbol, error);
      results.push({ symbol, error: String(error) });
    }
  }
  return results;
}

export async function getHistorical(symbol: string, startDate?: string, endDate?: string, interval = '1d') {
  const yf = await getYahooClient();
  try {
    // Ensure period1/period2 are provided in a format accepted by yahoo-finance2.
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    // convert to ISO date strings which yahoo-finance2 accepts as date'ish
    const period1 = start.toISOString().slice(0, 10);
    const period2 = end.toISOString().slice(0, 10);
    const cacheKey = `${symbol}|${period1}|${period2}|${interval}`;
    const cached = _histCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < HIST_CACHE_TTL) {
      return cached.data;
    }
    const hist = await yf.historical(symbol, { period1, period2, interval });
    if (!Array.isArray(hist)) return [];
    const mapped = hist.map((h: any) => ({
      date: new Date(h.date).toISOString(),
      open: Number(h.open ?? 0),
      high: Number(h.high ?? 0),
      low: Number(h.low ?? 0),
      close: Number(h.close ?? h.adjClose ?? 0),
      volume: Number(h.volume ?? 0)
    }));
    try { _histCache.set(cacheKey, { ts: Date.now(), data: mapped }); } catch (e) {}
    return mapped;
  } catch (e) {
    // Common: yahoo-finance2 may return "No data found" for delisted symbols — handle quietly
    const msg = e instanceof Error ? e.message : String(e);
    if (msg && msg.toLowerCase().includes('no data')) {
      console.debug('getHistorical: no data for', symbol);
      return [];
    }
    console.error('getHistorical error', symbol, e);
    return [];
  }
}

// Suggest option strikes based on underlying price and desired tick size.
export async function suggestOptionStrikes(symbol: string, price?: number | null, tick = 50, pads = 2) {
  try {
    let p = price;
    if (p == null) {
      const q = await fetchQuote(symbol);
      p = q.price || 0;
    }
    if (!p || p <= 0) return { error: 'invalid price' };

    // round to nearest tick
    const atm = Math.round(p / tick) * tick;
    const strikes: number[] = [];
    for (let i = -pads; i <= pads; i++) strikes.push(atm + i * tick);

    // simple recommendation: if bullish signal → buy CALL at ATM or +1; bearish → buy PUT at ATM or -1
    // We don't compute signal here; caller can pass intended direction or use calculateAISignal.

    return { symbol, price: Number(p.toFixed(2)), atm, tick, strikes };
  } catch (e) {
    console.error('suggestOptionStrikes error', e);
    return { error: String(e) };
  }
}