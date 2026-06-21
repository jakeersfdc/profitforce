/**
 * Professional SAS Signal Display Component
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Beautiful UI for trading signals with:
 * - Signal badge (BUY/SELL/EXIT/HOLD)
 * - Confidence score with visual indicator
 * - NTZ badge with warning
 * - Volume Profile display (POC, VAH, VAL)
 * - VIX regime badge
 * - Pivot zone heatmap
 * - Risk management display
 * - Confluence factors
 */

'use client';

import React from 'react';
import { SASSignal } from '@/lib/engine/types';
import { getVIXRegimeColor, getVIXRegimeLabel } from '@/lib/engine/vixIntegration';

interface SASSignalUIProps {
  signal: SASSignal;
  compact?: boolean;
  showMetadata?: boolean;
}

/**
 * Main Signal Display Component
 */
export default function SASSignalUI({
  signal,
  compact = false,
  showMetadata = true,
}: SASSignalUIProps) {
  const getSignalColor = (sig: string): string => {
    switch (sig) {
      case 'BUY':
        return 'bg-gradient-to-r from-green-500 to-emerald-600';
      case 'SELL':
        return 'bg-gradient-to-r from-red-500 to-rose-600';
      case 'EXIT':
        return 'bg-gradient-to-r from-orange-500 to-amber-600';
      case 'HOLD':
      default:
        return 'bg-gradient-to-r from-gray-500 to-slate-600';
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-emerald-600';
    if (confidence >= 40) return 'text-yellow-600';
    if (confidence >= 20) return 'text-orange-600';
    return 'text-red-600';
  };

  const getZoneColor = (zone: string): string => {
    switch (zone) {
      case 'ABOVE_R2':
        return 'bg-red-100 text-red-700';
      case 'R1_TO_R2':
        return 'bg-green-100 text-green-700';
      case 'PP_TO_R1':
        return 'bg-emerald-100 text-emerald-700';
      case 'S1_TO_PP':
        return 'bg-orange-100 text-orange-700';
      case 'S2_TO_S1':
        return 'bg-red-100 text-red-700';
      case 'BELOW_S2':
        return 'bg-rose-100 text-rose-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (compact) {
    return <CompactSignalView signal={signal} />;
  }

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className={`${getSignalColor(signal.signal)} p-4 text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{signal.signal}</h2>
            <p className="text-sm opacity-90">{signal.symbol}</p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${getConfidenceColor(signal.confidence)}`}>
              {signal.confidence.toFixed(0)}%
            </div>
            <p className="text-xs opacity-75">Confidence</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* NTZ Alert */}
        {signal.noTradeZone.isActive && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 rounded">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                  No-Trade Zone Active
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  {signal.noTradeZone.reason} - ADX: {signal.noTradeZone.adxValue.toFixed(1)} |
                  Distance from PP: {signal.noTradeZone.pricePct.toFixed(2)}%
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                  Skip choppy market trades. Wait for clarity.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Price & Zones */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Price & Zone</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Current Price:</span>
                <span className="text-lg font-bold">${signal.price.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-xs text-gray-500">Zone:</span>
                <span className={`inline-block ml-2 px-3 py-1 rounded text-sm font-semibold ${getZoneColor(signal.priceZone)}`}>
                  {signal.priceZone.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* VIX Regime */}
          {signal.vixRegime && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Volatility</h3>
              <div>
                <div
                  className="px-4 py-2 rounded-lg text-center text-sm font-semibold text-white"
                  style={{ backgroundColor: getVIXRegimeColor(signal.vixRegime) }}
                >
                  {getVIXRegimeLabel(signal.vixRegime)}
                </div>
                {signal.vixValue && (
                  <p className="text-xs text-gray-500 mt-2">VIX: {signal.vixValue.toFixed(2)}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pivot Zones */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Pivot Zones</h3>
          <div className="bg-gradient-to-r from-red-50 to-green-50 dark:from-red-900/10 dark:to-green-900/10 p-4 rounded-lg">
            <div className="grid grid-cols-5 gap-2 text-center">
              <div>
                <div className="text-xs text-gray-500">R2</div>
                <div className="font-bold text-red-600">${signal.pivotZones.r2.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">R1</div>
                <div className="font-bold text-orange-600">${signal.pivotZones.r1.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">PP</div>
                <div className="font-bold text-gray-700 dark:text-gray-300">
                  ${signal.pivotZones.pp.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">S1</div>
                <div className="font-bold text-orange-600">${signal.pivotZones.s1.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">S2</div>
                <div className="font-bold text-green-600">${signal.pivotZones.s2.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Volume Profile */}
        {signal.volumeProfile && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Volume Profile</h3>
            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">POC (Control):</span>
                <span className="font-semibold">${signal.volumeProfile.poc.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">VAH (High):</span>
                <span className="font-semibold">${signal.volumeProfile.vah.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">VAL (Low):</span>
                <span className="font-semibold">${signal.volumeProfile.val.toFixed(2)}</span>
              </div>
              <div className="text-xs text-gray-500 mt-2 px-2 py-1 bg-white dark:bg-slate-800 rounded">
                VA Spread: ${(signal.volumeProfile.vah - signal.volumeProfile.val).toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {/* Risk Management */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Risk Management</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-slate-800 rounded">
              <span className="text-sm text-gray-600">Entry:</span>
              <span className="font-bold">${signal.entry.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-red-50 dark:bg-red-900/10 rounded border border-red-200 dark:border-red-800">
              <span className="text-sm text-red-600">Stop Loss:</span>
              <span className="font-bold text-red-600">${signal.stopLoss.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-green-50 dark:bg-green-900/10 rounded border border-green-200 dark:border-green-800">
              <span className="text-sm text-green-600">Target 1:</span>
              <span className="font-bold text-green-600">${signal.target1.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-emerald-50 dark:bg-emerald-900/10 rounded">
              <span className="text-sm text-emerald-600">Target 2:</span>
              <span className="font-bold text-emerald-600">${signal.target2.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-blue-50 dark:bg-blue-900/10 rounded">
              <span className="text-sm text-blue-600">Target 3:</span>
              <span className="font-bold text-blue-600">${signal.target3.toFixed(2)}</span>
            </div>

            {/* Risk Reward Ratio */}
            <div className="mt-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/10 dark:to-pink-900/10 rounded border border-purple-200 dark:border-purple-800">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Risk:Reward Ratio
                </span>
                <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                  1:{(((signal.target1 - signal.entry) / (signal.entry - signal.stopLoss)).toFixed(2))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Confluence Factors */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Confluence Factors</h3>
          <div className="space-y-2">
            {/* Scores breakdown */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-gray-50 dark:bg-slate-800 rounded">
                <div className="text-xs text-gray-500">Pivot Zone</div>
                <div className="font-bold">{signal.confluenceScores.pivotZone > 0 ? '+' : ''}{signal.confluenceScores.pivotZone.toFixed(1)}</div>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-slate-800 rounded">
                <div className="text-xs text-gray-500">Trend</div>
                <div className="font-bold">{signal.confluenceScores.trend > 0 ? '+' : ''}{signal.confluenceScores.trend.toFixed(1)}</div>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-slate-800 rounded">
                <div className="text-xs text-gray-500">ADX</div>
                <div className="font-bold">{signal.confluenceScores.adx > 0 ? '+' : ''}{signal.confluenceScores.adx.toFixed(1)}</div>
              </div>
              <div className="p-2 bg-gray-50 dark:bg-slate-800 rounded">
                <div className="text-xs text-gray-500">Momentum</div>
                <div className="font-bold">{signal.confluenceScores.momentum > 0 ? '+' : ''}{signal.confluenceScores.momentum.toFixed(1)}</div>
              </div>
              {signal.confluenceScores.volumeProfile !== 0 && (
                <div className="p-2 bg-blue-50 dark:bg-blue-900/10 rounded">
                  <div className="text-xs text-blue-600">Vol Profile</div>
                  <div className="font-bold text-blue-600">{signal.confluenceScores.volumeProfile > 0 ? '+' : ''}{signal.confluenceScores.volumeProfile.toFixed(1)}</div>
                </div>
              )}
              {signal.confluenceScores.vix !== 0 && (
                <div className="p-2 bg-purple-50 dark:bg-purple-900/10 rounded">
                  <div className="text-xs text-purple-600">VIX</div>
                  <div className="font-bold text-purple-600">{signal.confluenceScores.vix > 0 ? '+' : ''}{signal.confluenceScores.vix.toFixed(1)}</div>
                </div>
              )}
            </div>

            {/* Total confluence */}
            <div className="p-3 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/10 dark:to-blue-900/10 rounded border border-indigo-200 dark:border-indigo-800">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-indigo-700 dark:text-indigo-300">Total Confluence</span>
                <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {signal.confluenceScores.total > 0 ? '+' : ''}{signal.confluenceScores.total.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Factor tags */}
            <div className="flex flex-wrap gap-2 mt-3">
              {signal.confluenceFactors.map((factor, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 text-xs rounded-full font-medium"
                >
                  {factor}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Timestamp */}
        {showMetadata && (
          <div className="text-xs text-gray-500 border-t pt-3">
            Generated: {signal.timestamp.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact signal view for dashboards
 */
function CompactSignalView({ signal }: { signal: SASSignal }) {
  const signalColors = {
    BUY: 'text-green-600 bg-green-50 dark:bg-green-900/20',
    SELL: 'text-red-600 bg-red-50 dark:bg-red-900/20',
    EXIT: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20',
    HOLD: 'text-gray-600 bg-gray-50 dark:bg-gray-900/20',
  };

  return (
    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg shadow border dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full font-bold text-sm ${signalColors[signal.signal as keyof typeof signalColors]}`}>
            {signal.signal}
          </div>
          <div>
            <div className="font-semibold text-sm">{signal.symbol}</div>
            <div className="text-xs text-gray-500">${signal.price.toFixed(2)}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-sm">{signal.confidence.toFixed(0)}%</div>
          {signal.noTradeZone.isActive && <span className="text-xs text-yellow-600">⚠️ NTZ</span>}
        </div>
      </div>
    </div>
  );
}
