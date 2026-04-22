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

// quote cache (10s TTL — Yahoo rate-limits aggressively at sub-second polling)
const _quoteCache: Map<string, { ts: number; data: any }> = new Map();
const QUOTE_CACHE_TTL = 10 * 1000;

export async function fetchQuote(symbol: string) {
  const cached = _quoteCache.get(symbol);
  if (cached && Date.now() - cached.ts < QUOTE_CACHE_TTL) return cached.data;
  try {
    const yf = await getYahooClient();
    const quote = await yf.quote(symbol);
    const price = quote?.regularMarketPrice ?? quote?.currentPrice ?? 0;
    // If Yahoo returned nothing useful, keep last good cached value rather than zeroing out
    if (!price && cached) return cached.data;
    const result = {
      symbol,
      price,
      changePercent: quote?.regularMarketChangePercent ?? 0,
    };
    _quoteCache.set(symbol, { ts: Date.now(), data: result });
    return result;
  } catch (error) {
    console.error(`Quote error for ${symbol}:`, error);
    // On error (e.g. 429), return last known good value instead of zeros
    if (cached) return cached.data;
    return { symbol, price: 0, changePercent: 0 };
  }
}

export async function getIndexPrices() {
  // include popular India indices and a set of global market indices
  const indices = [
    { id: 'NIFTY', name: 'NIFTY 50', sym: '^NSEI' },
    { id: 'SENSEX', name: 'SENSEX', sym: '^BSESN' },
    { id: 'BANKNIFTY', name: 'BANKNIFTY', sym: '^NSEBANK' },
    { id: 'FINNIFTY', name: 'FINNIFTY', sym: 'NIFTY_FIN_SERVICE.NS' },
    { id: 'DOWJ', name: 'DOW JONES', sym: '^DJI' },
    { id: 'SP500', name: 'S&P 500', sym: '^GSPC' },
    { id: 'NASDAQ', name: 'NASDAQ', sym: '^IXIC' },
    { id: 'FTSE', name: 'FTSE 100', sym: '^FTSE' },
    { id: 'NIKKEI', name: 'NIKKEI 225', sym: '^N225' },
    { id: 'HANGSENG', name: 'HANG SENG', sym: '^HSI' },
    // Commodities
    { id: 'GOLD', name: 'GOLD', sym: 'GC=F' },
    { id: 'SILVER', name: 'SILVER', sym: 'SI=F' },
    { id: 'CRUDE', name: 'CRUDE OIL', sym: 'CL=F' },
    { id: 'BRENT', name: 'BRENT OIL', sym: 'BZ=F' },
    { id: 'NATGAS', name: 'NAT GAS', sym: 'NG=F' },
    { id: 'COPPER', name: 'COPPER', sym: 'HG=F' },
    // FX (used for live USD→INR conversion on commodity strikes)
    { id: 'USDINR', name: 'USD/INR', sym: 'INR=X' },
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

/* ─────────────────────── Real NSE Option Chain ─────────────────────── */

// Approximate error function for normal CDF calculations
function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  return sign * (1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
}

// Map Yahoo symbols → NSE option chain symbol names
const NSE_OC_MAP: Record<string, string> = {
  '^NSEI': 'NIFTY',
  '^NSEBANK': 'BANKNIFTY',
  'NIFTY_FIN_SERVICE.NS': 'FINNIFTY',
  '^CNXIT': 'NIFTY IT',
  '^NSMIDCP': 'NIFTY MIDCAP 50',
};

// Fallback tick sizes per index
const TICK_MAP: Record<string, number> = {
  '^NSEI': 50, '^NSEBANK': 100, '^BSESN': 100,
  'NIFTY_FIN_SERVICE.NS': 50, '^NSMIDCP': 25, '^CNXIT': 50,
};

// Cache for NSE option chain data (30s TTL for near-realtime)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _nseOCCache: Map<string, { ts: number; data: any }> = new Map();
const NSE_OC_TTL = 30 * 1000;

/** Fetch real NSE option chain using stock-nse-india */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchNSEOptionChain(nseSymbol: string): Promise<any | null> {
  const cached = _nseOCCache.get(nseSymbol);
  if (cached && Date.now() - cached.ts < NSE_OC_TTL) return cached.data;

  try {
    const { NseIndia } = await import('stock-nse-india');
    const nse = new NseIndia();
    const data = await nse.getIndexOptionChain(nseSymbol);
    if (data && (data.records || data.filtered)) {
      _nseOCCache.set(nseSymbol, { ts: Date.now(), data });
      return data;
    }
    return null;
  } catch (err) {
    console.warn('NSE option chain fetch failed for', nseSymbol, err);
    return null;
  }
}

export type LiveStrike = {
  strike: number;
  callLTP: number | null;
  callOI: number;
  callIV: number | null;
  putLTP: number | null;
  putOI: number;
  putIV: number | null;
  isATM: boolean;
};

export async function suggestOptionStrikes(symbol: string, price?: number | null, tick?: number, pads = 2) {
  try {
    let p = price;
    if (p == null) {
      const q = await fetchQuote(symbol);
      p = q.price || 0;
    }
    if (!p || p <= 0) return { error: 'invalid price' };

    // ── Try real NSE option chain data first ──
    const nseSymbol = NSE_OC_MAP[symbol];
    if (nseSymbol) {
      try {
        const data = await fetchNSEOptionChain(nseSymbol);
        if (data) {
          const recs = data.records ?? {};
          const filt = data.filtered ?? {};
          const allData = (filt.data ?? recs.data ?? []) as Record<string, unknown>[];
          const underlyingValue = (filt.underlyingValue ?? recs.underlyingValue ?? p) as number;
          const expiryDates = (recs.expiryDates ?? []) as string[];
          const nearestExpiry = expiryDates[0] ?? null;

          if (allData.length > 0) {
            // Sort by distance to spot to find ATM
            const sorted = [...allData].sort(
              (a, b) => Math.abs((a.strikePrice as number) - underlyingValue) - Math.abs((b.strikePrice as number) - underlyingValue)
            );

            // ATM is the strike closest to spot
            const atmStrike = sorted[0]?.strikePrice as number ?? Math.round(underlyingValue / 50) * 50;

            // Pick `pads` strikes above and below ATM
            const allStrikesSorted = [...allData]
              .map(d => d.strikePrice as number)
              .sort((a, b) => a - b);
            const atmIdx = allStrikesSorted.indexOf(atmStrike);
            const fromIdx = Math.max(0, atmIdx - pads);
            const toIdx = Math.min(allStrikesSorted.length - 1, atmIdx + pads);
            const selectedStrikes = allStrikesSorted.slice(fromIdx, toIdx + 1);

            // Build lookup
            const strikeMap = new Map<number, Record<string, unknown>>();
            for (const d of allData) strikeMap.set(d.strikePrice as number, d);

            const liveStrikes: LiveStrike[] = selectedStrikes.map(s => {
              const row = strikeMap.get(s);
              const ce = (row?.CE ?? {}) as Record<string, unknown>;
              const pe = (row?.PE ?? {}) as Record<string, unknown>;
              return {
                strike: s,
                callLTP: (ce.lastPrice as number) ?? null,
                callOI: (ce.openInterest as number) ?? 0,
                callIV: (ce.impliedVolatility as number) ?? null,
                putLTP: (pe.lastPrice as number) ?? null,
                putOI: (pe.openInterest as number) ?? 0,
                putIV: (pe.impliedVolatility as number) ?? null,
                isATM: s === atmStrike,
              };
            });

            // Derive tick from actual strike spacing
            const derivedTick = selectedStrikes.length >= 2
              ? selectedStrikes[1] - selectedStrikes[0]
              : TICK_MAP[symbol] ?? 50;

            // Compute DTE from expiry string
            let daysToExpiry = 7;
            if (nearestExpiry) {
              const parts = nearestExpiry.split('-');
              if (parts.length === 3) {
                const expDate = new Date(nearestExpiry);
                daysToExpiry = Math.max(0.5, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
              }
            }

            // Average IV from ATM strikes
            const atmRow = strikeMap.get(atmStrike);
            const atmCeIV = ((atmRow?.CE as Record<string, unknown>)?.impliedVolatility as number) ?? 0;
            const atmPeIV = ((atmRow?.PE as Record<string, unknown>)?.impliedVolatility as number) ?? 0;
            const avgIV = atmCeIV > 0 && atmPeIV > 0 ? (atmCeIV + atmPeIV) / 2 : (atmCeIV || atmPeIV || 0);

            return {
              symbol,
              price: Number(underlyingValue.toFixed(2)),
              atm: atmStrike,
              tick: derivedTick,
              strikes: selectedStrikes,
              liveStrikes,
              expiry: nearestExpiry,
              daysToExpiry,
              iv: Math.round(avgIV * 100) / 100,
              live: true,
            };
          }
        }
      } catch (nseErr) {
        console.warn('NSE option chain error, using fallback:', nseErr);
      }
    }

    // ── Fallback: calculated strikes (for SENSEX or when NSE is unavailable) ──
    const resolvedTick = tick ?? TICK_MAP[symbol] ?? 50;
    const atm = Math.round(p / resolvedTick) * resolvedTick;
    const strikes: number[] = [];
    for (let i = -pads; i <= pads; i++) strikes.push(atm + i * resolvedTick);

    // Calculate nearest expiry. SENSEX (BSE) expires on Fridays, NSE indices on Thursdays.
    const isBSE = symbol === '^BSESN';
    const expiryDay = isBSE ? 4 : 2; // 4=Thursday (BSE/SENSEX), 2=Tuesday (NSE)
    const now = new Date();
    const today = now.getDay(); // 0=Sun
    let daysUntilExpiry = (expiryDay - today + 7) % 7;
    // If today is expiry day and market is past 15:30 IST, use next week
    if (daysUntilExpiry === 0) {
      const istMin = (now.getUTCHours() * 60 + now.getUTCMinutes()) + 330;
      if (istMin > 15 * 60 + 30) daysUntilExpiry = 7;
    }
    const expiryDate = new Date(now);
    expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);
    const expiryStr = `${String(expiryDate.getDate()).padStart(2, '0')}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][expiryDate.getMonth()]}-${expiryDate.getFullYear()}`;
    const dte = Math.max(0.5, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Build estimated live strikes with Black-Scholes premiums
    const estLiveStrikes: LiveStrike[] = strikes.map(s => {
      const dteForCalc = Math.max(0.5, dte);
      const t = dteForCalc / 365;
      const r = 0.065;
      const moneyness = Math.abs(p - s) / p;
      const iv = 0.15 + moneyness * 0.4;
      const d1 = (Math.log(p / s) + (r + iv * iv / 2) * t) / (iv * Math.sqrt(t));
      const d2 = d1 - iv * Math.sqrt(t);
      const nd1 = 0.5 * (1 + erf(d1 / Math.sqrt(2)));
      const nd2 = 0.5 * (1 + erf(d2 / Math.sqrt(2)));
      const callP = Math.max(0.5, p * nd1 - s * Math.exp(-r * t) * nd2);
      const putP = Math.max(0.5, s * Math.exp(-r * t) * (1 - nd2) - p * (1 - nd1));
      return {
        strike: s,
        callLTP: Math.round(callP * 100) / 100,
        callOI: 0,
        callIV: Math.round(iv * 10000) / 100,
        putLTP: Math.round(putP * 100) / 100,
        putOI: 0,
        putIV: Math.round(iv * 10000) / 100,
        isATM: s === atm,
      };
    });

    return { symbol, price: Number(p.toFixed(2)), atm, tick: resolvedTick, strikes, liveStrikes: estLiveStrikes, expiry: expiryStr, daysToExpiry: dte, iv: 15, live: false };
  } catch (e) {
    console.error('suggestOptionStrikes error', e);
    return { error: String(e) };
  }
}