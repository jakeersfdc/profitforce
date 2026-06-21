/**
 * Professional Trading Dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Complete trading dashboard showing:
 * - Multiple signals (stocks, indices, crypto)
 * - Signal comparison
 * - Market overview
 * - Portfolio statistics
 * - VIX and volatility metrics
 */

'use client';

import React, { useState, useEffect } from 'react';
import { SASSignal } from '@/lib/engine/types';
import SASSignalUI from './SASSignalUI';

interface TradingDashboardProps {
  signals?: SASSignal[];
  onSignalClick?: (signal: SASSignal) => void;
  refreshInterval?: number;
}

export default function TradingDashboard({
  signals: initialSignals = [],
  onSignalClick,
  refreshInterval = 60000,
}: TradingDashboardProps) {
  const [signals, setSignals] = useState<SASSignal[]>(initialSignals);
  const [selectedSignal, setSelectedSignal] = useState<SASSignal | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [loading, setLoading] = useState(false);

  // Calculate statistics
  const stats = {
    totalSignals: signals.length,
    buySignals: signals.filter((s) => s.signal === 'BUY').length,
    sellSignals: signals.filter((s) => s.signal === 'SELL').length,
    avgConfidence:
      signals.length > 0
        ? (signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length).toFixed(1)
        : 0,
    ntzActive: signals.filter((s) => s.noTradeZone.isActive).length,
    withVP: signals.filter((s) => s.volumeProfile).length,
    withVIX: signals.filter((s) => s.vixValue).length,
  };

  // Filter signals
  const filteredSignals =
    filterType === 'ALL'
      ? signals
      : signals.filter((s) => s.signal === filterType);

  // Fetch signals
  const fetchSignals = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/signals/sas');
      const data = await response.json();
      setSignals(data.signals || []);
    } catch (error) {
      console.error('Failed to fetch signals:', error);
    }
    setLoading(false);
  };

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchSignals, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">🤖 SAS Trading Dashboard</h1>
        <p className="text-gray-400">Real-time signal analysis • Automated trading system</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
        <StatCard
          label="Total Signals"
          value={stats.totalSignals}
          icon="📊"
          color="from-blue-500 to-blue-600"
        />
        <StatCard
          label="BUY Signals"
          value={stats.buySignals}
          icon="📈"
          color="from-green-500 to-green-600"
        />
        <StatCard
          label="SELL Signals"
          value={stats.sellSignals}
          icon="📉"
          color="from-red-500 to-red-600"
        />
        <StatCard
          label="Avg Confidence"
          value={`${stats.avgConfidence}%`}
          icon="💯"
          color="from-purple-500 to-purple-600"
        />
        <StatCard
          label="NTZ Active"
          value={stats.ntzActive}
          icon="⚠️"
          color="from-yellow-500 to-yellow-600"
        />
        <StatCard
          label="With VP"
          value={stats.withVP}
          icon="📈"
          color="from-cyan-500 to-cyan-600"
        />
        <StatCard
          label="With VIX"
          value={stats.withVIX}
          icon="🌡️"
          color="from-pink-500 to-pink-600"
        />
        <StatCard
          label="Signals/Hour"
          value={refreshInterval / 60000}
          icon="⏱️"
          color="from-indigo-500 to-indigo-600"
        />
      </div>

      {/* Controls */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <button
          onClick={() => setFilterType('ALL')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            filterType === 'ALL'
              ? 'bg-blue-500 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
          }`}
        >
          All ({signals.length})
        </button>
        <button
          onClick={() => setFilterType('BUY')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            filterType === 'BUY'
              ? 'bg-green-500 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
          }`}
        >
          BUY ({stats.buySignals})
        </button>
        <button
          onClick={() => setFilterType('SELL')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            filterType === 'SELL'
              ? 'bg-red-500 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
          }`}
        >
          SELL ({stats.sellSignals})
        </button>
        <button
          onClick={fetchSignals}
          disabled={loading}
          className="ml-auto px-4 py-2 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? '🔄 Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {/* Signals Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Signal View */}
        <div className="lg:col-span-2">
          {selectedSignal ? (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedSignal(null)}
                className="text-gray-400 hover:text-white text-sm font-semibold mb-4"
              >
                ← Back to Signals
              </button>
              <SASSignalUI signal={selectedSignal} showMetadata={true} />
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4">Active Signals</h2>
              {filteredSignals.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg">No signals in this filter</p>
                  <p className="text-sm mt-2">Try different filters or refresh</p>
                </div>
              ) : (
                filteredSignals.map((signal) => (
                  <div
                    key={`${signal.symbol}-${signal.timestamp.getTime()}`}
                    onClick={() => {
                      setSelectedSignal(signal);
                      onSignalClick?.(signal);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 rounded-lg p-4 cursor-pointer transition transform hover:scale-102"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`px-3 py-1 rounded-full font-bold text-sm ${
                          signal.signal === 'BUY'
                            ? 'bg-green-500 text-white'
                            : signal.signal === 'SELL'
                              ? 'bg-red-500 text-white'
                              : 'bg-gray-500 text-white'
                        }`}>
                          {signal.signal}
                        </div>
                        <div>
                          <div className="font-bold">{signal.symbol}</div>
                          <div className="text-xs text-gray-400">
                            ${signal.price.toFixed(2)} • {signal.priceZone.replace(/_/g, ' ')}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">{signal.confidence.toFixed(0)}%</div>
                        <div className="text-xs text-gray-400">
                          {signal.confluenceScores.total > 0 ? '+' : ''}{signal.confluenceScores.total.toFixed(1)}
                        </div>
                      </div>
                    </div>
                    {signal.noTradeZone.isActive && (
                      <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
                        <span>⚠️ NTZ {signal.noTradeZone.reason}</span>
                      </div>
                    )}
                    {signal.volumeProfile && (
                      <div className="mt-2 text-xs text-cyan-400">
                        VP: ${signal.volumeProfile.poc.toFixed(2)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Sidebar - Stats & Info */}
        <div className="space-y-4">
          {/* Market Status */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700">
            <h3 className="font-bold mb-4 text-lg">Market Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Active Symbols</span>
                <span className="font-bold text-green-400">{new Set(signals.map((s) => s.symbol)).size}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Win Signals (BUY)</span>
                <span className="font-bold text-green-400">{stats.buySignals}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Loss Signals (SELL)</span>
                <span className="font-bold text-red-400">{stats.sellSignals}</span>
              </div>
              <div className="h-px bg-slate-700 my-2"></div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Avg Confidence</span>
                <span className="font-bold text-purple-400">{stats.avgConfidence}%</span>
              </div>
            </div>
          </div>

          {/* Top Symbols */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700">
            <h3 className="font-bold mb-4 text-lg">Top Symbols</h3>
            <div className="space-y-2">
              {Array.from(new Set(signals.map((s) => s.symbol)))
                .slice(0, 5)
                .map((symbol) => {
                  const symbolSignals = signals.filter((s) => s.symbol === symbol);
                  const avgConf = (symbolSignals.reduce((sum, s) => sum + s.confidence, 0) / symbolSignals.length).toFixed(0);
                  return (
                    <div key={symbol} className="flex justify-between items-center p-2 bg-slate-700/50 rounded">
                      <span className="font-medium">{symbol}</span>
                      <span className="text-xs text-gray-400">{avgConf}%</span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* High Confidence Signals */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700">
            <h3 className="font-bold mb-4 text-lg">High Confidence</h3>
            <div className="space-y-2">
              {signals
                .filter((s) => s.confidence >= 80)
                .slice(0, 5)
                .map((signal) => (
                  <div
                    key={`${signal.symbol}-${signal.timestamp.getTime()}`}
                    className="flex justify-between items-center p-2 bg-slate-700/50 rounded hover:bg-slate-700 cursor-pointer"
                    onClick={() => {
                      setSelectedSignal(signal);
                      onSignalClick?.(signal);
                    }}
                  >
                    <span className="font-medium">{signal.symbol}</span>
                    <span className={`text-sm font-bold ${signal.signal === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                      {signal.signal}
                    </span>
                  </div>
                ))}
              {signals.filter((s) => s.confidence >= 80).length === 0 && (
                <p className="text-sm text-gray-500">No high confidence signals</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-slate-700 text-center text-gray-500 text-sm">
        <p>Last updated: {new Date().toLocaleTimeString()}</p>
        <p className="mt-2">SAS Trading System v2.0 • Professional Grade Signals</p>
      </div>
    </div>
  );
}

/**
 * Stat Card Component
 */
function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-lg p-4 text-center shadow-lg`}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-xs text-white/70 font-semibold uppercase">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">{value}</div>
    </div>
  );
}
