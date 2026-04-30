/* eslint-disable no-console */
/**
 * Sanity tests for OMS + risk + cost model + backtester (no DB needed).
 *
 * Run: npx tsx scripts/verify_oms.ts
 */
import { computeCosts, roundTripCost, applySlippage, segmentFor } from "@/lib/risk/CostModel";
import { runBacktest } from "@/lib/strategy/Backtester";
import { STRATEGIES, getStrategy } from "@/lib/strategy/strategies";
import type { Bar } from "@/lib/strategy/Strategy";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("✗", msg);
    process.exit(1);
  } else {
    console.log("✓", msg);
  }
}

console.log("\n── Cost model ─────────────────────────────────────────");
{
  // Equity-delivery: BUY 100 RELIANCE @ ₹2500 → STT = 0.1% × 2.5L = ₹250
  const c = computeCosts({ segment: "EQ_DELIVERY", side: "BUY", qty: 100, price: 2500 });
  console.log("EQ_DELIVERY BUY 100×2500:", c);
  assert(c.brokerage === 0, "delivery brokerage = 0");
  assert(Math.abs(c.stt - 250) < 0.01, "delivery STT = ₹250 on buy leg");
  assert(c.stamp > 0 && c.stamp <= 1500, "stamp duty within cap");
}
{
  // Index option: SELL 75 NIFTY 24550 CE @ ₹120 premium
  const c = computeCosts({ segment: "OPT_INDEX", side: "SELL", qty: 75, price: 120 });
  console.log("OPT_INDEX SELL 75×120 premium:", c);
  // Brokerage = min(₹20, 0.03% × ₹9000) = min(20, 2.70) = ₹2.70
  assert(Math.abs(c.brokerage - 2.7) < 0.01, "option brokerage = lower-of-flat-or-pct on small turnover");
  assert(c.stt > 0 && c.stt < 100, "option STT only on sell, on premium");
}
{
  // Bigger ticket — brokerage hits ₹20 cap
  const c = computeCosts({ segment: "OPT_INDEX", side: "SELL", qty: 750, price: 120 });
  assert(c.brokerage === 20, "option brokerage caps at ₹20 flat for high turnover");
}
{
  // Round-trip RELIANCE intraday 100 shares ₹2500 → 2510
  const rt = roundTripCost("EQ_INTRADAY", 100, 2500, 2510);
  console.log("EQ_INTRADAY round-trip 100×2500→2510:", rt);
  assert(rt.total < (2510 - 2500) * 100, "round-trip cost < gross profit (sanity)");
}
{
  const a = applySlippage({ price: 100, side: "BUY", liquidity: "high" });
  const b = applySlippage({ price: 100, side: "SELL", liquidity: "high" });
  assert(a > 100 && b < 100, "BUY pays up, SELL gets less");
  assert(segmentFor("RELIANCE.NS") === "EQ_DELIVERY", "default = delivery");
  assert(segmentFor("NIFTY", { isOption: true }) === "OPT_INDEX", "NIFTY option = OPT_INDEX");
  assert(segmentFor("GOLD") === "COM_NONAGRI", "GOLD = COM_NONAGRI");
}

console.log("\n── Strategies ─────────────────────────────────────────");
assert(Object.keys(STRATEGIES).length >= 3, "≥ 3 reference strategies registered");
assert(getStrategy("sma_5_20") != null, "sma_5_20 registered");
assert(getStrategy("rsi_meanrev") != null, "rsi_meanrev registered");
assert(getStrategy("donchian_20") != null, "donchian_20 registered");

console.log("\n── Backtester (synthetic uptrend) ─────────────────────");
{
  // Generate 200 bars: deterministic uptrend + small oscillation
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < 200; i++) {
    const drift = 0.001;
    const wave = Math.sin(i / 6) * 0.5;
    price = price * (1 + drift) + wave;
    const o = price - 0.2;
    const c = price;
    const h = Math.max(o, c) + 0.5;
    const l = Math.min(o, c) - 0.5;
    bars.push({
      date: new Date(2025, 0, 1 + i).toISOString().slice(0, 10),
      open: o, high: h, low: l, close: c, volume: 100000 + i * 10,
    });
  }

  const sma = getStrategy("sma_5_20")!;
  const result = runBacktest({
    symbol: "TEST.NS", bars, strategy: sma,
    startingCapital: 100000, riskPerTrade: 0.01, intraday: false,
  });
  console.log(`SMA result: ROI=${result.roiPct}%  trades=${result.closedTrades}  win=${result.winRate}%  PF=${result.profitFactor}  DD=${result.maxDrawdownPct}%  Sharpe=${result.sharpe}`);
  assert(result.closedTrades > 0, "uptrend produces trades");
  assert(result.endingCapital > 0, "capital remains positive");
  assert(result.totalFees > 0, "fees subtracted from gross");
}

console.log("\nAll OMS sanity checks passed.\n");
