"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PFPosition = {
  symbol: string;
  qty: number;
  avgPrice: number;
  realizedPnl: number;
  ltp: number;
  mtm: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
};

type PFOrder = {
  id: string; symbol: string; side: "BUY" | "SELL"; qty: number;
  price: number; amount: number; type: string; status: string;
  reason?: string; createdAt: string;
};

type PFPending = {
  id: string; symbol: string; side: "BUY" | "SELL"; qty: number;
  type: "limit" | "stop" | "stoplimit";
  limitPrice?: number; stopPrice?: number;
  bracket?: { sl?: number; target?: number; parentId?: string };
  createdAt: string;
};

type PFEquity = {
  funds: number;
  positionsValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  equity: number;
  positions: PFPosition[];
};

type AccountResp = {
  broker: "profitforce";
  account: { funds: number; positions: Record<string, unknown>; orders: PFOrder[]; pending?: PFPending[] };
  equity: PFEquity;
};

const fmtINR = (n: number) =>
  "₹" + (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export default function ProfitForceBrokerPanel({ prefillSymbol }: { prefillSymbol?: string }) {
  const [data, setData] = useState<AccountResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeDefaults, setTradeDefaults] = useState<Partial<TradeForm>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/broker/profitforce/account", { cache: "no-store" });
      if (r.status === 401) { setErr("Sign in to use the ProfitForce broker."); setLoading(false); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as AccountResp;
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);

  const cancelPending = async (id: string) => {
    await fetch(`/api/broker/profitforce/order?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  };

  const reset = async () => {
    if (!confirm("Reset ProfitForce account to ₹10,00,000 starting capital? Positions and orders will be wiped.")) return;
    await fetch("/api/broker/profitforce/account", { method: "DELETE" });
    load();
  };

  const addFunds = async () => {
    const v = prompt("Add virtual funds (₹). Negative to withdraw:", "100000");
    if (v == null) return;
    const amount = Number(v);
    if (!Number.isFinite(amount)) return;
    await fetch("/api/broker/profitforce/account", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    load();
  };

  const openTrade = (defaults: Partial<TradeForm> = {}) => {
    setTradeDefaults({ symbol: prefillSymbol, ...defaults });
    setTradeOpen(true);
  };

  if (loading) {
    return <div className="text-white/50 text-sm p-4">Loading broker…</div>;
  }
  if (err) {
    return <div className="text-amber-300 text-sm p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">{err}</div>;
  }
  if (!data) return null;

  const { account, equity } = data;
  const totalPnl = equity.unrealizedPnl + equity.realizedPnl;
  const pnlColor = totalPnl >= 0 ? "text-emerald-400" : "text-rose-400";
  const recentOrders = (account.orders ?? []).slice(-10).reverse();

  return (
    <section className="rounded-xl border border-white/10 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-slate-950/80 p-3 sm:p-4 shadow-xl backdrop-blur">
      <header className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm sm:text-base font-extrabold text-white tracking-wide">
            🏦 ProfitForce Broker <span className="text-[10px] font-normal text-white/40">• Virtual / paper trading</span>
          </h2>
          <p className="text-[10px] text-white/40 mt-0.5">In-house broker. No real money. Orders, P&L &amp; positions are yours alone.</p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => openTrade()} className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-emerald-500/90 text-white hover:bg-emerald-500 shadow">
            + Trade
          </button>
          <button onClick={addFunds} className="text-[11px] px-2 py-1.5 rounded-md bg-white/5 text-white/70 hover:bg-white/10">Funds</button>
          <button onClick={reset} className="text-[11px] px-2 py-1.5 rounded-md bg-white/5 text-white/50 hover:bg-rose-500/20 hover:text-rose-300">Reset</button>
        </div>
      </header>

      {/* Equity strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Stat label="Cash" value={fmtINR(equity.funds)} />
        <Stat label="Positions" value={fmtINR(equity.positionsValue)} />
        <Stat label="Equity" value={fmtINR(equity.equity)} big />
        <Stat label="Total P&L" value={fmtINR(totalPnl)} color={pnlColor} />
      </div>

      {/* Positions */}
      {equity.positions.length > 0 && (
        <div className="mb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1.5">Positions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] sm:text-xs">
              <thead className="text-white/40">
                <tr className="border-b border-white/5">
                  <th className="text-left py-1.5 pr-2">Symbol</th>
                  <th className="text-right py-1.5 px-2">Qty</th>
                  <th className="text-right py-1.5 px-2 hidden sm:table-cell">Avg</th>
                  <th className="text-right py-1.5 px-2">LTP</th>
                  <th className="text-right py-1.5 px-2">MTM</th>
                  <th className="text-right py-1.5 pl-2">P&amp;L</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {equity.positions.map(p => (
                  <tr key={p.symbol} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-1.5 pr-2 font-semibold text-white">{p.symbol}</td>
                    <td className="text-right px-2 text-white/80">{p.qty}</td>
                    <td className="text-right px-2 hidden sm:table-cell text-white/60">{fmtINR(p.avgPrice)}</td>
                    <td className="text-right px-2 text-white/80">{fmtINR(p.ltp)}</td>
                    <td className="text-right px-2 text-white/80">{fmtINR(p.mtm)}</td>
                    <td className={`text-right pl-2 font-semibold ${p.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmtINR(p.unrealizedPnl)}
                      <div className="text-[9px] font-normal opacity-70">{p.unrealizedPnlPct.toFixed(2)}%</div>
                    </td>
                    <td className="text-right pl-1">
                      <button
                        onClick={() => openTrade({ symbol: p.symbol, qty: p.qty, side: "SELL" })}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/40"
                      >Exit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending orders */}
      {(account.pending?.length ?? 0) > 0 && (
        <div className="mb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1.5">Open orders ({account.pending!.length})</h3>
          <ul className="space-y-1">
            {account.pending!.map(p => (
              <li key={p.id} className="flex items-center justify-between text-[11px] bg-white/5 border border-white/10 rounded-md px-2 py-1.5">
                <span className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${p.side === "BUY" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>{p.side}</span>
                  <span className="font-semibold text-white">{p.symbol}</span>
                  <span className="text-white/50">{p.qty} @</span>
                  <span className="text-white/80">
                    {p.type === "limit" && `LIMIT ${fmtINR(p.limitPrice!)}`}
                    {p.type === "stop" && `STOP ${fmtINR(p.stopPrice!)}`}
                    {p.type === "stoplimit" && `SL-L ${fmtINR(p.stopPrice!)} / ${fmtINR(p.limitPrice!)}`}
                  </span>
                  {p.bracket?.parentId && <span className="text-[9px] text-amber-300/70">· bracket child</span>}
                </span>
                <button onClick={() => cancelPending(p.id)} className="text-[10px] text-white/50 hover:text-rose-400">✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1.5 hover:text-white/70">
            Recent orders ({recentOrders.length})
          </summary>
          <ul className="space-y-1 mt-2 max-h-48 overflow-y-auto">
            {recentOrders.map(o => (
              <li key={o.id} className="flex items-center justify-between text-[11px] bg-white/5 rounded px-2 py-1">
                <span className="flex items-center gap-2">
                  <span className={`px-1 rounded text-[9px] font-bold ${o.side === "BUY" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>{o.side}</span>
                  <span className="text-white">{o.symbol}</span>
                  <span className="text-white/50">{o.qty} @ {fmtINR(o.price)}</span>
                </span>
                <span className={`text-[10px] ${o.status === "filled" ? "text-emerald-400" : "text-rose-400"}`}>{o.status}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {equity.positions.length === 0 && (account.pending?.length ?? 0) === 0 && recentOrders.length === 0 && (
        <div className="text-center text-white/40 text-xs py-6">
          No positions yet — hit <span className="text-emerald-400 font-semibold">+ Trade</span> to place your first order.
        </div>
      )}

      {tradeOpen && (
        <TradeModal
          defaults={tradeDefaults}
          onClose={() => setTradeOpen(false)}
          onDone={() => { setTradeOpen(false); load(); }}
        />
      )}
    </section>
  );
}

function Stat({ label, value, color, big }: { label: string; value: string; color?: string; big?: boolean }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`font-bold ${big ? "text-base sm:text-lg" : "text-sm"} ${color ?? "text-white"}`}>{value}</div>
    </div>
  );
}

type TradeForm = {
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  type: "market" | "limit" | "stop" | "stoplimit";
  limitPrice?: number;
  stopPrice?: number;
  sl?: number;
  target?: number;
};

function TradeModal({
  defaults,
  onClose,
  onDone,
}: {
  defaults: Partial<TradeForm>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<TradeForm>({
    symbol: defaults.symbol ?? "",
    side: defaults.side ?? "BUY",
    qty: defaults.qty ?? 1,
    type: defaults.type ?? "market",
    limitPrice: defaults.limitPrice,
    stopPrice: defaults.stopPrice,
    sl: defaults.sl,
    target: defaults.target,
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const bracketAllowed = useMemo(() => form.side === "BUY" && (form.type === "market" || form.type === "limit"), [form.side, form.type]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        symbol: form.symbol.trim().toUpperCase(),
        side: form.side,
        qty: form.qty,
        type: form.type,
      };
      if (form.type === "limit" || form.type === "stoplimit") body.limitPrice = form.limitPrice;
      if (form.type === "stop" || form.type === "stoplimit") body.stopPrice = form.stopPrice;
      if (bracketAllowed && (form.sl || form.target)) body.bracket = { sl: form.sl, target: form.target };

      const r = await fetch("/api/broker/profitforce/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setResult({ ok: false, msg: j.error || j.reason || `HTTP ${r.status}` });
      } else {
        setResult({ ok: true, msg: form.type === "market" ? "Filled ✓" : "Order placed ✓" });
        setTimeout(onDone, 600);
      }
    } catch (e) {
      setResult({ ok: false, msg: String((e as Error).message || e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold text-base">🏦 ProfitForce · Place order</h3>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <button type="button" onClick={() => setForm(f => ({ ...f, side: "BUY" }))}
            className={`py-2 rounded-md text-sm font-bold transition ${form.side === "BUY" ? "bg-emerald-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>BUY</button>
          <button type="button" onClick={() => setForm(f => ({ ...f, side: "SELL" }))}
            className={`py-2 rounded-md text-sm font-bold transition ${form.side === "SELL" ? "bg-rose-500 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>SELL</button>
        </div>

        <label className="block text-[10px] uppercase tracking-wider text-white/50 mt-3 mb-1">Symbol</label>
        <input
          value={form.symbol}
          onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}
          required
          placeholder="e.g. RELIANCE.NS or GC=F"
          className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
        />

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-white/50 mb-1">Qty</label>
            <input
              type="number" min={1} step={1} value={form.qty}
              onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) }))}
              required
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-white/50 mb-1">Type</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as TradeForm["type"] }))}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            >
              <option value="market">Market</option>
              <option value="limit">Limit</option>
              <option value="stop">Stop</option>
              <option value="stoplimit">Stop-limit</option>
            </select>
          </div>
        </div>

        {(form.type === "limit" || form.type === "stoplimit") && (
          <div className="mt-3">
            <label className="block text-[10px] uppercase tracking-wider text-white/50 mb-1">Limit price (₹)</label>
            <input
              type="number" step="0.01" value={form.limitPrice ?? ""}
              onChange={e => setForm(f => ({ ...f, limitPrice: Number(e.target.value) }))}
              required
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            />
          </div>
        )}
        {(form.type === "stop" || form.type === "stoplimit") && (
          <div className="mt-3">
            <label className="block text-[10px] uppercase tracking-wider text-white/50 mb-1">Stop / trigger price (₹)</label>
            <input
              type="number" step="0.01" value={form.stopPrice ?? ""}
              onChange={e => setForm(f => ({ ...f, stopPrice: Number(e.target.value) }))}
              required
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            />
          </div>
        )}

        {bracketAllowed && (
          <div className="mt-3 p-2.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300 mb-1.5">Bracket (optional)</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] text-white/50 mb-0.5">Stop-loss (₹)</label>
                <input
                  type="number" step="0.01" value={form.sl ?? ""}
                  onChange={e => setForm(f => ({ ...f, sl: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-rose-400"
                />
              </div>
              <div>
                <label className="block text-[9px] text-white/50 mb-0.5">Target (₹)</label>
                <input
                  type="number" step="0.01" value={form.target ?? ""}
                  onChange={e => setForm(f => ({ ...f, target: e.target.value ? Number(e.target.value) : undefined }))}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-400"
                />
              </div>
            </div>
            <div className="text-[9px] text-white/40 mt-1">When entry fills, SL (stop) &amp; target (limit) orders are auto-queued; whichever triggers first cancels the other.</div>
          </div>
        )}

        {result && (
          <div className={`mt-3 text-xs px-3 py-2 rounded-md ${result.ok ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" : "bg-rose-500/10 text-rose-300 border border-rose-500/20"}`}>
            {result.msg}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={`w-full mt-4 py-2.5 rounded-md text-sm font-bold transition ${form.side === "BUY" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"} text-white disabled:opacity-50`}
        >
          {submitting ? "Placing…" : `${form.side} ${form.qty} ${form.symbol || "?"} (${form.type.toUpperCase()})`}
        </button>
        <div className="mt-2 text-center text-[9px] text-white/40">
          Virtual paper order on ProfitForce broker · No real money
        </div>
      </form>
    </div>
  );
}
