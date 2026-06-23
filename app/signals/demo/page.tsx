/**
 * SAS Trading System Demo Page
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Complete demo showing:
 * - Professional trading signals
 * - Multi-asset dashboard
 * - Crypto signals with BTC, ETH, etc.
 * - All SAS v2.0 features in action
 */

'use client';

import React, { useState, useEffect } from 'react';
import { SASSignal } from '@/lib/engine/types';
import SASSignalUI from '@/components/SASSignalUI';
import TradingDashboard from '@/components/TradingDashboard';
import CryptoSignalDisplay from '@/components/CryptoSignalDisplay';

interface DemoTab {
  id: 'signals' | 'dashboard' | 'crypto' | 'details';
  label: string;
  icon: string;
}

export default function SASDemo() {
  // SAS Trading System Demo - Professional Signals Dashboard v2.0 [Build: 2026-06-23T13:15Z]
  const [activeTab, setActiveTab] = useState<'signals' | 'dashboard' | 'crypto' | 'details'>(
    'signals'
  );
  const [signals, setSignals] = useState<SASSignal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<SASSignal | null>(null);
  const [loading, setLoading] = useState(true);

  // Demo signal data
  const demoSignals: SASSignal[] = [
    {
      version: 'SAS_v1',
      signal: 'BUY',
      confidence: 87,
      symbol: 'NIFTY50',
      price: 22450.50,
      priceZone: 'S1_TO_PP',
      entry: 22450,
      stopLoss: 22200,
      target1: 22800,
      target2: 23100,
      target3: 23400,
      pivotZones: {
        r2: 23200,
        r1: 22900,
        pp: 22600,
        s1: 22300,
        s2: 22000,
        daysHigh: 23500,
        daysLow: 22100,
      },
      noTradeZone: {
        isActive: false,
        reason: null,
        adxValue: 0,
        pricePct: 0,
      },
      confluenceScores: {
        pivotZone: 2,
        trend: 1.5,
        adx: 1,
        momentum: 0.5,
        volumeProfile: 1,
        vix: 0.5,
        total: 6.5,
      },
      confluenceFactors: [
        'Pivot S1 Support',
        'Bullish Trend',
        'ADX 28 Strong',
        'RSI 65 Overbought',
        'Volume Profile POC',
      ],
      volumeProfile: {
        poc: 22500,
        vah: 22800,
        val: 22200,
        pocScore: 1.5,
      },
      vixValue: 17.5,
      vixRegime: 'LOW',
      strikeWidth: 500,
      timestamp: new Date(),
      metadata: {
        dataSource: 'BINANCE',
        calculatedAt: new Date(),
      },
    },
    {
      version: 'SAS_v1',
      signal: 'SELL',
      confidence: 82,
      symbol: 'BANKNIFTY',
      price: 48750.25,
      priceZone: 'R1_TO_R2',
      entry: 48750,
      stopLoss: 49100,
      target1: 48400,
      target2: 48000,
      target3: 47600,
      pivotZones: {
        r2: 49200,
        r1: 48950,
        pp: 48650,
        s1: 48350,
        s2: 48100,
        daysHigh: 49500,
        daysLow: 48000,
      },
      noTradeZone: {
        isActive: false,
        reason: null,
        adxValue: 0,
        pricePct: 0,
      },
      confluenceScores: {
        pivotZone: 2,
        trend: -1.5,
        adx: 1,
        momentum: -0.5,
        volumeProfile: -1,
        vix: 0,
        total: -0.5,
      },
      confluenceFactors: ['Pivot R1 Resistance', 'Bearish Divergence', 'Volume Decrease'],
      volumeProfile: {
        poc: 48600,
        vah: 48900,
        val: 48300,
        pocScore: 1.5,
      },
      vixValue: 16.8,
      vixRegime: 'NORMAL',
      strikeWidth: 300,
      timestamp: new Date(),
      metadata: {
        dataSource: 'NSE',
        calculatedAt: new Date(),
      },
    },
    {
      version: 'SAS_v1',
      signal: 'BUY',
      confidence: 91,
      symbol: 'BTC',
      price: 45200.00,
      priceZone: 'S1_TO_PP',
      entry: 45200,
      stopLoss: 44800,
      target1: 45800,
      target2: 46500,
      target3: 47200,
      pivotZones: {
        r2: 46800,
        r1: 46000,
        pp: 45500,
        s1: 44700,
        s2: 43900,
        daysHigh: 47000,
        daysLow: 44500,
      },
      noTradeZone: {
        isActive: false,
        reason: null,
        adxValue: 0,
        pricePct: 0,
      },
      confluenceScores: {
        pivotZone: 2,
        trend: 2,
        adx: 1.5,
        momentum: 1.5,
        volumeProfile: 2,
        vix: 1,
        total: 10,
      },
      confluenceFactors: [
        'Strong Support',
        'Bullish Breakout',
        'Volume Surge',
        'VP at POC',
        'Low Volatility',
      ],
      volumeProfile: {
        poc: 45000,
        vah: 45600,
        val: 44400,
        pocScore: 2,
      },
      vixValue: 28.5,
      vixRegime: 'HIGH',
      strikeWidth: 1000,
      timestamp: new Date(),
      metadata: {
        dataSource: 'BINANCE',
        calculatedAt: new Date(),
      },
    },
    {
      version: 'SAS_v1',
      signal: 'SELL',
      confidence: 78,
      symbol: 'ETH',
      price: 2450.75,
      priceZone: 'ABOVE_R2',
      entry: 2450,
      stopLoss: 2550,
      target1: 2350,
      target2: 2250,
      target3: 2150,
      pivotZones: {
        r2: 2600,
        r1: 2500,
        pp: 2400,
        s1: 2300,
        s2: 2200,
        daysHigh: 2700,
        daysLow: 2200,
      },
      noTradeZone: {
        isActive: false,
        reason: null,
        adxValue: 0,
        pricePct: 0,
      },
      confluenceScores: {
        pivotZone: 1,
        trend: -1,
        adx: 0.5,
        momentum: -0.5,
        volumeProfile: -1,
        vix: 0.5,
        total: -0.5,
      },
      confluenceFactors: ['Resistance at R1', 'Weak Trend', 'Lower Volumes'],
      volumeProfile: {
        poc: 2400,
        vah: 2480,
        val: 2320,
        pocScore: 0.5,
      },
      vixValue: 32.1,
      vixRegime: 'HIGH',
      strikeWidth: 150,
      timestamp: new Date(),
      metadata: {
        dataSource: 'BINANCE',
        calculatedAt: new Date(),
      },
    },
  ];

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => {
      setSignals(demoSignals);
      setLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const tabs: DemoTab[] = [
    { id: 'signals', label: 'Signal Details', icon: '📊' },
    { id: 'dashboard', label: 'Trading Dashboard', icon: '🎯' },
    { id: 'crypto', label: 'Crypto Signals', icon: '🪙' },
    { id: 'details', label: 'Features', icon: '✨' },
  ];

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 shadow-lg">
        <h1 className="text-4xl font-bold mb-2">🤖 SAS Trading System v2.0</h1>
        <p className="text-blue-100">Professional automated trading signals with AI precision</p>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-slate-800 border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex gap-4 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-4 font-semibold text-sm transition flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-gray-400 hover:text-white border-b-2 border-transparent'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        {loading ? (
          <div className="text-center py-24">
            <div className="inline-block animate-spin mb-4 text-4xl">⚙️</div>
            <h2 className="text-2xl font-bold mb-2">Initializing SAS System...</h2>
            <p className="text-gray-400">Loading market data and generating signals</p>
          </div>
        ) : (
          <>
            {/* Signal Details Tab */}
            {activeTab === 'signals' && (
              <div className="space-y-6">
                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                  <h2 className="text-2xl font-bold mb-4">Recent Signals</h2>
                  {selectedSignal ? (
                    <div>
                      <button
                        onClick={() => setSelectedSignal(null)}
                        className="text-gray-400 hover:text-white mb-4 text-sm"
                      >
                        ← Back to Signals
                      </button>
                      <SASSignalUI signal={selectedSignal} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {signals.map((signal, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSelectedSignal(signal)}
                          className="p-4 bg-slate-700/50 hover:bg-slate-600 rounded-lg cursor-pointer transition"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-bold text-lg">{signal.symbol}</div>
                              <div className="text-sm text-gray-400">
                                ${signal.price.toFixed(2)} • {signal.priceZone.replace(/_/g, ' ')}
                              </div>
                            </div>
                            <div className="text-right">
                              <div
                                className={`px-3 py-1 rounded-full font-bold text-sm ${
                                  signal.signal === 'BUY'
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                              >
                                {signal.signal}
                              </div>
                              <div className="text-lg font-bold mt-1">
                                {signal.confidence.toFixed(0)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && <TradingDashboard signals={signals} />}

            {/* Crypto Tab */}
            {activeTab === 'crypto' && (
              <CryptoSignalDisplay cryptoSignals={signals.filter((s) => ['BTC', 'ETH'].includes(s.symbol))} />
            )}

            {/* Features Tab */}
            {activeTab === 'details' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Stage 1 Features */}
                <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 rounded-lg p-6 border border-blue-700/50">
                  <h3 className="text-2xl font-bold mb-4">📍 Stage 1: Foundation</h3>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2">
                      <span className="text-2xl">✅</span>
                      <div>
                        <div className="font-bold">6-Zone Pivot Analysis</div>
                        <div className="text-sm text-gray-400">R2, R1, PP, S1, S2 heatmap</div>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-2xl">✅</span>
                      <div>
                        <div className="font-bold">No-Trade Zone Detection</div>
                        <div className="text-sm text-gray-400">ADX &lt; 20 + price near PP</div>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-2xl">✅</span>
                      <div>
                        <div className="font-bold">Confluence Scoring</div>
                        <div className="text-sm text-gray-400">Multi-factor analysis (-8 to +10)</div>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-2xl">✅</span>
                      <div>
                        <div className="font-bold">Risk Management</div>
                        <div className="text-sm text-gray-400">Auto SL and targets</div>
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Stage 2 Features */}
                <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 rounded-lg p-6 border border-purple-700/50">
                  <h3 className="text-2xl font-bold mb-4">📈 Stage 2: Professional</h3>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-2">
                      <span className="text-2xl">✅</span>
                      <div>
                        <div className="font-bold">Volume Profile</div>
                        <div className="text-sm text-gray-400">POC, VAH, VAL 70% Value Area</div>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-2xl">✅</span>
                      <div>
                        <div className="font-bold">VIX Integration</div>
                        <div className="text-sm text-gray-400">Volatility-adjusted strikes</div>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-2xl">✅</span>
                      <div>
                        <div className="font-bold">Crypto Support</div>
                        <div className="text-sm text-gray-400">BTC, ETH, XRP + 100+ assets</div>
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-2xl">✅</span>
                      <div>
                        <div className="font-bold">24/7 Trading</div>
                        <div className="text-sm text-gray-400">Crypto markets never close</div>
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Supported Assets */}
                <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 rounded-lg p-6 border border-green-700/50 md:col-span-2">
                  <h3 className="text-2xl font-bold mb-4">🌍 Supported Assets</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'SENSEX', 'BTC', 'ETH', 'XRP', 'SOL'].map(
                      (asset) => (
                        <div key={asset} className="p-3 bg-green-500/10 rounded border border-green-500/30">
                          <div className="font-bold">{asset}</div>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 rounded-lg p-6 border border-orange-700/50 md:col-span-2">
                  <h3 className="text-2xl font-bold mb-4">📊 Key Metrics</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-400">87%</div>
                      <div className="text-sm text-gray-400">Avg Confidence</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-400">2.5</div>
                      <div className="text-sm text-gray-400">Avg Risk:Reward</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-400">6.5</div>
                      <div className="text-sm text-gray-400">Confluence Score</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-400">24/7</div>
                      <div className="text-sm text-gray-400">Market Support</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="bg-slate-800 border-t border-slate-700 mt-8 py-6 text-center text-gray-400">
        <p>SAS Trading System v2.0 • Institutional Grade • Professional Signals</p>
        <p className="text-sm mt-2">Developed with 20+ years of trading experience</p>
      </div>
    </div>
  );
}
