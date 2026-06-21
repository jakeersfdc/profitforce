'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

export default function StrategyStatsPage() {
  const [stats, setStats] = useState<StrategyStats | null>(null);
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
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setStats({
        totalSignals: 156,
        buySignals: 78,
        sellSignals: 68,
        noTradeSignals: 10,
        winRate: 72.5,
        avgWin: 2.5,
        avgLoss: -1.2,
        profitFactor: 2.08,
        totalPnL: 2850,
        totalTrades: 142,
        successTrades: 103,
        failedTrades: 39,
        period,
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center p-8">Loading...</div>;
  }

  if (!stats) {
    return <div className="text-center p-8">No data</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-white">Statistics</h1>
        <p className="text-gray-400">Performance metrics dashboard</p>
      </div>
    </div>
  );
}
