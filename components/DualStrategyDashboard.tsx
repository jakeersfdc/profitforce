'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Zap } from 'lucide-react';

interface StrategySignal {
  strategy: string;
  signalStatus: 'BUY' | 'SELL' | 'NO_TRADE';
  confidence: number;
  bullScore?: number;
  marketBias?: string;
  orbStatus?: string;
  liquidityStatus?: string;
  targets: { t1: number; t2: number; t3: number };
  stopLoss: number;
  price: number;
}

export default function DualStrategyDashboard() {
  const [v21Signal, setV21Signal] = useState<StrategySignal | null>(null);
  const [nitsSignal, setNitsSignal] = useState<StrategySignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [agreement, setAgreement] = useState<'BOTH_BUY' | 'BOTH_SELL' | 'CONFLICT' | 'NONE'>(
    'NONE'
  );

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchSignals = async () => {
    try {
      setLoading(true);
      const [v21Res, nitsRes] = await Promise.all([
        fetch('/api/v2.1'),
        fetch('/api/nits'),
      ]);

      const v21Data = await v21Res.json();
      const nitsData = await nitsRes.json();

      if (v21Data.signal) {
        setV21Signal({
          strategy: 'v2.1 (Ichimoku + Stochastic RSI + ROC)',
          signalStatus: v21Data.signal.signalStatus,
          confidence: v21Data.signal.confidence,
          bullScore: v21Data.signal.bullScore,
          targets: v21Data.signal.targets,
          stopLoss: v21Data.signal.stopLoss,
          price: v21Data.signal.price,
        });
      }

      if (nitsData.signal) {
        setNitsSignal({
          strategy: 'NITS (Institutional Trading System)',
          signalStatus: nitsData.signal.signalStatus,
          confidence: nitsData.signal.confidence,
          marketBias: nitsData.signal.marketBias,
          orbStatus: nitsData.signal.orbStatus,
          liquidityStatus: nitsData.signal.liquidityStatus,
          targets: nitsData.signal.targets,
          stopLoss: nitsData.signal.stopLoss,
          price: nitsData.signal.price,
        });
      }

      // Calculate agreement
      if (v21Data.signal && nitsData.signal) {
        if (
          v21Data.signal.signalStatus === 'BUY' &&
          nitsData.signal.signalStatus === 'BUY'
        ) {
          setAgreement('BOTH_BUY');
        } else if (
          v21Data.signal.signalStatus === 'SELL' &&
          nitsData.signal.signalStatus === 'SELL'
        ) {
          setAgreement('BOTH_SELL');
        } else if (
          v21Data.signal.signalStatus !== 'NO_TRADE' &&
          nitsData.signal.signalStatus !== 'NO_TRADE' &&
          v21Data.signal.signalStatus !== nitsData.signal.signalStatus
        ) {
          setAgreement('CONFLICT');
        } else {
          setAgreement('NONE');
        }
      }
    } catch (error) {
      console.error('Failed to fetch signals:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAgreementColor = () => {
    switch (agreement) {
      case 'BOTH_BUY':
        return 'bg-green-100 border-green-300';
      case 'BOTH_SELL':
        return 'bg-red-100 border-red-300';
      case 'CONFLICT':
        return 'bg-yellow-100 border-yellow-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  const getAgreementBadgeColor = () => {
    switch (agreement) {
      case 'BOTH_BUY':
        return 'bg-green-600';
      case 'BOTH_SELL':
        return 'bg-red-600';
      case 'CONFLICT':
        return 'bg-yellow-600';
      default:
        return 'bg-gray-600';
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading signals...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Dual Strategy Signals</h1>
          <p className="text-gray-600 mt-2">
            Comparing v2.1 Technical Analysis vs NITS Institutional Trading
          </p>
        </div>

        {/* Strategy Agreement Status */}
        {(v21Signal || nitsSignal) && (
          <Card className={`${getAgreementColor()} border-2`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Strategy Agreement</h3>
                  <p className="text-sm text-gray-700 mt-1">
                    {agreement === 'BOTH_BUY' &&
                      '✅ Both strategies agree: BUY signal'}
                    {agreement === 'BOTH_SELL' &&
                      '✅ Both strategies agree: SELL signal'}
                    {agreement === 'CONFLICT' &&
                      '⚠️ Strategies conflict: Caution advised'}
                    {agreement === 'NONE' &&
                      '➡️ Strategies neutral or mixed'}
                  </p>
                </div>
                <Badge className={`${getAgreementBadgeColor()} text-white text-base px-4 py-2`}>
                  {agreement}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dual Signals Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* V2.1 Signal */}
          {v21Signal && (
            <Card className="border-blue-200">
              <CardHeader className="bg-blue-50 border-b border-blue-200">
                <CardTitle className="text-blue-900">{v21Signal.strategy}</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Signal:</span>
                  <Badge
                    variant={
                      v21Signal.signalStatus === 'BUY'
                        ? 'default'
                        : v21Signal.signalStatus === 'SELL'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {v21Signal.signalStatus}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-semibold">Confidence:</span>
                  <span className="text-lg">{v21Signal.confidence.toFixed(1)}%</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-semibold">Bull Score:</span>
                  <span className="text-green-600 font-semibold">
                    +{v21Signal.bullScore || 0}
                  </span>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                  <h4 className="font-semibold text-sm">Trade Setup</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-600">Entry</p>
                      <p className="font-mono font-semibold">₹{v21Signal.price.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">SL</p>
                      <p className="font-mono font-semibold text-red-600">
                        ₹{v21Signal.stopLoss.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">T1</p>
                      <p className="font-mono font-semibold text-green-600">
                        ₹{v21Signal.targets.t1.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">T3</p>
                      <p className="font-mono font-semibold text-green-600">
                        ₹{v21Signal.targets.t3.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* NITS Signal */}
          {nitsSignal && (
            <Card className="border-purple-200">
              <CardHeader className="bg-purple-50 border-b border-purple-200">
                <CardTitle className="text-purple-900">{nitsSignal.strategy}</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Signal:</span>
                  <Badge
                    variant={
                      nitsSignal.signalStatus === 'BUY'
                        ? 'default'
                        : nitsSignal.signalStatus === 'SELL'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {nitsSignal.signalStatus}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-semibold">Confidence:</span>
                  <span className="text-lg">{nitsSignal.confidence.toFixed(1)}%</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-semibold">Market Bias:</span>
                  <Badge
                    variant={
                      nitsSignal.marketBias === 'Bullish'
                        ? 'default'
                        : nitsSignal.marketBias === 'Bearish'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {nitsSignal.marketBias}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">ORB Status:</span>
                    <span className="font-semibold">{nitsSignal.orbStatus}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Liquidity Status:</span>
                    <span className="font-semibold">{nitsSignal.liquidityStatus}</span>
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                  <h4 className="font-semibold text-sm">Trade Setup</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-600">Entry</p>
                      <p className="font-mono font-semibold">₹{nitsSignal.price.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">SL</p>
                      <p className="font-mono font-semibold text-red-600">
                        ₹{nitsSignal.stopLoss.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">T1</p>
                      <p className="font-mono font-semibold text-green-600">
                        ₹{nitsSignal.targets.t1.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">T3</p>
                      <p className="font-mono font-semibold text-green-600">
                        ₹{nitsSignal.targets.t3.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Comparison Table */}
        <Card>
          <CardHeader>
            <CardTitle>Strategy Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4 font-semibold">Metric</th>
                    <th className="text-center py-2 px-4 font-semibold">v2.1</th>
                    <th className="text-center py-2 px-4 font-semibold">NITS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4">Signal</td>
                    <td className="text-center">
                      <Badge>{v21Signal?.signalStatus || 'N/A'}</Badge>
                    </td>
                    <td className="text-center">
                      <Badge>{nitsSignal?.signalStatus || 'N/A'}</Badge>
                    </td>
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4">Confidence</td>
                    <td className="text-center">{v21Signal?.confidence.toFixed(0)}%</td>
                    <td className="text-center">{nitsSignal?.confidence.toFixed(0)}%</td>
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4">Entry Price</td>
                    <td className="text-center font-mono">₹{v21Signal?.price.toFixed(2)}</td>
                    <td className="text-center font-mono">₹{nitsSignal?.price.toFixed(2)}</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="py-2 px-4">Stop Loss</td>
                    <td className="text-center font-mono">₹{v21Signal?.stopLoss.toFixed(2)}</td>
                    <td className="text-center font-mono">₹{nitsSignal?.stopLoss.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
