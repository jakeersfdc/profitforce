/**
 * Reference strategies. Each is a pure function over StrategyContext.
 * Adding a new one: implement `Strategy`, push into the registry.
 */
import type { Strategy } from "./Strategy";
import { sma, ema, rsi, highest, lowest } from "./Strategy";

/** Classic 5/20 SMA crossover with ATR-style stop using recent low. */
const smaCrossover: Strategy = {
  id: "sma_5_20",
  name: "SMA 5/20 Crossover",
  description: "Long when SMA5 crosses above SMA20; flat on opposite cross.",
  warmup: 25,
  step(ctx) {
    const closes = ctx.bars.map((b) => b.close);
    const i = ctx.i;
    const s = sma(closes, 5, i);
    const l = sma(closes, 20, i);
    const sp = sma(closes, 5, i - 1);
    const lp = sma(closes, 20, i - 1);
    if (s == null || l == null || sp == null || lp == null) return { action: "HOLD" };

    const buy = s > l && sp <= lp;
    const sell = s < l && sp >= lp;
    if (buy && ctx.position.qty <= 0) {
      const lows = ctx.bars.map((b) => b.low);
      const stop = Math.min(lowest(lows, 5, i), ctx.bars[i].close * 0.99);
      const risk = ctx.bars[i].close - stop;
      const target = ctx.bars[i].close + risk * 1.5;
      return { action: "BUY", stopLoss: stop, target, confidence: 0.6, reason: "sma5>sma20 cross" };
    }
    if (sell && ctx.position.qty >= 0) {
      return { action: ctx.position.qty > 0 ? "EXIT" : "HOLD", reason: "sma5<sma20 cross" };
    }
    return { action: "HOLD" };
  },
};

/** RSI(14) mean-reversion: buy oversold (<30) on liquid stocks, exit at 50. */
const rsiMeanReversion: Strategy = {
  id: "rsi_meanrev",
  name: "RSI(14) Mean Reversion",
  description: "Buy on RSI<30 with bullish bar; exit on RSI>50 or 5-day stop.",
  warmup: 20,
  step(ctx) {
    const closes = ctx.bars.map((b) => b.close);
    const i = ctx.i;
    const r = rsi(closes, 14, i);
    const rp = rsi(closes, 14, i - 1);
    if (r == null || rp == null) return { action: "HOLD" };

    const bar = ctx.bars[i];
    const bullish = bar.close > bar.open;

    if (ctx.position.qty <= 0 && r < 30 && bullish) {
      const lows = ctx.bars.map((b) => b.low);
      const stop = lowest(lows, 5, i);
      const target = bar.close + (bar.close - stop) * 2;
      return { action: "BUY", stopLoss: stop, target, confidence: 0.55, reason: "RSI oversold + bullish bar" };
    }
    if (ctx.position.qty > 0 && r > 50) {
      return { action: "EXIT", reason: "RSI mean-reverted" };
    }
    return { action: "HOLD" };
  },
};

/** Donchian 20-day breakout (turtle-style entry, EMA20 trail). */
const donchianBreakout: Strategy = {
  id: "donchian_20",
  name: "Donchian 20 Breakout",
  description: "Buy on close above 20-day high; trail with EMA20.",
  warmup: 25,
  step(ctx) {
    const closes = ctx.bars.map((b) => b.close);
    const highs = ctx.bars.map((b) => b.high);
    const lows = ctx.bars.map((b) => b.low);
    const i = ctx.i;
    if (i < 21) return { action: "HOLD" };

    const prevHigh = highest(highs, 20, i - 1);
    const prevLow = lowest(lows, 20, i - 1);
    const e20 = ema(closes, 20, i);

    if (ctx.position.qty <= 0 && closes[i] > prevHigh) {
      const stop = prevLow;
      const target = closes[i] + (closes[i] - stop) * 2;
      return { action: "BUY", stopLoss: stop, target, confidence: 0.65, reason: "20-day high breakout" };
    }
    if (ctx.position.qty > 0 && e20 != null && closes[i] < e20) {
      return { action: "EXIT", reason: "below EMA20 trail" };
    }
    return { action: "HOLD" };
  },
};

export const STRATEGIES: Record<string, Strategy> = {
  [smaCrossover.id]: smaCrossover,
  [rsiMeanReversion.id]: rsiMeanReversion,
  [donchianBreakout.id]: donchianBreakout,
};

export function getStrategy(id: string): Strategy | null {
  return STRATEGIES[id] ?? null;
}

export function listStrategies(): { id: string; name: string; description: string }[] {
  return Object.values(STRATEGIES).map((s) => ({ id: s.id, name: s.name, description: s.description }));
}
