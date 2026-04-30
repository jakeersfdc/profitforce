/**
 * Strategy framework.
 *
 * A Strategy looks at a sequence of bars + the running portfolio context and
 * emits Signals. The same strategy code runs in two harnesses:
 *
 *   • Backtester (lib/strategy/Backtester.ts) — historical bars, simulated fills
 *   • LiveRunner (lib/strategy/LiveRunner.ts) — fresh bars, real OMS placement
 *
 * Strategies must be deterministic given the same input. Random number sources
 * are forbidden (no Math.random); use bar timestamps as RNG seed if needed.
 */

export interface Bar {
  date: string;            // ISO yyyy-mm-dd
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyContext {
  symbol: string;
  segment: import("@/lib/risk/CostModel").Segment;
  capital: number;
  /** Currently open position (signed qty + avg). */
  position: { qty: number; avgPrice: number };
  /** Latest available bars, oldest → newest. The strategy may read all. */
  bars: Bar[];
  /** Index of "now" inside `bars`. Strategy must not look past this. */
  i: number;
}

export type SignalAction = "BUY" | "SELL" | "EXIT" | "HOLD";

export interface StrategySignal {
  action: SignalAction;
  /** Limit price; omit for market. */
  price?: number;
  stopLoss?: number;
  target?: number;
  /** 0..1; backtester / risk engine may use this for sizing. */
  confidence?: number;
  reason?: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  /** Pure function over context. No I/O, no Date.now(). */
  step(ctx: StrategyContext): StrategySignal;
  /** Optional warm-up. Strategy may not signal before this many bars. */
  warmup?: number;
}

/* ---------------------------------------------------------------- helpers */

export function sma(values: number[], period: number, idx: number): number | null {
  if (idx < period - 1 || idx >= values.length) return null;
  let s = 0;
  for (let i = idx - period + 1; i <= idx; i++) s += values[i];
  return s / period;
}

export function ema(values: number[], period: number, idx: number): number | null {
  if (idx < period - 1) return null;
  const k = 2 / (period + 1);
  let e = sma(values, period, period - 1);
  if (e == null) return null;
  for (let i = period; i <= idx; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

export function rsi(values: number[], period: number, idx: number): number | null {
  if (idx < period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const avgG = gains / period;
  const avgL = losses / period;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

export function highest(values: number[], period: number, idx: number): number {
  let m = -Infinity;
  for (let i = Math.max(0, idx - period + 1); i <= idx; i++) m = Math.max(m, values[i]);
  return m;
}

export function lowest(values: number[], period: number, idx: number): number {
  let m = Infinity;
  for (let i = Math.max(0, idx - period + 1); i <= idx; i++) m = Math.min(m, values[i]);
  return m;
}
