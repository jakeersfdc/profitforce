/**
 * Commodity conversions — Yahoo COMEX/NYMEX USD futures → MCX INR spot.
 *
 * ⚠️  HONESTY DISCLAIMER ⚠️
 * This app does NOT have a real-time MCX data feed. Without a paid MCX
 * license (or a Kite/Angel/Upstox broker API key), nobody can show
 * *exact* MCX LTP. What we show is an INTERNATIONAL REFERENCE price
 * converted to ₹ using:
 *
 *   1. Yahoo's COMEX/NYMEX/ICE USD futures price
 *   2. Live USD/INR FX rate
 *   3. Physical-unit conversion (oz↔g, lb↔kg)
 *   4. An Indian-market premium (import duty + GST + basis)
 *
 * Actual MCX contracts routinely deviate ±1–5% due to:
 *   - Contract-month basis (near-month vs far-month)
 *   - Delivery premium / cost-of-carry
 *   - Intraday MCX liquidity vs COMEX liquidity
 *   - Indian festive/demand premiums (Akshaya Tritiya, Dhanteras)
 *
 * If the operator has access to a live MCX feed, set these env vars to
 * override the estimate with a per-commodity anchor ₹ price (updated on
 * a schedule); intraday moves will then track the Yahoo % delta from the
 * anchor, giving broker-grade accuracy:
 *
 *   NEXT_PUBLIC_MCX_GOLD_ANCHOR       ₹/10g  (e.g. 150218)
 *   NEXT_PUBLIC_MCX_SILVER_ANCHOR     ₹/kg   (e.g. 241481)
 *   NEXT_PUBLIC_MCX_CRUDE_ANCHOR      ₹/bbl  (e.g. 9059)
 *   NEXT_PUBLIC_MCX_BRENT_ANCHOR      ₹/bbl
 *   NEXT_PUBLIC_MCX_NATGAS_ANCHOR     ₹/mmBtu (e.g. 258.8)
 *   NEXT_PUBLIC_MCX_COPPER_ANCHOR     ₹/kg
 *   NEXT_PUBLIC_MCX_ANCHOR_USD_GOLD   USD GC=F at anchor time
 *   NEXT_PUBLIC_MCX_ANCHOR_USD_SILVER SI=F at anchor time
 *   ...etc for each commodity
 *
 * When anchors ARE set, we render "MCX ≈ anchor × (1 + Δ%)" and label
 * the source as "MCX (anchor-tracked)".
 * When anchors are NOT set, we clearly label the display as
 * "Int'l Ref. (₹ est.)" and urge users to verify on broker.
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

// Read env (client/server safe)
function envNum(key: string, fallback: number): number {
  if (typeof process === "undefined") return fallback;
  const raw = process.env?.[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function envNumOrNull(key: string): number | null {
  if (typeof process === "undefined") return null;
  const raw = process.env?.[key];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Typical Indian premium over international-equivalent (duty + GST + basis).
// Used only when no anchor price is configured.
export const MCX_PREMIUM: Record<CommodityId, number> = {
  GOLD:   envNum("NEXT_PUBLIC_MCX_GOLD_PREMIUM",   1.10),
  SILVER: envNum("NEXT_PUBLIC_MCX_SILVER_PREMIUM", 1.08),
  CRUDE:  envNum("NEXT_PUBLIC_MCX_CRUDE_PREMIUM",  1.00),
  BRENT:  envNum("NEXT_PUBLIC_MCX_BRENT_PREMIUM",  1.00),
  NATGAS: envNum("NEXT_PUBLIC_MCX_NATGAS_PREMIUM", 1.00),
  COPPER: envNum("NEXT_PUBLIC_MCX_COPPER_PREMIUM", 1.02),
};

// Optional per-commodity MCX anchor: a known-good ₹ price captured at
// a known USD futures price. If both are set, we use them to track.
export const MCX_ANCHOR_INR: Record<CommodityId, number | null> = {
  GOLD:   envNumOrNull("NEXT_PUBLIC_MCX_GOLD_ANCHOR"),
  SILVER: envNumOrNull("NEXT_PUBLIC_MCX_SILVER_ANCHOR"),
  CRUDE:  envNumOrNull("NEXT_PUBLIC_MCX_CRUDE_ANCHOR"),
  BRENT:  envNumOrNull("NEXT_PUBLIC_MCX_BRENT_ANCHOR"),
  NATGAS: envNumOrNull("NEXT_PUBLIC_MCX_NATGAS_ANCHOR"),
  COPPER: envNumOrNull("NEXT_PUBLIC_MCX_COPPER_ANCHOR"),
};

export const MCX_ANCHOR_USD: Record<CommodityId, number | null> = {
  GOLD:   envNumOrNull("NEXT_PUBLIC_MCX_ANCHOR_USD_GOLD"),
  SILVER: envNumOrNull("NEXT_PUBLIC_MCX_ANCHOR_USD_SILVER"),
  CRUDE:  envNumOrNull("NEXT_PUBLIC_MCX_ANCHOR_USD_CRUDE"),
  BRENT:  envNumOrNull("NEXT_PUBLIC_MCX_ANCHOR_USD_BRENT"),
  NATGAS: envNumOrNull("NEXT_PUBLIC_MCX_ANCHOR_USD_NATGAS"),
  COPPER: envNumOrNull("NEXT_PUBLIC_MCX_ANCHOR_USD_COPPER"),
};

export function isCommodityId(id: string): id is CommodityId {
  return id === "GOLD" || id === "SILVER" || id === "CRUDE" || id === "BRENT" || id === "NATGAS" || id === "COPPER";
}

export function hasMcxAnchor(id: string): boolean {
  if (!isCommodityId(id)) return false;
  return MCX_ANCHOR_INR[id] != null && MCX_ANCHOR_USD[id] != null;
}

export type McxEstimate = {
  /** Rupee price estimate (₹/unit). */
  inr: number;
  /** Data source label for the UI. */
  source: "mcx-anchor" | "intl-ref";
  /** Human-readable label for the UI. */
  label: string;
};

/**
 * Convert a USD futures price to an ₹ MCX estimate.
 * If an anchor is configured for this commodity, we use
 *     anchor × (liveUSD / anchorUSD)
 * (so the ₹ price tracks intraday USD moves from a known-good MCX
 * reference point). Otherwise we compute a physical-unit + duty estimate
 * and CLEARLY label it as an international reference.
 */
export function usdToMcxEstimate(id: string, usd: number, fx: number): McxEstimate {
  const rate = fx > 0 ? fx : 83;

  if (isCommodityId(id) && hasMcxAnchor(id)) {
    const anchorInr = MCX_ANCHOR_INR[id] as number;
    const anchorUsd = MCX_ANCHOR_USD[id] as number;
    const inr = anchorInr * (usd / anchorUsd);
    return { inr, source: "mcx-anchor", label: "MCX (anchor-tracked)" };
  }

  const premium = isCommodityId(id) ? MCX_PREMIUM[id] : 1;
  let base = usd * rate;
  if (id === "GOLD") base = usd * rate * (10 / 31.1035);
  else if (id === "SILVER") base = usd * rate * (1000 / 31.1035);
  else if (id === "COPPER") base = usd * rate * (1 / 0.4536);
  return { inr: base * premium, source: "intl-ref", label: "Int'l Ref. (₹ est.)" };
}

/** Legacy helper — returns only the ₹ number for backwards compatibility. */
export function usdToMcxInr(id: string, usd: number, fx: number): number {
  return usdToMcxEstimate(id, usd, fx).inr;
}

/**
 * Runtime anchor support: given a live-fetched anchor map (see
 * /api/mcx-anchors), compute a broker-grade ₹ price. Falls back to the
 * env/heuristic path from `usdToMcxEstimate` when no anchor is supplied.
 */
export type RuntimeAnchor = { inr: number; usd: number };
export type RuntimeAnchorMap = Partial<Record<CommodityId, RuntimeAnchor>>;

export function usdToMcxEstimateWithAnchor(
  id: string,
  usd: number,
  fx: number,
  anchors: RuntimeAnchorMap | null | undefined,
): McxEstimate {
  if (isCommodityId(id) && anchors?.[id]) {
    const a = anchors[id]!;
    if (a.usd > 0 && a.inr > 0) {
      return {
        inr: a.inr * (usd / a.usd),
        source: "mcx-anchor",
        label: "MCX (anchor-tracked)",
      };
    }
  }
  return usdToMcxEstimate(id, usd, fx);
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
