"use client";
import { useEffect, useState, useCallback } from "react";

interface Position {
  symbol: string;
  exchange: string | null;
  netQty: number;
  avgPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  ltp: number | null;
}

interface Order {
  id: string;
  provider: string;
  broker_order_id: string | null;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  filled_qty: number;
  type: string;
  status: string;
  reject_reason: string | null;
  paper: boolean;
  created_at: string;
}

interface RiskProfile {
  capital: number;
  max_daily_loss_pct: number;
  max_position_pct: number;
  max_open_positions: number;
  risk_per_trade_pct: number;
  max_orders_per_minute: number;
  auto_execute: boolean;
}

interface KillSwitchRow {
  id: number;
  clerk_id: string | null;
  enabled: boolean;
  reason: string | null;
}

export default function OmsDashboard() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [pnl, setPnl] = useState<{ realized: number; unrealized: number; total: number } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profile, setProfile] = useState<RiskProfile | null>(null);
  const [kill, setKill] = useState<KillSwitchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [p, o, r, k] = await Promise.all([
        fetch("/api/oms/positions").then((res) => res.json()),
        fetch("/api/oms/orders?limit=50").then((res) => res.json()),
        fetch("/api/oms/risk-profile").then((res) => res.json()),
        fetch("/api/oms/kill-switch").then((res) => res.json()),
      ]);
      setPositions(p.positions ?? []);
      setPnl(p.pnl ?? null);
      setOrders(o.orders ?? []);
      setProfile(r.profile ?? null);
      setKill(k.switches ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const userKill = kill.find((k) => k.clerk_id != null);
  const globalKill = kill.find((k) => k.clerk_id == null);

  async function toggleKill(scope: "user" | "global") {
    const current = scope === "user" ? userKill : globalKill;
    const enabled = !current?.enabled;
    const reason = enabled ? prompt(`Reason to ${enabled ? "ENABLE" : "DISABLE"} ${scope} kill-switch?`) ?? "" : "";
    if (enabled && !reason.trim()) return;
    await fetch("/api/oms/kill-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, scope, reason }),
    });
    await refresh();
  }

  async function saveProfile(p: Partial<RiskProfile>) {
    await fetch("/api/oms/risk-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    await refresh();
  }

  return (
    <div className="p-6 space-y-6 text-zinc-100 bg-zinc-950 min-h-screen">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Algo OMS</h1>
        <div className="flex gap-2 text-sm">
          <button
            onClick={refresh}
            className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700"
            disabled={busy}
          >
            {busy ? "…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && <div className="p-3 rounded bg-red-900/40 border border-red-700">{error}</div>}

      {/* P&L summary */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card label="Capital" value={profile?.capital != null ? `₹${profile.capital.toLocaleString("en-IN")}` : "—"} />
        <Card label="Realized P&L" value={pnl ? formatPnL(pnl.realized) : "—"} tone={pnl ? toneFor(pnl.realized) : undefined} />
        <Card label="Unrealized P&L" value={pnl ? formatPnL(pnl.unrealized) : "—"} tone={pnl ? toneFor(pnl.unrealized) : undefined} />
        <Card label="Total Day P&L" value={pnl ? formatPnL(pnl.total) : "—"} tone={pnl ? toneFor(pnl.total) : undefined} />
      </section>

      {/* Kill-switch */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <KillCard label="Your kill-switch" row={userKill} onToggle={() => toggleKill("user")} />
        <KillCard label="Global kill-switch (admin)" row={globalKill} onToggle={() => toggleKill("global")} />
      </section>

      {/* Risk profile */}
      {profile && (
        <section className="rounded border border-zinc-800 p-4">
          <h2 className="text-lg font-semibold mb-3">Risk profile</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <ProfileField label="Capital (₹)" value={profile.capital} step={1000} onChange={(v) => saveProfile({ capital: v })} />
            <ProfileField label="Max daily loss %" value={profile.max_daily_loss_pct * 100} step={0.5} onChange={(v) => saveProfile({ max_daily_loss_pct: v / 100 })} />
            <ProfileField label="Risk per trade %" value={profile.risk_per_trade_pct * 100} step={0.25} onChange={(v) => saveProfile({ risk_per_trade_pct: v / 100 })} />
            <ProfileField label="Max position % per symbol" value={profile.max_position_pct * 100} step={1} onChange={(v) => saveProfile({ max_position_pct: v / 100 })} />
            <ProfileField label="Max open positions" value={profile.max_open_positions} step={1} onChange={(v) => saveProfile({ max_open_positions: Math.floor(v) })} />
            <ProfileField label="Orders per minute" value={profile.max_orders_per_minute} step={1} onChange={(v) => saveProfile({ max_orders_per_minute: Math.floor(v) })} />
            <label className="flex items-center gap-2 col-span-2">
              <input
                type="checkbox"
                checked={profile.auto_execute}
                onChange={(e) => saveProfile({ auto_execute: e.target.checked })}
              />
              <span>Auto-execute strategy signals</span>
            </label>
          </div>
        </section>
      )}

      {/* Positions */}
      <section className="rounded border border-zinc-800">
        <h2 className="text-lg font-semibold p-4 pb-2">Positions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <Th>Symbol</Th><Th>Net Qty</Th><Th>Avg</Th><Th>LTP</Th><Th>Realized</Th><Th>Unrealized</Th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-zinc-500">No open positions</td></tr>
              )}
              {positions.map((p) => (
                <tr key={`${p.symbol}-${p.exchange}`} className="border-b border-zinc-900">
                  <td className="p-2">{p.symbol}{p.exchange ? <span className="text-zinc-500"> · {p.exchange}</span> : null}</td>
                  <td className={`p-2 ${p.netQty > 0 ? "text-emerald-400" : p.netQty < 0 ? "text-rose-400" : "text-zinc-500"}`}>{p.netQty}</td>
                  <td className="p-2">{p.avgPrice ? `₹${p.avgPrice.toFixed(2)}` : "—"}</td>
                  <td className="p-2">{p.ltp != null ? `₹${p.ltp.toFixed(2)}` : "—"}</td>
                  <td className={`p-2 ${toneClass(p.realizedPnl)}`}>{formatPnL(p.realizedPnl)}</td>
                  <td className={`p-2 ${toneClass(p.unrealizedPnl)}`}>{formatPnL(p.unrealizedPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Orders */}
      <section className="rounded border border-zinc-800">
        <h2 className="text-lg font-semibold p-4 pb-2">Recent orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <Th>Time</Th><Th>Symbol</Th><Th>Side</Th><Th>Qty</Th><Th>Type</Th><Th>Status</Th><Th>Broker</Th><Th>Mode</Th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-center text-zinc-500">No orders yet</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-zinc-900">
                  <td className="p-2 text-zinc-400">{new Date(o.created_at).toLocaleTimeString()}</td>
                  <td className="p-2">{o.symbol}</td>
                  <td className={`p-2 ${o.side === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>{o.side}</td>
                  <td className="p-2">{o.filled_qty}/{o.qty}</td>
                  <td className="p-2">{o.type}</td>
                  <td className="p-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${statusClass(o.status)}`}>{o.status}</span>
                    {o.reject_reason ? <span className="text-rose-400 text-xs ml-2">{o.reject_reason}</span> : null}
                  </td>
                  <td className="p-2 text-zinc-500">{o.provider}</td>
                  <td className="p-2 text-zinc-500">{o.paper ? "PAPER" : "LIVE"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="text-xs text-zinc-500 pt-2">
        Investments in securities markets are subject to market risks. Read all related documents carefully.
        ProfitForce does not custody funds. Live execution requires connecting your own SEBI-registered broker
        and explicit acknowledgment of risk on each trade.
      </footer>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded border border-zinc-800 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : ""}`}>{value}</div>
    </div>
  );
}

function KillCard({ label, row, onToggle }: { label: string; row: KillSwitchRow | undefined; onToggle: () => void }) {
  const enabled = !!row?.enabled;
  return (
    <div className={`rounded border p-4 ${enabled ? "border-rose-700 bg-rose-950/30" : "border-zinc-800"}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
          <div className={`text-lg font-semibold ${enabled ? "text-rose-300" : "text-emerald-400"}`}>
            {enabled ? "HALTED" : "ACTIVE"}
          </div>
          {row?.reason && <div className="text-xs text-zinc-500 mt-1">{row.reason}</div>}
        </div>
        <button
          onClick={onToggle}
          className={`px-3 py-1.5 rounded text-sm ${enabled ? "bg-emerald-700 hover:bg-emerald-600" : "bg-rose-700 hover:bg-rose-600"}`}
        >
          {enabled ? "Resume" : "HALT"}
        </button>
      </div>
    </div>
  );
}

function ProfileField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <input
        type="number"
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && n !== value) onChange(n);
        }}
        className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"
      />
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left p-2 font-medium">{children}</th>;
}

function formatPnL(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function toneFor(v: number): "pos" | "neg" | undefined {
  if (v > 0) return "pos";
  if (v < 0) return "neg";
  return undefined;
}

function toneClass(v: number): string {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-rose-400";
  return "text-zinc-400";
}

function statusClass(s: string): string {
  switch (s) {
    case "FILLED": return "bg-emerald-900/60 text-emerald-300";
    case "PARTIAL": return "bg-amber-900/60 text-amber-300";
    case "OPEN":
    case "SUBMITTED":
    case "PENDING": return "bg-blue-900/60 text-blue-300";
    case "REJECTED":
    case "ERROR": return "bg-rose-900/60 text-rose-300";
    case "CANCELLED": return "bg-zinc-800 text-zinc-400";
    default: return "bg-zinc-800 text-zinc-300";
  }
}
