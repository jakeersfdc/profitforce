/**
 * CostModel — Indian regulator-accurate trading cost calculator.
 *
 * Source-of-truth references (Apr 2026 regime, sourced from Zerodha brokerage
 * calculator + NSE/BSE/MCX/SEBI circulars):
 *
 *   • Brokerage (discount-broker rate): ₹20 OR 0.03% of turnover, whichever is LOWER.
 *     Equity-delivery is brokerage-free at most discount brokers.
 *   • STT/CTT (Securities/Commodities Transaction Tax):
 *        Equity-delivery   : 0.1% on buy + sell (both legs)
 *        Equity-intraday   : 0.025% on the SELL leg only
 *        Equity F&O Future : 0.0125% on SELL
 *        Equity F&O Option : 0.0625% on SELL premium
 *        Option exercise   : 0.125% on intrinsic value (settlement)
 *        Commodity non-agri: 0.01% on SELL
 *   • Exchange transaction charges (NSE rates, BSE close):
 *        Equity            : 0.00297% of turnover
 *        F&O Futures       : 0.00173% of turnover
 *        F&O Options       : 0.03503% of premium
 *        MCX (commodities) : 0.0026% of turnover (avg; varies per contract)
 *   • SEBI turnover fee : ₹10 per crore = 0.0001% of turnover (both legs)
 *   • Stamp duty (charged on BUY only):
 *        Equity-delivery   : 0.015% (max ₹1500/day)
 *        Equity-intraday   : 0.003%
 *        F&O Futures       : 0.002%
 *        F&O Options       : 0.003%
 *        Commodities       : 0.002%
 *   • GST = 18% on (brokerage + exchange + SEBI fee)
 *
 * Slippage model:
 *   Worst-case = max(0.05% of price, 1 tick) for liquid instruments. Configurable.
 *
 * NOTE: This is a CONSERVATIVE estimator. Real fees may vary by ±5% with broker
 * promotions or SEBI rate revisions. Refresh rates quarterly. The numbers are
 * good enough for backtest realism and pre-trade cost previews — for tax filing
 * always use the broker's contract note.
 */

export type Segment =
  | "EQ_DELIVERY"
  | "EQ_INTRADAY"
  | "FUT_INDEX"
  | "FUT_STOCK"
  | "OPT_INDEX"
  | "OPT_STOCK"
  | "COM_NONAGRI";

export interface CostInput {
  segment: Segment;
  side: "BUY" | "SELL";
  qty: number;
  price: number;          // for options, this is the premium per unit
  lotSize?: number;       // not used in formulas (qty already = lots × lotSize) — kept for clarity
  exchange?: "NSE" | "BSE" | "MCX";
}

export interface CostBreakdown {
  turnover: number;
  brokerage: number;
  stt: number;
  exchangeFee: number;
  sebiFee: number;
  stamp: number;
  gst: number;            // 18% on brokerage + exchange + sebi
  total: number;          // sum of all of the above
  notes?: string[];
}

const BROKERAGE_FLAT = 20;
const BROKERAGE_PCT = 0.0003;
const SEBI_PCT = 0.000001; // ₹10/crore

function pct(amount: number, p: number): number {
  return amount * p;
}

function brokerageFor(segment: Segment, turnover: number): number {
  if (segment === "EQ_DELIVERY") return 0; // delivery brokerage-free at discount brokers
  return Math.min(BROKERAGE_FLAT, turnover * BROKERAGE_PCT);
}

function sttFor(segment: Segment, side: "BUY" | "SELL", turnover: number): number {
  switch (segment) {
    case "EQ_DELIVERY":
      return turnover * 0.001; // 0.1% on both legs
    case "EQ_INTRADAY":
      return side === "SELL" ? turnover * 0.00025 : 0;
    case "FUT_INDEX":
    case "FUT_STOCK":
      return side === "SELL" ? turnover * 0.000125 : 0;
    case "OPT_INDEX":
    case "OPT_STOCK":
      return side === "SELL" ? turnover * 0.000625 : 0;
    case "COM_NONAGRI":
      return side === "SELL" ? turnover * 0.0001 : 0;
  }
}

function exchangeFeeFor(segment: Segment, turnover: number, exchange: "NSE" | "BSE" | "MCX"): number {
  switch (segment) {
    case "EQ_DELIVERY":
    case "EQ_INTRADAY":
      return turnover * (exchange === "BSE" ? 0.0000375 : 0.0000297);
    case "FUT_INDEX":
    case "FUT_STOCK":
      return turnover * 0.0000173;
    case "OPT_INDEX":
    case "OPT_STOCK":
      return turnover * 0.0003503;
    case "COM_NONAGRI":
      return turnover * 0.000026;
  }
}

function stampFor(segment: Segment, side: "BUY" | "SELL", turnover: number): number {
  if (side !== "BUY") return 0;
  switch (segment) {
    case "EQ_DELIVERY":
      return Math.min(turnover * 0.00015, 1500);
    case "EQ_INTRADAY":
      return turnover * 0.00003;
    case "FUT_INDEX":
    case "FUT_STOCK":
      return turnover * 0.00002;
    case "OPT_INDEX":
    case "OPT_STOCK":
      return turnover * 0.00003;
    case "COM_NONAGRI":
      return turnover * 0.00002;
  }
}

export function computeCosts(input: CostInput): CostBreakdown {
  const exchange = input.exchange || (input.segment === "COM_NONAGRI" ? "MCX" : "NSE");
  const turnover = Math.abs(input.qty) * input.price;
  const brokerage = brokerageFor(input.segment, turnover);
  const stt = sttFor(input.segment, input.side, turnover);
  const exchangeFee = exchangeFeeFor(input.segment, turnover, exchange);
  const sebiFee = pct(turnover, SEBI_PCT);
  const stamp = stampFor(input.segment, input.side, turnover);
  const gst = (brokerage + exchangeFee + sebiFee) * 0.18;
  const total = brokerage + stt + exchangeFee + sebiFee + stamp + gst;
  return {
    turnover: round(turnover),
    brokerage: round(brokerage),
    stt: round(stt),
    exchangeFee: round(exchangeFee),
    sebiFee: round(sebiFee),
    stamp: round(stamp),
    gst: round(gst),
    total: round(total),
  };
}

/** Round-trip cost (entry + exit) — what backtests should subtract from gross P&L. */
export function roundTripCost(segment: Segment, qty: number, entryPrice: number, exitPrice: number, exchange?: "NSE" | "BSE" | "MCX"): CostBreakdown {
  const buy = computeCosts({ segment, side: "BUY", qty, price: entryPrice, exchange });
  const sell = computeCosts({ segment, side: "SELL", qty, price: exitPrice, exchange });
  return {
    turnover: round(buy.turnover + sell.turnover),
    brokerage: round(buy.brokerage + sell.brokerage),
    stt: round(buy.stt + sell.stt),
    exchangeFee: round(buy.exchangeFee + sell.exchangeFee),
    sebiFee: round(buy.sebiFee + sell.sebiFee),
    stamp: round(buy.stamp + sell.stamp),
    gst: round(buy.gst + sell.gst),
    total: round(buy.total + sell.total),
  };
}

export interface SlippageInput {
  price: number;
  tick?: number;            // minimum tick size (₹0.05 NSE eq, ₹0.05 F&O, etc.)
  side: "BUY" | "SELL";
  liquidity?: "high" | "medium" | "low";
}

/**
 * Apply slippage to a fill price. BUY pays up, SELL gets less.
 * Returns the worst-realistic fill (good for conservative backtest).
 */
export function applySlippage(input: SlippageInput): number {
  const tick = input.tick ?? 0.05;
  const liqMultiplier = input.liquidity === "low" ? 3 : input.liquidity === "medium" ? 1.5 : 1;
  const pctSlip = 0.0005 * liqMultiplier;
  const slip = Math.max(input.price * pctSlip, tick);
  const adj = input.side === "BUY" ? slip : -slip;
  return round(input.price + adj);
}

function round(n: number): number {
  return Number(n.toFixed(2));
}

/** Helper: figure out segment from symbol + product hints. Heuristic only. */
export function segmentFor(symbol: string, opts?: { isOption?: boolean; isFuture?: boolean; intraday?: boolean }): Segment {
  const s = symbol.toUpperCase();
  const isIndexSymbol = /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|BANKEX|NIFTYIT)/i.test(s);
  const isCommodity = /^(GOLD|SILVER|CRUDE|NATGAS|BRENT|COPPER|ZINC|LEAD|NICKEL|ALUMINIUM)/i.test(s) || s.endsWith("=F");
  if (isCommodity) return "COM_NONAGRI";
  if (opts?.isOption) return isIndexSymbol ? "OPT_INDEX" : "OPT_STOCK";
  if (opts?.isFuture) return isIndexSymbol ? "FUT_INDEX" : "FUT_STOCK";
  return opts?.intraday ? "EQ_INTRADAY" : "EQ_DELIVERY";
}
