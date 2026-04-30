/**
 * Backtester — runs Strategy bar-by-bar with realistic costs + slippage.
 *
 * Same Strategy object is used in LiveRunner; only the harness differs.
 * Position sizing uses Kelly-flavoured risk-per-trade: shares = floor(
 *   capital × riskPerTrade / |entry - stop|).
 */
import type { Bar, StrategyContext } from "./Strategy";
import { applySlippage, computeCosts, segmentFor, type Segment } from "@/lib/risk/CostModel";

export interface BacktestOptions {
  symbol: string;
  bars: Bar[];
  strategy: import("./Strategy").Strategy;
  startingCapital?: number;
  riskPerTrade?: number;       // 0..1 fraction of capital
  segment?: Segment;
  intraday?: boolean;
  maxLossPct?: number;         // hard cap per trade if strategy stop is too wide
}

export interface BacktestTrade {
  side: "BUY" | "SELL";
  qty: number;
  entryDate: string;
  entryPrice: number;
  exitDate?: string;
  exitPrice?: number;
  exitReason?: "TARGET" | "STOP" | "STRATEGY_EXIT" | "EOF";
  stopLoss?: number;
  target?: number;
  grossPnl?: number;
  fees?: number;
  netPnl?: number;
  netPnlPct?: number;
}

export interface BacktestSummary {
  symbol: string;
  strategyId: string;
  startingCapital: number;
  endingCapital: number;
  totalGrossPnl: number;
  totalFees: number;
  totalNetPnl: number;
  roiPct: number;
  cagrPct?: number;
  trades: BacktestTrade[];
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdownPct: number;
  sharpe?: number;
  sortino?: number;
}

export function runBacktest(opts: BacktestOptions): BacktestSummary {
  const {
    symbol, bars, strategy,
    startingCapital = 100000,
    riskPerTrade = 0.01,
    intraday = false,
    maxLossPct = 0.05,
  } = opts;

  const segment: Segment = opts.segment ?? segmentFor(symbol, { intraday });
  const dates = bars.map((b) => b.date);

  let capital = startingCapital;
  let peak = capital;
  let maxDD = 0;
  const equityCurve: number[] = [];
  const trades: BacktestTrade[] = [];
  let position = { qty: 0, avgPrice: 0 };

  const warmup = Math.max(strategy.warmup ?? 0, 21);

  for (let i = warmup; i < bars.length; i++) {
    const ctx: StrategyContext = {
      symbol, segment, capital, position, bars, i,
    };
    const signal = strategy.step(ctx);

    // Manage open position first (target/stop hits intra-bar)
    if (position.qty !== 0 && trades.length > 0) {
      const last = trades[trades.length - 1];
      if (last.exitPrice == null) {
        const bar = bars[i];
        let exitPrice: number | null = null;
        let reason: BacktestTrade["exitReason"] | null = null;
        if (last.side === "BUY") {
          if (last.stopLoss && bar.low <= last.stopLoss) { exitPrice = last.stopLoss; reason = "STOP"; }
          else if (last.target && bar.high >= last.target) { exitPrice = last.target; reason = "TARGET"; }
        } else {
          if (last.stopLoss && bar.high >= last.stopLoss) { exitPrice = last.stopLoss; reason = "STOP"; }
          else if (last.target && bar.low <= last.target) { exitPrice = last.target; reason = "TARGET"; }
        }
        if (signal.action === "EXIT" && exitPrice == null) {
          exitPrice = applySlippage({ price: bar.close, side: last.side === "BUY" ? "SELL" : "BUY" });
          reason = "STRATEGY_EXIT";
        }
        if (exitPrice != null && reason) {
          closeTrade(last, exitPrice, dates[i], reason);
          capital = applyTradePnl(capital, last);
          peak = Math.max(peak, capital);
          maxDD = Math.max(maxDD, ((peak - capital) / peak) * 100);
          position = { qty: 0, avgPrice: 0 };
        }
      }
    }

    // New entry on next bar's open if signal says BUY/SELL and we are flat
    if (position.qty === 0 && (signal.action === "BUY" || signal.action === "SELL")) {
      const next = bars[i + 1] ?? bars[i];
      const rawEntry = next.open ?? bars[i].close;
      const entryPrice = applySlippage({ price: rawEntry, side: signal.action });
      const stop = signal.stopLoss ?? (signal.action === "BUY" ? entryPrice * (1 - maxLossPct) : entryPrice * (1 + maxLossPct));
      const target = signal.target ?? (signal.action === "BUY" ? entryPrice + (entryPrice - stop) * 1.5 : entryPrice - (stop - entryPrice) * 1.5);
      const riskPerShare = Math.abs(entryPrice - stop) || 1e-6;
      const qty = Math.floor((capital * riskPerTrade) / riskPerShare);
      if (qty <= 0) continue;
      const trade: BacktestTrade = {
        side: signal.action,
        qty,
        entryDate: dates[Math.min(i + 1, bars.length - 1)],
        entryPrice,
        stopLoss: stop,
        target,
      };
      trades.push(trade);
      position = { qty: signal.action === "BUY" ? qty : -qty, avgPrice: entryPrice };
    }

    equityCurve.push(capital);
  }

  // Force close at EOF
  if (position.qty !== 0 && trades.length > 0) {
    const last = trades[trades.length - 1];
    if (last.exitPrice == null) {
      const bar = bars[bars.length - 1];
      const exitPrice = applySlippage({ price: bar.close, side: last.side === "BUY" ? "SELL" : "BUY" });
      closeTrade(last, exitPrice, bar.date, "EOF");
      capital = applyTradePnl(capital, last);
    }
  }

  const closed = trades.filter((t) => t.exitPrice != null);
  const wins = closed.filter((t) => (t.netPnl ?? 0) > 0).length;
  const losses = closed.length - wins;
  const grossWins = closed.filter((t) => (t.netPnl ?? 0) > 0).reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const grossLosses = Math.abs(closed.filter((t) => (t.netPnl ?? 0) < 0).reduce((s, t) => s + (t.netPnl ?? 0), 0));
  const totalGross = closed.reduce((s, t) => s + (t.grossPnl ?? 0), 0);
  const totalFees = closed.reduce((s, t) => s + (t.fees ?? 0), 0);
  const totalNet = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);

  const days = (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000;
  const cagr = days > 30 ? (Math.pow(capital / startingCapital, 365 / days) - 1) * 100 : undefined;

  // Sharpe / Sortino on equity-curve daily returns
  const rets: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1];
    if (prev > 0) rets.push((equityCurve[i] - prev) / prev);
  }
  const sharpe = rets.length > 5 ? sharpeRatio(rets) : undefined;
  const sortino = rets.length > 5 ? sortinoRatio(rets) : undefined;

  function closeTrade(t: BacktestTrade, exitPrice: number, exitDate: string, reason: BacktestTrade["exitReason"]) {
    t.exitPrice = exitPrice;
    t.exitDate = exitDate;
    t.exitReason = reason;
    const grossPnl = t.side === "BUY"
      ? (exitPrice - t.entryPrice) * t.qty
      : (t.entryPrice - exitPrice) * t.qty;
    const cost = computeCosts({ segment, side: t.side, qty: t.qty, price: t.entryPrice }).total
               + computeCosts({ segment, side: t.side === "BUY" ? "SELL" : "BUY", qty: t.qty, price: exitPrice }).total;
    t.grossPnl = round(grossPnl);
    t.fees = round(cost);
    t.netPnl = round(grossPnl - cost);
    t.netPnlPct = round((t.netPnl! / (t.entryPrice * t.qty)) * 100);
  }

  function applyTradePnl(cap: number, t: BacktestTrade): number {
    return round(cap + (t.netPnl ?? 0));
  }

  return {
    symbol,
    strategyId: strategy.id,
    startingCapital,
    endingCapital: round(capital),
    totalGrossPnl: round(totalGross),
    totalFees: round(totalFees),
    totalNetPnl: round(totalNet),
    roiPct: round(((capital - startingCapital) / startingCapital) * 100),
    cagrPct: cagr != null ? round(cagr) : undefined,
    trades,
    closedTrades: closed.length,
    wins,
    losses,
    winRate: closed.length ? round((wins / closed.length) * 100) : 0,
    profitFactor: grossLosses > 0 ? round(grossWins / grossLosses) : (grossWins > 0 ? Infinity : 0),
    expectancy: closed.length ? round(totalNet / closed.length) : 0,
    maxDrawdownPct: round(maxDD),
    sharpe: sharpe != null ? round(sharpe) : undefined,
    sortino: sortino != null ? round(sortino) : undefined,
  };
}

function round(n: number): number { return Number(n.toFixed(2)); }

function sharpeRatio(rets: number[]): number {
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
  const stdev = Math.sqrt(variance);
  if (stdev === 0) return 0;
  // Annualised assuming ~252 trading days
  return (mean / stdev) * Math.sqrt(252);
}

function sortinoRatio(rets: number[]): number {
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const downside = rets.filter((r) => r < 0);
  if (downside.length === 0) return 0;
  const dvar = downside.reduce((s, r) => s + r ** 2, 0) / downside.length;
  const dstd = Math.sqrt(dvar);
  if (dstd === 0) return 0;
  return (mean / dstd) * Math.sqrt(252);
}
