"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createChart, IChartApi, LineStyle } from "lightweight-charts";
import { useAuth } from "@/components/AuthProvider";

/* ═══════════════════════════════════════════════════════
   TRADING TABS — Watchlist · Orders · Portfolio · Positions · Market
   Modeled after Groww / Angel One / Upstox
   ═══════════════════════════════════════════════════════ */

const INR = (v: number | null | undefined) => {
  if (v == null) return "—";
  return "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/* ─── Types ─── */
type WatchlistStock = { symbol: string; name: string; price: number | null; change: number | null; changePct: number | null; signal?: string; strength?: number };
type OrderItem = { id: string; symbol: string; side: "BUY" | "SELL"; qty: number; type: string; price: number | null; filledPrice: number | null; status: string; createdAt: string; dryRun?: boolean };
type HoldingItem = { symbol: string; name: string; qty: number; avgPrice: number; currentPrice: number | null; pnl: number; pnlPct: number; investedValue: number; currentValue: number };
type PositionItem = { symbol: string; name: string; side: "LONG" | "SHORT"; qty: number; entryPrice: number; currentPrice: number | null; pnl: number; pnlPct: number; sl: number | null; target: number | null };
type MarketStock = { symbol: string; name: string; price: number | null; change: number | null; changePct: number | null; signal?: string; strength?: number; sector?: string };

/* ─── Popular Stocks ─── */
const POPULAR_STOCKS: { symbol: string; name: string; sector: string }[] = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries", sector: "Energy" },
  { symbol: "TCS.NS", name: "TCS", sector: "IT" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", sector: "Banking" },
  { symbol: "INFY.NS", name: "Infosys", sector: "IT" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", sector: "Banking" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever", sector: "FMCG" },
  { symbol: "SBIN.NS", name: "SBI", sector: "Banking" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "ITC.NS", name: "ITC", sector: "FMCG" },
  { symbol: "KOTAKBANK.NS", name: "Kotak Bank", sector: "Banking" },
  { symbol: "LT.NS", name: "L&T", sector: "Infra" },
  { symbol: "AXISBANK.NS", name: "Axis Bank", sector: "Banking" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors", sector: "Auto" },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki", sector: "Auto" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharma", sector: "Pharma" },
  { symbol: "WIPRO.NS", name: "Wipro", sector: "IT" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", sector: "Finance" },
  { symbol: "TATASTEEL.NS", name: "Tata Steel", sector: "Metals" },
  { symbol: "ADANIENT.NS", name: "Adani Enterprises", sector: "Conglomerate" },
  { symbol: "POWERGRID.NS", name: "Power Grid", sector: "Power" },
  { symbol: "NTPC.NS", name: "NTPC", sector: "Power" },
  { symbol: "ONGC.NS", name: "ONGC", sector: "Energy" },
  { symbol: "JSWSTEEL.NS", name: "JSW Steel", sector: "Metals" },
  { symbol: "TECHM.NS", name: "Tech Mahindra", sector: "IT" },
  { symbol: "HCLTECH.NS", name: "HCL Tech", sector: "IT" },
  { symbol: "ULTRACEMCO.NS", name: "UltraTech Cement", sector: "Cement" },
  { symbol: "TITAN.NS", name: "Titan", sector: "Consumer" },
  { symbol: "ASIANPAINT.NS", name: "Asian Paints", sector: "Consumer" },
  { symbol: "BAJAJFINSV.NS", name: "Bajaj Finserv", sector: "Finance" },
  { symbol: "COALINDIA.NS", name: "Coal India", sector: "Mining" },
];

const SECTORS = ["All", "Banking", "IT", "FMCG", "Energy", "Auto", "Pharma", "Finance", "Metals", "Infra", "Power", "Telecom", "Consumer", "Cement", "Conglomerate", "Mining"];

/* ═══════════════════════════════════════════════════════
   MAIN TAB COMPONENT
   ═══════════════════════════════════════════════════════ */

export type TradingTab = "watchlist" | "orders" | "portfolio" | "positions" | "market";

interface TradingTabsProps {
  activeTab: TradingTab;
  onTabChange: (tab: TradingTab) => void;
  onChartClick?: (symbol: string, name: string) => void;
}

export function TradingTabBar({ activeTab, onTabChange }: { activeTab: TradingTab; onTabChange: (t: TradingTab) => void }) {
  const tabs: { id: TradingTab; label: string; icon: string }[] = [
    { id: "watchlist", label: "Watchlist", icon: "⭐" },
    { id: "orders", label: "Orders", icon: "📋" },
    { id: "portfolio", label: "Portfolio", icon: "💼" },
    { id: "positions", label: "Positions", icon: "📊" },
    { id: "market", label: "Market", icon: "🏪" },
  ];
  return (
    <nav className="flex border-b border-gray-700/50 overflow-x-auto scrollbar-hide">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onTabChange(t.id)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === t.id
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          <span>{t.icon}</span>
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function TradingTabContent({ activeTab, onChartClick }: TradingTabsProps) {
  switch (activeTab) {
    case "watchlist":
      return <WatchlistTab onChartClick={onChartClick} />;
    case "orders":
      return <OrdersTab />;
    case "portfolio":
      return <PortfolioTab onChartClick={onChartClick} />;
    case "positions":
      return <PositionsTab onChartClick={onChartClick} />;
    case "market":
      return <MarketTab onChartClick={onChartClick} />;
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════
   1. WATCHLIST TAB
   ═══════════════════════════════════════════════════════ */

function WatchlistTab({ onChartClick }: { onChartClick?: (symbol: string, name: string) => void }) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [stocks, setStocks] = useState<WatchlistStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSymbol, setAddSymbol] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<typeof POPULAR_STOCKS>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [orderModal, setOrderModal] = useState<WatchlistStock | null>(null);

  // Fetch watchlist
  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist");
      const json = await res.json();
      setSymbols(json.symbols ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  // Fetch prices for watchlist symbols
  useEffect(() => {
    if (symbols.length === 0) { setStocks([]); return; }
    const fetchPrices = async () => {
      const results: WatchlistStock[] = [];
      // Batch fetch using signal endpoint
      try {
        const res = await fetch(`/api/scan?symbols=${symbols.join(",")}&limit=50`);
        const json = await res.json();
        const allResults = [...(json.results ?? []), ...(json.all ?? [])];
        for (const sym of symbols) {
          const match = allResults.find((r: any) => r.symbol === sym);
          const stock = POPULAR_STOCKS.find(p => p.symbol === sym);
          results.push({
            symbol: sym,
            name: match?.name || stock?.name || sym.replace(".NS", ""),
            price: match?.entryPrice ?? match?.currentPrice ?? null,
            change: match?.change ?? null,
            changePct: match?.changePct ?? null,
            signal: match?.signal,
            strength: match?.strength,
          });
        }
      } catch {}
      setStocks(results);
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 30000);
    return () => clearInterval(iv);
  }, [symbols]);

  const addToWatchlist = async (sym: string) => {
    setAddLoading(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      const json = await res.json();
      if (json.ok) { setSymbols(json.symbols); setAddSymbol(""); setShowSearch(false); }
    } catch {}
    setAddLoading(false);
  };

  const removeFromWatchlist = async (sym: string) => {
    try {
      const res = await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym }),
      });
      const json = await res.json();
      if (json.ok) setSymbols(json.symbols);
    } catch {}
  };

  // Search filter
  useEffect(() => {
    if (!addSymbol.trim()) { setSearchResults([]); return; }
    const q = addSymbol.toUpperCase();
    setSearchResults(POPULAR_STOCKS.filter(s => (s.symbol.includes(q) || s.name.toUpperCase().includes(q)) && !symbols.includes(s.symbol)).slice(0, 8));
  }, [addSymbol, symbols]);

  return (
    <div className="p-3 space-y-4">
      {/* Add Stock Search */}
      <div className="relative">
        <div className="flex gap-2">
          <input
            type="text"
            value={addSymbol}
            onChange={(e) => { setAddSymbol(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            placeholder="Search stocks to add... (e.g. RELIANCE, TCS)"
            className="flex-1 px-3 py-2 rounded-lg bg-[#0d1626] border border-gray-700/50 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          {addSymbol && (
            <button
              onClick={() => addToWatchlist(addSymbol.toUpperCase().includes(".NS") ? addSymbol.toUpperCase() : addSymbol.toUpperCase() + ".NS")}
              disabled={addLoading}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
            >
              {addLoading ? "..." : "+ Add"}
            </button>
          )}
        </div>
        {/* Search Dropdown */}
        {showSearch && searchResults.length > 0 && (
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-[#0d1626] border border-gray-700/50 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
            {searchResults.map(s => (
              <button
                key={s.symbol}
                onClick={() => addToWatchlist(s.symbol)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 text-left"
              >
                <div>
                  <span className="text-white text-sm font-bold">{s.name}</span>
                  <span className="text-gray-500 text-xs ml-2">{s.symbol.replace(".NS", "")}</span>
                </div>
                <span className="text-xs text-gray-500">{s.sector}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stock List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading watchlist...</div>
      ) : stocks.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-3">⭐</div>
          <h3 className="text-white font-bold">Your watchlist is empty</h3>
          <p className="text-gray-500 text-sm mt-1">Search and add stocks above to start tracking</p>
          {/* Quick add popular */}
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {POPULAR_STOCKS.slice(0, 8).map(s => (
              <button
                key={s.symbol}
                onClick={() => addToWatchlist(s.symbol)}
                className="px-3 py-1.5 rounded-lg bg-[#0d1626] border border-gray-700/50 text-gray-400 text-xs hover:border-blue-500 hover:text-white transition-colors"
              >
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {stocks.map((s) => {
            const isUp = (s.change ?? 0) >= 0;
            return (
              <div key={s.symbol} className="flex items-center justify-between p-3 rounded-xl bg-[#0d1626] border border-gray-700/30 hover:border-gray-600/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button onClick={() => onChartClick?.(s.symbol, s.name)} className="text-gray-400 hover:text-blue-400" title="Chart">📊</button>
                  <div className="min-w-0">
                    <div className="text-white font-bold text-sm truncate">{s.name}</div>
                    <div className="text-gray-500 text-[10px]">{s.symbol.replace(".NS", "")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {s.signal && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      s.signal === "BUY" ? "bg-green-500/20 text-green-400" :
                      s.signal === "SELL" ? "bg-red-500/20 text-red-400" :
                      "bg-gray-500/20 text-gray-400"
                    }`}>{s.signal}</span>
                  )}
                  <div className="text-right">
                    <div className="text-white font-bold text-sm">{INR(s.price)}</div>
                    <div className={`text-[10px] font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>
                      {isUp ? "▲" : "▼"} {s.changePct != null ? `${s.changePct.toFixed(2)}%` : "—"}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setOrderModal(s)} className="px-2 py-1 rounded bg-green-600/20 text-green-400 text-[10px] font-bold hover:bg-green-600/30">B</button>
                    <button onClick={() => setOrderModal(s)} className="px-2 py-1 rounded bg-red-600/20 text-red-400 text-[10px] font-bold hover:bg-red-600/30">S</button>
                    <button onClick={() => removeFromWatchlist(s.symbol)} className="px-2 py-1 rounded bg-gray-600/20 text-gray-400 text-[10px] hover:bg-gray-600/30">✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order Modal */}
      {orderModal && <OrderModal stock={orderModal} onClose={() => setOrderModal(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ORDER MODAL (Groww-style buy/sell)
   ═══════════════════════════════════════════════════════ */

function OrderModal({ stock, onClose }: { stock: WatchlistStock; onClose: () => void }) {
  const { isSignedIn } = useAuth();
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [qty, setQty] = useState(1);
  const [limitPrice, setLimitPrice] = useState(stock.price ?? 0);
  const [loading, setLoading] = useState(false);
  const [tradeMode, setTradeMode] = useState<"paper" | "live">("paper");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [livePrice, setLivePrice] = useState(stock.price);

  // Fetch real-time price on mount and every 5s
  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const res = await fetch(`/api/scan?symbols=${stock.symbol}&limit=1`);
        const json = await res.json();
        const all = [...(json.results ?? []), ...(json.all ?? [])];
        const match = all.find((r: Record<string, unknown>) => r.symbol === stock.symbol);
        if (match && !cancelled) {
          const p = (match.entryPrice ?? match.currentPrice ?? null) as number | null;
          if (p) { setLivePrice(p); if (orderType === "MARKET") setLimitPrice(p); }
        }
      } catch {}
    };
    fetchPrice();
    const iv = setInterval(fetchPrice, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [stock.symbol, orderType]);

  const currentPrice = orderType === "LIMIT" ? limitPrice : (livePrice ?? stock.price ?? 0);
  const estimatedCost = currentPrice * qty;

  async function placeOrder() {
    setLoading(true);
    setResult(null);
    try {
      const dryRun = tradeMode === "paper";

      const res = await fetch("/api/trade/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: stock.symbol,
          side,
          qty,
          type: orderType.toLowerCase(),
          price: orderType === "LIMIT" ? limitPrice : (livePrice ?? stock.price ?? 0),
          dryRun,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setResult({ ok: false, msg: json.error || "Order failed" });
      } else {
        const order = json.order || {};
        const fillPrice = order.filledPrice || order.fillPrice || currentPrice;
        // Save to localStorage for tracking
        const localOrder = {
          id: order.id || `order_${Date.now()}`,
          symbol: stock.symbol, name: stock.name, side, qty,
          type: orderType.toLowerCase(), price: fillPrice,
          filledPrice: fillPrice, amount: fillPrice * qty,
          status: order.status || "filled", dryRun: order.dryRun ?? dryRun,
          createdAt: order.createdAt || new Date().toISOString(),
        };
        const existing = JSON.parse(localStorage.getItem("pf_orders") || "[]");
        existing.unshift(localOrder);
        localStorage.setItem("pf_orders", JSON.stringify(existing));
        const trades = JSON.parse(localStorage.getItem("pf_trades") || "[]");
        trades.unshift(localOrder);
        localStorage.setItem("pf_trades", JSON.stringify(trades));

        const modeLabel = order.source === "live" ? "🔴 Live" : "📝 Paper";
        setResult({ ok: true, msg: `${modeLabel} order filled! ${side} ${qty}× ${stock.name} @ ${INR(fillPrice)}` });
      }
    } catch (e: unknown) {
      setResult({ ok: false, msg: String(e instanceof Error ? e.message : e) });
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-[#0a1628] border border-gray-700/50 rounded-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg">{stock.name}</h3>
            <div className="text-gray-500 text-xs">{stock.symbol.replace(".NS", "")} · <span className="text-white font-bold">{INR(livePrice ?? stock.price)}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
          </div>
        </div>

        {/* Buy/Sell Toggle */}
        <div className="flex rounded-xl overflow-hidden border border-gray-700/50">
          <button
            onClick={() => setSide("BUY")}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${side === "BUY" ? "bg-green-600 text-white" : "bg-transparent text-gray-500 hover:text-gray-300"}`}
          >BUY</button>
          <button
            onClick={() => setSide("SELL")}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${side === "SELL" ? "bg-red-600 text-white" : "bg-transparent text-gray-500 hover:text-gray-300"}`}
          >SELL</button>
        </div>

        {/* Order Type */}
        <div className="flex gap-3">
          {(["MARKET", "LIMIT"] as const).map(t => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                orderType === t ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-gray-700/50 text-gray-500 hover:text-gray-300"
              }`}
            >{t}</button>
          ))}
        </div>

        {/* Quantity */}
        <div>
          <label className="text-gray-500 text-xs mb-1 block">Quantity</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-10 h-10 rounded-lg bg-[#0d1626] border border-gray-700/50 text-white font-bold">-</button>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="flex-1 text-center py-2 rounded-lg bg-[#0d1626] border border-gray-700/50 text-white font-bold text-lg"
              min={1}
            />
            <button onClick={() => setQty(qty + 1)} className="w-10 h-10 rounded-lg bg-[#0d1626] border border-gray-700/50 text-white font-bold">+</button>
          </div>
          <div className="flex gap-2 mt-2">
            {[1, 5, 10, 25, 50, 100].map(n => (
              <button key={n} onClick={() => setQty(n)} className={`flex-1 py-1 rounded text-[10px] font-bold ${qty === n ? "bg-blue-500/20 text-blue-400" : "bg-[#0d1626] text-gray-500"}`}>{n}</button>
            ))}
          </div>
        </div>

        {/* Limit Price */}
        {orderType === "LIMIT" && (
          <div>
            <label className="text-gray-500 text-xs mb-1 block">Price (₹)</label>
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(Number(e.target.value) || 0)}
              className="w-full py-2 px-3 rounded-lg bg-[#0d1626] border border-gray-700/50 text-white font-bold"
              step={0.05}
            />
          </div>
        )}

        {/* Trade Mode Toggle */}
        <div className="flex rounded-xl overflow-hidden border border-gray-700/50">
          <button
            onClick={() => setTradeMode("paper")}
            className={`flex-1 py-2 text-xs font-bold transition-colors ${tradeMode === "paper" ? "bg-yellow-600/20 text-yellow-400 border-r border-gray-700/50" : "bg-transparent text-gray-500 hover:text-gray-300 border-r border-gray-700/50"}`}
          >📝 Paper</button>
          <button
            onClick={() => { if (isSignedIn) { setTradeMode("live"); setResult(null); } else setResult({ ok: false, msg: "Sign in to enable live trading" }); }}
            className={`flex-1 py-2 text-xs font-bold transition-colors ${tradeMode === "live" ? "bg-green-600/20 text-green-400" : "bg-transparent text-gray-500 hover:text-gray-300"}`}
          >🔴 Live</button>
        </div>

        {/* Order Summary */}
        <div className="bg-[#111b2e] rounded-xl p-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Order Type</span>
            <span className="text-white font-bold">{orderType}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Market Price</span>
            <span className="text-white font-bold">{INR(livePrice ?? stock.price)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">{side === "BUY" ? "Est. Cost" : "Est. Proceeds"}</span>
            <span className="text-white font-extrabold text-sm">{INR(estimatedCost)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Mode</span>
            <span className={`font-bold ${tradeMode === "live" ? "text-green-400" : "text-yellow-400"}`}>
              {tradeMode === "live" ? "🔴 Live Trading" : "📝 Paper Trading"}
            </span>
          </div>
        </div>

        {/* Live mode warning */}
        {tradeMode === "live" && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-2 text-[11px] text-red-400 font-medium">
            ⚠️ Live mode — real orders will be executed via your connected broker
          </div>
        )}

        {/* Result */}
        {result && (
          <div className={`p-3 rounded-xl text-sm font-bold ${result.ok ? "bg-green-500/10 text-green-400 border border-green-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"}`}>
            {result.msg}
          </div>
        )}

        {/* Place Order Button */}
        <button
          onClick={placeOrder}
          disabled={loading}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
            side === "BUY" ? "bg-green-600 hover:bg-green-500 text-white" : "bg-red-600 hover:bg-red-500 text-white"
          }`}
        >
          {loading ? "Placing..." : `${side} ${qty} × ${stock.name}`}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   2. ORDERS TAB
   ═══════════════════════════════════════════════════════ */

function OrdersTab() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "completed" | "cancelled">("all");

  useEffect(() => {
    // Load orders from localStorage (paper trades)
    try {
      const saved = JSON.parse(localStorage.getItem("pf_orders") ?? "[]");
      setOrders(saved);
    } catch {}

    // Also try API
    fetch("/api/trade/auto")
      .then(r => r.json())
      .then(json => {
        const apiOrders: OrderItem[] = [];
        // Current positions as open orders
        if (json.positions) {
          json.positions.forEach((p: any) => {
            apiOrders.push({
              id: p.id || `pos-${p.symbol}`,
              symbol: p.symbol,
              side: p.side === "SHORT" ? "SELL" : "BUY",
              qty: p.qty ?? 1,
              type: "market",
              price: p.entryPrice ?? null,
              filledPrice: p.entryPrice ?? null,
              status: "open",
              createdAt: p.enteredAt || new Date().toISOString(),
            });
          });
        }
        // Recent exits
        if (json.recentExits) {
          json.recentExits.forEach((e: any) => {
            apiOrders.push({
              id: e.id || `exit-${e.symbol}`,
              symbol: e.symbol,
              side: e.side === "SHORT" ? "SELL" : "BUY",
              qty: e.qty ?? 1,
              type: "market",
              price: e.entryPrice ?? null,
              filledPrice: e.exitPrice ?? null,
              status: "completed",
              createdAt: e.exitedAt || new Date().toISOString(),
            });
          });
        }
        if (apiOrders.length > 0) setOrders(prev => [...apiOrders, ...prev]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? orders : orders.filter(o => {
    if (filter === "open") return o.status === "open" || o.status === "pending";
    if (filter === "completed") return o.status === "completed" || o.status === "filled";
    if (filter === "cancelled") return o.status === "cancelled" || o.status === "rejected";
    return true;
  });

  return (
    <div className="p-3 space-y-4">
      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {(["all", "open", "completed", "cancelled"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${
              filter === f ? "bg-blue-500/20 text-blue-400" : "bg-[#0d1626] text-gray-500 hover:text-gray-300"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading orders...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-3">📋</div>
          <h3 className="text-white font-bold">No orders yet</h3>
          <p className="text-gray-500 text-sm mt-1">Place your first order from Watchlist or Market</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const isBuy = o.side === "BUY";
            const statusColor = {
              open: "text-blue-400 bg-blue-500/20",
              pending: "text-yellow-400 bg-yellow-500/20",
              completed: "text-green-400 bg-green-500/20",
              filled: "text-green-400 bg-green-500/20",
              cancelled: "text-red-400 bg-red-500/20",
              rejected: "text-red-400 bg-red-500/20",
            }[o.status] ?? "text-gray-400 bg-gray-500/20";
            return (
              <div key={o.id} className="p-3 rounded-xl bg-[#0d1626] border border-gray-700/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isBuy ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{o.side}</span>
                    <span className="text-white font-bold text-sm">{o.symbol.replace(".NS", "")}</span>
                    <span className="text-gray-500 text-xs">× {o.qty}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusColor}`}>{o.status.toUpperCase()}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{o.type.toUpperCase()} · {o.price != null ? INR(o.price) : "Market"}</span>
                  <span>{new Date(o.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {o.filledPrice && <div className="text-xs text-gray-400">Filled @ {INR(o.filledPrice)}</div>}
                {o.dryRun && <div className="text-[10px] text-yellow-500">📝 Paper Trade</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   3. PORTFOLIO / HOLDINGS TAB
   ═══════════════════════════════════════════════════════ */

function PortfolioTab({ onChartClick }: { onChartClick?: (symbol: string, name: string) => void }) {
  const [holdings, setHoldings] = useState<HoldingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Build holdings from localStorage tracked trades + orders
    const buildHoldings = () => {
      const holdingsMap: Record<string, HoldingItem> = {};

      // From tracked trades (pf_trades)
      try {
        const trades = JSON.parse(localStorage.getItem("pf_trades") ?? "[]");
        trades.filter((t: any) => t.status === "OPEN").forEach((t: any) => {
          const key = t.symbol;
          if (!holdingsMap[key]) {
            holdingsMap[key] = {
              symbol: t.symbol,
              name: t.name || t.symbol.replace(".NS", ""),
              qty: 0,
              avgPrice: 0,
              currentPrice: null,
              pnl: 0,
              pnlPct: 0,
              investedValue: 0,
              currentValue: 0,
            };
          }
          holdingsMap[key].qty += t.lots * 15; // lot size default
          holdingsMap[key].avgPrice = t.entryPremium;
          holdingsMap[key].currentPrice = t.currentPremium ?? t.entryPremium;
          holdingsMap[key].investedValue = t.entryPremium * t.lots * 15;
          holdingsMap[key].currentValue = (t.currentPremium ?? t.entryPremium) * t.lots * 15;
        });
      } catch {}

      // From paper orders
      try {
        const orders = JSON.parse(localStorage.getItem("pf_orders") ?? "[]");
        orders.filter((o: any) => o.status === "filled" || o.status === "completed").forEach((o: any) => {
          const key = o.symbol;
          if (!holdingsMap[key]) {
            holdingsMap[key] = {
              symbol: o.symbol,
              name: o.symbol.replace(".NS", ""),
              qty: 0,
              avgPrice: 0,
              currentPrice: null,
              pnl: 0,
              pnlPct: 0,
              investedValue: 0,
              currentValue: 0,
            };
          }
          if (o.side === "BUY") {
            holdingsMap[key].qty += o.qty;
            holdingsMap[key].avgPrice = o.filledPrice ?? o.price ?? 0;
          }
        });
      } catch {}

      const list = Object.values(holdingsMap).filter(h => h.qty > 0);
      list.forEach(h => {
        const cur = h.currentPrice ?? h.avgPrice;
        h.currentValue = cur * h.qty;
        h.investedValue = h.avgPrice * h.qty;
        h.pnl = h.currentValue - h.investedValue;
        h.pnlPct = h.investedValue > 0 ? (h.pnl / h.investedValue) * 100 : 0;
      });

      setHoldings(list);
      setLoading(false);
    };
    buildHoldings();
  }, []);

  const totalInvested = holdings.reduce((s, h) => s + h.investedValue, 0);
  const totalCurrent = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return (
    <div className="p-3 space-y-4">
      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0d1626] rounded-xl p-3 text-center">
          <div className="text-gray-500 text-[10px]">Invested</div>
          <div className="text-white font-bold">{INR(totalInvested)}</div>
        </div>
        <div className="bg-[#0d1626] rounded-xl p-3 text-center">
          <div className="text-gray-500 text-[10px]">Current</div>
          <div className="text-white font-bold">{INR(totalCurrent)}</div>
        </div>
        <div className="bg-[#0d1626] rounded-xl p-3 text-center">
          <div className="text-gray-500 text-[10px]">P&L</div>
          <div className={`font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}{INR(totalPnl)}
          </div>
        </div>
        <div className="bg-[#0d1626] rounded-xl p-3 text-center">
          <div className="text-gray-500 text-[10px]">Returns</div>
          <div className={`font-bold ${totalPnlPct >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Holdings List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading portfolio...</div>
      ) : holdings.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-3">💼</div>
          <h3 className="text-white font-bold">No holdings yet</h3>
          <p className="text-gray-500 text-sm mt-1">Buy stocks from Market or Watchlist to build your portfolio</p>
        </div>
      ) : (
        <div className="space-y-2">
          {holdings.map((h) => {
            const isUp = h.pnl >= 0;
            return (
              <div key={h.symbol} className="p-3 rounded-xl bg-[#0d1626] border border-gray-700/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => onChartClick?.(h.symbol, h.name)} className="text-gray-400 hover:text-blue-400">📊</button>
                    <div className="min-w-0">
                      <div className="text-white font-bold text-sm truncate">{h.name}</div>
                      <div className="text-gray-500 text-[10px]">{h.qty} shares · Avg {INR(h.avgPrice)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold text-sm">{INR(h.currentValue)}</div>
                    <div className={`text-[10px] font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>
                      {isUp ? "+" : ""}{INR(h.pnl)} ({isUp ? "+" : ""}{h.pnlPct.toFixed(2)}%)
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1 rounded-full bg-gray-700/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${isUp ? "bg-green-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min(100, Math.abs(h.pnlPct))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   4. POSITIONS TAB (Intraday/Open)
   ═══════════════════════════════════════════════════════ */

function PositionsTab({ onChartClick }: { onChartClick?: (symbol: string, name: string) => void }) {
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const res = await fetch("/api/trade/auto");
        const json = await res.json();
        if (json.positions) {
          setPositions(json.positions.map((p: any) => ({
            symbol: p.symbol,
            name: p.name || p.symbol.replace(".NS", ""),
            side: p.side || "LONG",
            qty: p.qty ?? 1,
            entryPrice: p.entryPrice ?? 0,
            currentPrice: p.currentPrice ?? p.entryPrice ?? null,
            pnl: ((p.currentPrice ?? p.entryPrice) - p.entryPrice) * (p.qty ?? 1) * (p.side === "SHORT" ? -1 : 1),
            pnlPct: p.entryPrice > 0 ? (((p.currentPrice ?? p.entryPrice) - p.entryPrice) / p.entryPrice * 100 * (p.side === "SHORT" ? -1 : 1)) : 0,
            sl: p.stopLoss ?? null,
            target: p.targetPrice ?? null,
          })));
        }
      } catch {}

      // Also add localStorage tracked trades as positions
      try {
        const trades = JSON.parse(localStorage.getItem("pf_trades") ?? "[]");
        const openTrades = trades.filter((t: any) => t.status === "OPEN");
        setPositions(prev => {
          const existing = new Set(prev.map(p => p.symbol));
          const newPos: PositionItem[] = openTrades
            .filter((t: any) => !existing.has(t.symbol))
            .map((t: any) => ({
              symbol: t.symbol,
              name: t.name || t.symbol.replace(".NS", ""),
              side: t.type === "CE" ? "LONG" as const : "SHORT" as const,
              qty: t.lots * 15,
              entryPrice: t.entryPremium,
              currentPrice: t.currentPremium ?? t.entryPremium,
              pnl: ((t.currentPremium ?? t.entryPremium) - t.entryPremium) * t.lots * 15,
              pnlPct: t.entryPremium > 0 ? ((t.currentPremium ?? t.entryPremium) - t.entryPremium) / t.entryPremium * 100 : 0,
              sl: t.sl,
              target: t.t1,
            }));
          return [...prev, ...newPos];
        });
      } catch {}

      setLoading(false);
    };
    fetchPositions();
    const iv = setInterval(fetchPositions, 15000);
    return () => clearInterval(iv);
  }, []);

  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);

  return (
    <div className="p-3 space-y-4">
      {/* P&L Summary */}
      <div className="bg-[#0d1626] rounded-xl p-4 text-center">
        <div className="text-gray-500 text-xs">Total P&L (Open Positions)</div>
        <div className={`text-2xl font-extrabold mt-1 ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
          {totalPnl >= 0 ? "+" : ""}{INR(totalPnl)}
        </div>
        <div className="text-gray-500 text-[10px] mt-1">{positions.length} position{positions.length !== 1 ? "s" : ""} open</div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading positions...</div>
      ) : positions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-3">📊</div>
          <h3 className="text-white font-bold">No open positions</h3>
          <p className="text-gray-500 text-sm mt-1">Trade from Market or Watchlist to see positions here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {positions.map((p, i) => {
            const isUp = p.pnl >= 0;
            return (
              <div key={`${p.symbol}-${i}`} className="p-3 rounded-xl bg-[#0d1626] border border-gray-700/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onChartClick?.(p.symbol, p.name)} className="text-gray-400 hover:text-blue-400">📊</button>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.side === "LONG" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>{p.side}</span>
                    <span className="text-white font-bold text-sm">{p.name}</span>
                    <span className="text-gray-500 text-xs">× {p.qty}</span>
                  </div>
                  <div className={`font-bold text-sm ${isUp ? "text-green-400" : "text-red-400"}`}>
                    {isUp ? "+" : ""}{INR(p.pnl)}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-[10px]">
                  <div className="text-center">
                    <div className="text-gray-500">Entry</div>
                    <div className="text-white font-bold">{INR(p.entryPrice)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500">CMP</div>
                    <div className="text-white font-bold">{INR(p.currentPrice)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500">SL</div>
                    <div className="text-red-400 font-bold">{p.sl != null ? INR(p.sl) : "—"}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-gray-500">Target</div>
                    <div className="text-green-400 font-bold">{p.target != null ? INR(p.target) : "—"}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   5. MARKET EXPLORER TAB — Real-time Trading
   Live indices · Stocks · Mutual Funds · Buy/Sell
   ═══════════════════════════════════════════════════════ */

type IndexData = { id: string; name: string; sym: string; price: number; change: number };
type MFData = { symbol: string; name: string; category: string; amc: string; nav: number | null; change: number | null; changePct: number | null };
type FnOStrike = { strike: number; callLTP: number | null; callOI: number | null; callIV: number | null; putLTP: number | null; putOI: number | null; putIV: number | null; isATM?: boolean };
type FnOData = { symbol: string; name: string; spot: number | null; expiry: string | null; strikes: FnOStrike[]; signal: string | null; recommendation: string | null };
type MarketSection = "explore" | "indices" | "stocks" | "mutualfunds" | "fno";

function MarketTab({ onChartClick }: { onChartClick?: (symbol: string, name: string) => void }) {
  const [section, setSection] = useState<MarketSection>("explore");
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [stocks, setStocks] = useState<MarketStock[]>([]);
  const [mfunds, setMfunds] = useState<MFData[]>([]);
  const [fnoList, setFnoList] = useState<FnOData[]>([]);
  const [fnoLoading, setFnoLoading] = useState(false);
  const [fnoSymbol, setFnoSymbol] = useState("NIFTY");
  const [loading, setLoading] = useState(true);
  const [mfLoading, setMfLoading] = useState(false);
  const [sector, setSector] = useState("All");
  const [search, setSearch] = useState("");
  const [orderModal, setOrderModal] = useState<WatchlistStock | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "change" | "strength">("strength");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Fetch all market data
  const fetchAll = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      // Parallel fetch: indices + stocks
      const [idxRes, scanRes] = await Promise.all([
        fetch("/api/indices").then(r => r.json()).catch(() => ({ indices: [] })),
        fetch(`/api/scan?symbols=${POPULAR_STOCKS.map(s => s.symbol).join(",")}&limit=50`).then(r => r.json()).catch(() => ({ results: [], all: [] })),
      ]);
      if (idxRes.indices) setIndices(idxRes.indices);
      const all = [...(scanRes.results ?? []), ...(scanRes.all ?? [])];
      setStocks(POPULAR_STOCKS.map(ps => {
        const match = all.find((r: Record<string, unknown>) => r.symbol === ps.symbol);
        return {
          ...ps,
          price: (match?.entryPrice ?? match?.currentPrice ?? null) as number | null,
          change: (match?.change ?? null) as number | null,
          changePct: (match?.changePct ?? null) as number | null,
          signal: match?.signal as string | undefined,
          strength: match?.strength as number | undefined,
        };
      }));
      setLastUpdated(new Date().toLocaleTimeString("en-IN"));
    } catch {}
    setLoading(false);
  }, []);

  // Fetch mutual funds
  const fetchMF = useCallback(async () => {
    if (mfunds.length > 0) return;
    setMfLoading(true);
    try {
      const res = await fetch("/api/mutualfunds");
      const json = await res.json();
      if (json.funds) setMfunds(json.funds);
    } catch {}
    setMfLoading(false);
  }, [mfunds.length]);

  // Initial load + auto-refresh every 10 seconds
  useEffect(() => {
    fetchAll(true);
    const iv = setInterval(() => fetchAll(false), 10000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  // Load MF when section changes
  useEffect(() => {
    if (section === "mutualfunds") fetchMF();
  }, [section, fetchMF]);

  // Fetch F&O option chain data
  const fetchFnO = useCallback(async (sym: string) => {
    setFnoLoading(true);
    try {
      const res = await fetch(`/api/strikes?symbol=${sym}.NS`);
      const json = await res.json();
      const strikes: FnOStrike[] = (json.strikes?.strikes || json.strikes || []).map((s: Record<string, unknown>) => ({
        strike: Number(s.strike ?? 0),
        callLTP: s.callLTP != null ? Number(s.callLTP) : null,
        callOI: s.callOI != null ? Number(s.callOI) : null,
        callIV: s.callIV != null ? Number(s.callIV) : null,
        putLTP: s.putLTP != null ? Number(s.putLTP) : null,
        putOI: s.putOI != null ? Number(s.putOI) : null,
        putIV: s.putIV != null ? Number(s.putIV) : null,
        isATM: !!s.isATM,
      }));
      setFnoList([{
        symbol: sym,
        name: sym,
        spot: json.strikes?.spot ?? null,
        expiry: json.strikes?.expiry ?? null,
        strikes,
        signal: json.signal?.signal ?? null,
        recommendation: json.recommendation?.action ?? null,
      }]);
    } catch {}
    setFnoLoading(false);
  }, []);

  useEffect(() => {
    if (section === "fno") fetchFnO(fnoSymbol);
  }, [section, fnoSymbol, fetchFnO]);

  // Derived data
  let filtered = stocks;
  if (sector !== "All") filtered = filtered.filter(s => s.sector === sector);
  if (search) {
    const q = search.toUpperCase();
    filtered = filtered.filter(s => s.symbol.toUpperCase().includes(q) || s.name.toUpperCase().includes(q));
  }
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === "change") return Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0);
    if (sortBy === "strength") return (b.strength ?? 0) - (a.strength ?? 0);
    return a.name.localeCompare(b.name);
  });
  const topGainers = [...stocks].filter(s => (s.changePct ?? 0) > 0).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 5);
  const topLosers = [...stocks].filter(s => (s.changePct ?? 0) < 0).sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 5);
  const indiaIdx = indices.filter(i => ["NIFTY", "SENSEX", "BANKNIFTY", "FINNIFTY"].includes(i.id));
  const globalIdx = indices.filter(i => !["NIFTY", "SENSEX", "BANKNIFTY", "FINNIFTY"].includes(i.id));

  return (
    <div className="p-3 space-y-4">
      {/* Live update indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>
          <span className="text-green-400 text-[10px] font-bold">LIVE</span>
        </div>
        {lastUpdated && <span className="text-gray-600 text-[10px]">Updated {lastUpdated}</span>}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {([
          { id: "explore" as const, label: "Explore", icon: "🏠" },
          { id: "indices" as const, label: "Indices", icon: "📈" },
          { id: "stocks" as const, label: "Stocks", icon: "📊" },
          { id: "fno" as const, label: "F&O", icon: "📜" },
          { id: "mutualfunds" as const, label: "Mutual Funds", icon: "🏦" },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              section === t.id ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" : "bg-[#0d1626] text-gray-500 hover:text-gray-300 border border-transparent"
            }`}
          >{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ───────── EXPLORE (Home) ───────── */}
      {section === "explore" && (
        <>
          {/* Live Indices Bar */}
          {indiaIdx.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2">📈 Market Indices — Live</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {indiaIdx.map(idx => {
                  const isUp = idx.change >= 0;
                  return (
                    <button key={idx.id} onClick={() => onChartClick?.(idx.sym, idx.name)}
                      className="bg-[#0d1626] rounded-xl p-3 border border-gray-700/30 hover:border-blue-500/40 transition-all text-left">
                      <div className="text-gray-400 text-[10px] font-bold">{idx.name}</div>
                      <div className="text-white font-extrabold text-lg mt-0.5">
                        {idx.price?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                      <div className={`text-xs font-bold mt-0.5 ${isUp ? "text-green-400" : "text-red-400"}`}>
                        {isUp ? "▲" : "▼"} {Math.abs(idx.change).toFixed(2)}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Global Indices */}
          {globalIdx.length > 0 && (
            <section>
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2">🌍 Global Markets</h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {globalIdx.map(idx => {
                  const isUp = idx.change >= 0;
                  return (
                    <button key={idx.id} onClick={() => onChartClick?.(idx.sym, idx.name)}
                      className="bg-[#0d1626] rounded-lg p-2 border border-gray-700/30 hover:border-blue-500/30 transition-all text-left">
                      <div className="text-gray-500 text-[8px] font-bold truncate">{idx.name}</div>
                      <div className="text-white font-bold text-xs">{idx.price?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
                      <div className={`text-[9px] font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>{isUp ? "+" : ""}{idx.change?.toFixed(2)}%</div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Top Gainers / Losers */}
          {!loading && stocks.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#0d1626] rounded-xl p-3 border border-gray-700/30">
                <h4 className="text-xs font-bold text-green-400 mb-2">🔥 Top Gainers</h4>
                {topGainers.length === 0 && <div className="text-gray-600 text-xs">No gainers today</div>}
                {topGainers.map(s => (
                  <button key={s.symbol} onClick={() => setOrderModal({ symbol: s.symbol, name: s.name, price: s.price, change: s.change, changePct: s.changePct ?? null })}
                    className="flex justify-between py-1.5 text-xs w-full hover:bg-white/5 px-1 rounded transition-colors">
                    <span className="text-white font-medium">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{INR(s.price)}</span>
                      <span className="text-green-400 font-bold">+{s.changePct?.toFixed(2)}%</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="bg-[#0d1626] rounded-xl p-3 border border-gray-700/30">
                <h4 className="text-xs font-bold text-red-400 mb-2">📉 Top Losers</h4>
                {topLosers.length === 0 && <div className="text-gray-600 text-xs">No losers today</div>}
                {topLosers.map(s => (
                  <button key={s.symbol} onClick={() => setOrderModal({ symbol: s.symbol, name: s.name, price: s.price, change: s.change, changePct: s.changePct ?? null })}
                    className="flex justify-between py-1.5 text-xs w-full hover:bg-white/5 px-1 rounded transition-colors">
                    <span className="text-white font-medium">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{INR(s.price)}</span>
                      <span className="text-red-400 font-bold">{s.changePct?.toFixed(2)}%</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Categories */}
          <section>
            <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2">🏷️ Explore by Category</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {[
                { label: "Banking", icon: "🏛️", sec: "Banking" },
                { label: "IT", icon: "💻", sec: "IT" },
                { label: "FMCG", icon: "🛒", sec: "FMCG" },
                { label: "Auto", icon: "🚗", sec: "Auto" },
                { label: "Pharma", icon: "💊", sec: "Pharma" },
                { label: "Energy", icon: "⚡", sec: "Energy" },
                { label: "Metals", icon: "⛏️", sec: "Metals" },
                { label: "Finance", icon: "💰", sec: "Finance" },
              ].map(c => (
                <button key={c.sec} onClick={() => { if (c.sec === "F&O") { setSection("fno"); } else { setSection("stocks"); setSector(c.sec); } }}
                  className="bg-[#0d1626] rounded-xl p-3 border border-gray-700/30 hover:border-blue-500/30 transition-all text-center">
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <div className="text-white text-xs font-bold">{c.label}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Most Traded Stocks (top 6) */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider">🔥 Most Traded</h3>
              <button onClick={() => setSection("stocks")} className="text-blue-400 text-[10px] font-bold">View All →</button>
            </div>
            {loading ? (
              <div className="text-center py-8 text-gray-500 text-sm">Loading market data...</div>
            ) : (
              <div className="space-y-1.5">
                {stocks.slice(0, 6).map(s => {
                  const isUp = (s.changePct ?? 0) >= 0;
                  return (
                    <div key={s.symbol} className="flex items-center justify-between p-2.5 rounded-xl bg-[#0d1626] border border-gray-700/30 hover:border-gray-600/50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button onClick={() => onChartClick?.(s.symbol, s.name)} className="text-gray-400 hover:text-blue-400 text-sm">📊</button>
                        <div className="min-w-0">
                          <div className="text-white font-bold text-sm truncate">{s.name}</div>
                          <div className="text-gray-500 text-[10px]">{s.sector}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-white font-bold text-sm">{INR(s.price)}</div>
                          <div className={`text-[10px] font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>
                            {isUp ? "▲" : "▼"} {s.changePct != null ? `${Math.abs(s.changePct).toFixed(2)}%` : "—"}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setOrderModal({ symbol: s.symbol, name: s.name, price: s.price, change: s.change, changePct: s.changePct ?? null })}
                            className="px-2 py-1 rounded-lg bg-green-600/20 text-green-400 text-[10px] font-bold hover:bg-green-600/30">B</button>
                          <button onClick={() => setOrderModal({ symbol: s.symbol, name: s.name, price: s.price, change: s.change, changePct: s.changePct ?? null })}
                            className="px-2 py-1 rounded-lg bg-red-600/20 text-red-400 text-[10px] font-bold hover:bg-red-600/30">S</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* ───────── INDICES SECTION ───────── */}
      {section === "indices" && (
        <>
          <h3 className="text-sm font-bold text-white">📈 Live Market Indices</h3>
          {indices.length === 0 && loading ? (
            <div className="text-center py-12 text-gray-500">Loading indices...</div>
          ) : (
            <>
              <section>
                <h4 className="text-xs font-bold text-white/60 mb-2">India</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {indiaIdx.map(idx => {
                    const isUp = idx.change >= 0;
                    return (
                      <button key={idx.id} onClick={() => onChartClick?.(idx.sym, idx.name)}
                        className="flex items-center justify-between p-4 rounded-xl bg-[#0d1626] border border-gray-700/30 hover:border-blue-500/40 transition-all">
                        <div>
                          <div className="text-white font-bold">{idx.name}</div>
                          <div className="text-gray-500 text-[10px]">NSE</div>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-extrabold text-xl">{idx.price?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
                          <div className={`text-sm font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>
                            {isUp ? "▲" : "▼"} {Math.abs(idx.change).toFixed(2)}%
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
              <section>
                <h4 className="text-xs font-bold text-white/60 mb-2">Global</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {globalIdx.map(idx => {
                    const isUp = idx.change >= 0;
                    return (
                      <button key={idx.id} onClick={() => onChartClick?.(idx.sym, idx.name)}
                        className="flex items-center justify-between p-3 rounded-xl bg-[#0d1626] border border-gray-700/30 hover:border-blue-500/30 transition-all">
                        <div>
                          <div className="text-white font-bold text-sm">{idx.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-bold">{idx.price?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
                          <div className={`text-xs font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>
                            {isUp ? "+" : ""}{idx.change?.toFixed(2)}%
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* ───────── STOCKS SECTION ───────── */}
      {section === "stocks" && (
        <>
          {/* Search */}
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stocks (e.g. Reliance, TCS)..."
            className="w-full px-3 py-2.5 rounded-xl bg-[#0d1626] border border-gray-700/50 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          {/* Sector Filter */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {SECTORS.map(s => (
              <button key={s} onClick={() => setSector(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${sector === s ? "bg-blue-500/20 text-blue-400" : "bg-[#0d1626] text-gray-500 hover:text-gray-300"}`}
              >{s}</button>
            ))}
          </div>
          {/* Sort */}
          <div className="flex gap-2 text-[10px]">
            <span className="text-gray-500">Sort:</span>
            {(["strength", "change", "name"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} className={`${sortBy === s ? "text-blue-400" : "text-gray-500"}`}>
                {s === "strength" ? "Signal" : s === "change" ? "% Change" : "A-Z"}
              </button>
            ))}
          </div>
          {/* Stock list */}
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading stocks...</div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(s => {
                const isUp = (s.changePct ?? 0) >= 0;
                return (
                  <div key={s.symbol} className="flex items-center justify-between p-3 rounded-xl bg-[#0d1626] border border-gray-700/30 hover:border-gray-600/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button onClick={() => onChartClick?.(s.symbol, s.name)} className="text-gray-400 hover:text-blue-400">📊</button>
                      <div className="min-w-0">
                        <div className="text-white font-bold text-sm truncate">{s.name}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-gray-500 text-[10px]">{s.sector}</span>
                          {s.signal && s.signal !== "HOLD" && (
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                              s.signal === "BUY" ? "bg-green-500/20 text-green-400" : s.signal === "SELL" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"
                            }`}>{s.signal}</span>
                          )}
                          {s.strength != null && s.strength > 50 && <span className="text-[8px] text-gray-500">{s.strength}%</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-white font-bold text-sm">{INR(s.price)}</div>
                        <div className={`text-[10px] font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>
                          {isUp ? "▲" : "▼"} {s.changePct != null ? `${Math.abs(s.changePct).toFixed(2)}%` : "—"}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setOrderModal({ symbol: s.symbol, name: s.name, price: s.price, change: s.change, changePct: s.changePct ?? null })}
                          className="px-2.5 py-1.5 rounded-lg bg-green-600/20 text-green-400 text-[10px] font-bold hover:bg-green-600/30">BUY</button>
                        <button onClick={() => setOrderModal({ symbol: s.symbol, name: s.name, price: s.price, change: s.change, changePct: s.changePct ?? null })}
                          className="px-2.5 py-1.5 rounded-lg bg-red-600/20 text-red-400 text-[10px] font-bold hover:bg-red-600/30">SELL</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="text-center py-8 text-gray-500 text-sm">No stocks match your search</div>}
            </div>
          )}
        </>
      )}

      {/* ───────── F&O SECTION ───────── */}
      {section === "fno" && (
        <>
          <h3 className="text-sm font-bold text-white">📜 Futures & Options — Live Chain</h3>
          {/* Symbol selector */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {["NIFTY", "BANKNIFTY", "FINNIFTY", "RELIANCE", "TCS", "HDFCBANK", "INFY", "SBIN", "TATAMOTORS", "ITC"].map(sym => (
              <button key={sym} onClick={() => setFnoSymbol(sym)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${fnoSymbol === sym ? "bg-blue-500/20 text-blue-400" : "bg-[#0d1626] text-gray-500 hover:text-gray-300"}`}
              >{sym}</button>
            ))}
          </div>

          {fnoLoading ? (
            <div className="text-center py-12 text-gray-500">Loading option chain...</div>
          ) : fnoList.length > 0 && fnoList[0].strikes.length > 0 ? (
            <div className="space-y-3">
              {/* Spot & Signal */}
              <div className="flex items-center justify-between bg-[#0d1626] rounded-xl p-3 border border-gray-700/30">
                <div>
                  <div className="text-white font-bold text-lg">{fnoList[0].name}</div>
                  <div className="text-gray-500 text-xs">Expiry: {fnoList[0].expiry || "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-extrabold text-xl">{fnoList[0].spot ? INR(fnoList[0].spot) : "—"}</div>
                  {fnoList[0].signal && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${fnoList[0].signal === "BUY" ? "bg-green-500/20 text-green-400" : fnoList[0].signal === "SELL" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                      {fnoList[0].signal}
                    </span>
                  )}
                </div>
              </div>
              {fnoList[0].recommendation && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-xs text-blue-400 font-bold">
                  💡 Recommended: {fnoList[0].recommendation}
                </div>
              )}
              {/* Option Chain Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700/50">
                      <th colSpan={3} className="text-center text-green-400 font-bold py-2 text-[10px]">CALLS</th>
                      <th className="text-center text-white font-bold py-2">Strike</th>
                      <th colSpan={3} className="text-center text-red-400 font-bold py-2 text-[10px]">PUTS</th>
                    </tr>
                    <tr className="border-b border-gray-700/30 text-gray-500 text-[9px]">
                      <th className="py-1 px-1">OI</th>
                      <th className="py-1 px-1">IV</th>
                      <th className="py-1 px-1">LTP</th>
                      <th className="py-1 px-1"></th>
                      <th className="py-1 px-1">LTP</th>
                      <th className="py-1 px-1">IV</th>
                      <th className="py-1 px-1">OI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fnoList[0].strikes.map(s => (
                      <tr key={s.strike} className={`border-b border-gray-800/30 ${s.isATM ? "bg-blue-500/10 border-blue-500/30" : "hover:bg-white/5"}`}>
                        <td className="py-1.5 px-1 text-center text-gray-400">{s.callOI != null ? (s.callOI / 1000).toFixed(0) + "K" : "—"}</td>
                        <td className="py-1.5 px-1 text-center text-gray-400">{s.callIV != null ? s.callIV.toFixed(1) : "—"}</td>
                        <td className="py-1.5 px-1 text-center text-green-400 font-bold">{s.callLTP != null ? s.callLTP.toFixed(2) : "—"}</td>
                        <td className={`py-1.5 px-1 text-center font-bold ${s.isATM ? "text-blue-400 bg-blue-500/10" : "text-white"}`}>{s.strike}</td>
                        <td className="py-1.5 px-1 text-center text-red-400 font-bold">{s.putLTP != null ? s.putLTP.toFixed(2) : "—"}</td>
                        <td className="py-1.5 px-1 text-center text-gray-400">{s.putIV != null ? s.putIV.toFixed(1) : "—"}</td>
                        <td className="py-1.5 px-1 text-center text-gray-400">{s.putOI != null ? (s.putOI / 1000).toFixed(0) + "K" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">📜</div>
              <h3 className="text-white font-bold">No option chain data</h3>
              <p className="text-gray-500 text-sm mt-1">Select a symbol above to view the F&O chain</p>
            </div>
          )}
        </>
      )}

      {/* ───────── MUTUAL FUNDS SECTION ───────── */}
      {section === "mutualfunds" && (
        <>
          <h3 className="text-sm font-bold text-white">🏦 Mutual Funds — Popular</h3>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {["All", "Large Cap", "Mid Cap", "Small Cap", "Flexi Cap"].map(c => (
              <button key={c} onClick={() => setSector(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${sector === c ? "bg-blue-500/20 text-blue-400" : "bg-[#0d1626] text-gray-500 hover:text-gray-300"}`}
              >{c}</button>
            ))}
          </div>
          {mfLoading ? (
            <div className="text-center py-12 text-gray-500">Loading mutual funds...</div>
          ) : (
            <div className="space-y-2">
              {(sector === "All" ? mfunds : mfunds.filter(f => f.category === sector)).map(f => {
                const isUp = (f.changePct ?? 0) >= 0;
                return (
                  <div key={f.symbol} className="p-3 rounded-xl bg-[#0d1626] border border-gray-700/30 hover:border-gray-600/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-white font-bold text-sm truncate">{f.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-bold">{f.category}</span>
                          <span className="text-gray-500 text-[10px]">{f.amc}</span>
                        </div>
                      </div>
                      <div className="text-right ml-3">
                        <div className="text-white font-bold">NAV {f.nav != null ? `₹${f.nav.toFixed(2)}` : "—"}</div>
                        {f.changePct != null && (
                          <div className={`text-xs font-bold ${isUp ? "text-green-400" : "text-red-400"}`}>
                            {isUp ? "+" : ""}{f.changePct.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button className="flex-1 py-1.5 rounded-lg bg-green-600/20 text-green-400 text-xs font-bold hover:bg-green-600/30 transition-colors">
                        Invest (SIP)
                      </button>
                      <button className="flex-1 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 text-xs font-bold hover:bg-blue-600/30 transition-colors">
                        One-time
                      </button>
                    </div>
                  </div>
                );
              })}
              {mfunds.length === 0 && !mfLoading && (
                <div className="text-center py-8 text-gray-500 text-sm">No mutual fund data available</div>
              )}
            </div>
          )}
        </>
      )}

      {/* Order Modal */}
      {orderModal && <OrderModal stock={orderModal} onClose={() => setOrderModal(null)} />}
    </div>
  );
}
