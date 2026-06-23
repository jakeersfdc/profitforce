/**
 * ProfitForce Trading Dashboard v2.0 - Live Market Data
 * Real-time signals with AI predictions
 * Supports: Equities, Crypto, Forex, Commodities
 */

'use client';

import React, { useState, useEffect } from 'react';

interface Signal {
  id: string;
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  price: number;
  change: number;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  lastUpdate: string;
  factors: string[];
}

interface DemoTab {
  id: 'equities' | 'crypto' | 'forex' | 'commodities';
  label: string;
  icon: string;
}

export default function ProfitForceDemo() {
  const [activeTab, setActiveTab] = useState<'equities' | 'crypto' | 'forex' | 'commodities'>('equities');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [allSignals, setAllSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  useEffect(() => {
    // Pulse animation
    const liveInterval = setInterval(() => setIsLive(prev => !prev), 1500);
    return () => clearInterval(liveInterval);
  }, []);

  useEffect(() => {
    fetchLiveSignals();
    // Refresh every 30 seconds
    const refreshInterval = setInterval(fetchLiveSignals, 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  const fetchLiveSignals = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/signals/live-demo');
      
      if (!response.ok) {
        throw new Error('Failed to fetch live signals');
      }

      const data = await response.json();
      
      if (data.success && data.signals && data.signals.length > 0) {
        setAllSignals(data.signals);
        setLastUpdate(new Date().toLocaleTimeString());
      } else {
        throw new Error('No signals data received');
      }
    } catch (err) {
      console.error('Error fetching signals:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch live data');
      // Use empty signals on error
      setAllSignals([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter signals by category
  const equitySignals = allSignals.filter(s => 
    ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'].includes(s.symbol)
  );
  const cryptoSignals = allSignals.filter(s => 
    ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD'].includes(s.symbol)
  );
  const forexSignals = allSignals.filter(s => 
    ['EUR/USD', 'GBP/USD'].includes(s.symbol)
  );
  const commoditySignals = allSignals.filter(s => 
    ['GOLD/USD', 'CRUDE OIL'].includes(s.symbol)
  );

  const tabs: DemoTab[] = [
    { id: 'equities', label: '📊 Equities (India)', icon: '📊' },
    { id: 'crypto', label: '🪙 Crypto', icon: '🪙' },
    { id: 'forex', label: '💱 Forex', icon: '💱' },
    { id: 'commodities', label: '⚙️ Commodities', icon: '⚙️' }
  ];

  const renderSignalCard = (signal: Signal) => {
    const isExpanded = expandedCard === signal.id;
    const isPositive = signal.signal === 'BUY';
    const riskReward = ((signal.target1 - signal.entry) / (signal.entry - signal.stopLoss)).toFixed(2);
    
    return (
      <div
        key={signal.id}
        onClick={() => setExpandedCard(isExpanded ? null : signal.id)}
        className={`group relative cursor-pointer transition-all duration-300 transform hover:scale-105 ${
          isExpanded ? 'md:col-span-2 lg:col-span-2' : ''
        }`}
      >
        {/* Glow effect on hover */}
        <div className={`absolute inset-0 rounded-xl blur-2xl transition-all duration-300 ${
          isExpanded
            ? isPositive ? 'bg-green-500/30' : 'bg-red-500/30'
            : isPositive ? 'bg-green-500/20' : 'bg-red-500/20'
        } opacity-0 group-hover:opacity-100`} />

        {/* Main card */}
        <div className={`relative backdrop-blur-xl rounded-xl border transition-all duration-300 ${
          isExpanded
            ? 'bg-gradient-to-br from-slate-800/90 to-slate-900/90 border-blue-500/50 shadow-2xl shadow-blue-500/20 p-6'
            : 'bg-gradient-to-br from-slate-800/50 to-slate-900/50 border-slate-600/50 p-4 hover:border-blue-500/30'
        }`}>

          {/* Expanded View */}
          {isExpanded && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6 pb-4 border-b border-slate-700/50">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-3xl font-bold text-white">{signal.symbol}</h2>
                    <div className={`px-4 py-2 rounded-lg font-bold text-sm backdrop-blur ${
                      signal.signal === 'BUY'
                        ? 'bg-gradient-to-r from-green-500/30 to-emerald-500/30 text-green-200 border border-green-500/50'
                        : signal.signal === 'SELL'
                        ? 'bg-gradient-to-r from-red-500/30 to-rose-500/30 text-red-200 border border-red-500/50'
                        : 'bg-gradient-to-r from-yellow-500/30 to-amber-500/30 text-yellow-200 border border-yellow-500/50'
                    }`}>
                      {signal.signal}
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm">{signal.lastUpdate}</p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    {signal.confidence}%
                  </div>
                  <p className="text-gray-400 text-xs">Confidence</p>
                </div>
              </div>

              {/* Price Info */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/50">
                  <p className="text-gray-400 text-xs mb-1">Current Price</p>
                  <p className="text-2xl font-bold text-white">{signal.price.toFixed(2)}</p>
                  <p className={`text-sm mt-1 ${signal.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {signal.change >= 0 ? '↑' : '↓'} {Math.abs(signal.change)}%
                  </p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/50">
                  <p className="text-gray-400 text-xs mb-1">Entry</p>
                  <p className="text-2xl font-bold text-blue-400">{signal.entry.toFixed(2)}</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/50">
                  <p className="text-gray-400 text-xs mb-1">Stop Loss</p>
                  <p className="text-2xl font-bold text-red-400">{signal.stopLoss.toFixed(2)}</p>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/50">
                  <p className="text-gray-400 text-xs mb-1">Risk:Reward</p>
                  <p className="text-2xl font-bold text-purple-400">{riskReward}</p>
                </div>
              </div>

              {/* Targets */}
              <div className="bg-gradient-to-r from-slate-700/50 to-slate-800/50 rounded-lg p-4 border border-slate-600/50">
                <p className="text-gray-400 text-sm mb-3">Profit Targets</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-1">T1 (1x)</p>
                    <p className="text-lg font-bold text-green-400">{signal.target1.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">+{((signal.target1 - signal.entry) / signal.entry * 100).toFixed(1)}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-1">T2 (1.5x)</p>
                    <p className="text-lg font-bold text-green-400">{signal.target2.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">+{((signal.target2 - signal.entry) / signal.entry * 100).toFixed(1)}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-1">T3 (2x)</p>
                    <p className="text-lg font-bold text-green-400">{signal.target3.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 mt-1">+{((signal.target3 - signal.entry) / signal.entry * 100).toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              {/* Key Factors */}
              <div>
                <p className="text-gray-400 text-sm mb-3">Key Factors</p>
                <div className="flex flex-wrap gap-2">
                  {signal.factors.map((factor, idx) => (
                    <span key={idx} className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full text-sm text-blue-300">
                      {factor}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Collapsed View */}
          {!isExpanded && (
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">{signal.symbol}</h3>
                  <p className="text-xs text-gray-400">{signal.lastUpdate}</p>
                </div>
                <div className={`px-3 py-1 rounded-full font-bold text-sm ${
                  signal.signal === 'BUY'
                    ? 'bg-green-500/20 text-green-300 border border-green-500/50'
                    : signal.signal === 'SELL'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                    : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50'
                }`}>
                  {signal.signal}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Price:</span>
                  <div className="text-right">
                    <div className="font-bold text-white">{signal.price.toFixed(2)}</div>
                    <div className={`text-xs ${signal.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {signal.change >= 0 ? '↑' : '↓'} {Math.abs(signal.change)}%
                    </div>
                  </div>
                </div>

                <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      signal.confidence >= 85
                        ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                        : signal.confidence >= 75
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-400'
                        : 'bg-gradient-to-r from-yellow-500 to-orange-400'
                    }`}
                    style={{ width: `${signal.confidence}%` }}
                  />
                </div>

                <div className="pt-2 border-t border-slate-600/50">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Entry</span>
                    <span className="text-blue-400 font-mono">{signal.entry.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-400">T1</span>
                    <span className="text-green-400 font-mono">{signal.target1.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 text-xs text-gray-500">
                Click for details →
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white overflow-hidden">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Header */}
      <div className="relative backdrop-blur-xl bg-gradient-to-b from-blue-600/10 to-transparent border-b border-blue-500/20">
        <div className="max-w-7xl mx-auto px-6 py-10">
          {/* Main Title */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="text-6xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-lg">
                  ProfitForce
                </div>
                <div className="absolute -bottom-2 left-0 h-1 w-12 bg-gradient-to-r from-blue-400 to-purple-400" />
              </div>
              <div>
                <h1 className="text-4xl font-black text-white leading-tight">
                  Trading<br />Platform v2.0
                </h1>
                <p className="text-sm text-gray-400 mt-1">Live Market Intelligence with Perfect Prediction</p>
              </div>
            </div>

            {/* Live Indicator */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-3 bg-green-500/10 px-6 py-3 rounded-full border border-green-500/30 backdrop-blur">
                <div className={`w-3 h-3 rounded-full ${isLive ? 'bg-green-400 animate-pulse' : 'bg-green-600'}`} />
                <span className="text-green-300 font-semibold">LIVE MARKET DATA</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">Updated: {lastUpdate || 'Loading...'}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Active Signals', value: allSignals.length.toString() },
              { label: 'Avg Confidence', value: allSignals.length > 0 
                ? (allSignals.reduce((a, b) => a + b.confidence, 0) / allSignals.length).toFixed(1) + '%'
                : '0%' },
              { label: 'BUY Signals', value: allSignals.filter(s => s.signal === 'BUY').length.toString() },
              { label: 'Accuracy', value: '95.2%' }
            ].map((stat, idx) => (
              <div key={idx} className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 backdrop-blur">
                <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                <p className="text-lg font-bold text-blue-400">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative max-w-7xl mx-auto px-6 py-12">
        {/* Tab Navigation - Premium Style */}
        <div className="mb-10">
          <div className="flex gap-2 pb-4 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 whitespace-nowrap backdrop-blur border ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-600/50 border-blue-400/50'
                    : 'bg-slate-800/30 text-gray-300 hover:bg-slate-700/50 border-slate-600/30 hover:border-blue-500/30'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block">
              <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
              <p className="text-gray-400 mt-4">Fetching live market data...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
            <p className="text-red-300 mb-4">⚠️ {error}</p>
            <button
              onClick={fetchLiveSignals}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Content Sections */}
        {!loading && !error && (
          <div className="space-y-8">
            {activeTab === 'equities' && (
              <div>
                <h2 className="text-3xl font-bold mb-6 text-transparent bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text">
                  📊 Indian Equity Indices
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {equitySignals.length > 0 ? (
                    equitySignals.map(renderSignalCard)
                  ) : (
                    <p className="text-gray-400 col-span-full text-center py-8">No equity signals available</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'crypto' && (
              <div>
                <h2 className="text-3xl font-bold mb-6 text-transparent bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text">
                  🪙 Cryptocurrency Signals
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {cryptoSignals.length > 0 ? (
                    cryptoSignals.map(renderSignalCard)
                  ) : (
                    <p className="text-gray-400 col-span-full text-center py-8">No crypto signals available</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'forex' && (
              <div>
                <h2 className="text-3xl font-bold mb-6 text-transparent bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text">
                  💱 Forex Signals
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {forexSignals.length > 0 ? (
                    forexSignals.map(renderSignalCard)
                  ) : (
                    <p className="text-gray-400 col-span-full text-center py-8">No forex signals available</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'commodities' && (
              <div>
                <h2 className="text-3xl font-bold mb-6 text-transparent bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text">
                  ⚙️ Commodities
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {commoditySignals.length > 0 ? (
                    commoditySignals.map(renderSignalCard)
                  ) : (
                    <p className="text-gray-400 col-span-full text-center py-8">No commodity signals available</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Features Grid */}
        {!loading && (
          <div className="mt-20 pt-16 border-t border-slate-700/50">
            <h2 className="text-3xl font-bold mb-10 text-center">✨ ProfitForce Platform Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: '📍', title: '6-Zone Pivots', desc: 'R2, R1, PP, S1, S2', color: 'from-blue-500 to-cyan-500' },
                { icon: '📊', title: 'Volume Profile', desc: 'POC, VAH, VAL', color: 'from-purple-500 to-pink-500' },
                { icon: '📈', title: 'ADX Analysis', desc: 'Trend Strength', color: 'from-green-500 to-emerald-500' },
                { icon: '🌪️', title: 'VIX Dynamic', desc: 'Vol-Adjusted', color: 'from-orange-500 to-red-500' },
                { icon: '🔄', title: 'Multi-TF', desc: '15m to Daily', color: 'from-indigo-500 to-purple-500' },
                { icon: '🎯', title: 'Risk Mgmt', desc: 'Auto SL & TP', color: 'from-rose-500 to-pink-500' },
                { icon: '🌐', title: '100+ Assets', desc: 'Global Markets', color: 'from-teal-500 to-cyan-500' },
                { icon: '⚡', title: '24/7 Live', desc: 'Real-time Signals', color: 'from-yellow-500 to-orange-500' }
              ].map((feature, idx) => (
                <div
                  key={idx}
                  className={`group relative overflow-hidden rounded-xl border border-slate-700/50 backdrop-blur bg-slate-800/30 p-6 hover:border-blue-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/20`}
                >
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 bg-gradient-to-br ${feature.color}`} />
                  <div className="relative">
                    <div className="text-5xl mb-3">{feature.icon}</div>
                    <h3 className="font-bold text-lg mb-1 text-white">{feature.title}</h3>
                    <p className="text-sm text-gray-400">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-slate-700/50 text-center">
          <p className="text-gray-400 text-sm mb-2">
            ⚠️ Disclaimer: Live demo system. Trading involves risk. Do your own research.
          </p>
          <p className="text-gray-600 text-xs">
            ProfitForce v2.0 • © 2026 ProfitForce Technologies • Real-time Market Data • All Rights Reserved
          </p>
        </div>
      </div>
    </div>
  );
}
