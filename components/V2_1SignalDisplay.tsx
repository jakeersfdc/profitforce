'use client';

import { useEffect, useState } from 'react';
import { SignalData } from '@/lib/engine/v2_1_signal_engine';

export default function V2_1SignalDisplay() {
  const [signal, setSignal] = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const fetchSignal = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/v2.1');
        if (!res.ok) throw new Error('Failed to fetch signal');
        const data = await res.json();
        setSignal(data.signal);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSignal();

    if (autoRefresh) {
      const interval = setInterval(fetchSignal, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg">
        <div className="text-white text-xl">Loading v2.1 Signal...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-900 bg-opacity-30 border border-red-500 rounded-lg text-red-200">
        Error: {error}
      </div>
    );
  }

  if (!signal) {
    return <div className="text-center text-gray-400 py-8">No signal available</div>;
  }

  const getSignalColor = () => {
    switch (signal.signalStatus) {
      case 'BUY':
        return 'from-green-600 to-green-800 border-green-400';
      case 'SELL':
        return 'from-red-600 to-red-800 border-red-400';
      case 'NEUTRAL':
        return 'from-yellow-600 to-yellow-800 border-yellow-400';
      default:
        return 'from-slate-600 to-slate-800 border-slate-400';
    }
  };

  const getIndicatorBadgeColor = (score: number) => {
    if (score > 0) return 'bg-green-500 text-white';
    if (score < 0) return 'bg-red-500 text-white';
    return 'bg-gray-500 text-white';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-bold text-white">v2.1 Trading Signal</h1>
        <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="w-4 h-4"
          />
          Auto Refresh
        </label>
      </div>

      {/* Main Signal Card */}
      <div
        className={`p-8 rounded-lg border-2 bg-gradient-to-br ${getSignalColor()} text-white shadow-2xl`}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Signal Status */}
          <div>
            <div className="text-gray-200 text-sm font-semibold mb-2">SIGNAL</div>
            <div className="text-4xl font-black">{signal.signalStatus}</div>
            <div className="text-sm text-gray-300 mt-2">Confidence: {signal.confidence.toFixed(1)}%</div>
          </div>

          {/* Scores */}
          <div>
            <div className="text-gray-200 text-sm font-semibold mb-2">BULL SCORE</div>
            <div className="text-3xl font-bold text-green-300">+{signal.bullScore}</div>
            <div className="text-gray-300 text-xs mt-1">(Max: 11)</div>
          </div>

          <div>
            <div className="text-gray-200 text-sm font-semibold mb-2">BEAR SCORE</div>
            <div className="text-3xl font-bold text-red-300">{signal.bearScore}</div>
            <div className="text-gray-300 text-xs mt-1">(Min: -11)</div>
          </div>

          {/* Current Price */}
          <div>
            <div className="text-gray-200 text-sm font-semibold mb-2">PRICE</div>
            <div className="text-3xl font-bold">₹{signal.price.toFixed(2)}</div>
            <div className="text-gray-300 text-xs mt-2">{signal.timestamp.toLocaleTimeString()}</div>
          </div>
        </div>
      </div>

      {/* Indicators Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Ichimoku */}
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-4">Ichimoku Cloud</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className="font-semibold text-white">{signal.indicators.ichimoku.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Cloud:</span>
              <span
                className={`font-bold px-2 py-1 rounded ${
                  signal.indicators.ichimoku.cloudColor === 'GREEN'
                    ? 'bg-green-500 text-white'
                    : signal.indicators.ichimoku.cloudColor === 'RED'
                    ? 'bg-red-500 text-white'
                    : 'bg-yellow-500 text-black'
                }`}
              >
                {signal.indicators.ichimoku.cloudColor}
              </span>
            </div>
            <div className={`px-3 py-1 rounded text-center font-bold ${getIndicatorBadgeColor(
              signal.indicators.ichimoku.score
            )}`}>
              Score: {signal.indicators.ichimoku.score > 0 ? '+' : ''}{signal.indicators.ichimoku.score}
            </div>
          </div>
        </div>

        {/* Stochastic RSI */}
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-4">Stochastic RSI</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">K Line:</span>
              <span className="font-semibold text-white">{signal.indicators.stochRSI.kLine.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">D Line:</span>
              <span className="font-semibold text-white">{signal.indicators.stochRSI.dLine.toFixed(1)}</span>
            </div>
            <div className={`px-3 py-1 rounded text-center font-bold ${getIndicatorBadgeColor(
              signal.indicators.stochRSI.score
            )}`}>
              Score: {signal.indicators.stochRSI.score > 0 ? '+' : ''}{signal.indicators.stochRSI.score}
            </div>
          </div>
        </div>

        {/* ROC */}
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-4">Rate of Change (ROC)</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Value:</span>
              <span className="font-semibold text-white">{signal.indicators.roc.value.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className="font-semibold text-white">{signal.indicators.roc.status}</span>
            </div>
            <div className={`px-3 py-1 rounded text-center font-bold ${getIndicatorBadgeColor(
              signal.indicators.roc.score
            )}`}>
              Score: {signal.indicators.roc.score > 0 ? '+' : ''}{signal.indicators.roc.score}
            </div>
          </div>
        </div>

        {/* RSI */}
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-4">RSI (14)</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Value:</span>
              <span className="font-semibold text-white">{signal.indicators.rsi.value.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Level:</span>
              <span className="font-semibold text-white">
                {signal.indicators.rsi.value > 70
                  ? 'Overbought'
                  : signal.indicators.rsi.value < 30
                  ? 'Oversold'
                  : 'Neutral'}
              </span>
            </div>
            <div className={`px-3 py-1 rounded text-center font-bold ${getIndicatorBadgeColor(
              signal.indicators.rsi.score
            )}`}>
              Score: {signal.indicators.rsi.score > 0 ? '+' : ''}{signal.indicators.rsi.score}
            </div>
          </div>
        </div>

        {/* MACD */}
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-4">MACD (12/26/9)</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">MACD:</span>
              <span className="font-semibold text-white">{signal.indicators.macd.line.toFixed(3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Signal:</span>
              <span className="font-semibold text-white">{signal.indicators.macd.signal.toFixed(3)}</span>
            </div>
            <div className={`px-3 py-1 rounded text-center font-bold ${getIndicatorBadgeColor(
              signal.indicators.macd.score
            )}`}>
              Score: {signal.indicators.macd.score > 0 ? '+' : ''}{signal.indicators.macd.score}
            </div>
          </div>
        </div>

        {/* Volume & VIX */}
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-4">Market Conditions</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Volume:</span>
              <span className={`font-semibold px-2 py-1 rounded ${
                signal.indicators.volume === 'Strong' ? 'bg-green-500 text-white' :
                signal.indicators.volume === 'Weak' ? 'bg-red-500 text-white' :
                'bg-gray-500 text-white'
              }`}>
                {signal.indicators.volume}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">VIX:</span>
              <span className="font-semibold text-white">{signal.indicators.vix}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Targets & Stop Loss */}
      {signal.targets && signal.stopLoss && (
        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-6">Trade Setup</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-gray-400 text-sm font-semibold mb-2">ENTRY</div>
              <div className="text-2xl font-bold text-blue-400">₹{signal.price.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm font-semibold mb-2">STOP LOSS</div>
              <div className="text-2xl font-bold text-red-400">₹{signal.stopLoss.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm font-semibold mb-2">TARGET 1</div>
              <div className="text-2xl font-bold text-green-400">₹{signal.targets.t1.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm font-semibold mb-2">TARGET 2</div>
              <div className="text-2xl font-bold text-green-400">₹{signal.targets.t2.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm font-semibold mb-2">TARGET 3</div>
              <div className="text-2xl font-bold text-green-400">₹{signal.targets.t3.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
