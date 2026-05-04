/**
 * OI (Open Interest) analytics — what every futures/options desk reads.
 *
 *  • PCR (Put-Call Ratio)         — sentiment gauge
 *  • Max Pain                      — strike where most OI sits; price tends to gravitate
 *  • OI buildup classification     — long buildup / short buildup / short cover / long unwinding
 *  • Net change in CE vs PE OI     — directional pressure
 *
 * All numbers come from the NSE option chain (records.data + filtered.data).
 * Cached upstream by fetchNSEOptionChain (30s TTL) so this is cheap to call.
 */

import { fetchQuote } from "../stockUtils";

// Map Yahoo symbols → NSE option chain symbol names
const NSE_OC_MAP: Record<string, string> = {
  "^NSEI": "NIFTY",
  "^NSEBANK": "BANKNIFTY",
  "NIFTY_FIN_SERVICE.NS": "FINNIFTY",
  "^CNXIT": "NIFTY IT",
  "^NSMIDCP": "NIFTY MIDCAP 50",
};

export type OIBias =
  | "STRONG_BULL"
  | "BULL"
  | "NEUTRAL"
  | "BEAR"
  | "STRONG_BEAR";

export type OIBuildup =
  | "LONG_BUILDUP"     // price ↑ + OI ↑ — fresh longs
  | "SHORT_BUILDUP"    // price ↓ + OI ↑ — fresh shorts
  | "SHORT_COVERING"   // price ↑ + OI ↓ — bears exiting
  | "LONG_UNWINDING"   // price ↓ + OI ↓ — bulls exiting
  | "UNCLEAR";

export interface OIReading {
  available: boolean;
  pcr: number;                 // total PE OI / total CE OI
  pcrChange: number;           // (ΔPE OI) / (ΔCE OI) for today
  maxPain: number | null;
  maxPainBias: "above" | "below" | "at" | null;  // spot vs max pain
  buildup: OIBuildup;
  netCEChg: number;            // Σ change in CE OI
  netPEChg: number;            // Σ change in PE OI
  bias: OIBias;
  reasons: string[];
}

const _cache: Map<string, { ts: number; data: OIReading }> = new Map();
const TTL = 30 * 1000;

/**
 * Compute OI-derived bias for an index symbol. Returns a neutral
 * "available: false" reading for stocks (no NSE option chain mapping).
 */
export async function readOI(yahooSymbol: string, lastClose: number, prevClose: number): Promise<OIReading> {
  const empty: OIReading = {
    available: false,
    pcr: 1,
    pcrChange: 1,
    maxPain: null,
    maxPainBias: null,
    buildup: "UNCLEAR",
    netCEChg: 0,
    netPEChg: 0,
    bias: "NEUTRAL",
    reasons: [],
  };

  const nseSymbol = NSE_OC_MAP[yahooSymbol];
  if (!nseSymbol) return empty;

  const cacheKey = `${nseSymbol}:${Math.round(lastClose)}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  try {
    const { NseIndia } = await import("stock-nse-india");
    const nse = new NseIndia();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await nse.getIndexOptionChain(nseSymbol);
    if (!data || !data.records) return empty;

    // Use nearest-expiry strikes only (avoid noise from far series)
    const filteredData = (data.filtered?.data ?? data.records.data ?? []) as Array<Record<string, unknown>>;
    if (filteredData.length === 0) return empty;

    const underlyingValue = Number(
      data.filtered?.underlyingValue ?? data.records.underlyingValue ?? lastClose
    ) || lastClose;

    let totCE_OI = 0, totPE_OI = 0, totCE_chg = 0, totPE_chg = 0;
    const strikeOI: Array<{ strike: number; ceOI: number; peOI: number }> = [];

    for (const row of filteredData) {
      const strike = Number(row.strikePrice ?? 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ce = (row.CE ?? {}) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pe = (row.PE ?? {}) as any;
      const ceOI = Number(ce.openInterest ?? 0);
      const peOI = Number(pe.openInterest ?? 0);
      const ceChg = Number(ce.changeinOpenInterest ?? 0);
      const peChg = Number(pe.changeinOpenInterest ?? 0);
      totCE_OI += ceOI;
      totPE_OI += peOI;
      totCE_chg += ceChg;
      totPE_chg += peChg;
      strikeOI.push({ strike, ceOI, peOI });
    }

    const pcr = totCE_OI > 0 ? totPE_OI / totCE_OI : 1;
    const pcrChange = Math.abs(totCE_chg) > 0 ? totPE_chg / totCE_chg : 1;

    // ── Max pain calc: strike where total option-writer payoff is minimised.
    //    Approximation: strike with max combined OI (CE + PE).
    let maxPain: number | null = null;
    let maxOI = 0;
    for (const s of strikeOI) {
      const sumOI = s.ceOI + s.peOI;
      if (sumOI > maxOI) { maxOI = sumOI; maxPain = s.strike; }
    }
    const maxPainBias: OIReading["maxPainBias"] = maxPain == null
      ? null
      : underlyingValue > maxPain * 1.002 ? "above"
        : underlyingValue < maxPain * 0.998 ? "below" : "at";

    // ── OI buildup classification (today's price action vs total OI change) ──
    // Index futures OI proxy: net change in TOTAL options OI. CE-OI-up + price-down
    // = call writers selling = bearish; PE-OI-up + price-up = put writers selling = bullish.
    const dayChangePct = prevClose > 0 ? (lastClose - prevClose) / prevClose : 0;
    const totalOI_chg = totCE_chg + totPE_chg;
    let buildup: OIBuildup = "UNCLEAR";
    if (totalOI_chg > 0 && dayChangePct > 0.001) buildup = "LONG_BUILDUP";
    else if (totalOI_chg > 0 && dayChangePct < -0.001) buildup = "SHORT_BUILDUP";
    else if (totalOI_chg < 0 && dayChangePct > 0.001) buildup = "SHORT_COVERING";
    else if (totalOI_chg < 0 && dayChangePct < -0.001) buildup = "LONG_UNWINDING";

    // ── Final bias scoring ──
    let score = 0;
    const reasons: string[] = [];

    // PCR interpretation (contrarian above 1.3, bearish below 0.7 — classic option-desk reading)
    if (pcr >= 1.4) { score += 2; reasons.push(`PCR ${pcr.toFixed(2)} (oversold — put writers heavy → bullish)`); }
    else if (pcr >= 1.15) { score += 1; reasons.push(`PCR ${pcr.toFixed(2)} (mild bullish)`); }
    else if (pcr <= 0.6) { score -= 2; reasons.push(`PCR ${pcr.toFixed(2)} (overbought — call writers heavy → bearish)`); }
    else if (pcr <= 0.85) { score -= 1; reasons.push(`PCR ${pcr.toFixed(2)} (mild bearish)`); }

    // Today's PCR change (intraday flow)
    if (totPE_chg > totCE_chg * 1.3 && totPE_chg > 0) { score += 1; reasons.push(`PE OI building > CE OI (put writers active)`); }
    else if (totCE_chg > totPE_chg * 1.3 && totCE_chg > 0) { score -= 1; reasons.push(`CE OI building > PE OI (call writers active)`); }

    // Buildup interpretation
    if (buildup === "LONG_BUILDUP") { score += 2; reasons.push("Long buildup (price↑ + OI↑)"); }
    else if (buildup === "SHORT_COVERING") { score += 1; reasons.push("Short covering (price↑ + OI↓)"); }
    else if (buildup === "SHORT_BUILDUP") { score -= 2; reasons.push("Short buildup (price↓ + OI↑)"); }
    else if (buildup === "LONG_UNWINDING") { score -= 1; reasons.push("Long unwinding (price↓ + OI↓)"); }

    // Max pain gravity (price tends toward max pain on expiry week)
    if (maxPainBias === "above") { score -= 0.5; reasons.push(`Spot above max pain ₹${maxPain} (gravity pulls down)`); }
    else if (maxPainBias === "below") { score += 0.5; reasons.push(`Spot below max pain ₹${maxPain} (gravity pulls up)`); }

    let bias: OIBias = "NEUTRAL";
    if (score >= 3) bias = "STRONG_BULL";
    else if (score >= 1.5) bias = "BULL";
    else if (score <= -3) bias = "STRONG_BEAR";
    else if (score <= -1.5) bias = "BEAR";

    const reading: OIReading = {
      available: true,
      pcr: Number(pcr.toFixed(3)),
      pcrChange: Number(pcrChange.toFixed(3)),
      maxPain,
      maxPainBias,
      buildup,
      netCEChg: totCE_chg,
      netPEChg: totPE_chg,
      bias,
      reasons,
    };
    _cache.set(cacheKey, { ts: Date.now(), data: reading });
    return reading;
  } catch (e) {
    console.warn("[readOI]", e instanceof Error ? e.message : String(e));
    return empty;
  }
}

// Re-export so callers can use a single import path
export { fetchQuote };
