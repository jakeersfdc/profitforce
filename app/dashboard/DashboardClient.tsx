"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createChart, IChartApi, LineStyle } from "lightweight-charts";
import { useAuth } from "@/components/AuthProvider";
import { TradingTabBar, TradingTabContent, type TradingTab } from "@/components/TradingTabs";
import { SebiSignalNote } from "@/components/SebiCompliance";
import { usdToMcxEstimateWithAnchor, commodityUnit, roundMcxStrike, mcxPremiumPct, type RuntimeAnchorMap } from "@/lib/commodity";
import {
  getExpiryForSymbol,
  getNseIndexWeeklyExpiry,
  getBseIndexWeeklyExpiry,
} from "@/lib/expiryUtils";
import { strikeStepFor, nearestOtmStrike, getLotSize } from "@/lib/contractSpecs";
import ProfitForceBrokerPanel from "@/components/ProfitForceBrokerPanel";
import BrokerConnectPanel from "@/components/BrokerConnectPanel";

/* ─────────────────────── Types ─────────────────────── */
type IndexData = {
  id: string;
  name: string;
  sym: string;
  price: number | null;
  change: number | null;
};

type FnORec = {
  type: string;
  strike?: number | null;
  reason?: string;
};

type Signal = {
  symbol: string;
  name?: string;
  signal: string;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  trailingStop: number | null;
  strength: number;
  confidence: number;
  reason: string;
  fnoRecommendation: FnORec | null;
  currentPrice?: number | null;
  timestamp?: string | null;
};

type StrikeRec = {
  type: string;
  strike: number | null;
  entry: number;
  stop: number;
  target: number;
  reason?: string;
};

type LiveStrike = {
  strike: number;
  callLTP: number | null;
  callOI: number;
  callIV: number | null;
  putLTP: number | null;
  putOI: number;
  putIV: number | null;
  isATM: boolean;
};

type StrikesData = {
  strikes: { atm: number; tick: number; strikes: number[]; price: number; liveStrikes?: LiveStrike[]; expiry?: string; live?: boolean; iv?: number; daysToExpiry?: number };
  recommendation: StrikeRec;
};

type AlertResult = {
  symbol: string;
  name?: string;
  signal: string;
  entryPrice?: number | null;
  stopLoss?: number | null;
  targetPrice?: number | null;
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
};

type Alert = { ts: string; results: AlertResult[] };

type ChartTarget = {
  symbol: string;
  name: string;
  entry: number | null;
  sl: number | null;
  target: number | null;
  signal: string;
  currentPrice: number | null;
};

type TrackedTrade = {
  id: string;
  symbol: string;
  name: string;
  type: "CE" | "PE";
  strike: number;
  entryPremium: number;
  sl: number;
  t1: number;
  t2: number;
  t3: number;
  lots: number;
  expiry: string;
  boughtAt: string; // ISO timestamp
  status: "OPEN" | "SL_HIT" | "T1_HIT" | "T2_HIT" | "T3_HIT" | "EXITED";
  exitPremium?: number;
  exitedAt?: string;
  currentPremium?: number;
  spotPrice?: number;
};

/* ─────────────────── Helpers ─────────────────── */
const INR = (v: number | null | undefined) => {
  if (v == null) return "—";
  return "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const pct = (v: number | null | undefined) =>
  v != null ? `${Number(v).toFixed(2)}%` : "—";

const pts = (price: number | null, change: number | null) =>
  price != null && change != null ? (price * change) / 100 : null;

function timeAgo(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const SUGGESTED_LOTS = [1, 3, 5, 10, 20, 30, 40] as const;
const LOT_SIZES = [...SUGGESTED_LOTS];

const MONTHS_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/**
 * Local view-helper that wraps the shared expiry resolver and adapts
 * "short" UI ids (NIFTY/SENSEX/BANKNIFTY/RELIANCE/...) to the symbol
 * format the resolver expects.
 */
function getExpiryFor(shortId: string): { expiryStr: string; dte: number } {
  const info = getExpiryForSymbol(shortId);
  return { expiryStr: info.display, dte: info.dte };
}

/** Back-compat: weekly-only resolver (NSE Tuesday / BSE Thursday). */
function getNextExpiry(indexName: string): { expiryStr: string; dte: number } {
  const info = isBseIndex(indexName)
    ? getBseIndexWeeklyExpiry()
    : getNseIndexWeeklyExpiry();
  return { expiryStr: info.display, dte: info.dte };
}

function isBseIndex(s: string): boolean {
  return s === "SENSEX" || s === "BSESN" || s === "BANKEX";
}

function tickForSymbol(sym: string): number {
  return strikeStepFor(sym, 0) || 50;
}

function indexShortName(label: string) {
  if (label.includes("GIFT NIFTY") || label.includes("GNIFTY")) return "GIFTNIFTY";
  if (label.includes("NIFTY 50") || label.includes("NSEI")) return "NIFTY";
  if (label.includes("BANK") || label.includes("NSEBANK")) return "BANKNIFTY";
  if (label.includes("FINNIFTY") || label.includes("FIN_SERVICE")) return "FINNIFTY";
  if (label.includes("SENSEX") || label.includes("BSESN")) return "SENSEX";
  return label.replace(/[^A-Z]/g, "");
}

/* ── Black-Scholes Option Premium Estimator ── */
function normCdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + sign * y);
}

function bsCallPrice(spot: number, strike: number, t: number, r: number, iv: number): number {
  if (t <= 0 || iv <= 0) return Math.max(spot - strike, 0);
  const d1 = (Math.log(spot / strike) + (r + iv * iv / 2) * t) / (iv * Math.sqrt(t));
  const d2 = d1 - iv * Math.sqrt(t);
  return spot * normCdf(d1) - strike * Math.exp(-r * t) * normCdf(d2);
}

function bsPutPrice(spot: number, strike: number, t: number, r: number, iv: number): number {
  if (t <= 0 || iv <= 0) return Math.max(strike - spot, 0);
  const d1 = (Math.log(spot / strike) + (r + iv * iv / 2) * t) / (iv * Math.sqrt(t));
  const d2 = d1 - iv * Math.sqrt(t);
  return strike * Math.exp(-r * t) * normCdf(-d2) - spot * normCdf(-d1);
}

function estimatePremium(spot: number, strike: number, isCall: boolean, daysToExpiry = 7): number {
  const t = daysToExpiry / 365;
  const r = 0.065; // RBI rate ~6.5%
  const moneyness = Math.abs(spot - strike) / spot;
  const iv = 0.15 + moneyness * 0.4; // base 15% IV, rising for OTM
  const price = isCall ? bsCallPrice(spot, strike, t, r, iv) : bsPutPrice(spot, strike, t, r, iv);
  return Math.max(Math.round(price * 100) / 100, 0.5);
}

function estimateOptionSLTarget(premium: number, strength: number) {
  // Expert-style: SL ~40-60% of premium, targets at 2x, 3x, 4x+
  const conf = Math.max(strength, 40) / 100;
  const sl = Math.round(premium * (0.35 + (1 - conf) * 0.25)); // tighter SL for higher confidence
  const t1 = Math.round(premium * (1.8 + conf * 0.7));  // ~2-2.5x
  const t2 = Math.round(premium * (2.5 + conf * 1.0));  // ~3-3.5x
  const t3 = Math.round(premium * (3.5 + conf * 1.5));  // ~4-5x
  return { sl, t1, t2, t3 };
}

function formatTradeCall(
  spot: number,
  strike: number | null,
  isCall: boolean,
  indexName: string,
  strength: number,
  livePremium?: number | null,
  expiryOverride?: string | null,
) {
  const tk = strikeStepFor(indexName, spot) || tickForSymbol(indexName);
  const strikeVal = strike ?? Math.round(spot / tk) * tk;
  // Use live NSE premium when available, else Black-Scholes estimate
  const { expiryStr } = getExpiryFor(indexName);
  const expLabel = expiryOverride ?? expiryStr;
  const premium = livePremium && livePremium > 0 ? livePremium : estimatePremium(spot, strikeVal, isCall);
  const isLiveP = livePremium != null && livePremium > 0;
  const { sl, t1, t2, t3 } = estimateOptionSLTarget(premium, strength);
  const lo = Math.floor(premium / 5) * 5 || Math.floor(premium);
  const hi = lo + 5;
  const optType = isCall ? "CE" : "PE";
  const contractLot = getLotSize(indexName) ?? null;
  const lotLine = contractLot
    ? `LOT SIZE: ${contractLot} qty/lot · lots: ${LOT_SIZES.join("/")}`
    : `LOTS: ${LOT_SIZES.join("/")}`;
  return {
    headline: `${indexName} ${expLabel} ${optType} ${(strikeVal ?? 0).toFixed(2)} @ ${lo}-${hi}`,
    premium,
    slLine: `STOPLOSS: ${sl}`,
    tgtLine: `TARGETS: ${t1}-${t2}-${t3}`,
    lotLine,
    sl, t1, t2, t3,
    isLivePremium: isLiveP,
    strikeVal,
    optType,
    expLabel,
    lo,
    hi,
    contractLot,
  };
}

function Badge({ signal }: { signal: string }) {
  const s = String(signal).toUpperCase();
  const c =
    s === "BUY"
      ? "bg-green-500 text-black shadow-lg shadow-green-500/30"
      : s === "SELL"
      ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
      : s === "EXIT"
      ? "bg-yellow-400 text-black shadow-lg shadow-yellow-400/30"
      : "bg-gray-500 text-white";
  return (
    <span className={`inline-block px-3 py-0.5 text-xs rounded-full font-extrabold tracking-wider ${c}`}>
      {s}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const label = pct >= 50 ? "HIGH" : pct >= 20 ? "MED" : "LOW";
  const c = pct >= 50 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : pct >= 20 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-red-500/20 text-red-400 border-red-500/30";
  return <span className={`inline-block px-1.5 py-0.5 text-[9px] rounded border font-bold ${c}`}>{label} {pct}%</span>;
}

function FnoBadge({ rec }: { rec: FnORec | null }) {
  if (!rec || rec.type === "NONE" || rec.type === "HOLD") return <span className="text-[var(--bf-muted)] text-xs">—</span>;
  const isCall = rec.type.includes("CALL");
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isCall ? "bg-emerald-900 text-emerald-300" : "bg-rose-900 text-rose-300"}`}>
      {rec.type.replace("_", " ")}
      {rec.strike != null ? ` ₹${Number(rec.strike).toLocaleString()}` : ""}
    </span>
  );
}

const INDIA_IDS = ["NIFTY", "SENSEX", "BANKNIFTY", "FINNIFTY", "GIFTNIFTY"];
const GLOBAL_IDS = ["DOWJ", "SP500", "NASDAQ", "FTSE", "NIKKEI", "HANGSENG"];
const COMMODITY_IDS = ["GOLD", "SILVER", "CRUDE", "BRENT", "NATGAS", "COPPER"];

const ALL_INDICES: IndexData[] = [
  { sym: "^NSEI", name: "NIFTY 50", price: null, change: null, id: "NIFTY" },
  { sym: "^BSESN", name: "SENSEX", price: null, change: null, id: "SENSEX" },
  { sym: "^NSEBANK", name: "BANK NIFTY", price: null, change: null, id: "BANKNIFTY" },
  { sym: "NIFTY_FIN_SERVICE.NS", name: "FINNIFTY", price: null, change: null, id: "FINNIFTY" },
  { sym: "^GNIFTY", name: "GIFT NIFTY", price: null, change: null, id: "GIFTNIFTY" },
  { sym: "^DJI", name: "DOW JONES", price: null, change: null, id: "DOWJ" },
  { sym: "^GSPC", name: "S&P 500", price: null, change: null, id: "SP500" },
  { sym: "^IXIC", name: "NASDAQ", price: null, change: null, id: "NASDAQ" },
  { sym: "^FTSE", name: "FTSE 100", price: null, change: null, id: "FTSE" },
  { sym: "^N225", name: "NIKKEI 225", price: null, change: null, id: "NIKKEI" },
  { sym: "^HSI", name: "HANG SENG", price: null, change: null, id: "HANGSENG" },
  // Commodities
  { sym: "GC=F", name: "GOLD", price: null, change: null, id: "GOLD" },
  { sym: "SI=F", name: "SILVER", price: null, change: null, id: "SILVER" },
  { sym: "CL=F", name: "CRUDE OIL", price: null, change: null, id: "CRUDE" },
  { sym: "BZ=F", name: "BRENT OIL", price: null, change: null, id: "BRENT" },
  { sym: "NG=F", name: "NAT GAS", price: null, change: null, id: "NATGAS" },
  { sym: "HG=F", name: "COPPER", price: null, change: null, id: "COPPER" },
  // FX (hidden from UI, used for live USD→INR conversion)
  { sym: "INR=X", name: "USD/INR", price: null, change: null, id: "USDINR" },
];

/* ═══════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════ */

export default function DashboardClient() {
  /* ── state ── */
  const [indices, setIndices] = useState<IndexData[]>(ALL_INDICES);
  const [marketStatus, setMarketStatus] = useState("Connecting…");
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});
  const [expandedSym, setExpandedSym] = useState<string | null>(null);
  const [strikesCache, setStrikesCache] = useState<Record<string, StrikesData>>({});
  const [strikesLoading, setStrikesLoading] = useState<string | null>(null);
  const [chartTarget, setChartTarget] = useState<ChartTarget | null>(null);
  const [activeView, setActiveView] = useState<"signals" | "trading">("signals");
  const [tradingTab, setTradingTab] = useState<TradingTab>("watchlist");

  /* ── Sidebar-driven section filter (?view=india|global|stocks|indices|fno|commodities|brokers|outlook|alerts|positions) ── */
  const [view, setView] = useState<string>("overview");
  useEffect(() => {
    const read = () => {
      try {
        const v = new URL(window.location.href).searchParams.get("view")?.toLowerCase() || "overview";
        setView(v);
      } catch { setView("overview"); }
    };
    read();
    // Sidebar patches history.pushState to dispatch 'pf:locationchange' on client-side <Link> nav
    window.addEventListener("popstate", read);
    window.addEventListener("pf:locationchange", read);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener("pf:locationchange", read);
    };
  }, []);
  const SHOW: Record<string, Set<string>> = useMemo(() => ({
    overview:    new Set(["india","global","commodities","commPred","pfBroker","brokers","fno","signals","alerts","outlook","positions"]),
    india:       new Set(["india","global","fno","outlook","signals","alerts","positions"]),
    global:      new Set(["india","global","commodities","commPred","positions"]),
    stocks:      new Set(["india","global","signals","alerts","positions"]),
    indices:     new Set(["india","global","fno","outlook","positions"]),
    fno:         new Set(["india","global","fno","outlook","positions"]),
    commodities: new Set(["india","global","commodities","commPred","positions"]),
    brokers:     new Set(["india","global","pfBroker","brokers","positions"]),
    outlook:     new Set(["india","global","outlook","positions"]),
    alerts:      new Set(["india","global","alerts","positions"]),
    positions:   new Set(["india","global","positions"]),
  }), []);
  const sectionsOn = SHOW[view] ?? SHOW.overview;
  const show = useCallback((id: string) => sectionsOn.has(id), [sectionsOn]);

  /* ── Sidebar deep-links: switch view/tab based on URL hash ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyHash = () => {
      const h = window.location.hash.replace("#", "").toLowerCase();
      if (!h) return;
      if (h === "alerts" || h === "signals") setActiveView("signals");
      const tradingTabs: TradingTab[] = ["watchlist", "market", "orders", "portfolio"];
      if ((tradingTabs as string[]).includes(h)) {
        setActiveView("trading");
        setTradingTab(h as TradingTab);
      }
      // Scroll to id-anchored sections (positions, brokers, alerts)
      const el = document.getElementById(h);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  /* ── Tracked Trades (localStorage) ── */
  const [trackedTrades, setTrackedTrades] = useState<TrackedTrade[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("pf_trades") ?? "[]"); } catch { return []; }
  });
  const saveTrades = useCallback((trades: TrackedTrade[]) => {
    setTrackedTrades(trades);
    try { localStorage.setItem("pf_trades", JSON.stringify(trades)); } catch {}
  }, []);
  const addTrade = useCallback(async (trade: Omit<TrackedTrade, "id" | "boughtAt" | "status">) => {
    try {
      const res = await fetch("/api/trade/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: trade.symbol,
          qty: trade.lots ?? 1,
          side: trade.type === "CE" ? "buy" : "sell",
          type: "market",
          price: trade.entryPremium,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      // Add to local state for tracking
      const newTrade: TrackedTrade = { ...trade, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, boughtAt: new Date().toISOString(), status: "OPEN" };
      saveTrades([newTrade, ...trackedTrades]);
      setToast({ msg: `✅ Order placed: ${trade.name} ${trade.type} ${trade.strike}`, type: "success" });

      // Also surface the broker modal prefilled with the signal's bracket
      // (SL + first target). User can confirm to place on the in-app
      // ProfitForce broker with a proper OCO bracket.
      try {
        window.dispatchEvent(new CustomEvent("pf:trade", {
          detail: {
            symbol: trade.symbol,
            side: trade.type === "CE" ? "BUY" : "SELL",
            qty: trade.lots ?? 1,
            type: "market",
            sl: trade.sl,
            target: trade.t1,
          },
        }));
      } catch {}
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ msg: `❌ Order failed: ${msg}`, type: "error" });
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  }, [trackedTrades, saveTrades, setToast]);
  const exitTrade = useCallback((id: string, premium?: number) => {
    saveTrades(trackedTrades.map(t => t.id === id ? { ...t, status: "EXITED" as const, exitPremium: premium ?? t.currentPremium ?? t.entryPremium, exitedAt: new Date().toISOString() } : t));
  }, [trackedTrades, saveTrades]);
  const removeTrade = useCallback((id: string) => {
    saveTrades(trackedTrades.filter(t => t.id !== id));
  }, [trackedTrades, saveTrades]);

  /* ── Live tracking: poll spot for each open trade and advance status ── */
  const openSymbolsKey = useMemo(
    () => Array.from(new Set(trackedTrades.filter(t => t.status === "OPEN").map(t => t.symbol))).sort().join(","),
    [trackedTrades]
  );
  useEffect(() => {
    if (!openSymbolsKey) return;
    const symbols = openSymbolsKey.split(",").filter(Boolean);

    const tick = async () => {
      const spotBySym: Record<string, number> = {};
      await Promise.all(symbols.map(async (sym) => {
        try {
          const r = await fetch(`/api/strikes?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
          if (!r.ok) return;
          const j = await r.json();
          const price = Number(j?.strikes?.price ?? 0);
          if (price > 0) spotBySym[sym] = price;
        } catch { /* ignore */ }
      }));
      if (Object.keys(spotBySym).length === 0) return;

      setTrackedTrades(prev => {
        const RANK: Record<TrackedTrade["status"], number> = { OPEN: 0, T1_HIT: 1, T2_HIT: 2, T3_HIT: 3, SL_HIT: 4, EXITED: 5 };
        let changed = false;
        const next = prev.map(t => {
          if (t.status === "EXITED" || t.status === "SL_HIT") return t;
          const spot = spotBySym[t.symbol];
          if (!spot) return t;
          const isCall = t.type === "CE";
          const expDate = new Date(t.expiry);
          const dte = Math.max(1, Math.ceil((expDate.getTime() - Date.now()) / 86_400_000));
          const cur = estimatePremium(spot, t.strike, isCall, dte);
          let nextStatus: TrackedTrade["status"] = t.status;
          if (cur <= t.sl) nextStatus = "SL_HIT";
          else if (cur >= t.t3 && RANK[t.status] < RANK.T3_HIT) nextStatus = "T3_HIT";
          else if (cur >= t.t2 && RANK[t.status] < RANK.T2_HIT) nextStatus = "T2_HIT";
          else if (cur >= t.t1 && RANK[t.status] < RANK.T1_HIT) nextStatus = "T1_HIT";
          if (Math.abs((t.currentPremium ?? -1) - cur) < 0.05 && t.spotPrice === spot && nextStatus === t.status) return t;
          changed = true;
          return { ...t, currentPremium: cur, spotPrice: spot, status: nextStatus };
        });
        if (!changed) return prev;
        try { localStorage.setItem("pf_trades", JSON.stringify(next)); } catch { /* */ }
        return next;
      });
    };

    void tick();
    const interval = setInterval(tick, 3_000);
    return () => clearInterval(interval);
  }, [openSymbolsKey]);

  /* index options: auto-fetched for NIFTY, SENSEX, BANKNIFTY */
  type IndexOption = { sym: string; label: string; signal: Signal | null; strikes: StrikesData | null; loading: boolean; error: string | null };
  const [indexOptions, setIndexOptions] = useState<IndexOption[]>([
    { sym: "^NSEI", label: "NIFTY 50", signal: null, strikes: null, loading: true, error: null },
    { sym: "^BSESN", label: "SENSEX", signal: null, strikes: null, loading: true, error: null },
    { sym: "NIFTY_FIN_SERVICE.NS", label: "FINNIFTY", signal: null, strikes: null, loading: true, error: null },
    { sym: "^NSEBANK", label: "BANK NIFTY", signal: null, strikes: null, loading: true, error: null },
    { sym: "^GNIFTY", label: "GIFT NIFTY", signal: null, strikes: null, loading: true, error: null },
  ]);

  /* ── Subscription status ── */
  const { isSignedIn } = useAuth();
  const [subPlan, setSubPlan] = useState<string>("free");
  const [subLoading, setSubLoading] = useState(true);
  // Paywall temporarily disabled — full access for all users
  const isPro = true;
  const isElite = true;

  useEffect(() => {
    if (!isSignedIn) { setSubLoading(false); return; }
    fetch("/api/stripe/subscription")
      .then(r => r.json())
      .then(d => { setSubPlan(d.plan || "free"); })
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, [isSignedIn]);

  const streamRef = useRef<EventSource | null>(null);
  const prevPrices = useRef<Record<string, number>>({});

  /* ── auto-fetch index options on mount + every 30s (fallback poll, primary feed is SSE) ── */
  useEffect(() => {
    const fetchIndexStrikes = async () => {
      const syms = ["^NSEI", "^BSESN", "NIFTY_FIN_SERVICE.NS", "^NSEBANK", "^GNIFTY"];
      const labels = ["NIFTY 50", "SENSEX", "FINNIFTY", "BANK NIFTY", "GIFT NIFTY"];
      const results = await Promise.all(
        syms.map(async (sym, i) => {
          try {
            // GIFT NIFTY uses NIFTY's option chain as proxy (no NSE-IX option chain in NSE India API)
            const strikeSym = sym === "^GNIFTY" ? "^NSEI" : sym;
            const [sigRes, stRes] = await Promise.all([
              fetch(`/api/signal?symbol=${encodeURIComponent(sym)}`),
              fetch(`/api/strikes?symbol=${encodeURIComponent(strikeSym)}&pads=3`),
            ]);
            const sigJson = sigRes.ok ? await sigRes.json() : null;
            const stJson = stRes.ok ? await stRes.json() : null;
            const sig: Signal | null = sigJson?.signal
              ? {
                  symbol: sym,
                  name: labels[i],
                  signal: sigJson.signal.signal ?? "HOLD",
                  entryPrice: sigJson.signal.entryPrice ?? null,
                  stopLoss: sigJson.signal.stopLoss ?? null,
                  targetPrice: sigJson.signal.targetPrice ?? null,
                  trailingStop: sigJson.signal.trailingStop ?? null,
                  strength: sigJson.signal.strength ?? 0,
                  confidence: sigJson.signal.confidence ?? 0,
                  reason: sigJson.signal.reason ?? "",
                  fnoRecommendation: sigJson.signal.fnoRecommendation ?? null,
                  timestamp: sigJson.signal.timestamp ?? null,
                }
              : null;
            return { sym, label: labels[i], signal: sig, strikes: stJson, loading: false, error: null };
          } catch {
            return { sym, label: labels[i], signal: null, strikes: null, loading: false, error: "Failed to load" };
          }
        })
      );
      setIndexOptions(results);
    };
    fetchIndexStrikes();
    const interval = setInterval(fetchIndexStrikes, 30_000);
    return () => clearInterval(interval);
  }, []);

  /* ── audio beep ── */
  const beep = useCallback(() => {
    if (!soundOn || typeof window === "undefined") return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      o.type = "sine";
      g.gain.value = 0.12;
      o.start();
      o.stop(ctx.currentTime + 0.12);
    } catch {
      /* no audio context */
    }
  }, [soundOn]);

  /* ── SSE: indices + signals ── */
  useEffect(() => {
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (streamRef.current) try { streamRef.current.close(); } catch { /* */ }
      const es = new EventSource("/api/stream");
      streamRef.current = es;

      es.addEventListener("indices", (ev) => {
        try {
          const { indices: fresh, ts } = JSON.parse(ev.data);
          // flash
          const fl: Record<string, "up" | "down"> = {};
          for (const f of fresh ?? []) {
            const k = f.id || f.sym;
            const p = prevPrices.current[k];
            if (p != null && f.price != null && f.price !== p) fl[k] = f.price > p ? "up" : "down";
            if (f.price != null) prevPrices.current[k] = f.price;
          }
          if (Object.keys(fl).length) { setFlash(fl); setTimeout(() => setFlash({}), 600); }

          setIndices((prev) =>
            prev.map((idx) => {
              const m = (fresh ?? []).find(
                (f: IndexData) => f.sym === idx.sym || f.name === idx.name || f.id === idx.id
              );
              return m
                ? { ...idx, price: m.price != null ? Number(m.price) : idx.price, change: m.change != null ? Number(m.change) : idx.change }
                : idx;
            })
          );

          // market hours
          const now = new Date(ts);
          const istMin = (now.getUTCHours() * 60 + now.getUTCMinutes()) + 330;
          const h = Math.floor(istMin / 60) % 24;
          const m = istMin % 60;
          const wd = now.getUTCDay();
          const open = wd >= 1 && wd <= 5 && ((h === 9 && m >= 15) || (h > 9 && h < 15) || (h === 15 && m <= 30));
          const live = (fresh ?? []).some((u: IndexData) => u.price != null && u.price !== 0);
          setIsMarketOpen(live && open);
          setMarketStatus(live ? (open ? "🟢 Market LIVE" : "🔴 Market Closed") : "🔴 Offline");
          setLastRefresh(now.toLocaleTimeString());
        } catch { /* */ }
      });

      es.addEventListener("signals", (ev) => {
        try {
          const { results } = JSON.parse(ev.data);
          setSignals(results ?? []);
          setSignalsLoading(false);
        } catch { /* */ }
      });

      es.addEventListener("indexOptions", (ev) => {
        try {
          const { items } = JSON.parse(ev.data);
          if (!Array.isArray(items)) return;
          setIndexOptions((prev) =>
            prev.map((row) => {
              const m = items.find((x: any) => x.sym === row.sym);
              if (!m) return row;
              return {
                ...row,
                signal: m.signal
                  ? {
                      symbol: m.sym,
                      name: m.label,
                      signal: m.signal.signal ?? "HOLD",
                      entryPrice: m.signal.entryPrice ?? null,
                      stopLoss: m.signal.stopLoss ?? null,
                      targetPrice: m.signal.targetPrice ?? null,
                      trailingStop: m.signal.trailingStop ?? null,
                      strength: m.signal.strength ?? 0,
                      confidence: m.signal.confidence ?? 0,
                      reason: m.signal.reason ?? "",
                      fnoRecommendation: m.signal.fnoRecommendation ?? null,
                      timestamp: m.signal.timestamp ?? null,
                    }
                  : row.signal,
                strikes: m.strikes ?? row.strikes,
                loading: false,
                error: m.error ?? null,
              };
            })
          );
        } catch { /* */ }
      });

      es.addEventListener("connected", () => { delay = 1000; });
      es.onerror = () => {
        es.close();
        streamRef.current = null;
        timer = setTimeout(() => { delay = Math.min(delay * 1.5, 10_000); connect(); }, delay);
      };
    };

    connect();
    return () => {
      if (streamRef.current) try { streamRef.current.close(); } catch { /* */ }
      if (timer) clearTimeout(timer);
    };
  }, []);

  /* ── SSE: alerts ── */
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      try {
        es = new EventSource("/api/alerts");
        es.onmessage = async (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (!data?.results) return;
            // enrich missing entry/stop/target
            const enhanced: AlertResult[] = await Promise.all(
              data.results.map(async (r: AlertResult) => {
                if (r.entryPrice == null && r.entry == null && r.symbol) {
                  try {
                    const resp = await fetch(`/api/signal?symbol=${encodeURIComponent(r.symbol)}`);
                    if (resp.ok) {
                      const j = await resp.json();
                      return { ...r, entryPrice: j.entryPrice ?? j.entry, stopLoss: j.stopLoss ?? j.stop, targetPrice: j.targetPrice ?? j.target, signal: r.signal ?? j.signal, name: r.name ?? j.name };
                    }
                  } catch { /* */ }
                }
                return r;
              })
            );
            setAlerts((prev) => [{ ...data, results: enhanced }, ...prev].slice(0, 60));
            beep();
            const f = enhanced[0];
            if (f) showToast(`${f.signal} ${f.symbol} Entry ${INR(f.entryPrice ?? f.entry)} SL ${INR(f.stopLoss ?? f.stop)} Tgt ${INR(f.targetPrice ?? f.target)}`, f.signal === "BUY" ? "success" : "error");
          } catch { /* */ }
        };
        es.onerror = () => {
          if (es && es.readyState === EventSource.CLOSED) timer = setTimeout(connect, 3000);
        };
      } catch { timer = setTimeout(connect, 3000); }
    };
    connect();
    return () => { if (timer) clearTimeout(timer); try { es?.close(); } catch { /* */ } };
  }, [beep]);

  const showToast = (msg: string, type: string) => setToast({ msg, type });
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  /* ── expand row → fetch strikes ── */
  const toggleRow = useCallback(
    async (sym: string) => {
      if (expandedSym === sym) { setExpandedSym(null); return; }
      setExpandedSym(sym);
      if (!strikesCache[sym]) {
        setStrikesLoading(sym);
        try {
          const r = await fetch(`/api/strikes?symbol=${encodeURIComponent(sym)}`);
          if (r.ok) { const d = await r.json(); setStrikesCache((p) => ({ ...p, [sym]: d })); }
        } catch { /* */ } finally { setStrikesLoading(null); }
      }
    },
    [expandedSym, strikesCache]
  );

  /* ── force refresh ── */
  const forceRefresh = () => {
    if (streamRef.current) try { streamRef.current.close(); } catch { /* */ }
    streamRef.current = null;
    const es = new EventSource("/api/stream");
    streamRef.current = es;
    es.addEventListener("indices", (ev: MessageEvent) => {
      try {
        const { indices: fresh, ts } = JSON.parse(ev.data);
        setIndices((prev) => prev.map((idx) => {
          const m = (fresh ?? []).find((f: IndexData) => f.sym === idx.sym || f.id === idx.id);
          return m ? { ...idx, price: m.price != null ? Number(m.price) : idx.price, change: m.change != null ? Number(m.change) : idx.change } : idx;
        }));
        setLastRefresh(new Date(ts).toLocaleTimeString());
      } catch { /* */ }
    });
    es.addEventListener("signals", (ev: MessageEvent) => { try { setSignals(JSON.parse(ev.data).results ?? []); setSignalsLoading(false); } catch { /* */ } });
    es.onerror = () => { es.close(); };
  };

  /* ── derived data ── */
  const processed: Signal[] = signals
    .map((s) => ({
      symbol: s.symbol,
      name: s.name,
      signal: s.signal,
      currentPrice: s.entryPrice ?? s.currentPrice ?? null,
      entryPrice: s.entryPrice ?? null,
      stopLoss: s.stopLoss ?? null,
      targetPrice: s.targetPrice ?? null,
      trailingStop: s.trailingStop ?? null,
      strength: s.strength ?? 0,
      confidence: s.confidence ?? 0,
      reason: s.reason ?? "",
      fnoRecommendation: s.fnoRecommendation ?? null,
      timestamp: s.timestamp ?? null,
    }))
    .sort((a, b) => {
      const ord: Record<string, number> = { BUY: 0, SELL: 1, EXIT: 2 };
      const ao = ord[String(a.signal).toUpperCase()] ?? 3;
      const bo = ord[String(b.signal).toUpperCase()] ?? 3;
      return ao !== bo ? ao - bo : b.strength - a.strength;
    });

  const actionable = processed.filter((s) => ["BUY", "SELL", "EXIT"].includes(String(s.signal).toUpperCase()));
  const indiaIdx = indices.filter((i) => INDIA_IDS.includes(i.id));
  const globalIdx = indices.filter((i) => GLOBAL_IDS.includes(i.id));
  const commodityIdx = indices.filter((i) => COMMODITY_IDS.includes(i.id));
  const usdInr = indices.find((i) => i.id === "USDINR")?.price ?? 83;

  // Runtime MCX anchor prices (broker-grade LTPs posted by ops).
  // /api/mcx-anchors is read-only public; POST is gated by ADMIN_API_KEY.
  const [mcxAnchors, setMcxAnchors] = useState<Record<string, { inr: number; usd: number }> | null>(null);
  const [anchorsUpdatedAt, setAnchorsUpdatedAt] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/mcx-anchors");
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        setMcxAnchors(j?.anchors ?? null);
        setAnchorsUpdatedAt(j?.updatedAt ?? null);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 1_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="px-2 sm:px-3 py-2 space-y-3 sm:space-y-4 text-sm text-white">

      {/* ━━━ TOP HEADER ━━━ */}
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-white">⚡ ProfitForce</h1>
          <span className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold ${isMarketOpen ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/40" : "bg-red-500/20 text-red-400 ring-1 ring-red-500/40"}`}>
            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${isMarketOpen ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            {marketStatus}
          </span>
          {!subLoading && false && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isElite ? "bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40" :
              isPro ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40" :
              "bg-gray-500/20 text-gray-400 ring-1 ring-gray-500/40"
            }`}>
              {isElite ? "👑 ELITE" : isPro ? "⭐ PRO" : "FREE"}
            </span>
          )}
          {lastRefresh && <span className="text-[10px] text-white/40">Updated {lastRefresh}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSoundOn(!soundOn)} className="p-1.5 rounded hover:bg-white/10 text-white/50 text-xs" title="Toggle sound">
            {soundOn ? "🔔" : "🔕"}
          </button>
          <button onClick={forceRefresh} className="p-1.5 rounded hover:bg-white/10 text-white/50 text-xs" title="Refresh">↻</button>
        </div>
      </header>

      {/* ━━━ UPGRADE BANNER (free users) ━━━ */}
      {!subLoading && !isPro && isSignedIn && (
        <div className="relative overflow-hidden rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-950/40 via-purple-950/30 to-blue-950/40 p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">🚀 Upgrade to Pro for full access</h3>
              <p className="text-xs text-gray-400 mt-0.5">Get real-time trade calls, option chain analysis, trade tracking & more — ₹999/mo</p>
            </div>
            <a href="/pricing" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors whitespace-nowrap">
              View Plans →
            </a>
          </div>
        </div>
      )}

      {/* ━━━ MAIN VIEW TOGGLE: Signals / Trading ━━━ */}
      <div className="flex rounded-xl overflow-hidden border border-gray-700/50 bg-[#0a1628]">
        <button
          onClick={() => setActiveView("signals")}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${activeView === "signals" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-300"}`}
        >📡 Signals</button>
        <button
          onClick={() => setActiveView("trading")}
          className={`flex-1 py-2.5 text-sm font-bold transition-colors ${activeView === "trading" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-300"}`}
        >💹 Trading</button>
      </div>

      {/* ━━━ TRADING VIEW ━━━ */}
      {activeView === "trading" ? (
        <div className="bg-[#0a1628] rounded-2xl border border-gray-700/50 overflow-hidden">
          <TradingTabBar activeTab={tradingTab} onTabChange={setTradingTab} />
          <TradingTabContent
            activeTab={tradingTab}
            onTabChange={setTradingTab}
            onChartClick={(sym, name) => setChartTarget({ symbol: sym, name, entry: null, sl: null, target: null, signal: "HOLD", currentPrice: null })}
          />
        </div>
      ) : (
      <>

      {/* ━━━ VIEW BANNER (when sidebar filter active) ━━━ */}
      {view !== "overview" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500/15 via-cyan-500/10 to-emerald-500/10 border border-white/10">
          <span className="text-base">📍</span>
          <span className="text-sm font-bold text-white capitalize">{({india:"India Market",global:"Global Market",stocks:"Stocks — Predictions",indices:"Indices",fno:"F & O",commodities:"Commodities",brokers:"Brokers",outlook:"Tomorrow's Outlook",alerts:"Live Alerts",positions:"My Positions"} as Record<string,string>)[view] ?? view}</span>
          <a href="/dashboard" className="ml-auto text-[11px] text-white/60 hover:text-white underline">Show all sections →</a>
        </div>
      )}
      {/* build marker (helps detect stale browser cache) */}
      <div data-build="sidebar-v2" className="hidden" aria-hidden />

      {/* ━━━ INDIA INDICES ━━━ */}
      {show("india") && (
      <section>
        <h2 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2">India Markets</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {indiaIdx.map((idx) => {
            const idxSig = signals.find(s => s.symbol === idx.sym);
            return <IndexCard key={idx.id} idx={idx} fl={flash[idx.id]} onChartClick={() => setChartTarget({ symbol: idx.sym, name: idx.name, entry: idxSig?.entryPrice ?? null, sl: idxSig?.stopLoss ?? null, target: idxSig?.targetPrice ?? null, signal: String(idxSig?.signal ?? "HOLD"), currentPrice: idx.price })} />;
          })}
        </div>
      </section>
      )}

      {/* ━━━ GLOBAL INDICES ━━━ */}
      {show("global") && (
      <section>
        <h2 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2">Global Markets</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {globalIdx.map((idx) => <IndexCardSmall key={idx.id} idx={idx} fl={flash[idx.id]} onChartClick={() => setChartTarget({ symbol: idx.sym, name: idx.name, entry: null, sl: null, target: null, signal: "HOLD", currentPrice: idx.price })} />)}
        </div>
      </section>
      )}

      {/* ━━━ COMMODITIES (Int'l reference, or MCX if anchors configured) ━━━ */}
      {show("commodities") && (
      <section>
        <h2 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-1">
          Commodities
        </h2>
        {(() => {
          const anchoredCount = commodityIdx.filter(c => mcxAnchors?.[c.id]?.inr && mcxAnchors?.[c.id]?.usd).length;
          const allAnchored = anchoredCount > 0 && anchoredCount === commodityIdx.length;
          const partial = anchoredCount > 0 && !allAnchored;
          if (allAnchored) {
            return (
              <div className="text-[10px] text-emerald-300/80 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-1.5 mb-2 leading-snug">
                ✅ <strong>MCX anchor-tracked prices</strong> — set {anchorsUpdatedAt ? new Date(anchorsUpdatedAt).toLocaleString("en-IN") : "recently"}. Intraday ₹ moves follow live international % change from the anchor. Still, always verify LTP on your broker.
              </div>
            );
          }
          return (
            <div className="text-[10px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1.5 mb-2 leading-snug">
              ⚠️ <strong>International reference prices</strong> (COMEX/NYMEX/ICE USD × live ₹{usdInr.toFixed(2)}/USD + Indian duty premium){partial ? ` — ${anchoredCount}/${commodityIdx.length} also MCX-anchored` : ""}. Actual MCX LTP differs ±1-5% due to contract basis &amp; delivery premium. <strong>Always verify on your broker</strong> before trading.
            </div>
          );
        })()}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {commodityIdx.map((idx) => {
            const usd = idx.price ?? 0;
            const est = usdToMcxEstimateWithAnchor(idx.id, usd, usdInr, mcxAnchors as RuntimeAnchorMap | null);
            const unit = commodityUnit(idx.id);
            const display: IndexData = { ...idx, price: est.inr };
            const badge = est.source === "mcx-anchor" ? "MCX" : "Est.";
            return (
              <IndexCardSmall
                key={idx.id}
                idx={display}
                fl={flash[idx.id]}
                currencyPrefix="₹"
                unitLabel={unit}
                subLabel={usd > 0 ? `${badge} · $${usd.toFixed(2)}` : badge}
                onChartClick={() =>
                  setChartTarget({
                    symbol: idx.sym,
                    name: idx.name,
                    entry: null,
                    sl: null,
                    target: null,
                    signal: "HOLD",
                    currentPrice: idx.price,
                  })
                }
              />
            );
          })}
        </div>
      </section>
      )}

      {/* ━━━ COMMODITY PREDICTIONS ━━━ */}
      {show("commPred") && (
        <CommodityPredictions commodities={commodityIdx} usdInr={usdInr} mcxAnchors={mcxAnchors as RuntimeAnchorMap | null} onBuyTrade={addTrade} />
      )}

      {/* ━━━ PROFITFORCE BROKER (in-house virtual broker) ━━━ */}
      {show("pfBroker") && <ProfitForceBrokerPanel />}

      {/* ━━━ CONNECT REAL BROKERS (Zerodha / Upstox / Angel One / Dhan) ━━━ */}
      {show("brokers") && (
      <section id="brokers">
        <h2 className="text-sm font-extrabold text-white uppercase tracking-wider mb-3">🔗 Connect Your Broker</h2>
        <BrokerConnectPanel />
      </section>
      )}

      {/* ━━━ INDEX OPTIONS: NIFTY / SENSEX / BANKNIFTY ━━━ */}
      {show("fno") && (
      <section className="relative">
        <h2 className="text-sm font-extrabold text-white uppercase tracking-wider mb-3">📈 Index Options — Strike Prices & Trade Calls</h2>
        {!isPro && !subLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#040915]/80 backdrop-blur-sm rounded-xl">
            <div className="text-center p-6">
              <div className="text-3xl mb-2">🔒</div>
              <h3 className="text-white font-bold text-lg">Pro Feature</h3>
              <p className="text-gray-400 text-sm mt-1 mb-4">Option chain analysis & live trade calls require a Pro subscription</p>
              <a href="/pricing" className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors">
                Upgrade to Pro — ₹999/mo
              </a>
            </div>
          </div>
        )}
        <div className={`space-y-3 ${!isPro && !subLoading ? "max-h-[200px] overflow-hidden" : ""}`}>
          {indexOptions.map((opt) => (
            <IndexOptionCard key={opt.sym} opt={opt} onChartClick={(ct) => setChartTarget(ct)} onBuyTrade={addTrade} />
          ))}
        </div>
      </section>
      )}

      {/* ━━━ MAIN CONTENT ━━━ */}
      {(show("signals") || show("alerts")) && (
      <div className={`grid grid-cols-1 ${show("signals") && show("alerts") ? "lg:grid-cols-3" : ""} gap-4`}>

        {/* ── SIGNALS TABLE (2/3) ── */}
        {show("signals") && (
        <section className={`${show("alerts") ? "lg:col-span-2" : ""} space-y-2`}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2 text-white">
              📊 Options Signals
              {actionable.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                  {actionable.length} actionable
                </span>
              )}
            </h2>
            <span className="text-[10px] text-[var(--bf-muted)]">{isMarketOpen ? "Live every 10s" : "Last close"}</span>
          </div>

          <div className="rounded-lg border border-white/8 overflow-hidden relative">
            {signalsLoading && (
              <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-t-transparent border-emerald-400 rounded-full animate-spin" />
              </div>
            )}

            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[var(--bf-muted)]">
                    <th className="px-2 py-2 text-left font-medium">Symbol</th>
                    <th className="px-2 py-2 text-center font-medium">Signal</th>
                    <th className="px-2 py-2 text-right font-medium text-emerald-500">Entry ₹</th>
                    <th className="px-2 py-2 text-right font-medium text-rose-500">Stop Loss ₹</th>
                    <th className="px-2 py-2 text-right font-medium text-sky-500">Target ₹</th>
                    <th className="px-2 py-2 text-center font-medium">F&O</th>
                    <th className="px-2 py-2 text-center font-medium">R:R</th>
                    <th className="px-2 py-2 text-center font-medium">Conf</th>
                    <th className="px-2 py-2 text-center font-medium">Str</th>
                    <th className="px-2 py-2 text-center font-medium">📊</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {processed.map((row, i) => {
                    const sig = String(row.signal).toUpperCase();
                    const act = ["BUY", "SELL", "EXIT"].includes(sig);
                    const exp = expandedSym === row.symbol;
                    const e = Number(row.entryPrice ?? 0);
                    const sl = Number(row.stopLoss ?? 0);
                    const tgt = Number(row.targetPrice ?? 0);
                    const rr = e && sl && tgt ? `1:${(Math.abs(tgt - e) / Math.abs(e - sl)).toFixed(1)}` : "—";

                    return (
                      <React.Fragment key={`${row.symbol}-${i}`}>
                        <tr
                          onClick={() => toggleRow(row.symbol)}
                          className={`cursor-pointer transition-colors hover:bg-white/3 ${act ? "" : "opacity-50"} ${exp ? "bg-white/5" : ""}`}
                        >
                          <td className="px-2 py-2">
                            <span className={`inline-block text-[10px] mr-1 transition-transform ${exp ? "rotate-90" : ""}`}>▶</span>
                            <span className="font-semibold">{row.symbol}</span>
                            {row.name && <div className="text-[9px] text-[var(--bf-muted)] ml-3">{row.name}</div>}
                          </td>
                          <td className="px-2 py-2 text-center"><Badge signal={row.signal} /></td>
                          <td className="px-2 py-2 text-right font-mono font-bold text-emerald-400">{INR(row.entryPrice)}</td>
                          <td className="px-2 py-2 text-right font-mono font-bold text-rose-400">{INR(row.stopLoss)}</td>
                          <td className="px-2 py-2 text-right font-mono font-bold text-sky-400">{INR(row.targetPrice)}</td>
                          <td className="px-2 py-2 text-center"><FnoBadge rec={row.fnoRecommendation} /></td>
                          <td className="px-2 py-2 text-center font-bold text-amber-400">{rr}</td>
                          <td className="px-2 py-2 text-center"><ConfidenceBadge confidence={row.confidence} /></td>
                          <td className="px-2 py-2 text-center">
                            <div className="inline-flex items-center gap-1">
                              <div className="w-12 bg-white/5 rounded-full h-1 overflow-hidden">
                                <div style={{ width: `${row.strength}%` }} className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" />
                              </div>
                              <span className="text-[9px] text-[var(--bf-muted)]">{row.strength}%</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button onClick={(ev) => { ev.stopPropagation(); setChartTarget({ symbol: row.symbol, name: row.name ?? row.symbol, entry: row.entryPrice, sl: row.stopLoss, target: row.targetPrice, signal: row.signal, currentPrice: row.currentPrice ?? row.entryPrice }); }} className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors" title="View chart">📊</button>
                          </td>
                        </tr>

                        {/* ── EXPANDED: Strike prices ── */}
                        {exp && (
                          <tr>
                            <td colSpan={10} className="p-0">
                              <div className="bg-[#060e1a] border-t border-b border-white/8 p-3">
                                {strikesLoading === row.symbol ? (
                                  <div className="flex items-center justify-center py-4 gap-2 text-[var(--bf-muted)]">
                                    <div className="w-4 h-4 border-2 border-t-transparent border-emerald-400 rounded-full animate-spin" />
                                    Loading strikes…
                                  </div>
                                ) : (
                                  (() => {
                                    const data = strikesCache[row.symbol];
                                    // If API returned something, but no strikes, try fallback
                                    if (data && data.strikes && Array.isArray(data.strikes.strikes) && data.strikes.strikes.length > 0) {
                                      return <StrikePanel data={data} signal={row} />;
                                    }
                                    // Try to generate synthetic strikes on the client as a last resort
                                    const price = Number(row.currentPrice ?? row.entryPrice ?? 0);
                                    if (price > 0) {
                                      const tick = 50;
                                      const atm = Math.round(price / tick) * tick;
                                      const pads = 2;
                                      const strikes = [];
                                      for (let i = -pads; i <= pads; i++) strikes.push(atm + i * tick);
                                      const fallbackData = {
                                        strikes: { atm, tick, strikes, price },
                                        recommendation: { type: 'HOLD', strike: atm, entry: price, stop: 0, target: 0 }
                                      };
                                      return <StrikePanel data={fallbackData} signal={row} />;
                                    }
                                    return <div className="text-center py-3 text-[var(--bf-muted)]">No strikes available for this symbol.</div>;
                                  })()
                                )}
                                {row.reason && (
                                  <p className="mt-2 text-[10px] text-[var(--bf-muted)] border-t border-white/5 pt-1">
                                    <b>Why:</b> {row.reason}
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {!signalsLoading && processed.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-6 text-[var(--bf-muted)]">Waiting for signals…</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-white/5">
              {processed.map((row, i) => {
                const sig = String(row.signal).toUpperCase();
                const act = ["BUY", "SELL", "EXIT"].includes(sig);
                const e = Number(row.entryPrice ?? 0);
                const sl = Number(row.stopLoss ?? 0);
                const tgt = Number(row.targetPrice ?? 0);
                const rr = e && sl && tgt ? `1:${(Math.abs(tgt - e) / Math.abs(e - sl)).toFixed(1)}` : "—";
                return (
                  <div key={`m-${row.symbol}-${i}`} className={`p-3 ${act ? "" : "opacity-50"}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <div className="font-bold">{row.symbol}</div>
                        {row.name && <div className="text-[9px] text-[var(--bf-muted)]">{row.name}</div>}
                      </div>
                      <Badge signal={row.signal} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><div className="text-[9px] text-[var(--bf-muted)]">Entry</div><div className="font-mono font-bold text-green-400">{INR(row.entryPrice)}</div></div>
                      <div><div className="text-[9px] text-[var(--bf-muted)]">Stop Loss</div><div className="font-mono font-bold text-red-400">{INR(row.stopLoss)}</div></div>
                      <div><div className="text-[9px] text-[var(--bf-muted)]">Target</div><div className="font-mono font-bold text-cyan-400">{INR(row.targetPrice)}</div></div>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[9px] text-[var(--bf-muted)]">
                      <FnoBadge rec={row.fnoRecommendation} />
                      <ConfidenceBadge confidence={row.confidence} />
                      <span>R:R {rr}</span>
                      <span>{row.strength}%</span>
                      <button onClick={() => setChartTarget({ symbol: row.symbol, name: row.name ?? row.symbol, entry: row.entryPrice, sl: row.stopLoss, target: row.targetPrice, signal: row.signal, currentPrice: row.currentPrice ?? row.entryPrice })} className="p-1 rounded bg-white/10 text-white/70">📊</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        )}

        {/* ── LIVE ALERTS PANEL (1/3) ── */}
        {show("alerts") && (
        <section id="alerts" className="space-y-2">
          <h2 className="text-sm sm:text-base font-extrabold flex items-center gap-2 text-white">
            🔔 Live Alerts
            <span className="text-[10px] sm:text-xs text-white/50 font-normal">{alerts.length}</span>
          </h2>

          <div className="rounded-lg border border-white/8 overflow-hidden">
            <div className="max-h-[calc(100vh-340px)] min-h-[200px] sm:min-h-[300px] overflow-y-auto divide-y divide-white/5">
              {alerts.length === 0 && (
                <div className="p-4 sm:p-8 text-center text-[var(--bf-muted)]">
                  <div className="text-xl sm:text-2xl mb-1 opacity-30">🔔</div>
                  Waiting for trading alerts…<br />
                  <span className="text-[10px]">Alerts fire every 30s when actionable signals appear</span>
                </div>
              )}
              {alerts.map((a, i) => (
                <div key={i} className="p-2 sm:p-3 hover:bg-white/5 transition-colors">
                  <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                    <span className="text-[10px] sm:text-xs text-white/50 font-medium">{new Date(a.ts).toLocaleTimeString()}</span>
                    <span className="text-[10px] sm:text-xs text-white/40">{timeAgo(a.ts)}</span>
                  </div>
                  {a.results?.map((r, j) => {
                    const aSpot = Number(r.entryPrice ?? r.entry ?? 0);
                    const dir = String(r.signal).toUpperCase();
                    const isBuyAlert = dir === "BUY";
                    const isSellAlert = dir === "SELL";
                    const sym = r.symbol ?? "";
                    const shortIdx = indexShortName(r.name ?? sym);
                    const isCall = isBuyAlert;
                    const aTick = strikeStepFor(shortIdx, aSpot);
                    const strikeVal = aSpot > 0 ? nearestOtmStrike(aSpot, aTick, isCall) : 0;
                    const premium = aSpot > 0 ? estimatePremium(aSpot, strikeVal, isCall) : 0;
                    const opts = estimateOptionSLTarget(premium, 60);
                    const lo = Math.floor(premium / 5) * 5 || Math.floor(premium);
                    const hi = lo + 5;
                    const { expiryStr: alertExpiry } = getExpiryFor(shortIdx);
                    const optLabel = isCall ? "CE" : "PE";
                    return (
                      <div key={j} className={`mb-2 last:mb-0 rounded-xl p-2 sm:p-3 border-2 font-mono text-xs sm:text-sm leading-relaxed ${
                        isBuyAlert ? "border-green-500/70 bg-green-950/50" : isSellAlert ? "border-red-500/70 bg-red-950/50" : "border-yellow-500/50 bg-yellow-950/30"
                      }`}>
                        <div className="flex items-center gap-2 mb-1 sm:mb-1.5">
                          <Badge signal={r.signal} />
                        </div>
                        {aSpot > 0 && (isBuyAlert || isSellAlert) ? (
                          <>
                            <div className={`font-extrabold text-xs sm:text-base ${isBuyAlert ? "text-green-300" : "text-red-300"}`}>
                              {isBuyAlert ? "📈" : "📉"} {shortIdx} {alertExpiry} {optLabel} {(strikeVal ?? 0).toFixed(2)} @ {lo}-{hi}
                            </div>
                            <div className="text-red-400 font-extrabold mt-1">🛑 STOPLOSS: {opts.sl}</div>
                            <div className="text-cyan-300 font-extrabold">🎯 TARGETS: {opts.t1}-{opts.t2}-{opts.t3}</div>
                            {(() => {
                              const lot = getLotSize(sym) ?? getLotSize(shortIdx);
                              return (
                                <div className="text-yellow-300 font-extrabold">
                                  📦 LOT SIZE: {lot ? `${lot} qty/lot` : "—"} <span className="text-yellow-200/70 text-[10px] font-bold">· lots: {LOT_SIZES.join("/")}</span>
                                </div>
                              );
                            })()}
                            <button onClick={() => addTrade({ symbol: sym, name: shortIdx, type: optLabel as "CE" | "PE", strike: strikeVal, entryPremium: premium, sl: opts.sl, t1: opts.t1, t2: opts.t2, t3: opts.t3, lots: 1, expiry: alertExpiry })} className="mt-2 w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors">📥 Buy &amp; Track</button>
                          </>
                        ) : (
                          <div className="text-yellow-300 font-bold">{dir} {sym} @ {INR(aSpot)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
        )}
      </div>
      )}

      {/* ━━━ TOMORROW'S OUTLOOK — based on signals + global markets ━━━ */}
      {show("outlook") && (
        <TomorrowOutlook indices={indices} indexOptions={indexOptions} signals={signals} onBuyTrade={addTrade} />
      )}

      {/* ━━━ MY POSITIONS ━━━ */}
      {show("positions") && (
      <div id="positions">
        {trackedTrades.length > 0 ? (
          <MyPositions trades={trackedTrades} onExit={exitTrade} onRemove={removeTrade} onChartClick={(t) => setChartTarget({ symbol: t.symbol, name: t.name, entry: t.strike, sl: null, target: null, signal: t.type === "CE" ? "BUY" : "SELL", currentPrice: t.spotPrice ?? null })} />
        ) : view === "positions" ? (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="text-3xl mb-2 opacity-60">💼</div>
            <h3 className="text-white font-bold text-base">No positions yet</h3>
            <p className="text-white/60 text-xs mt-1 mb-4">Buy &amp; track trade calls from Signals, Alerts, F&amp;O strikes, or Tomorrow&apos;s Outlook to see them here.</p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <a href="/dashboard?view=fno" className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">📈 Browse F&amp;O Strikes</a>
              <a href="/dashboard?view=stocks" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-bold">📊 Live Signals</a>
              <a href="/dashboard?view=outlook" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-bold">⚡ Tomorrow&apos;s Outlook</a>
            </div>
          </section>
        ) : null}
      </div>
      )}

      {/* ━━━ SUBSCRIPTION MANAGEMENT ━━━ */}
      {false && isSignedIn && !subLoading && (
        <SubscriptionCard plan={subPlan} isPro={isPro} isElite={isElite} />
      )}

      </>
      )}

      {/* ━━━ CHART MODAL ━━━ */}
      {chartTarget && <ChartModal target={chartTarget} onClose={() => setChartTarget(null)} />}

      {/* ━━━ TOAST ━━━ */}
      {toast && (
        <div className="fixed right-3 top-3 z-50 max-w-sm">
          <div className={`px-5 py-3 rounded-xl shadow-2xl text-sm font-bold border-2
            ${toast.type === "success" ? "bg-green-900 border-green-400 text-green-200 shadow-green-500/30" : toast.type === "error" ? "bg-red-900 border-red-400 text-red-200 shadow-red-500/30" : "bg-cyan-900 border-cyan-400 text-cyan-200 shadow-cyan-500/30"}`}>
            {toast.msg}
          </div>
        </div>
      )}

      {/* ━━━ MOBILE BOTTOM NAV (Groww-style) ━━━ */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a1628]/95 backdrop-blur-md border-t border-gray-700/50 sm:hidden">
        <div className="flex justify-around py-1.5">
          {[
            { id: "signals" as const, icon: "📡", label: "Signals" },
            { id: "watchlist" as const, icon: "⭐", label: "Watchlist" },
            { id: "market" as const, icon: "🏪", label: "Market" },
            { id: "orders" as const, icon: "📋", label: "Orders" },
            { id: "portfolio" as const, icon: "💼", label: "Portfolio" },
          ].map((item) => {
            const isActive = item.id === "signals"
              ? activeView === "signals"
              : activeView === "trading" && tradingTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === "signals") { setActiveView("signals"); }
                  else { setActiveView("trading"); setTradingTab(item.id as TradingTab); }
                }}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${isActive ? "text-blue-400" : "text-gray-500"}`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-[9px] font-bold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      {/* Bottom nav spacer for mobile */}
      <div className="h-16 sm:hidden" />
    </div>
  );
}

/* ─────────────────── Subscription Card ─────────────────── */

function SubscriptionCard({ plan, isPro, isElite }: { plan: string; isPro: boolean; isElite: boolean }) {
  void isElite;
  const [portalLoading, setPortalLoading] = useState(false);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_url: window.location.href }),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      }
    } catch {}
    setPortalLoading(false);
  }

  const planConfig = {
    free: { icon: "🆓", label: "Free Plan", color: "text-gray-400", bg: "bg-gray-500/10 border-gray-700/50" },
    pro: { icon: "⭐", label: "Pro Plan", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
    elite: { icon: "👑", label: "Elite Plan", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  }[plan] ?? { icon: "📋", label: plan, color: "text-gray-400", bg: "bg-gray-500/10 border-gray-700/50" };

  return (
    <section className={`rounded-xl border p-4 ${planConfig.bg}`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{planConfig.icon}</span>
          <div>
            <h3 className={`text-sm font-bold ${planConfig.color}`}>{planConfig.label}</h3>
            <p className="text-xs text-gray-500">
              {isPro ? "Full access to all trading signals & tools" : "Basic signals — upgrade for full access"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isPro ? (
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold transition-colors border border-gray-700/50"
            >
              {portalLoading ? "Loading..." : "Manage Subscription"}
            </button>
          ) : (
            <a href="/pricing" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors">
              Upgrade →
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── Chart Modal (full-screen with Entry/SL/Target) ─────────────────── */

type StrategyVerdict = {
  id: string;
  name: string;
  action: "BUY" | "SELL" | "EXIT" | "HOLD";
  stopLoss?: number;
  target?: number;
  confidence?: number;
  reason?: string;
};

type GannFanSeriesPoint = { date: string; g1x1: number; g2x1: number; g4x1: number; g1x2: number; g1x4: number };

type GannFanSnapshot = {
  pivot: { index: number; date: string; price: number; direction: "up" | "down"; unit: number };
  series: GannFanSeriesPoint[];
  squareSupport: number;
  squareResistance: number;
};

function ChartModal({ target, onClose }: { target: ChartTarget; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intv, setIntv] = useState<string>("1d");
  const [verdicts, setVerdicts] = useState<StrategyVerdict[]>([]);
  const [gann, setGann] = useState<GannFanSnapshot | null>(null);

  const isBuy = String(target.signal).toUpperCase() === "BUY";
  const isSell = String(target.signal).toUpperCase() === "SELL";

  useEffect(() => {
    let mounted = true;
    async function loadChart() {
      if (!containerRef.current) return;
      setLoading(true);
      setError(null);
      setVerdicts([]);
      setGann(null);
      try {
        const resp = await fetch(`/api/history?symbol=${encodeURIComponent(target.symbol)}&interval=${intv}`);
        if (!resp.ok) throw new Error("Failed to fetch data");
        const json = await resp.json();
        const hist = json?.hist ?? [];
        if (hist.length === 0) throw new Error("No historical data available");

        const hasOHLC = hist[0]?.open != null && hist[0]?.high != null && hist[0]?.low != null;
        const isIntraday = /^(\d+)(m|h)$/i.test(intv) || intv === "1h" || intv === "60m";
        // For intraday, use Unix seconds so each bar has a unique time.
        // For daily+, slice to YYYY-MM-DD (lightweight-charts business day format).
        const toTime = (raw: unknown): number | string => {
          const s = String(raw ?? "");
          if (isIntraday) {
            const t = new Date(s).getTime();
            return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
          }
          return s.slice(0, 10);
        };
        // De-duplicate timestamps (Yahoo occasionally returns repeats) and sort ascending.
        type HistRow = Record<string, unknown>;
        const seen = new Set<number | string>();
        const cleaned: HistRow[] = (hist as HistRow[])
          .map((h) => ({ ...h, __t: toTime(h.date) }))
          .filter((h) => {
            const t = h.__t as number | string;
            if (t === 0 || t === "" || seen.has(t)) return false;
            seen.add(t);
            return true;
          })
          .sort((a, b) => {
            const ta = a.__t as number | string;
            const tb = b.__t as number | string;
            if (typeof ta === "number" && typeof tb === "number") return ta - tb;
            return String(ta).localeCompare(String(tb));
          });

        try { chartRef.current?.remove(); } catch {}
        if (!containerRef.current || !mounted) return;

        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
          layout: { background: { color: "#071026" }, textColor: "#9aa7bd", fontFamily: "monospace" },
          grid: { vertLines: { color: "#0d1a30" }, horzLines: { color: "#0d1a30" } },
          rightPriceScale: { borderColor: "#1a2744", scaleMargins: { top: 0.1, bottom: 0.1 } },
          timeScale: { borderColor: "#1a2744", timeVisible: intv !== "1d" && intv !== "1wk" },
          crosshair: { mode: 0, vertLine: { color: "#ffffff30" }, horzLine: { color: "#ffffff30", labelBackgroundColor: "#1a2744" } },
        });
        chartRef.current = chart;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let series: any;
        if (hasOHLC) {
          series = chart.addCandlestickSeries({
            upColor: "#26a69a", downColor: "#ef5350", borderDownColor: "#ef5350", borderUpColor: "#26a69a",
            wickDownColor: "#ef5350", wickUpColor: "#26a69a",
          });
          series.setData(cleaned.map((h) => ({
            time: h.__t as number | string,
            open: Number(h.open), high: Number(h.high), low: Number(h.low), close: Number(h.close),
          })));
        } else {
          series = chart.addLineSeries({ color: "#26a69a", lineWidth: 2 });
          series.setData(cleaned.map((h) => ({ time: h.__t as number | string, value: Number(h.close) })));
        }

        if (target.entry && target.entry > 0) {
          series.createPriceLine({
            price: target.entry, color: "#00ff99", lineWidth: 2, lineStyle: LineStyle.Dashed,
            axisLabelVisible: true, title: `▶ ENTRY ₹${target.entry.toLocaleString("en-IN")}`,
          });
        }
        if (target.sl && target.sl > 0) {
          series.createPriceLine({
            price: target.sl, color: "#ff4d4f", lineWidth: 2, lineStyle: LineStyle.Dashed,
            axisLabelVisible: true, title: `🛑 SL ₹${target.sl.toLocaleString("en-IN")}`,
          });
        }
        if (target.target && target.target > 0) {
          series.createPriceLine({
            price: target.target, color: "#66b3ff", lineWidth: 2, lineStyle: LineStyle.Dashed,
            axisLabelVisible: true, title: `🎯 TGT ₹${target.target.toLocaleString("en-IN")}`,
          });
        }
        if (target.currentPrice && target.currentPrice > 0) {
          series.createPriceLine({
            price: target.currentPrice, color: "#ffffff80", lineWidth: 1, lineStyle: LineStyle.Dotted,
            axisLabelVisible: true, title: `CMP ₹${target.currentPrice.toLocaleString("en-IN")}`,
          });
        }

        // Strategy snapshot + Gann fan overlay (best-effort; failure is non-fatal)
        try {
          const sresp = await fetch(`/api/strategy/snapshot?symbol=${encodeURIComponent(target.symbol)}&interval=${intv}`);
          if (sresp.ok) {
            const sjson = await sresp.json() as { verdicts?: StrategyVerdict[]; gannFan?: GannFanSnapshot | null };
            if (mounted) {
              setVerdicts(sjson.verdicts ?? []);
              setGann(sjson.gannFan ?? null);
            }
            const fan = sjson.gannFan;
            if (fan && fan.series && fan.series.length > 1 && !isIntraday) {
              const fanLines: Array<{ key: keyof GannFanSeriesPoint; color: string; title: string }> = [
                { key: "g4x1", color: "#f87171", title: "Gann 4×1" },
                { key: "g2x1", color: "#fb923c", title: "Gann 2×1" },
                { key: "g1x1", color: "#f97316", title: "Gann 1×1" },
                { key: "g1x2", color: "#facc15", title: "Gann 1×2" },
                { key: "g1x4", color: "#fde047", title: "Gann 1×4" },
              ];
              for (const fl of fanLines) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const ls: any = chart.addLineSeries({ color: fl.color, lineWidth: 1, lineStyle: LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, title: fl.title });
                ls.setData(fan.series.map((p) => ({ time: p.date, value: Number(p[fl.key]) })));
              }
              // Square-of-9 horizontal levels
              series.createPriceLine({
                price: fan.squareSupport, color: "#10b981", lineWidth: 1, lineStyle: LineStyle.Dotted,
                axisLabelVisible: true, title: `Sq9 S ₹${fan.squareSupport.toLocaleString("en-IN")}`,
              });
              series.createPriceLine({
                price: fan.squareResistance, color: "#ef4444", lineWidth: 1, lineStyle: LineStyle.Dotted,
                axisLabelVisible: true, title: `Sq9 R ₹${fan.squareResistance.toLocaleString("en-IN")}`,
              });
            }
          }
        } catch { /* snapshot is optional */ }

        chart.timeScale().fitContent();

        const ro = new ResizeObserver(() => {
          if (!containerRef.current) return;
          chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
        });
        ro.observe(containerRef.current);

        if (mounted) setLoading(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Chart failed";
        if (mounted) { setError(msg); setLoading(false); }
      }
    }
    loadChart();
    return () => { mounted = false; try { chartRef.current?.remove(); } catch {} chartRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.symbol, intv]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const sigBg = isBuy ? "bg-green-500" : isSell ? "bg-red-500" : "bg-yellow-500";
  const intervals = [
    { label: "5m", val: "5m" }, { label: "15m", val: "15m" }, { label: "1H", val: "1h" },
    { label: "1D", val: "1d" }, { label: "1W", val: "1wk" }, { label: "1M", val: "1mo" },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-6xl h-[90vh] bg-[#071026] rounded-2xl border-2 border-white/20 shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xl">{isBuy ? "📈" : isSell ? "📉" : "📊"}</span>
            <div>
              <div className="font-extrabold text-lg text-white">{target.name}</div>
              <div className="text-[10px] text-white/50 font-mono">{target.symbol}</div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${sigBg} ${isBuy || isSell ? "text-white" : "text-black"}`}>{String(target.signal).toUpperCase()}</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            {target.entry != null && target.entry > 0 && (
              <div className="text-center">
                <div className="text-[9px] text-white/40">ENTRY</div>
                <div className="font-bold text-green-400">₹{target.entry.toLocaleString("en-IN")}</div>
              </div>
            )}
            {target.sl != null && target.sl > 0 && (
              <div className="text-center">
                <div className="text-[9px] text-white/40">STOP LOSS</div>
                <div className="font-bold text-red-400">₹{target.sl.toLocaleString("en-IN")}</div>
              </div>
            )}
            {target.target != null && target.target > 0 && (
              <div className="text-center">
                <div className="text-[9px] text-white/40">TARGET</div>
                <div className="font-bold text-cyan-400">₹{target.target.toLocaleString("en-IN")}</div>
              </div>
            )}
            {target.currentPrice != null && target.currentPrice > 0 && (
              <div className="text-center">
                <div className="text-[9px] text-white/40">CMP</div>
                <div className="font-bold text-white">₹{target.currentPrice.toLocaleString("en-IN")}</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-white/5 rounded-lg overflow-hidden border border-white/10">
              {intervals.map(iv => (
                <button key={iv.val} onClick={() => setIntv(iv.val)}
                  className={`px-2.5 py-1 text-[10px] font-bold transition-all ${intv === iv.val ? "bg-blue-600 text-white" : "text-white/50 hover:bg-white/10 hover:text-white"}`}>
                  {iv.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white text-lg font-bold transition-colors" title="Close (Esc)">✕</button>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 relative">
          <div ref={containerRef} className="w-full h-full" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#071026]/80">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-t-transparent border-emerald-400 rounded-full animate-spin" />
                <span className="text-white/60 font-medium">Loading chart for {target.name}…</span>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#071026]/80">
              <div className="text-center">
                <div className="text-red-400 text-lg font-bold mb-1">⚠ {error}</div>
                <div className="text-white/40 text-sm">Try a different interval or check the symbol</div>
              </div>
            </div>
          )}
        </div>

        {/* Strategy verdicts (live ensemble snapshot) */}
        {(verdicts.length > 0 || gann) && (
          <div className="px-4 py-2 border-t border-white/10 bg-[#06101e]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Strategies:</span>
              {verdicts.length === 0 && (
                <span className="text-[11px] text-white/40">No verdict (insufficient history)</span>
              )}
              {verdicts.map((v) => {
                const tone =
                  v.action === "BUY" ? "bg-emerald-900/60 text-emerald-300 border-emerald-700/60"
                  : v.action === "SELL" ? "bg-rose-900/60 text-rose-300 border-rose-700/60"
                  : v.action === "EXIT" ? "bg-amber-900/60 text-amber-300 border-amber-700/60"
                  : "bg-white/5 text-white/50 border-white/10";
                return (
                  <span
                    key={v.id}
                    title={v.reason ?? ""}
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold ${tone}`}
                  >
                    {v.name}: {v.action}
                    {v.confidence != null ? ` · ${(v.confidence * 100).toFixed(0)}%` : ""}
                  </span>
                );
              })}
              {gann && (
                <span className="ml-auto text-[10px] text-white/50 font-mono">
                  Gann pivot {gann.pivot.direction === "up" ? "↑" : "↓"} ₹{gann.pivot.price} ({gann.pivot.date}) · 1×1 ₹{gann.pivot.unit}/bar
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer legend */}
        <div className="flex items-center justify-center gap-6 px-4 py-2 border-t border-white/10 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-green-400 inline-block" /> Entry</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-red-400 inline-block" /> Stop Loss</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-cyan-400 inline-block" /> Target</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-white/40 inline-block border-t border-dotted border-white/40" /> CMP</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-orange-500 inline-block" /> Gann 1×1</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-yellow-300 inline-block" /> Gann 1×4 / 4×1</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-emerald-500 inline-block border-t border-dotted border-emerald-500" /> Sq9 S</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-red-500 inline-block border-t border-dotted border-red-500" /> Sq9 R</span>
          <span className="text-white/30">Press ESC to close</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Index Cards ─────────────────── */

function IndexCard({ idx, fl, onChartClick }: { idx: IndexData; fl?: "up" | "down"; onChartClick?: () => void }) {
  const up = (idx.change ?? 0) >= 0;
  const p = pts(idx.price, idx.change);
  return (
    <div onClick={onChartClick} className={`rounded-xl p-4 border-2 transition-all duration-300 cursor-pointer hover:scale-[1.03] ${fl === "up" ? "ring-2 ring-green-400 scale-[1.02]" : fl === "down" ? "ring-2 ring-red-400 scale-[1.02]" : ""} ${up ? "border-green-500/50 bg-gradient-to-br from-green-950/40 to-[#071026]" : "border-red-500/50 bg-gradient-to-br from-red-950/40 to-[#071026]"}`}>
      <div className="text-xs font-bold text-white/80 tracking-wider">{idx.name} <span className="text-[8px] text-white/30 ml-1">📊 click for chart</span></div>
      <div className={`text-2xl font-extrabold tabular-nums mt-0.5 ${up ? "text-green-400" : "text-red-400"}`}>
        {idx.price != null ? idx.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
      </div>
      <div className={`text-sm mt-0.5 flex items-center gap-1 font-bold ${up ? "text-green-300" : "text-red-300"}`}>
        <span>{up ? "▲" : "▼"}</span>
        <span>{pct(idx.change)}</span>
        {p != null && <span className="text-xs">({up ? "+" : ""}{p.toFixed(2)} pts)</span>}
      </div>
    </div>
  );
}

function IndexCardSmall({ idx, fl, onChartClick, currencyPrefix, unitLabel, subLabel }: { idx: IndexData; fl?: "up" | "down"; onChartClick?: () => void; currencyPrefix?: string; unitLabel?: string; subLabel?: string }) {
  const up = (idx.change ?? 0) >= 0;
  const p = pts(idx.price, idx.change);
  return (
    <div onClick={onChartClick} className={`rounded-lg p-2.5 border transition-all duration-300 cursor-pointer hover:scale-[1.03] ${fl === "up" ? "ring-1 ring-green-400" : fl === "down" ? "ring-1 ring-red-400" : ""} ${up ? "border-green-600/40 bg-green-950/20" : "border-red-600/40 bg-red-950/20"}`}>
      <div className="text-[10px] text-white/70 truncate font-medium flex items-center justify-between gap-1">
        <span className="truncate">{idx.name}</span>
        {unitLabel && <span className="text-[9px] text-white/40 shrink-0">/{unitLabel}</span>}
      </div>
      <div className={`text-sm font-extrabold tabular-nums ${up ? "text-green-400" : "text-red-400"}`}>
        {idx.price != null ? `${currencyPrefix ?? ""}${idx.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
      </div>
      <div className={`text-[10px] font-bold ${up ? "text-green-300" : "text-red-300"}`}>
        {up ? "▲" : "▼"} {pct(idx.change)}
        {p != null && <span className="ml-1 text-white/60">({up ? "+" : ""}{p.toFixed(2)})</span>}
      </div>
      {subLabel && <div className="text-[9px] text-white/30 mt-0.5 tabular-nums">{subLabel}</div>}
    </div>
  );
}

/* ─────────────────── Strike Panel (expanded) ─────────────────── */

function StrikePanel({ data, signal }: { data: StrikesData; signal: Signal }) {
  const { strikes, recommendation: rec } = data;
  const list = strikes?.strikes ?? [];
  const atm = strikes?.atm ?? 0;
  const underlying = strikes?.price ?? Number(signal.currentPrice ?? signal.entryPrice ?? 0);
  const sig = String(signal.signal).toUpperCase();
  const isBull = sig === "BUY";
  const isBear = sig === "SELL";

  const eP = Number(signal.entryPrice ?? 0);
  const sP = Number(signal.stopLoss ?? 0);
  const tP = Number(signal.targetPrice ?? 0);

  return (
    <div className="space-y-2">
      {/* ── ACTION BANNER ── */}
      <div className={`flex items-center gap-3 p-3 rounded-lg ${isBull ? "bg-emerald-950/60 border border-emerald-700/40" : isBear ? "bg-rose-950/60 border border-rose-700/40" : "bg-amber-950/60 border border-amber-700/40"}`}>
        <div className="text-xl">{isBull ? "🟢" : isBear ? "🔴" : "🟡"}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">{sig} — {signal.symbol}</div>
          <div className="text-[10px] text-[var(--bf-muted)]">
            {rec?.type === "HOLD"
              ? "No F&O action recommended"
              : `${rec?.type?.replace("_", " ")} @ Strike ₹${rec?.strike?.toLocaleString() ?? "—"}`}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] text-[var(--bf-muted)]">Spot Price</div>
          <div className="font-bold text-sm">₹{(underlying ?? 0).toFixed(2)}</div>
        </div>
      </div>

      {/* ── QUICK SUMMARY: Entry / SL / Target / R:R ── */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg p-2">
          <div className="text-[8px] text-[var(--bf-muted)] uppercase tracking-widest">Entry</div>
          <div className="font-mono font-extrabold text-sm text-emerald-400">{eP ? INR(eP) : "—"}</div>
        </div>
        <div className="bg-rose-950/30 border border-rose-800/30 rounded-lg p-2">
          <div className="text-[8px] text-[var(--bf-muted)] uppercase tracking-widest">Stop Loss</div>
          <div className="font-mono font-extrabold text-sm text-rose-400">{sP ? INR(sP) : "—"}</div>
        </div>
        <div className="bg-sky-950/30 border border-sky-800/30 rounded-lg p-2">
          <div className="text-[8px] text-[var(--bf-muted)] uppercase tracking-widest">Target</div>
          <div className="font-mono font-extrabold text-sm text-sky-400">{tP ? INR(tP) : "—"}</div>
        </div>
        <div className="bg-amber-950/30 border border-amber-800/30 rounded-lg p-2">
          <div className="text-[8px] text-[var(--bf-muted)] uppercase tracking-widest">Risk:Reward</div>
          <div className="font-mono font-extrabold text-sm text-amber-400">
            {eP && sP && tP ? `1:${(Math.abs(tP - eP) / Math.abs(eP - sP)).toFixed(1)}` : "—"}
          </div>
        </div>
      </div>

      {/* ── STRIKE PRICES TABLE ── */}
      {list.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[var(--bf-muted)] border-b border-white/8">
                <th className="py-1.5 px-2 text-left">Strike Price</th>
                <th className="py-1.5 px-2 text-center">Type</th>
                <th className="py-1.5 px-2 text-right text-emerald-500">Buy At ₹</th>
                <th className="py-1.5 px-2 text-right text-rose-500">Stop Loss ₹</th>
                <th className="py-1.5 px-2 text-right text-sky-500">Target ₹</th>
                <th className="py-1.5 px-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/3">
              {list.map((strike: number) => {
                const isAtm = strike === atm;
                const isRec = rec?.strike === strike;
                const otmCall = strike > atm;
                const otmPut = strike < atm;
                const diff = strike - atm;

                let buy: number, sl: number, tgt: number, label: string;
                if (isBull) {
                  buy = eP + diff; sl = sP + diff; tgt = tP + diff;
                  label = isRec ? "★ BUY CALL" : isAtm ? "BUY CALL (ATM)" : otmCall ? "BUY CALL (OTM)" : "BUY CALL (ITM)";
                } else if (isBear) {
                  buy = eP - diff; sl = sP - diff; tgt = tP - diff;
                  label = isRec ? "★ BUY PUT" : isAtm ? "BUY PUT (ATM)" : otmPut ? "BUY PUT (OTM)" : "BUY PUT (ITM)";
                } else {
                  buy = eP; sl = sP; tgt = tP;
                  label = sig === "EXIT" ? "EXIT" : "HOLD";
                }

                return (
                  <tr key={strike} className={`${isRec ? "bg-emerald-900/25 ring-1 ring-inset ring-emerald-500/30" : ""} ${isAtm && !isRec ? "bg-white/4" : ""}`}>
                    <td className="py-1.5 px-2 font-mono font-bold">
                      ₹{strike.toLocaleString()}
                      {isAtm && <span className="ml-1 text-[8px] px-1 py-0.5 bg-white/10 rounded">ATM</span>}
                      {isRec && <span className="ml-1 text-[8px] px-1 py-0.5 bg-emerald-800 text-emerald-300 rounded">★ REC</span>}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {otmCall ? <span className="text-emerald-500">OTM</span> : otmPut ? <span className="text-rose-500">OTM</span> : <span className="text-white/50">ATM</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-400">{buy > 0 ? `₹${buy.toFixed(2)}` : "—"}</td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold text-rose-400">{sl > 0 ? `₹${sl.toFixed(2)}` : "—"}</td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold text-sky-400">{tgt > 0 ? `₹${tgt.toFixed(2)}` : "—"}</td>
                    <td className={`py-1.5 px-2 text-center font-bold ${isRec ? "text-emerald-300" : "text-[var(--bf-muted)]"}`}>
                      {label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── My Positions ─────────────────── */

function MyPositions({ trades, onExit, onRemove, onChartClick }: {
  trades: TrackedTrade[];
  onExit: (id: string, premium?: number) => void;
  onRemove: (id: string) => void;
  onChartClick: (t: TrackedTrade) => void;
}) {
  const openTrades = trades.filter(t => t.status === "OPEN");
  const closedTrades = trades.filter(t => t.status !== "OPEN");

  const getStatusBadge = (status: TrackedTrade["status"]) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      OPEN: { bg: "bg-blue-500/20", text: "text-blue-400", label: "OPEN" },
      SL_HIT: { bg: "bg-red-500/20", text: "text-red-400", label: "SL HIT" },
      T1_HIT: { bg: "bg-green-500/20", text: "text-green-400", label: "T1 HIT" },
      T2_HIT: { bg: "bg-green-500/20", text: "text-green-400", label: "T2 HIT" },
      T3_HIT: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "T3 HIT" },
      EXITED: { bg: "bg-gray-500/20", text: "text-gray-400", label: "EXITED" },
    };
    const s = map[status] ?? map.OPEN;
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  const renderTrade = (t: TrackedTrade) => {
    const cur = t.currentPremium ?? t.entryPremium ?? 0;
    const exitP = t.exitPremium ?? cur;
    const isClosed = t.status !== "OPEN";
    const refP = isClosed ? exitP : cur;
    const pnlPts = (refP ?? 0) - (t.entryPremium ?? 0);
    const pnlPct = (t.entryPremium ?? 0) > 0 ? (pnlPts / (t.entryPremium ?? 0)) * 100 : 0;
    const pnlColor = pnlPts >= 0 ? "text-green-400" : "text-red-400";
    // Real NSE/MCX contract lot size; falls back to 1 if unknown
    const lotSize = getLotSize(t.symbol) ?? getLotSize(t.name) ?? 1;
    const pnlAmount = pnlPts * lotSize * t.lots;

    // Check if SL or targets hit
    let statusNote = "";
    if (t.status === "OPEN") {
      if (cur <= t.sl) statusNote = "⚠️ SL Zone";
      else if (cur >= t.t3) statusNote = "🎯 T3 Reached!";
      else if (cur >= t.t2) statusNote = "🎯 T2 Reached";
      else if (cur >= t.t1) statusNote = "🎯 T1 Reached";
    }

    const boughtTime = new Date(t.boughtAt);
    const timeStr = boughtTime.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });

    return (
      <div key={t.id} className="bg-[#0d1626] border border-gray-700/50 rounded-xl p-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${t.type === "CE" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{t.type}</span>
            <span className="text-white font-bold text-sm">{t.name}</span>
            <span className="text-gray-400 text-xs">{t.strike}</span>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(t.status)}
            <button onClick={() => onChartClick(t)} className="text-gray-400 hover:text-blue-400 text-sm" title="View Chart">📊</button>
          </div>
        </div>

        {/* Price Grid */}
        <div className="grid grid-cols-4 gap-1 text-[10px]">
          <div className="bg-[#111b2e] rounded p-1.5 text-center">
            <div className="text-gray-500">Entry</div>
            <div className="text-white font-bold">₹{(t.entryPremium ?? 0).toFixed(1)}</div>
          </div>
          <div className="bg-[#111b2e] rounded p-1.5 text-center">
            <div className="text-gray-500">SL</div>
            <div className="text-red-400 font-bold">₹{(t.sl ?? 0).toFixed(1)}</div>
          </div>
          <div className="bg-[#111b2e] rounded p-1.5 text-center">
            <div className="text-gray-500">Target</div>
            <div className="text-green-400 font-bold">₹{(t.t1 ?? 0).toFixed(1)}</div>
          </div>
          <div className="bg-[#111b2e] rounded p-1.5 text-center">
            <div className="text-gray-500">{isClosed ? "Exit" : "CMP"}</div>
            <div className={`font-bold ${pnlColor}`}>₹{(refP ?? 0).toFixed(1)}</div>
          </div>
        </div>

        {/* All targets row */}
        <div className="flex gap-2 text-[9px] text-gray-500">
          <span>T1: ₹{(t.t1 ?? 0).toFixed(1)}</span>
          <span>T2: ₹{(t.t2 ?? 0).toFixed(1)}</span>
          <span>T3: ₹{(t.t3 ?? 0).toFixed(1)}</span>
          <span className="ml-auto">Exp: {t.expiry}</span>
        </div>

        {/* P&L + Status Note */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold ${pnlColor}`}>
              {pnlPts >= 0 ? "+" : ""}{(pnlPts ?? 0).toFixed(1)} pts ({pnlPct >= 0 ? "+" : ""}{(pnlPct ?? 0).toFixed(1)}%)
            </span>
            <span className={`text-xs ${pnlColor}`}>
              {pnlAmount >= 0 ? "+" : ""}₹{pnlAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
          </div>
          {statusNote && <span className="text-[10px] font-bold text-yellow-400">{statusNote}</span>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>📅 {timeStr} · {t.lots} lot(s)</span>
          <div className="flex gap-2">
            {t.status === "OPEN" && (
              <button onClick={() => onExit(t.id)} className="px-2 py-0.5 rounded bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 font-bold transition-colors">
                Exit
              </button>
            )}
            <button onClick={() => onRemove(t.id)} className="px-2 py-0.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 font-bold transition-colors">
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="mt-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
        📋 My Positions
        <span className="text-xs font-normal text-gray-400">
          ({openTrades.length} open{closedTrades.length > 0 ? `, ${closedTrades.length} closed` : ""})
        </span>
      </h2>

      {/* Open Trades */}
      {openTrades.length > 0 && (
        <div className="space-y-3 mb-4">
          {openTrades.map(renderTrade)}
        </div>
      )}

      {/* Closed Trades (collapsible) */}
      {closedTrades.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300 mb-2 select-none">
            📁 Closed Trades ({closedTrades.length})
          </summary>
          <div className="space-y-3 opacity-70">
            {closedTrades.map(renderTrade)}
          </div>
        </details>
      )}
    </section>
  );
}

/* ─────────────────── Commodity Predictions ─────────────────── */

// SEBI-grade safety: only publish a BUY/SELL call when the SignalEngine's
// confidence clears this threshold. Below it we default to HOLD ("no trade")
// so the app never pushes a low-conviction call to retail users.
const COMMODITY_MIN_STRENGTH = 60;

function CommodityPredictions({ commodities, usdInr, mcxAnchors, onBuyTrade }: { commodities: IndexData[]; usdInr: number; mcxAnchors?: RuntimeAnchorMap | null; onBuyTrade?: (t: Omit<TrackedTrade, "id" | "boughtAt" | "status">) => void }) {
  const withData = commodities.filter(c => c.price != null && c.change != null);

  // Fetch REAL technical-analysis signals from SignalEngine for every
  // commodity symbol, the same engine that produces stock & index calls
  // (EMA alignment, RSI, MACD, Bollinger, ADX, SuperTrend, VWAP, OBV,
  // Pivot/Fib S&R, candle patterns, and the trend-aware counter-trend veto).
  const [cmdSignals, setCmdSignals] = useState<Record<string, Signal | null>>({});
  const [signalsLoaded, setSignalsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const results = await Promise.all(
        withData.map(async c => {
          try {
            const r = await fetch(`/api/signal?symbol=${encodeURIComponent(c.sym)}`);
            if (!r.ok) return [c.id, null] as const;
            const j = await r.json();
            return [c.id, (j?.signal ?? null) as Signal | null] as const;
          } catch {
            return [c.id, null] as const;
          }
        })
      );
      if (cancelled) return;
      const next: Record<string, Signal | null> = {};
      for (const [id, sig] of results) next[id] = sig;
      setCmdSignals(next);
      setSignalsLoaded(true);
    };
    load();
    // Refresh every 60s so commodity calls track intraday technical shifts.
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withData.map(c => c.sym).join(",")]);

  if (withData.length === 0) return null;

  const predictions = withData.map(c => {
    const price = c.price ?? 0;
    // Per-commodity daily volatility (fallback when ATR unavailable)
    const volPct = c.id === "NATGAS" ? 0.025 : c.id === "SILVER" ? 0.018 : c.id === "CRUDE" || c.id === "BRENT" ? 0.015 : c.id === "COPPER" ? 0.012 : c.id === "GOLD" ? 0.008 : 0.012;

    const sig = cmdSignals[c.id];
    const hasSignal = !!sig;
    const sigDir = String(sig?.signal ?? "HOLD").toUpperCase();
    const engineStrength = Number.isFinite(sig?.strength) ? (sig!.strength as number) : 0;

    // SEBI-grade gating: we only emit a tradable call when the engine is
    // confident enough. Below the floor, or when no data, we report HOLD.
    let signal: "BUY" | "SELL" | "HOLD" = "HOLD";
    if (hasSignal && engineStrength >= COMMODITY_MIN_STRENGTH) {
      if (sigDir === "BUY") signal = "BUY";
      else if (sigDir === "SELL") signal = "SELL";
    }

    const strength = engineStrength;
    const engineEntry = Number(sig?.entryPrice ?? 0);
    const engineSL = Number(sig?.stopLoss ?? 0);
    const engineTgt = Number(sig?.targetPrice ?? 0);

    let entry = price, sl = 0, t1 = 0, t2 = 0, t3 = 0;
    if (signal === "BUY") {
      entry = engineEntry > 0 ? engineEntry : price;
      sl = engineSL > 0 && engineSL < entry ? engineSL : entry * (1 - volPct);
      const riskPct = entry > 0 ? (entry - sl) / entry : volPct;
      t1 = engineTgt > 0 ? engineTgt : entry * (1 + riskPct * 1.0);
      t2 = entry * (1 + Math.max(riskPct * 1.8, volPct * 1.8));
      t3 = entry * (1 + Math.max(riskPct * 2.8, volPct * 2.8));
    } else if (signal === "SELL") {
      entry = engineEntry > 0 ? engineEntry : price;
      sl = engineSL > 0 && engineSL > entry ? engineSL : entry * (1 + volPct);
      const riskPct = entry > 0 ? (sl - entry) / entry : volPct;
      t1 = engineTgt > 0 ? engineTgt : entry * (1 - riskPct * 1.0);
      t2 = entry * (1 - Math.max(riskPct * 1.8, volPct * 1.8));
      t3 = entry * (1 - Math.max(riskPct * 2.8, volPct * 2.8));
    } else {
      sl = price * (1 - volPct * 0.8);
      t1 = price * (1 + volPct * 0.8);
      t2 = price * (1 + volPct * 1.5);
      t3 = price * (1 + volPct * 2.2);
    }
    const reason = sig?.reason ?? "";
    return { ...c, signal, strength, entry, sl, t1, t2, t3, volPct, reason, hasSignal };
  });

  const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const fx = usdInr > 0 ? usdInr : 83;
  const usdToMcx = (id: string, usd: number) => usdToMcxEstimateWithAnchor(id, usd, fx, mcxAnchors ?? null).inr;
  const roundStrike = (id: string, mcxPrice: number) => roundMcxStrike(id, mcxPrice);

  return (
    <section>
      <h2 className="text-sm font-extrabold text-white uppercase tracking-wider mb-2">🛢️ Commodity Option Recommendations <span className="text-[10px] font-normal text-white/40 normal-case tracking-normal">• ₹ est. @ USD/INR ₹{fx.toFixed(2)} • verify LTP on broker</span></h2>
      {!signalsLoaded && (
        <div className="text-[11px] text-white/50 mb-3">⏳ Fetching real-time technical analysis — no call will be shown until indicators confirm.</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {predictions.map(p => {
          const isBuy = p.signal === "BUY";
          const isSell = p.signal === "SELL";
          const color = isBuy ? "green" : isSell ? "red" : "yellow";
          // Yahoo gives USD prices; convert to MCX INR before computing strike & premium
          const usdPrice = p.price ?? 0;
          const mcxPrice = usdToMcx(p.id, usdPrice);
          const mcxEntry = usdToMcx(p.id, p.entry);
          const mcxSL = usdToMcx(p.id, p.sl);
          const mcxT1 = usdToMcx(p.id, p.t1);
          const mcxT2 = usdToMcx(p.id, p.t2);
          const mcxT3 = usdToMcx(p.id, p.t3);
          const strike = roundStrike(p.id, mcxPrice);
          const optType: "CE" | "PE" = isBuy ? "CE" : "PE";
          // Rough ATM option premium ≈ % of MCX spot
          const premFactor = p.id === "NATGAS" ? 0.025 : p.id === "SILVER" ? 0.018 : p.id === "GOLD" ? 0.010 : 0.015;
          const estPremium = mcxPrice * premFactor;
          const premExit = estPremium * 1.6; // ~60% gain target
          const premSL = estPremium * 0.6;   // ~40% drop SL
          const unit = `₹/${commodityUnit(p.id) || "unit"}`;
          const waitingForData = !signalsLoaded || !p.hasSignal;
          const actionLine = isBuy
            ? `BUY ${p.name} ${strike} CE`
            : isSell
            ? `BUY ${p.name} ${strike} PE`
            : waitingForData
            ? `Collecting data…`
            : `NO TRADE — Confidence below ${COMMODITY_MIN_STRENGTH}%`;
          return (
            <div key={p.id} className={`rounded-xl border bg-[#0a1628] p-3 space-y-2.5 border-${color}-500/40`}>
              {/* Header: commodity + LTP */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">{p.name} <span className="text-[9px] text-white/40">MCX</span></div>
                  <div className="text-[10px] text-white/50">LTP ₹{fmt(mcxPrice)} <span className="text-white/30">({unit})</span> <span className={(p.change ?? 0) >= 0 ? "text-green-400" : "text-red-400"}>({(p.change ?? 0) >= 0 ? "+" : ""}{(p.change ?? 0).toFixed(2)}%)</span></div>
                  <div className="text-[9px] text-white/30">Intl: ${fmt(usdPrice)}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${isBuy ? "bg-green-500/20 text-green-400" : isSell ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                  {isBuy ? "📈 BULLISH" : isSell ? "📉 BEARISH" : "↔️ NEUTRAL"}
                </span>
              </div>

              {/* BIG ACTION BANNER */}
              <div className={`rounded-lg px-3 py-2 ${isBuy ? "bg-green-500/15 border border-green-500/40" : isSell ? "bg-red-500/15 border border-red-500/40" : "bg-yellow-500/10 border border-yellow-500/30"}`}>
                <div className="text-[9px] uppercase tracking-wider text-white/50">Action</div>
                <div className={`text-sm font-extrabold ${isBuy ? "text-green-300" : isSell ? "text-red-300" : "text-yellow-300"}`}>
                  {actionLine}
                </div>
                {p.signal !== "HOLD" && (
                  <div className="text-[10px] text-white/60 mt-0.5">Est. premium ≈ ₹{fmt(estPremium)} • Lot size varies (check broker)</div>
                )}
                {p.reason && (
                  <div className="text-[10px] text-white/50 mt-1 leading-snug" title={p.reason}>
                    <span className="text-white/40">TA:</span> {p.reason.length > 140 ? p.reason.slice(0, 140) + "…" : p.reason}
                  </div>
                )}
              </div>

              {p.signal !== "HOLD" ? (
                <>
                  {/* Option premium plan */}
                  <div className="space-y-1">
                    <div className="text-[9px] uppercase tracking-wider text-white/40">Option Premium Plan (per lot)</div>
                    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                      <div className="bg-white/5 rounded px-2 py-1">
                        <div className="text-white/40 text-[9px] uppercase">Buy @</div>
                        <div className="font-bold text-white">₹{fmt(estPremium)}</div>
                      </div>
                      <div className="bg-red-500/10 rounded px-2 py-1">
                        <div className="text-red-400/70 text-[9px] uppercase">Exit if SL</div>
                        <div className="font-bold text-red-300">₹{fmt(premSL)}</div>
                      </div>
                      <div className="bg-green-500/15 rounded px-2 py-1">
                        <div className="text-green-400/70 text-[9px] uppercase">🎯 Exit @</div>
                        <div className="font-bold text-green-200">₹{fmt(premExit)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Underlying MCX spot plan */}
                  <div className="space-y-1">
                    <div className="text-[9px] uppercase tracking-wider text-white/40">MCX {p.name} Levels ({unit})</div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div className="bg-white/5 rounded px-2 py-1">
                        <div className="text-white/40 text-[9px] uppercase">Entry</div>
                        <div className="font-bold text-white">₹{fmt(mcxEntry)}</div>
                      </div>
                      <div className="bg-red-500/10 rounded px-2 py-1">
                        <div className="text-red-400/70 text-[9px] uppercase">Stop Loss</div>
                        <div className="font-bold text-red-300">₹{fmt(mcxSL)}</div>
                      </div>
                      <div className="bg-green-500/10 rounded px-2 py-1">
                        <div className="text-green-400/70 text-[9px] uppercase">T1</div>
                        <div className="font-bold text-green-300">₹{fmt(mcxT1)}</div>
                      </div>
                      <div className="bg-green-500/15 rounded px-2 py-1">
                        <div className="text-green-400/70 text-[9px] uppercase">T2</div>
                        <div className="font-bold text-green-300">₹{fmt(mcxT2)}</div>
                      </div>
                      <div className="col-span-2 bg-green-500/20 rounded px-2 py-1">
                        <div className="text-green-400/70 text-[9px] uppercase">🎯 T3 (Final Exit)</div>
                        <div className="font-bold text-green-200">₹{fmt(mcxT3)}</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-white/50 italic">Price action flat — wait for MCX breakout above ₹{fmt(mcxPrice * 1.004)} (BUY) or below ₹{fmt(mcxPrice * 0.996)} (SELL).</div>
              )}

              <div className="flex items-center justify-between pt-1">
                <div className="text-[10px] text-white/40">Confidence: <span className={`font-bold ${p.strength >= 70 ? "text-green-400" : p.strength >= 50 ? "text-yellow-400" : "text-white/50"}`}>{p.strength}%</span></div>
                {onBuyTrade && p.signal !== "HOLD" && (
                  <button
                    onClick={() => onBuyTrade({
                      symbol: p.sym,
                      name: `${p.name} ${strike} ${optType}`,
                      type: optType,
                      strike: strike,
                      entryPremium: Number(estPremium.toFixed(2)),
                      sl: Number(premSL.toFixed(2)),
                      t1: Number((estPremium * 1.25).toFixed(2)),
                      t2: Number((estPremium * 1.5).toFixed(2)),
                      t3: Number(premExit.toFixed(2)),
                      lots: 1,
                      expiry: "",
                    })}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold ${isBuy ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"} text-white`}
                  >
                    Track {optType}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-white/50 mt-3 space-y-1 leading-relaxed">
        <div>📡 <span className="text-white/70">Data source:</span> Yahoo Finance COMEX/NYMEX/ICE USD futures, converted to ₹ using live USD/INR + Indian import-duty &amp; GST premium (GOLD ~{mcxPremiumPct("GOLD").toFixed(0)}%, SILVER ~{mcxPremiumPct("SILVER").toFixed(0)}%, COPPER ~{mcxPremiumPct("COPPER").toFixed(0)}%). <strong>This is NOT a live MCX feed</strong> — actual MCX contracts trade with ±1-5% basis due to contract-month, delivery premium, and liquidity. For broker-grade accuracy, operators can set <code>NEXT_PUBLIC_MCX_*_ANCHOR</code> env vars (see <code>lib/commodity.ts</code>).</div>
        <div>🎯 <span className="text-white/70">Method:</span> SignalEngine with today&apos;s live bar injected (EMA 9/21/50/200, RSI-14, MACD, Bollinger, ADX, SuperTrend, VWAP, OBV, Pivot / Fib / swing S&amp;R, candle patterns) + trend-aware counter-trend veto. Calls published only when confidence ≥ {COMMODITY_MIN_STRENGTH}%.</div>
        <div>⚠️ <span className="text-white/70">Disclaimer:</span> Educational / informational content. <strong>Not investment advice</strong>. Option premiums shown are approximate ATM estimates — verify LTP, IV &amp; expiry on your broker before any trade. Derivatives involve substantial risk of loss.</div>
      </div>
    </section>
  );
}

/* ─────────────────── Tomorrow's Outlook ─────────────────── */

type IndexOptionItem = { sym: string; label: string; signal: Signal | null; strikes: StrikesData | null; loading: boolean; error: string | null };

type EnsembleVerdict = { id: string; name: string; action: string; reason?: string; confidence?: number; stopLoss?: number; target?: number };
type EnsembleEntry = { buys: number; sells: number; holds: number; total: number; top: "BUY" | "SELL" | "HOLD"; confidence: number; verdicts: EnsembleVerdict[]; lastClose?: number; ts: number };

function TomorrowOutlook({ indices, indexOptions, signals, onBuyTrade }: { indices: IndexData[]; indexOptions: IndexOptionItem[]; signals: Signal[]; onBuyTrade?: (t: Omit<TrackedTrade, "id" | "boughtAt" | "status">) => void }) {
  // Expert bias override: "AUTO" follows signals, "BEARISH" forces PE, "BULLISH" forces CE
  const [expertBias, setExpertBias] = useState<"AUTO" | "BULLISH" | "BEARISH">("AUTO");

  // ── All-strategies ensemble: poll /api/strategy/snapshot for every India index ──
  const [ensemble, setEnsemble] = useState<Record<string, EnsembleEntry>>({});
  const [ensembleTickAt, setEnsembleTickAt] = useState<number>(0);
  // Build target list once from indices prop
  const indiaTargets = useMemo(
    () => indices.filter(i => ["NIFTY", "SENSEX", "BANKNIFTY", "FINNIFTY", "GIFTNIFTY"].includes(i.id)).map(i => ({ id: i.id, sym: i.sym, name: i.name })),
    [indices]
  );
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next: Record<string, EnsembleEntry> = {};
      await Promise.all(indiaTargets.map(async (t) => {
        try {
          const r = await fetch(`/api/strategy/snapshot?symbol=${encodeURIComponent(t.sym)}&interval=1d`, { cache: "no-store" });
          if (!r.ok) return;
          const j = await r.json();
          const verdicts: EnsembleVerdict[] = Array.isArray(j?.verdicts) ? j.verdicts : [];
          if (verdicts.length === 0) return;
          let buys = 0, sells = 0, holds = 0;
          for (const v of verdicts) {
            const a = String(v.action ?? "HOLD").toUpperCase();
            if (a === "BUY" || a === "ENTER_LONG" || a === "LONG") buys++;
            else if (a === "SELL" || a === "ENTER_SHORT" || a === "SHORT" || a === "EXIT_LONG") sells++;
            else holds++;
          }
          const total = verdicts.length;
          const top: "BUY" | "SELL" | "HOLD" = buys > sells && buys > holds ? "BUY" : sells > buys && sells > holds ? "SELL" : "HOLD";
          const confidence = total > 0 ? Math.round(((top === "BUY" ? buys : top === "SELL" ? sells : holds) / total) * 100) : 0;
          next[t.id] = { buys, sells, holds, total, top, confidence, verdicts, lastClose: Number(j?.lastClose ?? 0) || undefined, ts: Date.now() };
        } catch { /* ignore single failure */ }
      }));
      if (!cancelled && Object.keys(next).length > 0) {
        setEnsemble(next);
        setEnsembleTickAt(Date.now());
      }
    };
    tick();
    const h = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(h); };
  }, [indiaTargets]);

  // ── Direction lock per index: hold CE/PE until target/SL hit OR strong opposite consensus ──
  type LockState = { side: "CE" | "PE"; strike: number; entry: number; sl: number; target: number; reason: string; lockedAt: number };
  const lockRef = useRef<Record<string, LockState | null>>({});
  // Hysteresis: remember the last issued sigDir + a pending opposite count per
  // index. Require 2 consecutive same-direction reads before flipping BUY↔SELL.
  // This kills the mid-session flip-flop driven by live-bar splicing flipping
  // indicators (RSI 50, MACD histogram sign) on every poll.
  const sigDirRef = useRef<Record<string, { dir: "BUY" | "SELL" | "HOLD"; pending: "BUY" | "SELL" | "HOLD"; pendingCount: number }>>({});
  const activeSide = useMemo<Record<string, LockState | null>>(() => {
    const prev = lockRef.current;
    const next: Record<string, LockState | null> = { ...prev };
    for (const t of indiaTargets) {
      const e = ensemble[t.id];
      const opt = indexOptions.find(o => indexShortName(o.label) === t.id || o.label === t.name);
      const live = opt?.strikes?.strikes?.liveStrikes ?? [];
      const atmStrike = live.find(ls => ls.isATM) ?? live[0];
      const cur = prev[t.id];

      // 1. Existing lock — check exit (target/SL hit on the locked strike)
      if (cur) {
        const lockedStrike = live.find(ls => ls.strike === cur.strike);
        const ltp = lockedStrike ? (cur.side === "CE" ? (lockedStrike.callLTP ?? 0) : (lockedStrike.putLTP ?? 0)) : 0;
        if (ltp > 0 && (ltp >= cur.target || ltp <= cur.sl)) { next[t.id] = null; }
      }
      // 2. Strong opposite consensus → release lock
      if (next[t.id] && e && e.total > 0) {
        const ns = next[t.id]!;
        const opposite = (ns.side === "CE" && e.top === "SELL") || (ns.side === "PE" && e.top === "BUY");
        if (opposite && e.confidence >= 70) { next[t.id] = null; }
      }
      // 3. No lock + actionable consensus ≥ 50% → engage lock at ATM
      if (!next[t.id] && e && e.total > 0 && atmStrike && (e.top === "BUY" || e.top === "SELL") && e.confidence >= 50) {
        const side: "CE" | "PE" = e.top === "BUY" ? "CE" : "PE";
        const prem = side === "CE" ? (atmStrike.callLTP ?? 0) : (atmStrike.putLTP ?? 0);
        if (prem > 0) {
          const opts = estimateOptionSLTarget(prem, e.confidence);
          next[t.id] = { side, strike: atmStrike.strike, entry: prem, sl: opts.sl, target: opts.t2, reason: `${e.buys}B/${e.sells}S/${e.holds}H of ${e.total}`, lockedAt: e.ts };
        }
      }
    }
    lockRef.current = next;
    return next;
  }, [ensemble, indexOptions, indiaTargets]);

  // Compute market sentiment from global indices
  const globalIds = ["DOWJ", "SP500", "NASDAQ", "FTSE", "NIKKEI", "HANGSENG"];
  const globalIdx = indices.filter(i => globalIds.includes(i.id) && i.price != null && i.change != null);
  const globalUp = globalIdx.filter(i => (i.change ?? 0) >= 0).length;
  const globalDown = globalIdx.length - globalUp;
  const globalBias = globalUp > globalDown ? "BULLISH" : globalUp < globalDown ? "BEARISH" : "MIXED";
  const avgGlobalChange = globalIdx.length > 0 ? globalIdx.reduce((s, i) => s + (i.change ?? 0), 0) / globalIdx.length : 0;

  // India indices (incl. GIFT NIFTY pre-market cue)
  const indiaIds = ["NIFTY", "SENSEX", "BANKNIFTY", "FINNIFTY", "GIFTNIFTY"];
  const indiaIdx = indices.filter(i => indiaIds.includes(i.id) && i.price != null);

  // Compute tomorrow's predicted levels for each India index using signals
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  // Skip weekends
  const dow = tomorrowDate.getDay();
  if (dow === 0) tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  if (dow === 6) tomorrowDate.setDate(tomorrowDate.getDate() + 2);
  const tomorrowStr = `${tomorrowDate.getDate()} ${MONTHS_SHORT[tomorrowDate.getMonth()]} ${tomorrowDate.getFullYear()}`;

  // Aggregate bull/bear counts from all signals
  const actionableSignals = signals.filter(s => ["BUY", "SELL"].includes(String(s.signal).toUpperCase()) && s.strength >= 40);
  const buyCount = actionableSignals.filter(s => String(s.signal).toUpperCase() === "BUY").length;
  const sellCount = actionableSignals.filter(s => String(s.signal).toUpperCase() === "SELL").length;
  const domesticBias = buyCount > sellCount ? "BULLISH" : buyCount < sellCount ? "BEARISH" : "NEUTRAL";

  // Today's actual India index performance — THE most important input an
  // expert trader reads. A bearish close on Nifty/Sensex/BankNifty cannot be
  // overridden by a handful of oversold-RSI "BUY" tags on individual stocks.
  const indiaChanges = indiaIdx.map(i => i.change ?? 0).filter(v => Number.isFinite(v));
  const avgIndiaChange = indiaChanges.length > 0 ? indiaChanges.reduce((s, v) => s + v, 0) / indiaChanges.length : 0;
  const indiaDownCount = indiaChanges.filter(v => v < 0).length;
  const indiaUpCount = indiaChanges.filter(v => v > 0).length;
  let todayIndiaBias: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (avgIndiaChange <= -0.4 || (indiaDownCount >= 2 && avgIndiaChange < 0)) todayIndiaBias = "BEARISH";
  else if (avgIndiaChange >= 0.4 || (indiaUpCount >= 2 && avgIndiaChange > 0)) todayIndiaBias = "BULLISH";

  // Overall outlook — expert override takes priority.
  // Weights scale with magnitude so a sharply bearish global cue doesn't get
  // outvoted by a flat India close + a few oversold-RSI BUYs.
  //   today India: 2x base, 3x if |move| >= 0.8%
  //   global cue:  1x base, 2x if |avg| >= 0.8%, 3x if |avg| >= 1.2%
  //   domestic signals: 1x
  const todayWeight = Math.abs(avgIndiaChange) >= 0.8 ? 3 : 2;
  const globalWeight = Math.abs(avgGlobalChange) >= 1.2 ? 3 : Math.abs(avgGlobalChange) >= 0.8 ? 2 : 1;
  const todayScore = todayIndiaBias === "BULLISH" ? todayWeight : todayIndiaBias === "BEARISH" ? -todayWeight : 0;
  const globalScore = globalBias === "BULLISH" ? globalWeight : globalBias === "BEARISH" ? -globalWeight : 0;
  const domesticScore = domesticBias === "BULLISH" ? 1 : domesticBias === "BEARISH" ? -1 : 0;
  const overallBull = todayScore + globalScore + domesticScore;
  let autoOutlook: "BULLISH" | "BEARISH" | "SIDEWAYS" = overallBull > 0 ? "BULLISH" : overallBull < 0 ? "BEARISH" : "SIDEWAYS";
  // Hard guards: extreme moves on either India or global cannot be flipped.
  if (avgIndiaChange <= -0.8 && autoOutlook === "BULLISH") autoOutlook = "BEARISH";
  if (avgIndiaChange >= 0.8 && autoOutlook === "BEARISH") autoOutlook = "BULLISH";
  // If global is sharply bearish (>=1.2%) and India is flat (<0.4%), downgrade
  // an otherwise-bullish AUTO read to SIDEWAYS — gap-down risk overnight.
  if (avgGlobalChange <= -1.2 && Math.abs(avgIndiaChange) < 0.4 && autoOutlook === "BULLISH") autoOutlook = "SIDEWAYS";
  const outlook = expertBias === "AUTO" ? autoOutlook : expertBias;
  const outlookColor = outlook === "BULLISH" ? "text-green-400" : outlook === "BEARISH" ? "text-red-400" : "text-yellow-400";
  const outlookBorder = outlook === "BULLISH" ? "border-green-500/50" : outlook === "BEARISH" ? "border-red-500/50" : "border-yellow-500/50";
  const outlookBg = outlook === "BULLISH" ? "from-green-950/30" : outlook === "BEARISH" ? "from-red-950/30" : "from-yellow-950/30";

  // Build index-level predictions from their matching indexOption signals
  const indexPredictions = indiaIdx.map(idx => {
    const opt = indexOptions.find(o => indexShortName(o.label) === idx.id || o.label.includes(idx.name));
    const sig = opt?.signal;
    const price = idx.price ?? 0;
    const change = idx.change ?? 0;
    const liveDir = String(sig?.signal ?? "HOLD").toUpperCase();
    const liveStrength = sig?.strength ?? 0;
    const ens = ensemble[idx.id];
    // Fuse: 60% all-strategies ensemble + 40% live momentum signal (when both present).
    // BUT: when ensemble (daily-bar lagging) disagrees with live momentum on a
    // sharp intraday move (>=0.6%), flip the weighting so live tape dominates —
    // the ensemble is by definition stale during an intraday regime change.
    let sigDir = liveDir;
    let strength = liveStrength;
    if (ens && ens.total > 0) {
      const ensScore = ens.top === "BUY" ? ens.confidence : ens.top === "SELL" ? -ens.confidence : 0;
      const liveScore = liveDir === "BUY" ? liveStrength : liveDir === "SELL" ? -liveStrength : 0;
      const sharpIntraday = Math.abs(change) >= 0.6;
      const signsDisagree = ensScore * liveScore < 0;
      let wEns = 0.6, wLive = 0.4;
      if (sharpIntraday && signsDisagree) { wEns = 0.3; wLive = 0.7; }
      const fused = ensScore * wEns + liveScore * wLive;
      sigDir = fused > 15 ? "BUY" : fused < -15 ? "SELL" : "HOLD";
      strength = Math.min(100, Math.round(Math.abs(fused)));
    }
    // Hysteresis: require 2 consecutive same-direction reads before flipping
    // BUY↔SELL. HOLD transitions freely. Prevents mid-session flip-flop.
    const histRec = sigDirRef.current[idx.id] ?? { dir: "HOLD" as const, pending: "HOLD" as const, pendingCount: 0 };
    let stableDir: "BUY" | "SELL" | "HOLD" = histRec.dir;
    const newDir = sigDir as "BUY" | "SELL" | "HOLD";
    if (newDir === histRec.dir) {
      stableDir = newDir;
      sigDirRef.current[idx.id] = { dir: newDir, pending: newDir, pendingCount: 0 };
    } else if (histRec.dir === "HOLD" || newDir === "HOLD") {
      // Free transition into/out of HOLD
      stableDir = newDir;
      sigDirRef.current[idx.id] = { dir: newDir, pending: newDir, pendingCount: 0 };
    } else {
      // BUY↔SELL flip — require pending to repeat
      if (histRec.pending === newDir && histRec.pendingCount >= 1) {
        stableDir = newDir;
        sigDirRef.current[idx.id] = { dir: newDir, pending: newDir, pendingCount: 0 };
      } else {
        stableDir = histRec.dir;
        sigDirRef.current[idx.id] = {
          dir: histRec.dir,
          pending: newDir,
          pendingCount: histRec.pending === newDir ? histRec.pendingCount + 1 : 1,
        };
      }
    }
    sigDir = stableDir;
    const entry = Number(sig?.entryPrice ?? price);
    const sl = Number(sig?.stopLoss ?? 0);
    const tgt = Number(sig?.targetPrice ?? 0);

    // Parse support/resistance from reason string if available
    const reason = sig?.reason ?? "";
    const sMatch = reason.match(/S:\s*(₹[\d,.\/\s₹]+)/);
    const rMatch = reason.match(/R:\s*(₹[\d,.\/\s₹]+)/);
    const supportStr = sMatch ? sMatch[1] : "—";
    const resistanceStr = rMatch ? rMatch[1] : "—";

    return { id: idx.id, name: idx.name, price, change, sigDir, entry, sl, tgt, strength, supportStr, resistanceStr, ens };
  });

  return (
    <section className="mt-4">
      <h2 className="text-sm font-extrabold text-white uppercase tracking-wider mb-3">
        🔮 Tomorrow&apos;s Outlook — {tomorrowStr}
      </h2>
      <div className={`rounded-xl border-2 ${outlookBorder} bg-gradient-to-r ${outlookBg} via-[#0a1628] to-[#0a1628] p-4 space-y-4`}>

        {/* Expert Bias Override Toggle */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Expert Bias:</span>
          {(["AUTO", "BULLISH", "BEARISH"] as const).map(b => (
            <button key={b} onClick={() => setExpertBias(b)}
              className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border transition-all ${
                expertBias === b
                  ? b === "BULLISH" ? "bg-green-500/30 border-green-500 text-green-300"
                    : b === "BEARISH" ? "bg-red-500/30 border-red-500 text-red-300"
                    : "bg-blue-500/30 border-blue-500 text-blue-300"
                  : "bg-white/5 border-white/20 text-white/40 hover:bg-white/10"
              }`}>
              {b === "AUTO" ? "🤖 Auto" : b === "BULLISH" ? "📈 Bullish (CE)" : "📉 Bearish (PE)"}
            </button>
          ))}
          {expertBias !== "AUTO" && (
            <span className="text-[9px] text-yellow-400/80 ml-1">⚡ Expert override active</span>
          )}
        </div>

        {/* Overall bias */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{outlook === "BULLISH" ? "📈" : outlook === "BEARISH" ? "📉" : "↔️"}</span>
            <div>
              <div className={`text-lg font-extrabold ${outlookColor}`}>Market Outlook: {outlook}</div>
              <div className="text-xs text-white/50">
                {expertBias !== "AUTO"
                  ? `Expert trader analysis → ${expertBias} → Buy ${expertBias === "BEARISH" ? "PE" : "CE"} options`
                  : `Score ${overallBull >= 0 ? "+" : ""}${overallBull} = India ${todayScore >= 0 ? "+" : ""}${todayScore} (×${todayWeight}) · Global ${globalScore >= 0 ? "+" : ""}${globalScore} (×${globalWeight}) · Signals ${domesticScore >= 0 ? "+" : ""}${domesticScore}`}
              </div>
            </div>
          </div>
          <div className="flex gap-3 text-xs">
            <div className="bg-white/5 rounded-lg px-3 py-2 text-center">
              <div className="text-[9px] text-white/40 uppercase">Today India</div>
              <div className={`font-bold ${todayIndiaBias === "BULLISH" ? "text-green-400" : todayIndiaBias === "BEARISH" ? "text-red-400" : "text-yellow-400"}`}>
                {todayIndiaBias} ({avgIndiaChange >= 0 ? "+" : ""}{avgIndiaChange.toFixed(2)}%)
              </div>
            </div>
            <div className="bg-white/5 rounded-lg px-3 py-2 text-center">
              <div className="text-[9px] text-white/40 uppercase">Global Cue</div>
              <div className={`font-bold ${globalBias === "BULLISH" ? "text-green-400" : globalBias === "BEARISH" ? "text-red-400" : "text-yellow-400"}`}>
                {globalBias} ({avgGlobalChange >= 0 ? "+" : ""}{avgGlobalChange.toFixed(2)}%)
              </div>
            </div>
            <div className="bg-white/5 rounded-lg px-3 py-2 text-center">
              <div className="text-[9px] text-white/40 uppercase">Domestic Signals</div>
              <div className={`font-bold ${domesticBias === "BULLISH" ? "text-green-400" : domesticBias === "BEARISH" ? "text-red-400" : "text-yellow-400"}`}>
                {domesticBias} ({buyCount}B / {sellCount}S)
              </div>
            </div>
          </div>
        </div>

        {/* Global markets summary */}
        <div>
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1">Global Markets (Closing)</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {globalIdx.map(g => {
              const up = (g.change ?? 0) >= 0;
              return (
                <div key={g.id} className={`rounded-lg px-2 py-1.5 text-center ${up ? "bg-green-950/30 border border-green-800/30" : "bg-red-950/30 border border-red-800/30"}`}>
                  <div className="text-[9px] text-white/60 truncate">{g.name}</div>
                  <div className={`text-xs font-bold ${up ? "text-green-400" : "text-red-400"}`}>
                    {up ? "▲" : "▼"} {pct(g.change)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* All-strategies consensus per India index (auto-refresh every 60s) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">🤖 All-Strategies Consensus per Index</div>
            <div className="text-[9px] text-white/40">
              {ensembleTickAt > 0 ? `Updated ${new Date(ensembleTickAt).toLocaleTimeString("en-IN", { hour12: false })} · refresh every 30s` : "Loading…"}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {indiaTargets.map(t => {
              const e = ensemble[t.id];
              if (!e) return (
                <div key={t.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-center">
                  <div className="text-[10px] text-white/50 font-bold">{t.name}</div>
                  <div className="text-[10px] text-white/30 mt-1">⏳ computing…</div>
                </div>
              );
              const topColor = e.top === "BUY" ? "text-green-400 border-green-500/40 bg-green-950/20" : e.top === "SELL" ? "text-red-400 border-red-500/40 bg-red-950/20" : "text-yellow-400 border-yellow-500/40 bg-yellow-950/20";
              return (
                <div key={t.id} className={`rounded-lg border ${topColor} p-2`}>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-white/70 font-bold truncate">{t.name}</div>
                    <div className="text-[9px] text-white/40">{e.total} strat</div>
                  </div>
                  <div className={`text-base font-extrabold ${e.top === "BUY" ? "text-green-400" : e.top === "SELL" ? "text-red-400" : "text-yellow-400"}`}>
                    {e.top === "BUY" ? "📈 BUY" : e.top === "SELL" ? "📉 SELL" : "↔ HOLD"} <span className="text-xs text-white/60">({e.confidence}%)</span>
                  </div>
                  <div className="mt-1 flex gap-1 text-[10px] font-mono">
                    <span className="px-1.5 py-0.5 rounded bg-green-900/40 text-green-300 font-bold">B {e.buys}</span>
                    <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-300 font-bold">S {e.sells}</span>
                    <span className="px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-300 font-bold">H {e.holds}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex">
                    <div className="h-full bg-green-500" style={{ width: `${(e.buys / e.total) * 100}%` }} />
                    <div className="h-full bg-yellow-500" style={{ width: `${(e.holds / e.total) * 100}%` }} />
                    <div className="h-full bg-red-500" style={{ width: `${(e.sells / e.total) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Per-strategy verdict matrix */}
          {Object.keys(ensemble).length > 0 && (
            <details className="mt-2 group">
              <summary className="cursor-pointer text-[10px] text-white/50 hover:text-white/80 font-bold uppercase tracking-wider select-none">▾ Per-strategy verdicts (click to expand)</summary>
              <div className="mt-2 overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr className="bg-white/5 text-white/60 text-[10px]">
                      <th className="py-1.5 px-2 text-left">Strategy</th>
                      {indiaTargets.map(t => (<th key={t.id} className="py-1.5 px-2 text-center">{t.id}</th>))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(() => {
                      // Union of all strategy ids across indices
                      const allIds = new Map<string, string>();
                      for (const e of Object.values(ensemble)) for (const v of e.verdicts) allIds.set(v.id, v.name);
                      return Array.from(allIds.entries()).map(([sid, sname]) => (
                        <tr key={sid} className="hover:bg-white/5">
                          <td className="py-1 px-2 text-white/80 font-bold">{sname}</td>
                          {indiaTargets.map(t => {
                            const v = ensemble[t.id]?.verdicts.find(x => x.id === sid);
                            const a = String(v?.action ?? "—").toUpperCase();
                            const cls = a === "BUY" || a === "ENTER_LONG" || a === "LONG" ? "text-green-400" : a === "SELL" || a === "ENTER_SHORT" || a === "SHORT" || a === "EXIT_LONG" ? "text-red-400" : a === "HOLD" ? "text-yellow-400" : "text-white/30";
                            return (<td key={t.id} className={`py-1 px-2 text-center font-bold ${cls}`} title={v?.reason ?? ""}>{a}</td>);
                          })}
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>

        {/* Index-wise predictions */}
        <div>
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2">Index Predictions — Key Levels for Tomorrow</div>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/5 text-white/70 border-b border-white/10">
                  <th className="py-2 px-3 text-left font-bold">Index</th>
                  <th className="py-2 px-2 text-center font-bold">Signal</th>
                  <th className="py-2 px-2 text-center font-bold">All-Strat</th>
                  <th className="py-2 px-2 text-right font-bold">Today Close</th>
                  <th className="py-2 px-2 text-right font-bold text-green-400">Support</th>
                  <th className="py-2 px-2 text-right font-bold text-red-400">Resistance</th>
                  <th className="py-2 px-2 text-right font-bold text-emerald-400">Entry</th>
                  <th className="py-2 px-2 text-right font-bold text-rose-400">Stop Loss</th>
                  <th className="py-2 px-2 text-right font-bold text-cyan-400">Target</th>
                  <th className="py-2 px-2 text-center font-bold">Strength</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {indexPredictions.map(ip => {
                  const up = ip.change >= 0;
                  return (
                    <tr key={ip.id} className="hover:bg-white/5">
                      <td className="py-2 px-3 font-bold text-white">{ip.name}</td>
                      <td className="py-2 px-2 text-center"><Badge signal={ip.sigDir} /></td>
                      <td className="py-2 px-2 text-center">
                        {ip.ens ? (
                          <span title={`${ip.ens.buys}B / ${ip.ens.sells}S / ${ip.ens.holds}H of ${ip.ens.total}`} className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${ip.ens.top === "BUY" ? "bg-green-900/50 text-green-300" : ip.ens.top === "SELL" ? "bg-red-900/50 text-red-300" : "bg-yellow-900/40 text-yellow-300"}`}>
                            {ip.ens.top} {ip.ens.confidence}%
                          </span>
                        ) : <span className="text-white/30 text-[10px]">—</span>}
                      </td>
                      <td className={`py-2 px-2 text-right font-mono font-bold ${up ? "text-green-400" : "text-red-400"}`}>
                        {ip.price > 0 ? ip.price.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-green-400 font-bold text-[11px]">{ip.supportStr}</td>
                      <td className="py-2 px-2 text-right font-mono text-red-400 font-bold text-[11px]">{ip.resistanceStr}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-emerald-400">{ip.entry > 0 ? INR(ip.entry) : "—"}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-rose-400">{ip.sl > 0 ? INR(ip.sl) : "—"}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-cyan-400">{ip.tgt > 0 ? INR(ip.tgt) : "—"}</td>
                      <td className="py-2 px-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          <div className="w-10 bg-white/5 rounded-full h-1 overflow-hidden">
                            <div style={{ width: `${ip.strength}%` }} className={`h-full ${ip.sigDir === "BUY" ? "bg-green-500" : ip.sigDir === "SELL" ? "bg-red-500" : "bg-yellow-500"}`} />
                          </div>
                          <span className="text-[9px] text-white/50">{ip.strength}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tomorrow's trade calls */}
        <div>
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2">Tomorrow&apos;s Recommended Calls {expertBias !== "AUTO" && <span className="text-yellow-400">({expertBias === "BEARISH" ? "PE" : "CE"} — Expert Override)</span>}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(expertBias !== "AUTO" ? indexPredictions.filter(ip => ip.price > 0) : indexPredictions.filter(ip => ip.sigDir === "BUY" || ip.sigDir === "SELL")).map(ip => {
              const isCall = expertBias === "BULLISH" ? true : expertBias === "BEARISH" ? false : ip.sigDir === "BUY";
              const tk = tickForSymbol(ip.id);
              const price = ip.entry > 0 ? ip.entry : ip.price;
              const strikeVal = price > 0 ? Math.round(price / tk) * tk + (isCall ? tk : -tk) : 0;
              const premium = price > 0 ? estimatePremium(price, strikeVal, isCall) : 0;
              const opts = estimateOptionSLTarget(premium, ip.strength || 60);
              const lo = Math.floor(premium / 5) * 5 || Math.floor(premium);
              const hi = lo + 5;
              const optType = isCall ? "CE" : "PE";
              const { expiryStr } = getNextExpiry(ip.id);

              return (
                <div key={ip.id} className={`rounded-xl p-3 border-2 font-mono text-sm ${isCall ? "border-green-500/60 bg-green-950/40" : "border-red-500/60 bg-red-950/40"}`}>
                  <div className={`font-extrabold text-sm leading-tight ${isCall ? "text-green-300" : "text-red-300"}`}>
                    {isCall ? "📈" : "📉"} {ip.id} {expiryStr} {optType} {(strikeVal ?? 0).toFixed(2)} @ {lo}-{hi}
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs">
                    <div className="text-red-400 font-extrabold">🛑 STOPLOSS: {opts.sl}</div>
                    <div className="text-cyan-300 font-extrabold">🎯 TARGETS: {opts.t1}-{opts.t2}-{opts.t3}</div>
                    {(() => {
                      const lot = getLotSize(ip.id) ?? getLotSize(ip.name);
                      return (
                        <div className="text-yellow-300 font-extrabold">
                          📦 LOT SIZE: {lot ? `${lot} qty/lot` : "—"} <span className="text-yellow-200/70 text-[10px] font-bold">· lots: {LOT_SIZES.join("/")}</span>
                        </div>
                      );
                    })()}
                  </div>
                  <button onClick={() => onBuyTrade?.({ symbol: ip.id, name: ip.name, type: optType as "CE" | "PE", strike: strikeVal, entryPremium: premium, sl: opts.sl, t1: opts.t1, t2: opts.t2, t3: opts.t3, lots: 1, expiry: expiryStr })} className="mt-2 w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-colors">📥 Buy &amp; Track</button>
                </div>
              );
            })}
            {(expertBias !== "AUTO" ? indexPredictions.filter(ip => ip.price > 0) : indexPredictions.filter(ip => ip.sigDir === "BUY" || ip.sigDir === "SELL")).length === 0 && (
              <div className="col-span-full text-center text-white/40 py-3 text-sm">⏸ No actionable index calls for tomorrow — market awaiting direction</div>
            )}
          </div>
        </div>

        {/* Strike-by-strike trade calls — directional (CE OR PE), locked until target/SL/strong reversal */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">📈 Active Trade Calls — Locked Direction per Index</div>
            <div className="text-[9px] text-white/40">⚡ Auto-flip on target/SL hit or 70%+ opposite consensus</div>
          </div>
          <div className="space-y-3">
            {indexOptions.filter(o => o.strikes?.strikes?.liveStrikes && o.strikes.strikes.liveStrikes.length > 0).map(o => {
              const live = o.strikes!.strikes.liveStrikes!;
              const atm = o.strikes!.strikes.atm ?? 0;
              const expiry = o.strikes!.strikes.expiry ?? "";
              const idxId = indexShortName(o.label);
              const lot = getLotSize(idxId) ?? getLotSize(o.label) ?? 0;
              const lock = activeSide[idxId];
              const e = ensemble[idxId];
              // Determine display side: locked > consensus > expert override > none
              const displaySide: "CE" | "PE" | null =
                lock?.side ??
                (e && e.confidence >= 50 && e.top === "BUY" ? "CE" : e && e.confidence >= 50 && e.top === "SELL" ? "PE" : null);
              const sideColor = displaySide === "CE" ? "text-green-400 bg-green-950/30 border-green-500/40" : displaySide === "PE" ? "text-rose-400 bg-rose-950/30 border-rose-500/40" : "text-yellow-400 bg-yellow-950/20 border-yellow-500/30";
              return (
                <div key={o.sym} className={`rounded-lg border ${displaySide ? "border-white/10" : "border-yellow-500/20"} bg-[#06101e]/60`}>
                  <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2 border-b border-white/5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-white">{o.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-bold">ATM {atm}</span>
                      {expiry && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-800/60 text-purple-300 font-bold">Exp {expiry}</span>}
                      {lot > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-800/60 text-yellow-200 font-bold">Lot {lot}</span>}
                      <span className={`text-[10px] px-2 py-0.5 rounded font-extrabold border ${sideColor}`}>
                        {displaySide ? `🎯 ${displaySide} ONLY` : "⏸ AWAITING DIRECTION"}
                      </span>
                      {e && <span className="text-[9px] text-white/50">Consensus {e.top} {e.confidence}%</span>}
                    </div>
                    {lock && (
                      <div className="text-[10px] font-mono text-white/70">
                        🔒 Locked {lock.side} {lock.strike} @ ₹{lock.entry.toFixed(2)} · SL ₹{lock.sl} · Tgt ₹{lock.target} · {lock.reason}
                      </div>
                    )}
                  </div>
                  {!displaySide ? (
                    <div className="px-3 py-4 text-center text-white/40 text-xs">⏳ No high-confidence direction yet — waiting for consensus ≥ 50% before issuing a call</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] font-mono">
                        <thead>
                          <tr className="bg-white/5 text-white/60 text-[10px]">
                            <th className="py-1.5 px-2 text-center bg-white/10 text-white font-extrabold">STRIKE</th>
                            <th className="py-1.5 px-2 text-right">{displaySide} OI</th>
                            <th className={`py-1.5 px-2 text-right ${displaySide === "CE" ? "text-green-400" : "text-rose-400"}`}>{displaySide} LTP</th>
                            <th className="py-1.5 px-2 text-right text-white/60">Moneyness</th>
                            <th className="py-1.5 px-2 text-right text-rose-300/70">SL</th>
                            <th className="py-1.5 px-2 text-right text-cyan-300/80">Target T1/T2/T3</th>
                            <th className="py-1.5 px-2 text-right text-white/50">R:R</th>
                            <th className="py-1.5 px-2 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {live.map((ls) => {
                            const isATM = ls.isATM;
                            const prem = displaySide === "CE" ? (ls.callLTP ?? 0) : (ls.putLTP ?? 0);
                            const oi = displaySide === "CE" ? ls.callOI : ls.putOI;
                            const opts = prem > 0 ? estimateOptionSLTarget(prem, e?.confidence ?? 60) : null;
                            // ITM/ATM/OTM tag
                            let moneyness = "—";
                            if (atm > 0) {
                              if (isATM) moneyness = "ATM";
                              else if (displaySide === "CE") moneyness = ls.strike < atm ? "ITM" : "OTM";
                              else moneyness = ls.strike > atm ? "ITM" : "OTM";
                            }
                            const rr = opts && prem > 0 ? ((opts.t2 - prem) / Math.max(1, prem - opts.sl)).toFixed(2) : "—";
                            const isLocked = lock && lock.side === displaySide && lock.strike === ls.strike;
                            return (
                              <tr key={ls.strike} className={isLocked ? "bg-emerald-900/20" : isATM ? "bg-amber-900/15" : "hover:bg-white/5"}>
                                <td className={`py-1.5 px-2 text-center font-extrabold ${isATM ? "text-amber-300" : "text-white"}`}>
                                  {ls.strike}
                                  {isATM && <span className="ml-1 text-[8px] px-1 rounded bg-amber-500/40">ATM</span>}
                                  {isLocked && <span className="ml-1 text-[8px] px-1 rounded bg-emerald-500/60 text-white">🔒</span>}
                                </td>
                                <td className="py-1.5 px-2 text-right text-white/60">{oi ? oi.toLocaleString("en-IN") : "—"}</td>
                                <td className={`py-1.5 px-2 text-right font-bold ${displaySide === "CE" ? "text-green-400" : "text-rose-400"}`}>{prem > 0 ? prem.toFixed(2) : "—"}</td>
                                <td className={`py-1.5 px-2 text-right font-bold text-[10px] ${moneyness === "ITM" ? "text-emerald-400" : moneyness === "ATM" ? "text-amber-300" : "text-white/50"}`}>{moneyness}</td>
                                <td className="py-1.5 px-2 text-right text-rose-300">{opts ? opts.sl : "—"}</td>
                                <td className="py-1.5 px-2 text-right text-cyan-300">{opts ? `${opts.t1}/${opts.t2}/${opts.t3}` : "—"}</td>
                                <td className="py-1.5 px-2 text-right text-white/50">{rr}</td>
                                <td className="py-1.5 px-2 text-center">
                                  {prem > 0 && opts && (
                                    <button
                                      onClick={() => onBuyTrade?.({ symbol: idxId, name: o.label, type: displaySide, strike: ls.strike, entryPremium: prem, sl: opts.sl, t1: opts.t1, t2: opts.t2, t3: opts.t3, lots: 1, expiry })}
                                      className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${displaySide === "CE" ? "bg-green-700 hover:bg-green-600" : "bg-rose-700 hover:bg-rose-600"}`}
                                      title={`Buy ${idxId} ${ls.strike} ${displaySide} @ ${prem}`}
                                    >+{displaySide}</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {indexOptions.filter(o => o.strikes?.strikes?.liveStrikes && o.strikes.strikes.liveStrikes.length > 0).length === 0 && (
              <div className="text-center text-white/40 py-4 text-sm rounded-lg border border-white/5 bg-white/5">⏳ Loading live option chain…</div>
            )}
          </div>
        </div>

        {/* SEBI compliance note — mandatory on every research call view */}
        <SebiSignalNote className="pt-2 border-t border-white/5" />

      </div>
    </section>
  );
}

/* ─────────────────── Index Option Card (auto-visible) ─────────────────── */

function IndexOptionCard({ opt, onChartClick, onBuyTrade }: { opt: { sym: string; label: string; signal: Signal | null; strikes: StrikesData | null; loading: boolean; error: string | null }; onChartClick?: (ct: ChartTarget) => void; onBuyTrade?: (t: Omit<TrackedTrade, "id" | "boughtAt" | "status">) => void }) {
  const sig = opt.signal;
  const st = opt.strikes;
  const rec = st?.recommendation;
  const strikeList = st?.strikes?.strikes ?? [];
  const atm = st?.strikes?.atm ?? 0;
  const tick = st?.strikes?.tick ?? 50;
  const spotPrice = st?.strikes?.price ?? Number(sig?.entryPrice ?? 0);
  const sigDir = String(sig?.signal ?? rec?.type ?? "HOLD").toUpperCase();
  const isBull = sigDir === "BUY" || sigDir === "BUY_CALL" || rec?.type === "BUY_CALL";
  const isBear = sigDir === "SELL" || sigDir === "BUY_PUT" || rec?.type === "BUY_PUT";
  const isCall = isBull;
  const strength = sig?.strength ?? 50;
  const idxName = indexShortName(opt.label);
  const liveStrikes: LiveStrike[] = st?.strikes?.liveStrikes ?? [];
  const isLive = st?.strikes?.live === true && liveStrikes.length > 0;
  const expiry = st?.strikes?.expiry ?? null;
  const liveIV = st?.strikes?.iv ?? null;
  const dte = st?.strikes?.daysToExpiry ?? null;
  const recStrike = rec?.strike ?? (isBull ? atm + tick : isBear ? atm - tick : atm);

  // Build a lookup for live strike data  
  const liveMap = new Map<number, LiveStrike>();
  for (const ls of liveStrikes) liveMap.set(ls.strike, ls);

  if (opt.loading) {
    return (
      <div className="rounded-xl border-2 border-white/20 bg-[#0a1628] p-5 animate-pulse">
        <div className="h-5 w-40 bg-white/15 rounded mb-3" />
        <div className="h-28 bg-white/8 rounded" />
      </div>
    );
  }
  if (opt.error) {
    return (
      <div className="rounded-xl border-2 border-red-500/60 bg-red-950/30 p-5">
        <span className="text-red-400 text-base font-bold">{opt.label}: {opt.error}</span>
      </div>
    );
  }

  // Get live premium for the recommended strike
  const recLive = liveMap.get(recStrike);
  const recLivePremium = recLive ? (isCall ? recLive.callLTP : recLive.putLTP) : null;

  const mainCall = spotPrice > 0 && (isBull || isBear)
    ? formatTradeCall(spotPrice, recStrike, isCall, idxName, strength, recLivePremium, expiry)
    : null;

  return (
    <div className={`rounded-xl border-2 p-3 sm:p-5 ${isBull ? "border-green-500/70 bg-gradient-to-r from-green-950/30 via-[#0a1628] to-[#0a1628]" : isBear ? "border-red-500/70 bg-gradient-to-r from-red-950/30 via-[#0a1628] to-[#0a1628]" : "border-yellow-500/50 bg-gradient-to-r from-yellow-950/20 via-[#0a1628] to-[#0a1628]"}`}>

      {/* HEADER */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="text-xl sm:text-2xl">{isBull ? "🟢" : isBear ? "🔴" : "🟡"}</span>
          <span className="font-extrabold text-base sm:text-xl text-white">{opt.label}</span>
          <span className={`text-[10px] sm:text-xs px-2 sm:px-3 py-0.5 sm:py-1 rounded-full font-extrabold tracking-wide ${isBull ? "bg-green-500 text-black shadow-lg shadow-green-500/40" : isBear ? "bg-red-500 text-white shadow-lg shadow-red-500/40" : "bg-yellow-500 text-black shadow-lg shadow-yellow-500/40"}`}>
            {isBull ? "BUY CALL" : isBear ? "BUY PUT" : "HOLD"}
          </span>
          {sig && <span className="text-[10px] sm:text-xs text-white/60">Str: {strength}%</span>}
          {isLive
            ? <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold animate-pulse">● LIVE</span>
            : <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-bold">EST</span>}
          {liveIV != null && <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-amber-800/60 text-amber-300 font-bold">IV {liveIV.toFixed(1)}%</span>}
          {dte != null && <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded bg-purple-800/60 text-purple-300 font-bold">{dte < 1 ? 'Expiry Day' : `${Math.round(dte)}d to Exp`}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[10px] sm:text-xs text-white/50 font-medium">SPOT</div>
            <div className="font-mono font-extrabold text-sm sm:text-lg text-white">₹{spotPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            {expiry && <div className="text-[9px] text-white/40">Exp: {expiry}</div>}
          </div>
          <button onClick={() => onChartClick?.({ symbol: opt.sym, name: opt.label, entry: sig?.entryPrice ?? null, sl: sig?.stopLoss ?? null, target: sig?.targetPrice ?? null, signal: sigDir, currentPrice: spotPrice || null })} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors text-lg" title="View chart">📊</button>
        </div>
      </div>

      {/* MAIN TRADE CALL */}
      {mainCall ? (
        <div className={`rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 border-2 font-mono shadow-xl ${isBull ? "border-green-400 bg-green-950/60 shadow-green-500/20" : "border-red-400 bg-red-950/60 shadow-red-500/20"}`}>
          <div className={`font-extrabold text-sm sm:text-xl leading-tight ${isBull ? "text-green-300" : "text-red-300"}`}>
            {isBull ? "📈" : "📉"} {mainCall.headline}
            {mainCall.isLivePremium && <span className="ml-2 text-[9px] px-1 py-0.5 bg-emerald-700 rounded text-emerald-200">LIVE</span>}
          </div>
          <div className="mt-2 space-y-0.5 sm:space-y-1 text-sm sm:text-base">
            <div className="text-red-400 font-extrabold">🛑 {mainCall.slLine}</div>
            <div className="text-cyan-300 font-extrabold">🎯 {mainCall.tgtLine}</div>
            <div className="text-yellow-300 font-extrabold">📦 {mainCall.lotLine}</div>
          </div>
          <button onClick={() => onBuyTrade?.({ symbol: opt.sym, name: idxName, type: mainCall.optType as "CE" | "PE", strike: mainCall.strikeVal, entryPremium: mainCall.premium, sl: mainCall.sl, t1: mainCall.t1, t2: mainCall.t2, t3: mainCall.t3, lots: 1, expiry: mainCall.expLabel })} className="mt-3 w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors shadow-lg shadow-blue-500/20">📥 Buy &amp; Track This Call</button>
        </div>
      ) : (
        <div className="rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 border-2 border-yellow-500/50 bg-yellow-950/30 font-mono">
          <div className="text-yellow-300 font-extrabold text-sm sm:text-lg">⏸ HOLD — No active trade for {idxName}</div>
          <div className="text-white/50 text-xs sm:text-sm mt-1">Waiting for a clear BUY/SELL signal from technical analysis…</div>
        </div>
      )}

      {/* STRIKE-WISE BREAKDOWN */}
      {strikeList.length > 0 && spotPrice > 0 && (isBull || isBear) && (
        <div className="overflow-x-auto rounded-lg border border-white/10 -mx-1 sm:mx-0">
          <table className="w-full text-[10px] sm:text-sm min-w-[520px]">
            <thead>
              <tr className="bg-white/5 text-white/80 border-b border-white/10">
                <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-left font-bold">Strike ₹</th>
                <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-center font-bold">Type</th>
                <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-bold text-green-400">LTP</th>
                {isLive && <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-bold text-purple-400">OI</th>}
                {isLive && <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-bold text-amber-400">IV%</th>}
                <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-bold text-green-400">Buy At</th>
                <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-bold text-red-400">SL</th>
                <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-bold text-cyan-400">T1</th>
                <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-bold text-cyan-300">T2</th>
                <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-bold text-cyan-200">T3+</th>
                <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-center font-bold text-yellow-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {strikeList.map((strike: number) => {
                const isAtmS = strike === atm;
                const isRecS = strike === recStrike;
                const otmCall = strike > atm;
                const otmPut = strike < atm;

                // Use live NSE data when available
                const liveRow = liveMap.get(strike);
                const liveLTP = liveRow ? (isCall ? liveRow.callLTP : liveRow.putLTP) : null;
                const liveOI = liveRow ? (isCall ? liveRow.callOI : liveRow.putOI) : 0;
                const liveIV = liveRow ? (isCall ? liveRow.callIV : liveRow.putIV) : null;

                // Premium: live LTP first, then Black-Scholes fallback
                const premium = liveLTP && liveLTP > 0 ? liveLTP : estimatePremium(spotPrice, strike, isCall);
                const opts = estimateOptionSLTarget(premium, strength);
                const lo = Math.floor(premium / 5) * 5 || Math.floor(premium);
                const hi = lo + 5;
                const label = isCall
                  ? (isRecS ? "★ BUY CE" : isAtmS ? "CE (ATM)" : otmCall ? "CE (OTM)" : "CE (ITM)")
                  : (isRecS ? "★ BUY PE" : isAtmS ? "PE (ATM)" : otmPut ? "PE (OTM)" : "PE (ITM)");

                return (
                  <tr key={strike} className={`${isRecS ? "bg-green-900/40 ring-1 ring-inset ring-green-400/50" : ""} ${isAtmS && !isRecS ? "bg-white/5" : ""} hover:bg-white/8 transition-colors`}>
                    <td className="py-1.5 sm:py-2 px-2 sm:px-3 font-mono font-extrabold text-white">
                      ₹{strike.toLocaleString()}
                      {isAtmS && <span className="ml-1 sm:ml-1.5 text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 bg-white/20 rounded text-white font-bold">ATM</span>}
                      {isRecS && <span className="ml-1 sm:ml-1.5 text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 bg-green-500 text-black rounded font-bold">★ REC</span>}
                    </td>
                    <td className="py-1.5 sm:py-2 px-1 sm:px-3 text-center font-bold">
                      {isCall
                        ? (otmCall ? <span className="text-green-400">OTM</span> : otmPut ? <span className="text-orange-400">ITM</span> : <span className="text-white">ATM</span>)
                        : (otmPut ? <span className="text-red-400">OTM</span> : otmCall ? <span className="text-orange-400">ITM</span> : <span className="text-white">ATM</span>)}
                    </td>
                    <td className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-mono font-extrabold text-white">
                      ₹{premium.toFixed(1)}
                    </td>
                    {isLive && (
                      <td className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-mono text-purple-300">
                        {liveOI > 0 ? (liveOI >= 100000 ? (liveOI / 100000).toFixed(1) + "L" : liveOI.toLocaleString()) : "—"}
                      </td>
                    )}
                    {isLive && (
                      <td className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-mono text-amber-300">
                        {liveIV != null && liveIV > 0 ? liveIV.toFixed(1) + "%" : "—"}
                      </td>
                    )}
                    <td className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-mono font-extrabold text-green-400">{lo}-{hi}</td>
                    <td className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-mono font-extrabold text-red-400">{opts.sl}</td>
                    <td className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-mono font-extrabold text-cyan-400">{opts.t1}</td>
                    <td className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-mono font-extrabold text-cyan-300">{opts.t2}</td>
                    <td className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-mono font-extrabold text-cyan-200">{opts.t3}+</td>
                    <td className={`py-1.5 sm:py-2 px-1 sm:px-3 text-center text-[10px] sm:text-xs font-extrabold ${isRecS ? "text-green-300" : "text-white/60"}`}>
                      {label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Reason */}
      {rec?.reason && <div className="mt-3 text-sm text-white/60 italic">💡 {rec.reason}</div>}
      {sig?.reason && <div className="mt-1 text-xs text-white/40">📊 {sig.reason}</div>}
    </div>
  );
}
