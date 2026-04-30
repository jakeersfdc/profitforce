/**
 * Gann fan / square-of-9 helpers (extracted from SignalEngine.ts so they
 * can be reused by the strategy framework and chart UI without importing
 * the full signal pipeline).
 */
import type { Bar } from "./Strategy";

export interface GannPivot {
  index: number;          // bar index of the pivot
  date: string;           // pivot date
  price: number;          // pivot price
  direction: "up" | "down"; // up = pivot is a swing low, fan ascends
  unit: number;           // 1x1 slope = unit price per bar (ATR-anchored)
}

export interface GannFanPoint {
  date: string;
  g1x1: number;
  g2x1: number;
  g4x1: number;
  g1x2: number;
  g1x4: number;
}

export interface GannFanProjection {
  pivot: GannPivot;
  series: GannFanPoint[];   // historical + projected, one per bar
  squareSupport: number;
  squareResistance: number;
}

/** True Range and rolling ATR(14). */
function atr(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return Math.max(0, (bars[bars.length - 1]?.high ?? 0) - (bars[bars.length - 1]?.low ?? 0));
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prev),
      Math.abs(bars[i].low - prev),
    );
    sum += tr;
  }
  return sum / period;
}

/** Find the most recent swing pivot (n bars on each side). */
function findSwing(bars: Bar[], n = 3): { lowIdx: number; highIdx: number } {
  let lowIdx = -1;
  let highIdx = -1;
  for (let i = bars.length - n - 1; i >= n; i--) {
    let isLow = true, isHigh = true;
    for (let j = 1; j <= n; j++) {
      if (bars[i].low > bars[i - j].low || bars[i].low > bars[i + j].low) isLow = false;
      if (bars[i].high < bars[i - j].high || bars[i].high < bars[i + j].high) isHigh = false;
    }
    if (isLow && lowIdx === -1) lowIdx = i;
    if (isHigh && highIdx === -1) highIdx = i;
    if (lowIdx !== -1 && highIdx !== -1) break;
  }
  return { lowIdx, highIdx };
}

/** Square-of-9 nearest support / resistance for a given price. */
export function gannSquareOfNine(price: number): { support: number; resistance: number } {
  const root = Math.sqrt(price);
  const lower = Math.floor(root);
  const upper = Math.ceil(root);
  const stepDown = lower * lower;
  const stepUp = upper * upper;
  const harmonicDown = Math.pow(lower + 0.125, 2);
  const harmonicUp = Math.pow(upper - 0.125, 2);
  return {
    support: Math.min(stepDown, harmonicDown),
    resistance: Math.max(stepUp, harmonicUp),
  };
}

/**
 * Project a Gann fan from the most recent swing pivot through every bar
 * (history + N forward projection bars). Output is shaped for charting.
 */
export function projectGannFan(bars: Bar[], projectBars = 10): GannFanProjection | null {
  if (bars.length < 30) return null;
  const { lowIdx, highIdx } = findSwing(bars, 3);
  // Pick the more recent of the two pivots; that defines fan direction.
  const useLow = lowIdx > highIdx;
  const pivotIdx = useLow ? lowIdx : highIdx;
  if (pivotIdx < 0) return null;
  const direction: "up" | "down" = useLow ? "up" : "down";
  const pivotPrice = useLow ? bars[pivotIdx].low : bars[pivotIdx].high;
  const a = atr(bars, 14);
  const unit = Math.max(a, pivotPrice * 0.0005);
  const sign = direction === "up" ? 1 : -1;

  const series: GannFanPoint[] = [];
  // Last bar's date as the anchor for projection-date generation
  const lastDate = bars[bars.length - 1].date;
  const lastTs = new Date(lastDate).getTime();

  for (let i = pivotIdx; i < bars.length + projectBars; i++) {
    const t = i - pivotIdx;
    const date = i < bars.length
      ? bars[i].date
      : new Date(lastTs + (i - bars.length + 1) * 86400000).toISOString().slice(0, 10);
    series.push({
      date,
      g1x1: round(pivotPrice + sign * unit * t),
      g2x1: round(pivotPrice + sign * unit * t * 2),
      g4x1: round(pivotPrice + sign * unit * t * 4),
      g1x2: round(pivotPrice + sign * unit * t * 0.5),
      g1x4: round(pivotPrice + sign * unit * t * 0.25),
    });
  }

  const sq = gannSquareOfNine(bars[bars.length - 1].close);
  return {
    pivot: {
      index: pivotIdx,
      date: bars[pivotIdx].date,
      price: round(pivotPrice),
      direction,
      unit: round(unit),
    },
    series,
    squareSupport: round(sq.support),
    squareResistance: round(sq.resistance),
  };
}

function round(n: number): number { return Number(n.toFixed(2)); }
