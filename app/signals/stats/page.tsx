/**
 * Strategy Statistics Dashboard Page
 * Displays comprehensive performance metrics
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Zap } from 'lucide-react';

interface StrategyStats {
  totalSignals: number;
  buySignals: number;
  sellSignals: number;
  noTradeSignals: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalPnL: number;
  totalTrades: number;
  successTrades: number;
  failedTrades: number;
  period: string;
}

interface PerformanceData {
  date: string;
  cumulative_returns: number;
  drawdown: number;
  trades: number;
}

export default function StrategyStatsPage() {
  const [stats, setStats] = useState<StrategyStats | null>(null);
  const [performance, setPerformance] = useState<PerformanceData[]>([]);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [period]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/history?action=stats&period=${period}`);
      const data = await res.json();

      if (data.success) {
        setStats(data.stats);
        generatePerformanceData(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePerformanceData = (statsData: StrategyStats) => {
    const mockData: PerformanceData[] = [];
    const days = period === 'today' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 365;

    for (let i = 0; i < days; i++) {
      mockData.push({
        date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000)
          .toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
          .replace(',', ''),
        cumulative_returns: Math.random() * 20 - 5 + i * 0.5,
        drawdown: Math.random() * 15,
        trades: Math.floor(Math.random() * 5),
      });
    }

    setPerformance(mockData);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (!stats) {
    return <div className="flex justify-center items-center h-screen">No data available</div>;
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const signalDistribution = [
    { name: 'BUY', value: stats.buySignals, fill: '#10b981' },
    { name: 'SELL', value: stats.sellSignals, fill: '#ef4444' },
    { name: 'NO_TRADE', value: stats.noTradeSignals, fill: '#f3f4f6' },
  ];

  const tradeDistribution = [
    { name: 'Wins', value: stats.successTrades, fill: '#10b981' },
    { name: 'Losses', value: stats.failedTrades, fill: '#ef4444' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Strategy Statistics</h1>
            <p className="text-gray-600 mt-2">NIFTY PRO v2.1 Performance Analytics</p>
          </div>
          <div className="flex gap-2">
            {(['today', 'week', 'month', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  period === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Win Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {stats.winRate.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {stats.successTrades}W / {stats.failedTrades}L
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Profit Factor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {stats.profitFactor.toFixed(2)}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {stats.avgWin > 0 ? `Avg Win: ₹${stats.avgWin.toFixed(0)}` : 'N/A'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total P&L
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-bold ${
                  stats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {formatCurrency(stats.totalPnL)}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {stats.totalTrades} closed trades
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Signals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">
                {stats.totalSignals}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {stats.period} period
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Cumulative Returns</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={performance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="cumulative_returns"
                    stroke="#3b82f6"
                    dot={false}
                    name="Returns %"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Signal Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Signal Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={signalDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {signalDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Trade Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Trade Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={tradeDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {tradeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Drawdown Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Drawdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="drawdown" fill="#ef4444" name="Drawdown %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">Trade Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Trades:</span>
                    <span className="font-medium">{stats.totalTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Winning Trades:</span>
                    <span className="font-medium text-green-600">
                      {stats.successTrades}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Losing Trades:</span>
                    <span className="font-medium text-red-600">
                      {stats.failedTrades}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Win Rate:</span>
                    <span className="font-medium">{stats.winRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">Signal Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Signals:</span>
                    <span className="font-medium">{stats.totalSignals}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">BUY Signals:</span>
                    <span className="font-medium text-green-600">
                      {stats.buySignals}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">SELL Signals:</span>
                    <span className="font-medium text-red-600">
                      {stats.sellSignals}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">NO TRADE:</span>
                    <span className="font-medium">{stats.noTradeSignals}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">Risk/Reward</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Win:</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(stats.avgWin)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Loss:</span>
                    <span className="font-medium text-red-600">
                      {formatCurrency(stats.avgLoss)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Profit Factor:</span>
                    <span className="font-medium">
                      {stats.profitFactor.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total P&L:</span>
                    <span
                      className={`font-medium ${
                        stats.totalPnL >= 0
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(stats.totalPnL)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
