import {
  getExpiryForSymbol,
  getStockExpiry,
  getNseIndexWeeklyExpiry,
  getBseIndexWeeklyExpiry,
  getMcxExpiry,
} from "../lib/expiryUtils";
import { strikeStepFor, nearestOtmStrike, getLotSize } from "../lib/contractSpecs";

const ref = new Date("2026-04-29T05:00:00Z"); // 10:30 IST, April 29 2026 (Wed)

const cases: Array<[string, number]> = [
  ["ONGC.NS", 301.40],
  ["RELIANCE.NS", 1425.40],
  ["LT.NS", 4096.10],
  ["ITC.NS", 316.25],
  ["TATASTEEL.NS", 215.88],
  ["BAJFINANCE.NS", 7250],
  ["^NSEI", 24500],
  ["^NSEBANK", 53800],
  ["^BSESN", 80120],
  ["GOLD", 99500],
  ["SILVER", 121000],
  ["CRUDE", 5320],
  ["NATGAS", 280],
  ["COPPER", 870],
];

console.log("=== Expiry / Strike / Lot resolution sanity test ===");
console.log("Reference date:", ref.toISOString(), "(IST 10:30, Wed Apr 29 2026)");
console.log();

for (const [sym, spot] of cases) {
  const exp = getExpiryForSymbol(sym, ref);
  const step = strikeStepFor(sym, spot);
  const ce = nearestOtmStrike(spot, step, true);
  const pe = nearestOtmStrike(spot, step, false);
  const lot = getLotSize(sym);
  console.log(
    `${sym.padEnd(14)} spot=₹${String(spot).padStart(7)}  exp=${exp.display.padEnd(15)} dte=${String(exp.dte).padStart(3)}  step=₹${String(step).padStart(5)}  CE=${ce}  PE=${pe}  lot=${lot ?? "?"}`
  );
}
