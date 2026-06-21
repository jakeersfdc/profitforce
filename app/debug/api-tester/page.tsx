/**
 * API Tester & Demo Page
 * Interactive testing of v2.1 signal endpoint
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Play } from 'lucide-react';

interface TestResult {
  success: boolean;
  signal: any;
  timestamp: string;
  responseTime: number;
}

export default function ApiTesterPage() {
  const [ohlcvData, setOhlcvData] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const sampleData = [
    {
      time: 1704067200000,
      open: 19500,
      high: 19550,
      low: 19450,
      close: 19520,
      volume: 1000000,
    },
    {
      time: 1704067800000,
      open: 19520,
      high: 19600,
      low: 19500,
      close: 19580,
      volume: 1200000,
    },
    {
      time: 1704068400000,
      open: 19580,
      high: 19650,
      low: 19550,
      close: 19630,
      volume: 1100000,
    },
    {
      time: 1704069000000,
      open: 19630,
      high: 19700,
      low: 19600,
      close: 19680,
      volume: 900000,
    },
    {
      time: 1704069600000,
      open: 19680,
      high: 19720,
      low: 19650,
      close: 19710,
      volume: 1050000,
    },
  ];

  const loadSampleData = () => {
    setOhlcvData(JSON.stringify(sampleData, null, 2));
  };

  const testSignalApi = async () => {
    try {
      setLoading(true);
      const startTime = Date.now();

      const payload = {
        symbol: 'NSE:NIFTY',
        candles: JSON.parse(ohlcvData),
      };

      const res = await fetch('/api/v2.1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseTime = Date.now() - startTime;
      const data = await res.json();

      setResult({
        success: res.ok,
        signal: data,
        timestamp: new Date().toISOString(),
        responseTime,
      });
    } catch (error: any) {
      setResult({
        success: false,
        signal: { error: error.message },
        timestamp: new Date().toISOString(),
        responseTime: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-gray-900">API Tester</h1>
          <p className="text-gray-600 mt-2">Test v2.1 Signal Generation Endpoint</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <Card>
            <CardHeader>
              <CardTitle>OHLCV Data Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Candle Data (JSON)
                </label>
                <textarea
                  value={ohlcvData}
                  onChange={(e) => setOhlcvData(e.target.value)}
                  rows={12}
                  className="w-full p-3 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Paste OHLCV data as JSON array..."
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={loadSampleData}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium transition-all"
                >
                  Load Sample Data
                </button>
                <button
                  onClick={testSignalApi}
                  disabled={loading || !ohlcvData}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Test Signal
                </button>
              </div>

              {/* Documentation */}
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Expected Format</h3>
                <code className="text-xs text-blue-800">
                  <pre>
{`[
  {
    "time": 1704067200000,
    "open": 19500,
    "high": 19550,
    "low": 19450,
    "close": 19520,
    "volume": 1000000
  }
]`}
                  </pre>
                </code>
              </div>
            </CardContent>
          </Card>

          {/* Output Section */}
          <Card>
            <CardHeader>
              <CardTitle>Signal Response</CardTitle>
            </CardHeader>
            <CardContent>
              {!result ? (
                <div className="flex items-center justify-center h-96 text-gray-500">
                  Run a test to see results
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <Badge variant={result.success ? 'default' : 'destructive'}>
                      {result.success ? 'Success' : 'Error'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Response Time:</span>
                    <span className="font-mono text-sm">
                      {result.responseTime}ms
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Timestamp:</span>
                    <span className="font-mono text-xs">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="mt-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold">Response Body:</span>
                      <button
                        onClick={() =>
                          copyToClipboard(JSON.stringify(result.signal, null, 2))
                        }
                        className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <Copy className="h-4 w-4" />
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-80 text-xs font-mono">
                      {JSON.stringify(result.signal, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* API Reference */}
        <Card>
          <CardHeader>
            <CardTitle>API Reference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Endpoint</h3>
                <code className="bg-gray-100 p-2 rounded text-sm">
                  POST /api/v2.1
                </code>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Response Time</h3>
                <p className="text-sm text-gray-600">
                  Typically &lt;100ms for 100-candle analysis
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Request Body</h3>
                <code className="text-xs bg-gray-100 p-3 rounded block font-mono">
{`{
  "symbol": "NSE:NIFTY",
  "candles": [OHLCV array]
}`}
                </code>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Response Body</h3>
                <code className="text-xs bg-gray-100 p-3 rounded block font-mono">
{`{
  "signal": {
    "symbol": string,
    "signalStatus": "BUY"|"SELL"|"NO_TRADE",
    "bullScore": number,
    "bearScore": number,
    "confidence": number,
    "indicators": {
      ichimoku, stochrsi, roc,
      rsi, macd, volume
    }
  }
}`}
                </code>
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-semibold text-yellow-900 mb-2">Rate Limits</h4>
              <p className="text-sm text-yellow-800">
                500 requests/minute • Burst limit: 50 requests/second
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
