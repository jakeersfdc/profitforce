/**
 * Commodity conversions — Yahoo COMEX/NYMEX USD futures → MCX INR spot.
 *
 * Physical unit basis (MCX contract spec):
 *   GOLD    ₹ per 10 grams   (COMEX is $/troy ounce)   → USD × fx × 10 / 31.1035
 *   SILVER  ₹ per kilogram   (COMEX is $/troy ounce)   → USD × fx × 1000 / 31.1035
 *   CRUDE   ₹ per barrel     (NYMEX is $/barrel)       → USD × fx
 *   BRENT   ₹ per barrel     (ICE is $/barrel)         → USD × fx
 *   NATGAS  ₹ per mmBtu      (NYMEX is $/mmBtu)        → USD × fx
 *   COPPER  ₹ per kilogram   (COMEX is $/pound)        → USD × fx / 0.4536
 *
 * INDIAN MARKET PREMIUM (to match what users see on Zerodha/Kotak broker
 * apps). MCX futures trade at a consistent premium over physical-equivalent
 * due to import duty, GST, basis, premium, and liquidity. These multipliers
 * are typical-case estimates (tunable via NEXT_PUBLIC_MCX_*_PREMIUM env).
 *
 * Import-duty / GST reality (2025-26 regime, indicative):
 *   GOLD   ~6% import duty + 3% GST on bar ≈ 1.09–1.12×
 *   SILVER ~10% all-in ≈ 1.08–1.11×
 *   CRUDE  ~1.00 (near-perfect arb with NYMEX)
 *   BRENT  ~1.00
 *   NATGAS ~1.00
 *   COPPER ~1.02 (minor basis)
 *
 * These are APPROXIMATIONS. Always verify on broker before trading.
 */

export type CommodityId = "GOLD" | "SILVER" | "CRUDE" | "BRENT" | "NATGAS" | "COPPER";

export const COMMODITY_UNITS: Record<CommodityId, string> = {
  GOLD: "10g",
  SILVER: "kg",
  CRUDE: "bbl",
  BRENT: "bbl",
  NATGAS: "mmBtu",
  COPPER: "kg",
};

export const COMMODITY_STRIKE_STEP: Record<CommodityId, number> = {
  GOLD: 100,
  SILVER: 500,
  CRUDE: 50,
  BRENT: 50,
  NATGAS: 2,
  COPPER: 5,
};

// MCX premium over international-equivalent (duty + GST + basis).
// Read from env at module-load so ops can tune without redeploying code.
function envNum(key: string, fallback: number): number {
  if (typeof process === "undefined") return fallback;
  const raw = process.env?.[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const MCX_PREMIUM: Record<CommodityId, number> = {
  GOLD:   envNum("NEXT_PUBLIC_MCX_GOLD_PREMIUM",   1.10),
  SILVER: envNum("NEXT_PUBLIC_MCX_SILVER_PREMIUM", 1.08),
  CRUDE:  envNum("NEXT_PUBLIC_MCX_CRUDE_PREMIUM",  1.00),
  BRENT:  envNum("NEXT_PUBLIC_MCX_BRENT_PREMIUM",  1.00),
  NATGAS: envNum("NEXT_PUBLIC_MCX_NATGAS_PREMIUM", 1.00),
  COPPER: envNum("NEXT_PUBLIC_MCX_COPPER_PREMIUM", 1.02),
};

export function isCommodityId(id: string): id is CommodityId {
  return id === "GOLD" || id === "SILVER" || id === "CRUDE" || id === "BRENT" || id === "NATGAS" || id === "COPPER";
}

export function usdToMcxInr(id: string, usd: number, fx: number): number {
  const rate = fx > 0 ? fx : 83;
  const premium = isCommodityId(id) ? MCX_PREMIUM[id] : 1;
  let base = usd * rate;
  if (id === "GOLD") base = usd * rate * (10 / 31.1035);
  else if (id === "SILVER") base = usd * rate * (1000 / 31.1035);
  else if (id === "COPPER") base = usd * rate * (1 / 0.4536);
  // CRUDE, BRENT, NATGAS — traded in original unit
  return base * premium;
}

export function roundMcxStrike(id: string, mcxPrice: number): number {
  const step = isCommodityId(id) ? COMMODITY_STRIKE_STEP[id] : 10;
  if (!Number.isFinite(mcxPrice) || mcxPrice <= 0) return 0;
  return Math.round(mcxPrice / step) * step;
}

export function commodityUnit(id: string): string {
  return isCommodityId(id) ? COMMODITY_UNITS[id] : "";
}

export function mcxPremiumPct(id: string): number {
  const p = isCommodityId(id) ? MCX_PREMIUM[id] : 1;
  return (p - 1) * 100;
}
