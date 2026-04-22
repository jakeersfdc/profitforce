"use client";

import React, { useState, useCallback } from "react";

type Signal = {
  symbol: string;
  name?: string;
  currentPrice?: number;
  signal: "BUY" | "SELL" | "EXIT" | "HOLD" | string;
  entryPrice?: number | null;
  stopLoss?: number | null;
  targetPrice?: number | null;
  trailingStop?: number | null;
  strength: number;
  confidence?: number;
  reason: string;
  fnoRecommendation?: { type: string; strike?: number | null; reason?: string } | null;
};

type StrikesData = {
  symbol: string;
  strikes: { atm: number; tick: number; strikes: number[]; price: number };
  recommendation: { type: string; strike: number | null; entry: number | null; stop: number | null; target: number | null; reason?: string };
  signal: Signal;
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

function StrikeChildTable({ strikesData, parentSignal }: { strikesData: StrikesData; parentSignal: Signal }) {
  const { strikes, recommendation } = strikesData;
  const strikesList = strikes?.strikes ?? [];
  const atm = strikes?.atm ?? 0;
  const tick = strikes?.tick ?? 50;
  const underlyingPrice = strikes?.price ?? parentSignal.currentPrice ?? parentSignal.entryPrice ?? 0;
  const rec = recommendation;
  const isBull = parentSignal.signal === 'BUY';
  const isBear = parentSignal.signal === 'SELL';
  const isExit = parentSignal.signal === 'EXIT';

  // Compute buy/sell/exit prices for each strike based on ATR-derived levels
  const entryP = Number(parentSignal.entryPrice ?? 0);
  const stopP = Number(parentSignal.stopLoss ?? 0);
  const targetP = Number(parentSignal.targetPrice ?? 0);
  const atr = entryP && stopP ? Math.abs(entryP - stopP) / 1.5 : tick; // reverse-engineer ATR from stop

  return (
    <div className="bg-[#0b1628] border border-white/10 rounded-lg p-4 space-y-3">
      {/* Action banner */}
      <div className={`flex items-center gap-3 p-3 rounded-lg ${isBull ? 'bg-emerald-950 border border-emerald-800' : isBear ? 'bg-rose-950 border border-rose-800' : isExit ? 'bg-amber-950 border border-amber-800' : 'bg-gray-900 border border-gray-700'}`}>
        <div className="text-2xl">{isBull ? '🟢' : isBear ? '🔴' : isExit ? '🟡' : '⚪'}</div>
        <div className="flex-1">
          <div className="font-bold text-lg">
            {isBull ? 'BUY' : isBear ? 'SELL' : isExit ? 'EXIT' : 'HOLD'} — {parentSignal.symbol}
          </div>
          <div className="text-sm text-[var(--bf-muted)]">
            {rec?.type === 'HOLD' ? 'No F&O action recommended' : `${rec?.type?.replace('_', ' ')} @ Strike ₹${rec?.strike?.toLocaleString() ?? '—'}`}
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-[var(--bf-muted)]">Underlying</div>
          <div className="font-bold text-lg">₹{(Number(underlyingPrice) || 0).toFixed(2)}</div>
        </div>
      </div>

      {/* Strikes table with Buy/Sell/Exit prices */}
      {strikesList.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--bf-muted)] text-xs border-b border-white/10">
                <th className="py-2 px-3 text-left">#</th>
                <th className="py-2 px-3 text-left">Strike Price</th>
                <th className="py-2 px-3 text-center">Type</th>
                <th className="py-2 px-3 text-right text-emerald-400">Buy At</th>
                <th className="py-2 px-3 text-right text-rose-400">Stop Loss</th>
                <th className="py-2 px-3 text-right text-sky-400">Target / Exit</th>
                <th className="py-2 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {strikesList.map((strike, i) => {
                const isAtm = strike === atm;
                const isRecommended = rec?.strike === strike;
                const isOtmCall = strike > atm;
                const isOtmPut = strike < atm;

                // Calculate option-specific buy/sell/exit prices per strike
                const diff = strike - atm; // how far from ATM
                let buyPrice: number;
                let slPrice: number;
                let exitPrice: number;
                let actionLabel: string;
                let actionColor: string;

                if (isBull) {
                  // For BUY signal: buy calls
                  buyPrice = entryP + diff;       // entry adjusted by strike distance
                  slPrice = stopP + diff;          // stop adjusted
                  exitPrice = targetP + diff;      // target adjusted
                  actionLabel = isRecommended ? '★ BUY CALL' : isAtm ? 'BUY CALL (ATM)' : isOtmCall ? 'BUY CALL (OTM)' : 'BUY CALL (ITM)';
                  actionColor = isRecommended ? 'text-emerald-300 font-bold' : 'text-emerald-500/70';
                } else if (isBear) {
                  // For SELL signal: buy puts
                  buyPrice = entryP - diff;
                  slPrice = stopP - diff;
                  exitPrice = targetP - diff;
                  actionLabel = isRecommended ? '★ BUY PUT' : isAtm ? 'BUY PUT (ATM)' : isOtmPut ? 'BUY PUT (OTM)' : 'BUY PUT (ITM)';
                  actionColor = isRecommended ? 'text-rose-300 font-bold' : 'text-rose-500/70';
                } else if (isExit) {
                  // For EXIT signal: exit/square-off
                  buyPrice = entryP;
                  slPrice = entryP;  // no new SL for exit
                  exitPrice = entryP; // exit at current
                  actionLabel = isAtm ? 'EXIT (ATM)' : 'EXIT';
                  actionColor = 'text-amber-400';
                } else {
                  // HOLD
                  buyPrice = entryP + diff;
                  slPrice = stopP ? stopP + diff : 0;
                  exitPrice = targetP ? targetP + diff : 0;
                  actionLabel = 'HOLD';
                  actionColor = 'text-gray-400';
                }

                return (
                  <tr key={strike} className={`${isRecommended ? 'bg-emerald-900/20 ring-1 ring-inset ring-emerald-500/30' : ''} ${isAtm && !isRecommended ? 'bg-white/4' : ''}`}>
                    <td className="py-2.5 px-3 text-[var(--bf-muted)] text-xs">{i + 1}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-base">
                      ₹{strike.toLocaleString()}
                      {isAtm && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-white/10 rounded text-[var(--bf-muted)]">ATM</span>}
                      {isRecommended && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-emerald-900 text-emerald-300 rounded">★ REC</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs">
                      {isOtmCall ? <span className="text-emerald-500">OTM</span> : isOtmPut ? <span className="text-rose-500">OTM</span> : <span className="text-white/70">ATM</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400">
                      ₹{buyPrice > 0 ? buyPrice.toFixed(2) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-rose-400">
                      ₹{slPrice > 0 ? slPrice.toFixed(2) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-sky-400">
                      ₹{exitPrice > 0 ? exitPrice.toFixed(2) : '—'}
                    </td>
                    <td className={`py-2.5 px-3 text-center text-xs ${actionColor}`}>{actionLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Risk/Reward Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-white/5 pt-3">
        <div className="text-center">
          <div className="text-[10px] text-[var(--bf-muted)] uppercase">Entry</div>
          <div className="font-bold text-emerald-400">₹{entryP ? entryP.toFixed(2) : '—'}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-[var(--bf-muted)] uppercase">Stop Loss</div>
          <div className="font-bold text-rose-400">₹{stopP ? stopP.toFixed(2) : '—'}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-[var(--bf-muted)] uppercase">Target</div>
          <div className="font-bold text-sky-400">₹{targetP ? targetP.toFixed(2) : '—'}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-[var(--bf-muted)] uppercase">Risk:Reward</div>
          <div className="font-bold text-amber-400">
            {entryP && stopP && targetP
              ? `1:${(Math.abs(targetP - entryP) / Math.abs(entryP - stopP)).toFixed(1)}`
              : '—'}
          </div>
        </div>
      </div>

      {/* Reason */}
      <div className="text-xs text-[var(--bf-muted)] border-t border-white/5 pt-2">
        <span className="font-semibold">Reason:</span> {parentSignal.reason}
      </div>
    </div>
  );
}

export default function SignalTable({ data, loading, onSelect }: { data: Signal[]; loading?: boolean; onSelect?: (s: Signal) => void }) {
  data = data || [];
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [strikesCache, setStrikesCache] = useState<Record<string, StrikesData>>({});
  const [strikesLoading, setStrikesLoading] = useState<string | null>(null);

  const toggleExpand = useCallback(async (row: Signal) => {
    onSelect?.(row);
    const key = row.symbol;
    if (expandedSymbol === key) {
      setExpandedSymbol(null);
      return;
    }
    setExpandedSymbol(key);

    // Fetch strikes if not cached
    if (!strikesCache[key]) {
      setStrikesLoading(key);
      try {
        const resp = await fetch(`/api/strikes?symbol=${encodeURIComponent(key)}`);
        if (resp.ok) {
          const data = await resp.json();
          setStrikesCache(prev => ({ ...prev, [key]: data }));
        }
      } catch (e) {
        console.error('Failed to fetch strikes for', key, e);
      } finally {
        setStrikesLoading(null);
      }
    }
  }, [expandedSymbol, strikesCache, onSelect]);

  return (
    <div className="rounded-lg overflow-hidden border border-white/5 relative">
      {loading && (
        <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-t-transparent border-white/40 rounded-full animate-spin" />
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-white/6">
          <thead className="bg-transparent">
            <tr>
              <th className="px-4 py-3 text-left text-sm text-[var(--bf-muted)]"></th>
              <th className="px-4 py-3 text-left text-sm text-[var(--bf-muted)]">Symbol</th>
              <th className="px-4 py-3 text-right text-sm text-[var(--bf-muted)]">Price</th>
              <th className="px-4 py-3 text-center text-sm text-[var(--bf-muted)]">Signal</th>
              <th className="px-4 py-3 text-right text-sm text-[var(--bf-muted)]">Entry</th>
              <th className="px-4 py-3 text-right text-sm text-[var(--bf-muted)]">Stop Loss</th>
              <th className="px-4 py-3 text-right text-sm text-[var(--bf-muted)]">Target</th>
              <th className="px-4 py-3 text-center text-sm text-[var(--bf-muted)]">F&O Strike</th>
              <th className="px-4 py-3 text-center text-sm text-[var(--bf-muted)]">Strength</th>
            </tr>
          </thead>
          <tbody className="bg-transparent divide-y divide-white/6">
            {data.map((row, idx) => {
              const isExpanded = expandedSymbol === row.symbol;
              return (
                <React.Fragment key={`${row.symbol}-${idx}`}>
                  <tr onClick={() => toggleExpand(row)} className={`hover:bg-white/2 cursor-pointer transition-colors ${isExpanded ? 'bg-white/5' : ''}`}>
                    <td className="px-2 py-3 text-center text-[var(--bf-muted)] text-xs w-8">
                      <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium">{row.symbol}</div>
                      <div className="text-xs text-[var(--bf-muted)]">{row.name}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{row.currentPrice != null ? Number(row.currentPrice).toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-center"><SignalPill signal={row.signal} /></td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-400">{row.entryPrice != null ? Number(row.entryPrice).toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-rose-400">{row.stopLoss != null ? Number(row.stopLoss).toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-sky-400">{row.targetPrice != null ? Number(row.targetPrice).toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-center text-xs">
                      {row.fnoRecommendation && row.fnoRecommendation.type !== 'NONE' ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-2 py-1 rounded font-semibold ${row.fnoRecommendation.type.includes('CALL') ? 'bg-emerald-900 text-emerald-300' : row.fnoRecommendation.type.includes('PUT') ? 'bg-rose-900 text-rose-300' : 'bg-gray-700 text-gray-300'}`}>
                            {row.fnoRecommendation.type.replace('_', ' ')}
                          </span>
                          {row.fnoRecommendation.strike != null && (
                            <span className="font-bold text-sm text-white">₹{Number(row.fnoRecommendation.strike).toLocaleString()}</span>
                          )}
                        </div>
                      ) : <span className="text-[var(--bf-muted)]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-full bg-white/3 rounded-full h-2 overflow-hidden">
                        <div style={{ width: `${row.strength}%` }} className="h-2 bg-gradient-to-r from-emerald-400 to-emerald-600" />
                      </div>
                      <div className="text-xs text-[var(--bf-muted)] mt-1">{row.strength}% {row.confidence != null ? `(${(row.confidence * 100).toFixed(0)}% conf)` : ''}</div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="p-4 bg-[#060e1a]">
                        {strikesLoading === row.symbol ? (
                          <div className="flex items-center justify-center py-6 gap-3">
                            <div className="w-6 h-6 border-2 border-t-transparent border-emerald-400 rounded-full animate-spin" />
                            <span className="text-sm text-[var(--bf-muted)]">Loading strikes for {row.symbol}...</span>
                          </div>
                        ) : strikesCache[row.symbol] ? (
                          <StrikeChildTable strikesData={strikesCache[row.symbol]} parentSignal={row} />
                        ) : (
                          <div className="text-center py-4 text-sm text-[var(--bf-muted)]">No strike data available</div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3 p-2">
        {data.map((row, idx) => {
          const isExpanded = expandedSymbol === row.symbol;
          return (
            <div key={`${row.symbol}-${idx}`} className="rounded-md bg-white/3 border border-white/6 overflow-hidden">
              <div onClick={() => toggleExpand(row)} className={`p-3 cursor-pointer ${isExpanded ? 'bg-white/5' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-semibold">
                      <span className={`inline-block mr-2 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                      {row.symbol} <span className="text-xs text-[var(--bf-muted)]">› {row.name}</span>
                    </div>
                    <div className="text-xs text-[var(--bf-muted)] mt-1 line-clamp-1">{row.reason}</div>
                    <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                      <div><div className="text-[var(--bf-muted)]">Entry</div><div className="font-medium text-emerald-400">{row.entryPrice != null ? Number(row.entryPrice).toFixed(2) : '—'}</div></div>
                      <div><div className="text-[var(--bf-muted)]">Stop Loss</div><div className="font-medium text-rose-400">{row.stopLoss != null ? Number(row.stopLoss).toFixed(2) : '—'}</div></div>
                      <div><div className="text-[var(--bf-muted)]">Target</div><div className="font-medium text-sky-400">{row.targetPrice != null ? Number(row.targetPrice).toFixed(2) : '—'}</div></div>
                    </div>
                    {row.fnoRecommendation && row.fnoRecommendation.type !== 'NONE' && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded font-semibold ${row.fnoRecommendation.type.includes('CALL') ? 'bg-emerald-900 text-emerald-300' : row.fnoRecommendation.type.includes('PUT') ? 'bg-rose-900 text-rose-300' : 'bg-gray-700 text-gray-300'}`}>
                          {row.fnoRecommendation.type.replace('_', ' ')}
                        </span>
                        {row.fnoRecommendation.strike != null && (
                          <span className="font-bold text-white">₹{Number(row.fnoRecommendation.strike).toLocaleString()}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{row.currentPrice != null ? Number(row.currentPrice).toFixed(2) : '0.00'}</div>
                    <div className="mt-2 text-right"><SignalPill signal={row.signal} /></div>
                    <div className="text-xs text-[var(--bf-muted)] mt-2">Str: {row.strength}%</div>
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div className="p-3 border-t border-white/5 bg-[#060e1a]">
                  {strikesLoading === row.symbol ? (
                    <div className="flex items-center justify-center py-4 gap-2">
                      <div className="w-5 h-5 border-2 border-t-transparent border-emerald-400 rounded-full animate-spin" />
                      <span className="text-xs text-[var(--bf-muted)]">Loading strikes...</span>
                    </div>
                  ) : strikesCache[row.symbol] ? (
                    <StrikeChildTable strikesData={strikesCache[row.symbol]} parentSignal={row} />
                  ) : (
                    <div className="text-center py-3 text-xs text-[var(--bf-muted)]">No strike data available</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
