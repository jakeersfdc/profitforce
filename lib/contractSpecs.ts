/**
 * NSE / BSE / MCX contract specifications — strike-step intervals and
 * lot sizes. Single source of truth used by the dashboard, signal engine,
 * AutoTrader and notification broadcaster.
 *
 * Lot sizes track NSE F&O Master (Mar 2026 series) for Nifty 50 stocks.
 * Update on each NSE lot-size revision (typically twice a year).
 */

import { isCommodityId, COMMODITY_STRIKE_STEP, type CommodityId } from "./commodity";
import { normaliseSymbol } from "./expiryUtils";

/* ───────────────────── Strike-step rules ───────────────────── */

const INDEX_STRIKE_STEP: Record<string, number> = {
  NIFTY: 50,
  BANKNIFTY: 100,
  FINNIFTY: 50,
  NIFTYIT: 50,
  NIFTYMIDCAP: 25,
  SENSEX: 100,
  BANKEX: 100,
};

/**
 * NSE F&O strike-interval for individual stocks, calibrated against
 * actual listed strikes for liquid F&O names.
 */
function stockStrikeStep(price: number): number {
  if (price <= 50) return 2.5;
  if (price <= 100) return 5;
  if (price <= 250) return 5;
  if (price <= 500) return 5;
  if (price <= 1000) return 10;
  if (price <= 2500) return 20;
  if (price <= 5000) return 50;
  return 100;
}

export function strikeStepFor(symbol: string, price: number): number {
  const s = normaliseSymbol(symbol);
  if (isCommodityId(s)) return COMMODITY_STRIKE_STEP[s as CommodityId];
  if (INDEX_STRIKE_STEP[s] != null) return INDEX_STRIKE_STEP[s];
  return stockStrikeStep(price);
}

/**
 * First listed OTM strike for the given direction:
 *   • CE → ceil(spot/step)·step (next strike above spot)
 *   • PE → floor(spot/step)·step (next strike below spot)
 * If spot lands exactly on a strike, jump one further out for a true OTM.
 */
export function nearestOtmStrike(spot: number, step: number, isCall: boolean): number {
  if (!(spot > 0) || !(step > 0)) return 0;
  const ratio = spot / step;
  const k = isCall ? Math.ceil(ratio) * step : Math.floor(ratio) * step;
  const adj = (k === spot) ? (isCall ? k + step : k - step) : k;
  return Math.round(adj * 100) / 100;
}

export function atmStrike(spot: number, step: number): number {
  if (!(spot > 0) || !(step > 0)) return 0;
  return Math.round(Math.round(spot / step) * step * 100) / 100;
}

/* ───────────────────── NSE Lot Sizes (current series) ───────────────────── */

/**
 * Contract lot size per symbol. Keys are normalised (e.g. "RELIANCE",
 * "NIFTY", "BANKNIFTY"). Values from NSE F&O bhavcopy and circular
 * 2026/006 dated 28 Feb 2026 (placeholder — replace with current
 * series each quarter or fetch from /api/lotsize endpoint).
 */
export const NSE_LOT_SIZE: Record<string, number> = {
  // Indices (post-Apr 2025 lot revision)
  NIFTY: 75,
  BANKNIFTY: 30,
  FINNIFTY: 65,
  NIFTYIT: 100,
  NIFTYMIDCAP: 120,
  SENSEX: 20,
  BANKEX: 30,

  // Nifty-50 single-stock options
  ADANIENT: 300,
  ADANIPORTS: 800,
  APOLLOHOSP: 125,
  ASIANPAINT: 200,
  AXISBANK: 625,
  BAJAJ_AUTO: 75,
  BAJFINANCE: 125,
  BAJAJFINSV: 500,
  BEL: 2850,
  BHARTIARTL: 475,
  BPCL: 1800,
  BRITANNIA: 200,
  CIPLA: 375,
  COALINDIA: 2100,
  DIVISLAB: 200,
  DRREDDY: 125,
  EICHERMOT: 175,
  ETERNAL: 1100,
  GRASIM: 250,
  HCLTECH: 350,
  HDFCBANK: 550,
  HDFCLIFE: 1100,
  HEROMOTOCO: 150,
  HINDALCO: 1400,
  HINDUNILVR: 300,
  ICICIBANK: 700,
  INDUSINDBK: 700,
  INFY: 400,
  ITC: 1600,
  JIOFIN: 2400,
  JSWSTEEL: 675,
  KOTAKBANK: 400,
  LT: 175,
  LTNS: 175,
  LTIM: 150,
  M_M: 175,
  MARUTI: 50,
  NESTLEIND: 250,
  NTPC: 1500,
  ONGC: 2250,
  POWERGRID: 1900,
  RELIANCE: 500,
  SBILIFE: 375,
  SBIN: 750,
  SHRIRAMFIN: 825,
  SUNPHARMA: 350,
  TATACONSUM: 550,
  TATAMOTORS: 800,
  TATASTEEL: 5500,
  TCS: 175,
  TECHM: 600,
  TITAN: 175,
  TRENT: 100,
  ULTRACEMCO: 50,
  WIPRO: 3000,
};

/* ───────────────────── MCX Lot Sizes ───────────────────── */

export const MCX_LOT_SIZE: Record<CommodityId, number> = {
  GOLD: 100,    // 100 g (mini)
  SILVER: 5,    // 5 kg (mini)
  CRUDE: 100,   // 100 bbl
  BRENT: 100,
  NATGAS: 1250, // mmBtu
  COPPER: 2500, // kg
};

/**
 * Resolve the contract lot size for any tradeable symbol.
 * Returns null if unknown so the UI can fall back gracefully.
 */
export function getLotSize(symbol: string): number | null {
  const s = normaliseSymbol(symbol);
  if (isCommodityId(s)) return MCX_LOT_SIZE[s as CommodityId];
  if (NSE_LOT_SIZE[s] != null) return NSE_LOT_SIZE[s];
  // Common alias normalisation
  const alt = s.replace(/[-_]/g, "");
  if (NSE_LOT_SIZE[alt] != null) return NSE_LOT_SIZE[alt];
  return null;
}

/** Suggested lot multipliers for UI (1× = single lot, 40× = institutional). */
export const SUGGESTED_LOT_MULTIPLIERS = [1, 3, 5, 10, 20, 30, 40] as const;
