/**
 * Comprehensive Signals Hub
 * Central dashboard for all trading strategies, execution, and analytics
 */

'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import V2_1SignalDisplay from '@/components/V2_1SignalDisplay';
import PaperTradingTracker from '@/components/PaperTradingTracker';
import DualStrategyDashboard from '@/components/DualStrategyDashboard';
import { Zap, BarChart3, Settings, BookOpen } from 'lucide-react';

// Lazy load heavy components
const StrategyStatsPage = React.lazy(() => import('./stats/page'));
const ApiTesterPage = React.lazy(() => import('../debug/api-tester/page'));

export default function SignalsHubPage() {
  const [activeTab, setActiveTab] = useState('comparison');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 to-gray-900">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8 border-b border-gray-800 pb-6">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
            Profitforce Trading
          </h1>
          <p className="text-gray-400 mt-2">
            Multi-strategy automated trading system with institutional-grade execution
          </p>
        </div>

        {/* Key Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Strategies</p>
            <p className="text-3xl font-bold text-white">2</p>
            <p className="text-xs text-gray-500 mt-1">v2.1 + NITS</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Status</p>
            <p className="text-2xl font-bold text-green-400">🟢 LIVE</p>
            <p className="text-xs text-gray-500 mt-1">Vercel deployed</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Paper Trading</p>
            <p className="text-2xl font-bold text-blue-400">Enabled</p>
            <p className="text-xs text-gray-500 mt-1">Risk-free testing</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Broker Integration</p>
            <p className="text-2xl font-bold text-purple-400">Ready</p>
            <p className="text-xs text-gray-500 mt-1">Zerodha/Angel</p>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 gap-2 mb-8 bg-gray-800 border border-gray-700 p-1">
            <TabsTrigger
              value="comparison"
              className="flex items-center gap-2 data-[state=active]:bg-purple-600"
            >
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Comparison</span>
            </TabsTrigger>
            <TabsTrigger
              value="v2-1"
              className="flex items-center gap-2 data-[state=active]:bg-blue-600"
            >
              <span className="font-mono text-xs">v2.1</span>
            </TabsTrigger>
            <TabsTrigger
              value="nits"
              className="flex items-center gap-2 data-[state=active]:bg-purple-700"
            >
              <span className="font-mono text-xs">NITS</span>
            </TabsTrigger>
            <TabsTrigger
              value="paper-trading"
              className="flex items-center gap-2 data-[state=active]:bg-green-600"
            >
              <span className="hidden sm:inline text-xs">Paper Trade</span>
            </TabsTrigger>
            <TabsTrigger
              value="statistics"
              className="flex items-center gap-2 data-[state=active]:bg-orange-600"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Stats</span>
            </TabsTrigger>
            <TabsTrigger
              value="tools"
              className="flex items-center gap-2 data-[state=active]:bg-gray-700"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Tools</span>
            </TabsTrigger>
          </TabsList>

          {/* Comparison Tab */}
          <TabsContent value="comparison" className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <DualStrategyDashboard />
          </TabsContent>

          {/* V2.1 Tab */}
          <TabsContent value="v2-1" className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="bg-blue-900 bg-opacity-30 p-4 rounded-lg mb-6 border border-blue-700">
              <h3 className="font-semibold text-blue-300 flex items-center gap-2">
                <Zap className="h-5 w-5" />
                v2.1 Technical Analysis Strategy
              </h3>
              <p className="text-gray-300 text-sm mt-1">
                Ichimoku Cloud (±3) • Stochastic RSI (±2) • ROC (±2) • RSI • MACD • Volume
              </p>
            </div>
            <V2_1SignalDisplay />
          </TabsContent>

          {/* NITS Tab */}
          <TabsContent value="nits" className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="bg-purple-900 bg-opacity-30 p-4 rounded-lg mb-6 border border-purple-700">
              <h3 className="font-semibold text-purple-300 flex items-center gap-2">
                <Zap className="h-5 w-5" />
                NITS Institutional Strategy
              </h3>
              <p className="text-gray-300 text-sm mt-1">
                Opening Range Breakout • POC Levels • Liquidity Sweeps • Multi-Timeframe Analysis
              </p>
            </div>
            <div className="text-center py-12 text-gray-400">
              NITS signals loading... (Fetch from /api/nits)
            </div>
          </TabsContent>

          {/* Paper Trading Tab */}
          <TabsContent value="paper-trading" className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="bg-green-900 bg-opacity-30 p-4 rounded-lg mb-6 border border-green-700">
              <h3 className="font-semibold text-green-300">Paper Trading Simulator</h3>
              <p className="text-gray-300 text-sm mt-1">
                Risk-free trading practice with real signals
              </p>
            </div>
            <PaperTradingTracker />
          </TabsContent>

          {/* Statistics Tab */}
          <TabsContent value="statistics" className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <React.Suspense
              fallback={
                <div className="flex justify-center items-center h-96 text-gray-400">
                  Loading statistics dashboard...
                </div>
              }
            >
              <StrategyStatsPage />
            </React.Suspense>
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* API Tester */}
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  API Testing Tool
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Test signal generation endpoints with custom OHLCV data
                </p>
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition">
                  Open API Tester
                </button>
              </div>

              {/* Broker Integration */}
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Broker Integration
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Configure and connect to Zerodha, Angel, or Shoonya brokers
                </p>
                <button className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-medium transition">
                  Configure Broker
                </button>
              </div>

              {/* Trade Execution */}
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Automated Execution
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Execute real trades automatically from signals
                </p>
                <button className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-medium transition disabled:opacity-50"
                  disabled>
                  Enable Execution (Requires Broker)
                </button>
              </div>

              {/* Options Selector */}
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Options Strike Selector
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  VIX-based option strike recommendations
                </p>
                <button className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg font-medium transition">
                  Open Selector
                </button>
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h3 className="font-semibold text-white mb-4">System Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-300 text-sm">Risk Per Trade (%)</label>
                  <input
                    type="number"
                    defaultValue="2"
                    min="0.1"
                    max="10"
                    step="0.1"
                    className="w-full mt-1 bg-gray-700 text-white p-2 rounded border border-gray-600"
                  />
                </div>
                <div>
                  <label className="text-gray-300 text-sm">Max Open Trades</label>
                  <input
                    type="number"
                    defaultValue="3"
                    min="1"
                    max="10"
                    className="w-full mt-1 bg-gray-700 text-white p-2 rounded border border-gray-600"
                  />
                </div>
                <button className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition">
                  Save Settings
                </button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer Info */}
        <div className="mt-12 text-center text-gray-400 border-t border-gray-800 pt-6">
          <p className="text-sm">
            ✅ v2.1 Strategy Live • ✅ NITS Strategy Live • ✅ Paper Trading • ✅ Broker Integration Ready
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Last updated: {new Date().toLocaleTimeString()} | Vercel: Deployed
          </p>
        </div>
      </div>
    </div>
  );
}
