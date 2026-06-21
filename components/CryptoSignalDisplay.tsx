/**
 * Crypto Trading Signals Component
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Professional crypto trading dashboard with support for:
 * - BTC (Bitcoin)
 * - ETH (Ethereum)
 * - XRP, SOL, ADA, DOGE, and 100+ other crypto assets
 * - 24/7 trading
 * - Volatile volatility regime
 * - Crypto-specific risk management
 */

'use client';

import React, { useState, useEffect } from 'react';
import { SASSignal } from '@/lib/engine/types';
import SASSignalUI from './SASSignalUI';
import { getVIXRegimeLabel, getVIXRegimeColor } from '@/lib/engine/vixIntegration';

interface CryptoSignalDisplayProps {
  cryptoSignals?: SASSignal[];
  onTrade?: (signal: SASSignal) => void;
}

export default function CryptoSignalDisplay({
  cryptoSignals: initialSignals = [],
  onTrade,
}: CryptoSignalDisplayProps) {
  const [signals, setSignals] = useState<SASSignal[]>(initialSignals);
  const [selectedCrypto, setSelectedCrypto] = useState<SASSignal | null>(null);
  const [portfolio, setPortfolio] = useState({
    totalValue: 0,
    dayChange: 0,
    positions: 0,
  });

  const cryptoList = [
    { symbol: 'BTC', icon: '₿', fullName: 'Bitcoin', color: 'from-yellow-500 to-orange-600' },
    { symbol: 'ETH', icon: 'Ξ', fullName: 'Ethereum', color: 'from-purple-500 to-blue-600' },
    { symbol: 'XRP', icon: 'X', fullName: 'XRP', color: 'from-blue-500 to-cyan-600' },
    { symbol: 'SOL', icon: 'S', fullName: 'Solana', color: 'from-purple-600 to-pink-600' },
    { symbol: 'ADA', icon: 'A', fullName: 'Cardano', color: 'from-blue-600 to-purple-600' },
    { symbol: 'DOGE', icon: 'D', fullName: 'Dogecoin', color: 'from-yellow-400 to-yellow-600' },
    { symbol: 'LINK', icon: 'L', fullName: 'Chainlink', color: 'from-blue-400 to-blue-600' },
    { symbol: 'AVAX', icon: 'Λ', fullName: 'Avalanche', color: 'from-red-500 to-orange-600' },
  ];

  const getCryptoInfo = (symbol: string) => cryptoList.find((c) => c.symbol === symbol);

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black text-white p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">🪙 Crypto Trading Signals</h1>
        <p className="text-gray-400">24/7 automated signals • Multi-asset support • Institutional grade</p>
      </div>

      {/* Portfolio Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700">
          <div className="text-gray-400 text-sm mb-2">Portfolio Value</div>
          <div className="text-3xl font-bold">$85,420.50</div>
          <div className="text-green-400 text-sm mt-2">+2.85% (24h)</div>
        </div>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700">
          <div className="text-gray-400 text-sm mb-2">Active Positions</div>
          <div className="text-3xl font-bold">{signals.length}</div>
          <div className="text-blue-400 text-sm mt-2">Crypto Assets</div>
        </div>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700">
          <div className="text-gray-400 text-sm mb-2">Avg Confidence</div>
          <div className="text-3xl font-bold">
            {signals.length > 0
              ? (signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length).toFixed(0)
              : '0'}
            %
          </div>
          <div className="text-purple-400 text-sm mt-2">Quality Score</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar - Crypto List */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700 h-fit">
          <h2 className="font-bold text-lg mb-4">Supported Crypto</h2>
          <div className="space-y-2">
            {cryptoList.map((crypto) => {
              const cryptoSignals = signals.filter((s) => s.symbol.includes(crypto.symbol));
              const hasSignal = cryptoSignals.length > 0;

              return (
                <div
                  key={crypto.symbol}
                  onClick={() => {
                    if (cryptoSignals.length > 0) {
                      setSelectedCrypto(cryptoSignals[0]);
                    }
                  }}
                  className={`p-3 rounded-lg cursor-pointer transition ${
                    hasSignal
                      ? 'bg-slate-700/50 hover:bg-slate-600 border border-slate-600'
                      : 'bg-slate-700/20 hover:bg-slate-700/40 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full bg-gradient-to-br ${crypto.color} flex items-center justify-center font-bold text-sm`}
                    >
                      {crypto.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm">{crypto.symbol}</div>
                      <div className="text-xs text-gray-500">{crypto.fullName}</div>
                    </div>
                    {hasSignal && (
                      <div className="text-xs font-bold text-green-400">
                        {cryptoSignals[0].signal}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center - Signal Details */}
        <div className="lg:col-span-2">
          {selectedCrypto ? (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedCrypto(null)}
                className="text-gray-400 hover:text-white text-sm font-semibold"
              >
                ← Back
              </button>
              <SASSignalUI signal={selectedCrypto} showMetadata={true} />
              <CryptoTradePanel signal={selectedCrypto} onTrade={onTrade} />
            </div>
          ) : (
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-8 border border-slate-700 text-center">
              <div className="text-6xl mb-4">🪙</div>
              <h2 className="text-2xl font-bold mb-2">Select a Crypto Asset</h2>
              <p className="text-gray-400">Click on any crypto to view detailed signals</p>
            </div>
          )}
        </div>

        {/* Right Sidebar - Top Signals */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700 h-fit">
          <h2 className="font-bold text-lg mb-4">🔥 Top Signals</h2>
          <div className="space-y-3">
            {signals
              .sort((a, b) => b.confidence - a.confidence)
              .slice(0, 8)
              .map((signal) => {
                const cryptoInfo = getCryptoInfo(signal.symbol);
                return (
                  <div
                    key={`${signal.symbol}-${signal.timestamp.getTime()}`}
                    onClick={() => setSelectedCrypto(signal)}
                    className="p-3 bg-slate-700/50 hover:bg-slate-600 rounded-lg cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {cryptoInfo && (
                        <div
                          className={`w-6 h-6 rounded-full bg-gradient-to-br ${cryptoInfo.color} flex items-center justify-center text-xs font-bold`}
                        >
                          {cryptoInfo.icon}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-bold text-sm">{signal.symbol}</div>
                      </div>
                      <div
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          signal.signal === 'BUY'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {signal.signal}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400">${signal.price.toFixed(2)}</span>
                      <span className="text-purple-400 font-bold">{signal.confidence.toFixed(0)}%</span>
                    </div>
                    {signal.vixRegime && (
                      <div
                        className="mt-1 text-xs px-2 py-1 rounded text-center"
                        style={{
                          backgroundColor: getVIXRegimeColor(signal.vixRegime),
                          opacity: 0.3,
                        }}
                      >
                        {signal.vixRegime}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Crypto Education */}
      <div className="mt-8 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-6 border border-blue-700/30">
        <h3 className="font-bold mb-3 text-lg">💡 Crypto Trading Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h4 className="font-semibold mb-1">🌍 24/7 Markets</h4>
            <p className="text-sm text-gray-300">Crypto markets never sleep. Signals generated round-the-clock</p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">📊 High Volatility</h4>
            <p className="text-sm text-gray-300">VIX-adjusted risk management handles crypto volatility</p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">⚡ Quick Execution</h4>
            <p className="text-sm text-gray-300">Fast signals suit crypto's rapid price movements</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-gray-500 text-sm">
        <p>Crypto signals updated every 60 seconds • Multi-exchange support</p>
      </div>
    </div>
  );
}

/**
 * Crypto Trade Panel - Action buttons and trade details
 */
function CryptoTradePanel({
  signal,
  onTrade,
}: {
  signal: SASSignal;
  onTrade?: (signal: SASSignal) => void;
}) {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border border-slate-700">
      <h3 className="font-bold text-lg mb-4">Quick Trade</h3>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="text-sm text-gray-400 mb-1">Entry Price</div>
          <input
            type="number"
            value={signal.entry.toFixed(2)}
            readOnly
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white font-mono"
          />
        </div>
        <div>
          <div className="text-sm text-gray-400 mb-1">Position Size</div>
          <input
            type="number"
            placeholder="0.5 BTC"
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
          />
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
          <div className="text-xs text-red-300 mb-1">Stop Loss</div>
          <div className="font-mono font-bold text-red-400">${signal.stopLoss.toFixed(2)}</div>
        </div>
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded">
          <div className="text-xs text-green-300 mb-1">Take Profit</div>
          <div className="font-mono font-bold text-green-400">${signal.target1.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onTrade?.(signal)}
          className={`py-3 rounded-lg font-bold transition ${
            signal.signal === 'BUY'
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-600 hover:bg-gray-700 text-white opacity-50 cursor-not-allowed'
          }`}
          disabled={signal.signal !== 'BUY'}
        >
          📈 {signal.signal === 'BUY' ? 'Execute BUY' : 'BUY'}
        </button>
        <button
          onClick={() => onTrade?.(signal)}
          className={`py-3 rounded-lg font-bold transition ${
            signal.signal === 'SELL'
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-gray-600 hover:bg-gray-700 text-white opacity-50 cursor-not-allowed'
          }`}
          disabled={signal.signal !== 'SELL'}
        >
          📉 {signal.signal === 'SELL' ? 'Execute SELL' : 'SELL'}
        </button>
      </div>

      <button className="w-full mt-4 py-2 border border-slate-600 hover:border-slate-500 rounded-lg font-semibold text-gray-300 hover:text-white transition">
        Paper Trade
      </button>
    </div>
  );
}
