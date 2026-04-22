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
 * These are PHYSICAL EQUIVALENTS — actual MCX futures may differ by a few
 * percent due to import duty, GST, contract month basis, premium, and
 * liquidity. Use only as an indicative reference; always verify on broker.
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

export function isCommodityId(id: string): id is CommodityId {
  return id === "GOLD" || id === "SILVER" || id === "CRUDE" || id === "BRENT" || id === "NATGAS" || id === "COPPER";
}

export function usdToMcxInr(id: string, usd: number, fx: number): number {
  const rate = fx > 0 ? fx : 83;
  if (id === "GOLD") return usd * rate * (10 / 31.1035);
  if (id === "SILVER") return usd * rate * (1000 / 31.1035);
  if (id === "COPPER") return usd * rate * (1 / 0.4536);
  // CRUDE, BRENT, NATGAS — traded in original unit
  return usd * rate;
}

export function roundMcxStrike(id: string, mcxPrice: number): number {
  const step = isCommodityId(id) ? COMMODITY_STRIKE_STEP[id] : 10;
  if (!Number.isFinite(mcxPrice) || mcxPrice <= 0) return 0;
  return Math.round(mcxPrice / step) * step;
}

export function commodityUnit(id: string): string {
  return isCommodityId(id) ? COMMODITY_UNITS[id] : "";
}
