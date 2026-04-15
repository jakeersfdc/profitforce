"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

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

type StrikesData = {
  strikes: { atm: number; tick: number; strikes: number[]; price: number };
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

const LOT_SIZES = [1, 3, 5, 10, 20, 30, 40];

function indexShortName(label: string) {
  if (label.includes("NIFTY 50") || label.includes("NSEI")) return "NIFTY";
  if (label.includes("BANK") || label.includes("NSEBANK")) return "BANKNIFTY";
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
) {
  const strikeVal = strike ?? Math.round(spot / 50) * 50;
  const premium = estimatePremium(spot, strikeVal, isCall);
  const { sl, t1, t2, t3 } = estimateOptionSLTarget(premium, strength);
  const lo = Math.floor(premium / 5) * 5;
  const hi = lo + 5;
  const optType = isCall ? "CE" : "PE";
  const dir = isCall ? "BUY" : "BUY";
  return {
    headline: `${dir} ${indexName} ${strikeVal}${optType} @ ${lo}-${hi}`,
    premium,
    slLine: `SL ${sl}`,
    tgtLine: `TGT ${t1}/${t2}/${t3}++++`,
    lotLine: `LOT ${LOT_SIZES.join("/")}`,
    sl, t1, t2, t3,
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

const INDIA_IDS = ["NIFTY", "SENSEX", "BANKNIFTY"];
const GLOBAL_IDS = ["DOWJ", "SP500", "NASDAQ", "FTSE", "NIKKEI", "HANGSENG"];

const ALL_INDICES: IndexData[] = [
  { sym: "^NSEI", name: "NIFTY 50", price: null, change: null, id: "NIFTY" },
  { sym: "^BSESN", name: "SENSEX", price: null, change: null, id: "SENSEX" },
  { sym: "^NSEBANK", name: "BANK NIFTY", price: null, change: null, id: "BANKNIFTY" },
  { sym: "^DJI", name: "DOW JONES", price: null, change: null, id: "DOWJ" },
  { sym: "^GSPC", name: "S&P 500", price: null, change: null, id: "SP500" },
  { sym: "^IXIC", name: "NASDAQ", price: null, change: null, id: "NASDAQ" },
  { sym: "^FTSE", name: "FTSE 100", price: null, change: null, id: "FTSE" },
  { sym: "^N225", name: "NIKKEI 225", price: null, change: null, id: "NIKKEI" },
  { sym: "^HSI", name: "HANG SENG", price: null, change: null, id: "HANGSENG" },
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

  /* index options: auto-fetched for NIFTY, SENSEX, BANKNIFTY */
  type IndexOption = { sym: string; label: string; signal: Signal | null; strikes: StrikesData | null; loading: boolean; error: string | null };
  const [indexOptions, setIndexOptions] = useState<IndexOption[]>([
    { sym: "^NSEI", label: "NIFTY 50", signal: null, strikes: null, loading: true, error: null },
    { sym: "^BSESN", label: "SENSEX", signal: null, strikes: null, loading: true, error: null },
    { sym: "^NSEBANK", label: "BANK NIFTY", signal: null, strikes: null, loading: true, error: null },
  ]);

  const streamRef = useRef<EventSource | null>(null);
  const prevPrices = useRef<Record<string, number>>({});

  /* ── auto-fetch index options on mount + every 30s ── */
  useEffect(() => {
    const fetchIndexStrikes = async () => {
      const syms = ["^NSEI", "^BSESN", "^NSEBANK"];
      const labels = ["NIFTY 50", "SENSEX", "BANK NIFTY"];
      const results = await Promise.all(
        syms.map(async (sym, i) => {
          try {
            const [sigRes, stRes] = await Promise.all([
              fetch(`/api/signal?symbol=${encodeURIComponent(sym)}`),
              fetch(`/api/strikes?symbol=${encodeURIComponent(sym)}&pads=3`),
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
    const interval = setInterval(fetchIndexStrikes, 1_000);
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

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="px-2 sm:px-3 py-2 space-y-3 sm:space-y-4 text-sm">

      {/* ━━━ TOP HEADER ━━━ */}
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className="text-base sm:text-lg font-extrabold tracking-tight">⚡ ProfitForce</h1>
          <span className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold ${isMarketOpen ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/40" : "bg-red-500/20 text-red-400 ring-1 ring-red-500/40"}`}>
            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${isMarketOpen ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            {marketStatus}
          </span>
          {lastRefresh && <span className="text-[10px] text-white/40">Updated {lastRefresh}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setSoundOn(!soundOn)} className="p-1.5 rounded hover:bg-white/10 text-white/50 text-xs" title="Toggle sound">
            {soundOn ? "🔔" : "🔕"}
          </button>
          <button onClick={forceRefresh} className="p-1.5 rounded hover:bg-white/10 text-white/50 text-xs" title="Refresh">↻</button>
        </div>
      </header>

      {/* ━━━ INDIA INDICES ━━━ */}
      <section>
        <h2 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2">India Markets</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          {indiaIdx.map((idx) => <IndexCard key={idx.id} idx={idx} fl={flash[idx.id]} />)}
        </div>
      </section>

      {/* ━━━ GLOBAL INDICES ━━━ */}
      <section>
        <h2 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2">Global Markets</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {globalIdx.map((idx) => <IndexCardSmall key={idx.id} idx={idx} fl={flash[idx.id]} />)}
        </div>
      </section>

      {/* ━━━ INDEX OPTIONS: NIFTY / SENSEX / BANKNIFTY ━━━ */}
      <section>
        <h2 className="text-sm font-extrabold text-white uppercase tracking-wider mb-3">📈 Index Options — Strike Prices & Trade Calls</h2>
        <div className="space-y-3">
          {indexOptions.map((opt) => (
            <IndexOptionCard key={opt.sym} opt={opt} />
          ))}
        </div>
      </section>

      {/* ━━━ MAIN CONTENT ━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── SIGNALS TABLE (2/3) ── */}
        <section className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
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
                    <th className="px-2 py-2 text-center font-medium">Str</th>
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
                          <td className="px-2 py-2 text-center">
                            <div className="inline-flex items-center gap-1">
                              <div className="w-12 bg-white/5 rounded-full h-1 overflow-hidden">
                                <div style={{ width: `${row.strength}%` }} className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" />
                              </div>
                              <span className="text-[9px] text-[var(--bf-muted)]">{row.strength}%</span>
                            </div>
                          </td>
                        </tr>

                        {/* ── EXPANDED: Strike prices ── */}
                        {exp && (
                          <tr>
                            <td colSpan={8} className="p-0">
                              <div className="bg-[#060e1a] border-t border-b border-white/8 p-3">
                                {strikesLoading === row.symbol ? (
                                  <div className="flex items-center justify-center py-4 gap-2 text-[var(--bf-muted)]">
                                    <div className="w-4 h-4 border-2 border-t-transparent border-emerald-400 rounded-full animate-spin" />
                                    Loading strikes…
                                  </div>
                                ) : strikesCache[row.symbol] ? (
                                  <StrikePanel data={strikesCache[row.symbol]} signal={row} />
                                ) : (
                                  <div className="text-center py-3 text-[var(--bf-muted)]">No strike data</div>
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
                    <tr><td colSpan={8} className="text-center py-6 text-[var(--bf-muted)]">Waiting for signals…</td></tr>
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
                      <span>R:R {rr}</span>
                      <span>{row.strength}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── LIVE ALERTS PANEL (1/3) ── */}
        <section className="space-y-2">
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
                    const strikeVal = aSpot > 0 ? Math.round(aSpot / 50) * 50 + (isBuyAlert ? 50 : -50) : 0;
                    const premium = aSpot > 0 ? estimatePremium(aSpot, strikeVal, isCall) : 0;
                    const opts = estimateOptionSLTarget(premium, 60);
                    const lo = Math.floor(premium / 5) * 5 || Math.floor(premium);
                    const hi = lo + 5;
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
                              🚀 {dir} {shortIdx} {strikeVal}{isBuyAlert ? "CE" : "PE"} @ {lo}-{hi}
                            </div>
                            <div className="text-red-400 font-extrabold mt-1">🛑 SL {opts.sl}</div>
                            <div className="text-cyan-300 font-extrabold">🎯 TGT {opts.t1}/{opts.t2}/{opts.t3}++++</div>
                            <div className="text-yellow-300 font-extrabold">📦 LOT {LOT_SIZES.join("/")}</div>
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
      </div>

      {/* ━━━ TOAST ━━━ */}
      {toast && (
        <div className="fixed right-3 top-3 z-50 max-w-sm">
          <div className={`px-5 py-3 rounded-xl shadow-2xl text-sm font-bold border-2
            ${toast.type === "success" ? "bg-green-900 border-green-400 text-green-200 shadow-green-500/30" : toast.type === "error" ? "bg-red-900 border-red-400 text-red-200 shadow-red-500/30" : "bg-cyan-900 border-cyan-400 text-cyan-200 shadow-cyan-500/30"}`}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Index Cards ─────────────────── */

function IndexCard({ idx, fl }: { idx: IndexData; fl?: "up" | "down" }) {
  const up = (idx.change ?? 0) >= 0;
  const p = pts(idx.price, idx.change);
  return (
    <div className={`rounded-xl p-4 border-2 transition-all duration-300 ${fl === "up" ? "ring-2 ring-green-400 scale-[1.02]" : fl === "down" ? "ring-2 ring-red-400 scale-[1.02]" : ""} ${up ? "border-green-500/50 bg-gradient-to-br from-green-950/40 to-[#071026]" : "border-red-500/50 bg-gradient-to-br from-red-950/40 to-[#071026]"}`}>
      <div className="text-xs font-bold text-white/80 tracking-wider">{idx.name}</div>
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

function IndexCardSmall({ idx, fl }: { idx: IndexData; fl?: "up" | "down" }) {
  const up = (idx.change ?? 0) >= 0;
  const p = pts(idx.price, idx.change);
  return (
    <div className={`rounded-lg p-2.5 border transition-all duration-300 ${fl === "up" ? "ring-1 ring-green-400" : fl === "down" ? "ring-1 ring-red-400" : ""} ${up ? "border-green-600/40 bg-green-950/20" : "border-red-600/40 bg-red-950/20"}`}>
      <div className="text-[10px] text-white/70 truncate font-medium">{idx.name}</div>
      <div className={`text-sm font-extrabold tabular-nums ${up ? "text-green-400" : "text-red-400"}`}>
        {idx.price != null ? idx.price.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}
      </div>
      <div className={`text-[10px] font-bold ${up ? "text-green-300" : "text-red-300"}`}>
        {up ? "▲" : "▼"} {pct(idx.change)}
        {p != null && <span className="ml-1 text-white/60">({up ? "+" : ""}{p.toFixed(2)})</span>}
      </div>
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
          <div className="font-bold text-sm">₹{underlying.toFixed(2)}</div>
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

/* ─────────────────── Index Option Card (auto-visible) ─────────────────── */

function IndexOptionCard({ opt }: { opt: { sym: string; label: string; signal: Signal | null; strikes: StrikesData | null; loading: boolean; error: string | null } }) {
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
  const recStrike = rec?.strike ?? (isBull ? atm + tick : isBear ? atm - tick : atm);

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

  const mainCall = spotPrice > 0 && (isBull || isBear)
    ? formatTradeCall(spotPrice, recStrike, isCall, idxName, strength)
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
        </div>
        <div className="text-right">
          <div className="text-[10px] sm:text-xs text-white/50 font-medium">SPOT</div>
          <div className="font-mono font-extrabold text-sm sm:text-lg text-white">₹{spotPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* MAIN TRADE CALL */}
      {mainCall ? (
        <div className={`rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 border-2 font-mono shadow-xl ${isBull ? "border-green-400 bg-green-950/60 shadow-green-500/20" : "border-red-400 bg-red-950/60 shadow-red-500/20"}`}>
          <div className={`font-extrabold text-sm sm:text-xl leading-tight ${isBull ? "text-green-300" : "text-red-300"}`}>
            🚀 {mainCall.headline}
          </div>
          <div className="mt-2 space-y-0.5 sm:space-y-1 text-sm sm:text-base">
            <div className="text-red-400 font-extrabold">🛑 {mainCall.slLine}</div>
            <div className="text-cyan-300 font-extrabold">🎯 {mainCall.tgtLine}</div>
            <div className="text-yellow-300 font-extrabold">📦 {mainCall.lotLine}</div>
          </div>
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
          <table className="w-full text-[10px] sm:text-sm min-w-[500px]">
            <thead>
              <tr className="bg-white/5 text-white/80 border-b border-white/10">
                <th className="py-1.5 sm:py-2 px-2 sm:px-3 text-left font-bold">Strike ₹</th>
                <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-center font-bold">Type</th>
                <th className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-bold text-green-400">Premium</th>
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
                const premium = estimatePremium(spotPrice, strike, isCall);
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
                    <td className="py-1.5 sm:py-2 px-1 sm:px-3 text-right font-mono font-extrabold text-white">₹{premium.toFixed(1)}</td>
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
