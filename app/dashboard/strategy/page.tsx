"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

interface StrategyMeta { id: string; name: string; description: string }

interface BacktestSummary {
  symbol: string;
  strategyId: string;
  startingCapital: number;
  endingCapital: number;
  totalNetPnl: number;
  roiPct: number;
  cagrPct?: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdownPct: number;
  sharpe?: number;
  sortino?: number;
}

interface Ensemble {
  startingCapital: number;
  endingCapital: number;
  totalNetPnl: number;
  roiPct: number;
  closedTrades: number;
  winRate: number;
  avgSharpe: number | null;
  perStrategyAllocation: Record<string, number>;
}

interface PriceBar { date: string; open: number; high: number; low: number; close: number }

interface GannFanPoint { date: string; g1x1: number; g2x1: number; g4x1: number; g1x2: number; g1x4: number }

interface GannFan {
  pivot: { index: number; date: string; price: number; direction: "up" | "down"; unit: number };
  series: GannFanPoint[];
  squareSupport: number;
  squareResistance: number;
}

interface AllResponse {
  mode: "all";
  symbol: string;
  bars: PriceBar[];
  gannFan: GannFan | null;
  results: Record<string, BacktestSummary>;
  ensemble: Ensemble;
}

export default function StrategyLab() {
  const [strategies, setStrategies] = useState<StrategyMeta[]>([]);
  const [symbol, setSymbol] = useState("RELIANCE");
  const [capital, setCapital] = useState(100000);
  const [risk, setRisk] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AllResponse | null>(null);

  useEffect(() => {
    fetch("/api/strategy/backtest").then((r) => r.json()).then((d) => setStrategies(d.strategies ?? []));
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch("/api/strategy/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          strategyId: "all",
          startingCapital: capital,
          riskPerTrade: risk / 100,
        }),
      });
      const text = await r.text();
      const json = text ? (JSON.parse(text) as AllResponse | { error: string }) : null;
      if (!json) throw new Error("Empty response");
      if ("error" in json) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [symbol, capital, risk]);

  return (
    <div className="p-6 space-y-6 text-zinc-100 bg-zinc-950 min-h-screen">
      <header className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Strategy Lab</h1>
          <p className="text-sm text-zinc-400">All strategies, side by side, with the Gann fan projection.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2 text-sm">
          <Field label="Symbol">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 w-32"
            />
          </Field>
          <Field label="Capital ₹">
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 w-32"
            />
          </Field>
          <Field label="Risk %">
            <input
              type="number"
              step={0.25}
              value={risk}
              onChange={(e) => setRisk(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 w-20"
            />
          </Field>
          <button
            onClick={run}
            disabled={busy || !symbol}
            className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? "Running…" : "Run all strategies"}
          </button>
        </div>
      </header>

      {error && <div className="p-3 rounded bg-red-900/40 border border-red-700">{error}</div>}

      {data && (
        <>
          <EnsembleCard ensemble={data.ensemble} />
          <GannChart bars={data.bars} fan={data.gannFan} />
          <ResultsTable results={data.results} strategies={strategies} />
        </>
      )}

      <footer className="text-xs text-zinc-500 pt-2">
        Backtest results are historical and do not guarantee future performance.
        Investments in securities markets are subject to market risks.
      </footer>
    </div>
  );
}

function EnsembleCard({ ensemble }: { ensemble: Ensemble }) {
  return (
    <section className="rounded border border-zinc-800 p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
      <Stat label="Ensemble ROI" value={`${ensemble.roiPct}%`} tone={ensemble.roiPct >= 0 ? "pos" : "neg"} />
      <Stat label="Net P&L" value={inr(ensemble.totalNetPnl)} tone={ensemble.totalNetPnl >= 0 ? "pos" : "neg"} />
      <Stat label="Win rate" value={`${ensemble.winRate}%`} />
      <Stat label="Trades" value={`${ensemble.closedTrades}`} />
      <Stat label="Avg Sharpe" value={ensemble.avgSharpe != null ? `${ensemble.avgSharpe}` : "—"} />
    </section>
  );
}

function ResultsTable({ results, strategies }: { results: Record<string, BacktestSummary>; strategies: StrategyMeta[] }) {
  const rows = Object.entries(results);
  const nameById = Object.fromEntries(strategies.map((s) => [s.id, s.name]));
  return (
    <section className="rounded border border-zinc-800 overflow-x-auto">
      <h2 className="text-lg font-semibold p-4 pb-2">Per-strategy results</h2>
      <table className="w-full text-sm">
        <thead className="text-zinc-400">
          <tr className="border-b border-zinc-800">
            <Th>Strategy</Th><Th>Trades</Th><Th>Win %</Th><Th>Net P&L</Th><Th>ROI %</Th>
            <Th>Profit factor</Th><Th>Expectancy</Th><Th>Max DD %</Th><Th>Sharpe</Th><Th>Sortino</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, r]) => (
            <tr key={id} className="border-b border-zinc-900">
              <td className="p-2 font-medium">{nameById[id] ?? id}</td>
              <td className="p-2">{r.closedTrades}</td>
              <td className="p-2">{r.winRate}%</td>
              <td className={`p-2 ${r.totalNetPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{inr(r.totalNetPnl)}</td>
              <td className={`p-2 ${r.roiPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{r.roiPct}%</td>
              <td className="p-2">{Number.isFinite(r.profitFactor) ? r.profitFactor : "∞"}</td>
              <td className="p-2">{r.expectancy}</td>
              <td className="p-2 text-amber-300">{r.maxDrawdownPct}%</td>
              <td className="p-2">{r.sharpe ?? "—"}</td>
              <td className="p-2">{r.sortino ?? "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={10} className="p-4 text-center text-zinc-500">No results</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function GannChart({ bars, fan }: { bars: PriceBar[]; fan: GannFan | null }) {
  const W = 960, H = 380, padL = 50, padR = 20, padT = 16, padB = 28;
  const points = useMemo(() => {
    if (!bars.length) return null;
    // x axis covers bars + fan-projected dates
    const allDates = new Set<string>(bars.map((b) => b.date));
    if (fan) for (const p of fan.series) allDates.add(p.date);
    const xs = Array.from(allDates).sort();
    const xIdx: Record<string, number> = {};
    xs.forEach((d, i) => { xIdx[d] = i; });

    const allPrices: number[] = [];
    bars.forEach((b) => { allPrices.push(b.high, b.low); });
    if (fan) fan.series.forEach((p) => { allPrices.push(p.g1x1, p.g4x1, p.g1x4); });
    if (fan) { allPrices.push(fan.squareSupport, fan.squareResistance); }
    const lo = Math.min(...allPrices) * 0.98;
    const hi = Math.max(...allPrices) * 1.02;

    const x = (d: string) => padL + (xIdx[d] / Math.max(1, xs.length - 1)) * (W - padL - padR);
    const y = (p: number) => padT + (1 - (p - lo) / Math.max(1e-6, hi - lo)) * (H - padT - padB);
    return { xs, xIdx, lo, hi, x, y };
  }, [bars, fan]);

  if (!points || !bars.length) return <section className="rounded border border-zinc-800 p-4 text-zinc-500">No price data.</section>;
  const { x, y, lo, hi } = points;

  const candleW = Math.max(2, (W - padL - padR) / Math.max(50, bars.length) * 0.8);

  return (
    <section className="rounded border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Price + Gann fan</h2>
        {fan && (
          <div className="text-xs text-zinc-400">
            Pivot {fan.pivot.direction === "up" ? "↑ swing low" : "↓ swing high"} ₹{fan.pivot.price} on {fan.pivot.date}
            {" · "}1×1 unit ₹{fan.pivot.unit}/bar
            {" · "}Sq9 support ₹{fan.squareSupport} / resistance ₹{fan.squareResistance}
          </div>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="bg-zinc-950">
        {/* axes */}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#3f3f46" />
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#3f3f46" />
        {/* y ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const p = lo + t * (hi - lo);
          return (
            <g key={i}>
              <line x1={padL} y1={y(p)} x2={W - padR} y2={y(p)} stroke="#27272a" strokeDasharray="2 4" />
              <text x={6} y={y(p) + 3} fontSize="10" fill="#71717a">₹{Math.round(p)}</text>
            </g>
          );
        })}

        {/* square-of-9 horizontals */}
        {fan && (
          <>
            <line x1={padL} x2={W - padR} y1={y(fan.squareSupport)} y2={y(fan.squareSupport)} stroke="#10b981" strokeOpacity="0.6" strokeDasharray="4 4" />
            <line x1={padL} x2={W - padR} y1={y(fan.squareResistance)} y2={y(fan.squareResistance)} stroke="#ef4444" strokeOpacity="0.6" strokeDasharray="4 4" />
            <text x={W - padR - 80} y={y(fan.squareResistance) - 4} fontSize="10" fill="#fca5a5">Sq9 R ₹{fan.squareResistance}</text>
            <text x={W - padR - 80} y={y(fan.squareSupport) + 12} fontSize="10" fill="#6ee7b7">Sq9 S ₹{fan.squareSupport}</text>
          </>
        )}

        {/* candles */}
        {bars.map((b) => {
          const cx = x(b.date);
          const isUp = b.close >= b.open;
          const colour = isUp ? "#34d399" : "#f87171";
          return (
            <g key={b.date}>
              <line x1={cx} x2={cx} y1={y(b.high)} y2={y(b.low)} stroke={colour} strokeWidth={1} />
              <rect
                x={cx - candleW / 2}
                y={y(Math.max(b.open, b.close))}
                width={candleW}
                height={Math.max(1, Math.abs(y(b.open) - y(b.close)))}
                fill={colour}
                opacity={isUp ? 0.85 : 0.85}
              />
            </g>
          );
        })}

        {/* gann fan lines */}
        {fan && (
          <>
            {(["g1x4", "g1x2", "g1x1", "g2x1", "g4x1"] as const).map((k, idx) => {
              const stroke = ["#fde047", "#facc15", "#f97316", "#fb923c", "#f87171"][idx];
              const d = fan.series.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date)},${y(p[k])}`).join(" ");
              return <path key={k} d={d} stroke={stroke} strokeWidth={1.5} fill="none" opacity={0.85} />;
            })}
            {/* labels at right */}
            {(["g4x1", "g2x1", "g1x1", "g1x2", "g1x4"] as const).map((k, i) => {
              const last = fan.series[fan.series.length - 1];
              const stroke = ["#f87171", "#fb923c", "#f97316", "#facc15", "#fde047"][i];
              const labels: Record<string, string> = { g4x1: "4×1", g2x1: "2×1", g1x1: "1×1", g1x2: "1×2", g1x4: "1×4" };
              return (
                <text key={k} x={W - padR + 2} y={y(last[k]) + 3} fontSize="10" fill={stroke}>
                  {labels[k]}
                </text>
              );
            })}
            {/* pivot marker */}
            <circle cx={x(fan.pivot.date)} cy={y(fan.pivot.price)} r={4} fill="#22d3ee" />
          </>
        )}
      </svg>
      <div className="text-xs text-zinc-500 mt-2 flex flex-wrap gap-3">
        <span><span className="inline-block w-3 h-0.5 bg-orange-500 align-middle mr-1" />1×1 (45° trend)</span>
        <span><span className="inline-block w-3 h-0.5 bg-orange-400 align-middle mr-1" />2×1 / 1×2</span>
        <span><span className="inline-block w-3 h-0.5 bg-yellow-300 align-middle mr-1" />4×1 / 1×4</span>
        <span><span className="inline-block w-3 h-0.5 bg-emerald-500 align-middle mr-1" />Sq9 support</span>
        <span><span className="inline-block w-3 h-0.5 bg-rose-500 align-middle mr-1" />Sq9 resistance</span>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold ${tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : ""}`}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left p-2 font-medium">{children}</th>;
}

function inr(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
