/**
 * Centralised NSE / BSE / MCX option expiry calculations.
 *
 * Single source of truth for every UI panel, signal engine and notification
 * broadcaster. All timestamps interpreted in IST (Asia/Kolkata) — same-day
 * post-15:30 IST rolls to the next expiry.
 *
 * Rules implemented (as of Apr 2026, post-SEBI single-weekly directive):
 *   • NSE indices (NIFTY, FINNIFTY, NIFTYIT, MIDCAP)   → weekly Tuesday
 *   • BSE SENSEX (and BANKEX)                          → weekly Thursday
 *   • NSE BANKNIFTY                                    → monthly, last Tuesday
 *   • NSE single-stock options                         → monthly, last Tuesday
 *   • MCX bullion / energy / base metals               → fixed day-of-month
 */

import { isCommodityId, type CommodityId } from "./commodity";

const MONTHS_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"] as const;
const MONTHS_TITLE = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

/** Returns true if the wall-clock IST minute-of-day is past 15:30 (market close). */
function isPostMarketCloseIST(now: Date): boolean {
  const istMin = (now.getUTCHours() * 60 + now.getUTCMinutes()) + 330;
  return istMin > 15 * 60 + 30;
}

/* ──────────────────── Index identification ──────────────────── */

const NSE_INDEX_SHORTS = new Set<string>([
  "NIFTY", "NSEI", "FINNIFTY", "NIFTYIT", "CNXIT", "NIFTYMIDCAP", "NSMIDCP",
]);
const BSE_INDEX_SHORTS = new Set<string>([
  "SENSEX", "BSESN", "BANKEX",
]);
const MONTHLY_INDEX_SHORTS = new Set<string>([
  // BANKNIFTY moved to monthly-only after SEBI's single-weekly rule
  "BANKNIFTY", "NSEBANK",
]);

const YAHOO_TO_SHORT: Record<string, string> = {
  "^NSEI": "NIFTY",
  "^NSEBANK": "BANKNIFTY",
  "^BSESN": "SENSEX",
  "NIFTY_FIN_SERVICE.NS": "FINNIFTY",
  "^CNXIT": "NIFTYIT",
  "^NSMIDCP": "NIFTYMIDCAP",
};

export function normaliseSymbol(sym: string): string {
  if (!sym) return sym;
  if (YAHOO_TO_SHORT[sym]) return YAHOO_TO_SHORT[sym];
  return sym.replace(/^\^/, "").replace(/\.NS$/i, "").replace(/\.BO$/i, "").toUpperCase();
}

export function isIndexSymbol(sym: string): boolean {
  if (!sym) return false;
  if (sym.startsWith("^") || sym in YAHOO_TO_SHORT) return true;
  const s = normaliseSymbol(sym);
  return NSE_INDEX_SHORTS.has(s) || BSE_INDEX_SHORTS.has(s) || MONTHLY_INDEX_SHORTS.has(s);
}

/* ──────────────────── Date helpers ──────────────────── */

/** Last Tuesday on or before the last day of (year, monthIdx). */
export function lastTuesdayOfMonth(year: number, monthIdx: number): Date {
  const last = new Date(year, monthIdx + 1, 0); // 0 = last day of prev month
  const offset = (last.getDay() - 2 + 7) % 7;   // 2 = Tuesday
  last.setDate(last.getDate() - offset);
  return last;
}

/** Last Thursday of (year, monthIdx). */
export function lastThursdayOfMonth(year: number, monthIdx: number): Date {
  const last = new Date(year, monthIdx + 1, 0);
  const offset = (last.getDay() - 4 + 7) % 7;
  last.setDate(last.getDate() - offset);
  return last;
}

/** Number of full days (rounded up, ≥0.5) between `now` and `exp`. */
export function dteFrom(now: Date, exp: Date): number {
  return Math.max(0.5, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function nextWeekdayOnOrAfter(now: Date, weekday: number): Date {
  const d = new Date(now);
  let delta = (weekday - d.getDay() + 7) % 7;
  if (delta === 0 && isPostMarketCloseIST(now)) delta = 7;
  d.setDate(d.getDate() + delta);
  return d;
}

/* ──────────────────── Public expiry resolvers ──────────────────── */

export type ExpiryInfo = {
  /** "26 May 2026" — used in UI headlines */
  display: string;
  /** "26-May-2026" — used in API payloads */
  iso: string;
  /** Native Date object (local time, midnight) */
  date: Date;
  /** Days-to-expiry, ≥0.5 */
  dte: number;
};

function format(d: Date): { display: string; iso: string } {
  const day = d.getDate();
  return {
    display: `${day} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`,
    iso: `${String(day).padStart(2, "0")}-${MONTHS_TITLE[d.getMonth()]}-${d.getFullYear()}`,
  };
}

/** Next NSE single-stock / BANKNIFTY expiry — last Tuesday of month. */
export function getStockExpiry(now: Date = new Date()): ExpiryInfo {
  let exp = lastTuesdayOfMonth(now.getFullYear(), now.getMonth());
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (exp < today0) {
    exp = lastTuesdayOfMonth(now.getFullYear(), now.getMonth() + 1);
  } else if (exp.getTime() === today0.getTime() && isPostMarketCloseIST(now)) {
    exp = lastTuesdayOfMonth(now.getFullYear(), now.getMonth() + 1);
  }
  return { ...format(exp), date: exp, dte: dteFrom(now, exp) };
}

/** Next NSE-index weekly expiry — Tuesday. */
export function getNseIndexWeeklyExpiry(now: Date = new Date()): ExpiryInfo {
  const exp = nextWeekdayOnOrAfter(now, 2);
  return { ...format(exp), date: exp, dte: dteFrom(now, exp) };
}

/** Next BSE SENSEX weekly expiry — Thursday. */
export function getBseIndexWeeklyExpiry(now: Date = new Date()): ExpiryInfo {
  const exp = nextWeekdayOnOrAfter(now, 4);
  return { ...format(exp), date: exp, dte: dteFrom(now, exp) };
}

/**
 * MCX commodity contract expiry calendar (current month, rolls if past).
 * Day-of-month per MCX contract specs (2025-26):
 *   GOLD/SILVER → 5th
 *   CRUDE/BRENT → 19th (settlement T+1, last trade ~19th-20th)
 *   COPPER      → last day of month (we use last trading day = last weekday)
 *   NATGAS      → 25th (varies; using nominal expiry)
 */
export function getMcxExpiry(commodity: CommodityId, now: Date = new Date()): ExpiryInfo {
  const day = (() => {
    switch (commodity) {
      case "GOLD":
      case "SILVER":
        return 5;
      case "CRUDE":
      case "BRENT":
        return 19;
      case "NATGAS":
        return 25;
      case "COPPER":
        return 28; // approx last trading day (refine per contract)
    }
  })();

  const candidate = (year: number, monthIdx: number) => {
    const d = new Date(year, monthIdx, day);
    // If the chosen day falls on Sat/Sun, shift to previous Friday
    const dow = d.getDay();
    if (dow === 0) d.setDate(d.getDate() - 2);
    else if (dow === 6) d.setDate(d.getDate() - 1);
    return d;
  };

  let exp = candidate(now.getFullYear(), now.getMonth());
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (exp < today0 || (exp.getTime() === today0.getTime() && isPostMarketCloseIST(now))) {
    exp = candidate(now.getFullYear(), now.getMonth() + 1);
  }
  return { ...format(exp), date: exp, dte: dteFrom(now, exp) };
}

/** Resolve correct expiry for any tradeable symbol. */
export function getExpiryForSymbol(sym: string, now: Date = new Date()): ExpiryInfo {
  const s = normaliseSymbol(sym);
  if (isCommodityId(s)) return getMcxExpiry(s as CommodityId, now);
  if (BSE_INDEX_SHORTS.has(s)) return getBseIndexWeeklyExpiry(now);
  if (NSE_INDEX_SHORTS.has(s)) return getNseIndexWeeklyExpiry(now);
  // BANKNIFTY + every NSE F&O stock → monthly
  return getStockExpiry(now);
}
