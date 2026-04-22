"use client";
import { useCallback, useEffect, useState } from "react";

type PFPosition = { symbol: string; qty: number; avgPrice: number; realizedPnl: number; lastUpdated: string };
type PFOrder = { id: string; symbol: string; side: "BUY" | "SELL"; qty: number; price: number; amount: number; status: "filled" | "rejected"; reason?: string; createdAt: string };
type PFAccount = { funds: number; positions: Record<string, PFPosition>; orders: PFOrder[] };

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export default function PFAccountPanel() {
  const [acct, setAcct] = useState<PFAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile/pf-account");
      if (res.ok) setAcct(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const resetAccount = async () => {
    if (!confirm("Reset virtual account? This wipes all positions and orders, and restores ₹10,00,000 cash.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/pf-account", { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setAcct(data.account);
        setMsg("Account reset");
      }
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 2500);
    }
  };

  if (loading) return <div className="text-white/50 text-sm p-4">Loading virtual account…</div>;
  if (!acct) return null;

  const positions = Object.values(acct.positions);
  const invested = positions.reduce((s, p) => s + p.qty * p.avgPrice, 0);
  const equity = acct.funds + invested; // mark-to-book (we don't have live prices here)
  const realizedPnl = positions.reduce((s, p) => s + p.realizedPnl, 0);
  const recentOrders = [...acct.orders].reverse().slice(0, 15);

  return (
    <div className="max-w-2xl mx-auto p-5 bg-[#0a1628] rounded-xl border border-emerald-500/30 mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">🏦 ProfitForce Virtual Account</h2>
          <p className="text-[11px] text-white/50">Self-contained broker. Every order fills instantly at live price. No external API.</p>
        </div>
        <button onClick={resetAccount} disabled={busy} className="px-3 py-1.5 rounded bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-50">
          Reset
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="bg-white/5 rounded px-3 py-2">
          <div className="text-white/40 text-[9px] uppercase">Cash</div>
          <div className="font-extrabold text-white text-sm">₹{fmt(acct.funds)}</div>
        </div>
        <div className="bg-white/5 rounded px-3 py-2">
          <div className="text-white/40 text-[9px] uppercase">Invested (book)</div>
          <div className="font-extrabold text-white text-sm">₹{fmt(invested)}</div>
        </div>
        <div className="bg-white/5 rounded px-3 py-2">
          <div className="text-white/40 text-[9px] uppercase">Realized P&amp;L</div>
          <div className={`font-extrabold text-sm ${realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>₹{fmt(realizedPnl)}</div>
        </div>
      </div>
      <div className="text-[11px] text-white/50">Total equity (book): <span className="font-bold text-white">₹{fmt(equity)}</span></div>

      {/* Positions */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Open Positions ({positions.length})</div>
        {positions.length === 0 ? (
          <div className="text-[11px] text-white/40 italic">No open positions. Trade through the dashboard&apos;s Track buttons to build holdings.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="text-white/40 uppercase text-[9px]">
                <tr>
                  <th className="text-left px-2 py-1">Symbol</th>
                  <th className="text-right px-2 py-1">Qty</th>
                  <th className="text-right px-2 py-1">Avg</th>
                  <th className="text-right px-2 py-1">Invested</th>
                  <th className="text-right px-2 py-1">Realized</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(p => (
                  <tr key={p.symbol} className="border-t border-white/5">
                    <td className="px-2 py-1 font-bold text-white">{p.symbol}</td>
                    <td className="px-2 py-1 text-right text-white">{p.qty}</td>
                    <td className="px-2 py-1 text-right text-white/70">₹{fmt(p.avgPrice)}</td>
                    <td className="px-2 py-1 text-right text-white/70">₹{fmt(p.qty * p.avgPrice)}</td>
                    <td className={`px-2 py-1 text-right ${p.realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>₹{fmt(p.realizedPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Orders */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Recent Orders</div>
        {recentOrders.length === 0 ? (
          <div className="text-[11px] text-white/40 italic">No orders yet.</div>
        ) : (
          <div className="overflow-auto max-h-60">
            <table className="w-full text-[11px]">
              <thead className="text-white/40 uppercase text-[9px] sticky top-0 bg-[#0a1628]">
                <tr>
                  <th className="text-left px-2 py-1">Time</th>
                  <th className="text-left px-2 py-1">Symbol</th>
                  <th className="text-left px-2 py-1">Side</th>
                  <th className="text-right px-2 py-1">Qty</th>
                  <th className="text-right px-2 py-1">Price</th>
                  <th className="text-left px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(o => (
                  <tr key={o.id} className="border-t border-white/5">
                    <td className="px-2 py-1 text-white/60">{new Date(o.createdAt).toLocaleTimeString()}</td>
                    <td className="px-2 py-1 font-bold text-white">{o.symbol}</td>
                    <td className={`px-2 py-1 font-bold ${o.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{o.side}</td>
                    <td className="px-2 py-1 text-right text-white">{o.qty}</td>
                    <td className="px-2 py-1 text-right text-white/70">₹{fmt(o.price)}</td>
                    <td className={`px-2 py-1 ${o.status === "filled" ? "text-emerald-400" : "text-red-400"}`} title={o.reason || ""}>
                      {o.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {msg && <div className="text-emerald-400 text-sm">{msg}</div>}
    </div>
  );
}
