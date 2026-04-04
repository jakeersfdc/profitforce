"use client";

import React from "react";

type Signal = {
  symbol: string;
  name?: string;
  currentPrice?: number;
  signal: "BUY" | "SELL" | "EXIT" | "HOLD" | string;
  entryPrice?: number | null;
  stopLoss?: number | null;
  targetPrice?: number | null;
  strength: number;
  reason: string;
};

function SignalPill({ signal }: { signal: Signal["signal"] }) {
  const map: Record<string, string> = {
    BUY: "bg-emerald-500 text-black",
    SELL: "bg-rose-600 text-white",
    EXIT: "bg-rose-600 text-white",
    HOLD: "bg-sky-500 text-white",
  };
  return <span className={`px-2 py-1 text-xs rounded-md font-semibold ${map[signal] ?? 'bg-gray-500 text-white'}`}>{signal}</span>;
}

export default function SignalTable({ data, loading, onSelect }: { data: Signal[]; loading?: boolean; onSelect?: (s: Signal) => void }) {
  data = data || [];
  return (
    <div className="rounded-lg overflow-hidden border border-white/5 relative">
      {loading && (
        <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-t-transparent border-white/40 rounded-full animate-spin" />
        </div>
      )}

      <div className="hidden md:block">
        <table className="min-w-full divide-y divide-white/6">
          <thead className="bg-transparent">
            <tr>
              <th className="px-4 py-3 text-left text-sm text-[var(--bf-muted)]">Symbol</th>
              <th className="px-4 py-3 text-left text-sm text-[var(--bf-muted)]">Name</th>
              <th className="px-4 py-3 text-right text-sm text-[var(--bf-muted)]">Price</th>
              <th className="px-4 py-3 text-right text-sm text-[var(--bf-muted)]">Entry</th>
              <th className="px-4 py-3 text-right text-sm text-[var(--bf-muted)]">Stop</th>
              <th className="px-4 py-3 text-right text-sm text-[var(--bf-muted)]">Target</th>
              <th className="px-4 py-3 text-center text-sm text-[var(--bf-muted)]">Signal</th>
              <th className="px-4 py-3 text-center text-sm text-[var(--bf-muted)]">Strength</th>
              <th className="px-4 py-3 text-left text-sm text-[var(--bf-muted)]">Reason</th>
            </tr>
          </thead>
          <tbody className="bg-transparent divide-y divide-white/6">
            {data.map((row, idx) => (
              <tr key={`${row.symbol}-${idx}`} onClick={() => onSelect?.(row)} className="hover:bg-white/2 cursor-pointer">
                <td className="px-4 py-3 align-middle font-medium">{row.symbol}</td>
                <td className="px-4 py-3 text-sm text-[var(--bf-muted)]">{row.name}</td>
                <td className="px-4 py-3 text-right font-semibold">{row.currentPrice != null ? Number(row.currentPrice).toFixed(2) : '—'}</td>
                <td className="px-4 py-3 text-right">{row.entryPrice != null ? Number(row.entryPrice).toFixed(2) : '—'}</td>
                <td className="px-4 py-3 text-right">{row.stopLoss != null ? Number(row.stopLoss).toFixed(2) : '—'}</td>
                <td className="px-4 py-3 text-right">{row.targetPrice != null ? Number(row.targetPrice).toFixed(2) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <SignalPill signal={row.signal} />
                </td>
                <td className="px-4 py-3">
                  <div className="w-full bg-white/3 rounded-full h-2 overflow-hidden">
                    <div style={{ width: `${row.strength}%` }} className="h-2 bg-gradient-to-r from-emerald-400 to-emerald-600" />
                  </div>
                  <div className="text-xs text-[var(--bf-muted)] mt-1">{row.strength}%</div>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--bf-muted)]">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3 p-2">
        {data.map((row, idx) => (
          <div key={`${row.symbol}-${idx}`} onClick={() => onSelect?.(row)} className="p-3 rounded-md bg-white/3 border border-white/6 cursor-pointer">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="text-sm font-semibold">{row.symbol} <span className="text-xs text-[var(--bf-muted)]">› {row.name}</span></div>
                <div className="text-sm text-[var(--bf-muted)] mt-1">{row.reason}</div>
                  <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                  <div><div className="text-[var(--bf-muted)]">Entry</div><div className="font-medium">{row.entryPrice != null ? Number(row.entryPrice).toFixed(2) : '—'}</div></div>
                  <div><div className="text-[var(--bf-muted)]">Stop</div><div className="font-medium">{row.stopLoss != null ? Number(row.stopLoss).toFixed(2) : '—'}</div></div>
                  <div><div className="text-[var(--bf-muted)]">Target</div><div className="font-medium">{row.targetPrice != null ? Number(row.targetPrice).toFixed(2) : '—'}</div></div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{row.currentPrice != null ? Number(row.currentPrice).toFixed(2) : '0.00'}</div>
                <div className="mt-2 text-right">
                  <SignalPill signal={row.signal} />
                </div>
                <div className="text-xs text-[var(--bf-muted)] mt-2">Strength: {row.strength}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
