/**
 * API Route: /api/signals/history (also available at /api/history)
 * Get signal history and statistics
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock data for now (replace with real DB queries)
let signalHistory: any[] = [];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol') || 'NSE:NIFTY';
    const action = searchParams.get('action') || 'history'; // 'history' | 'stats'
    const period = searchParams.get('period') || 'all'; // 'today' | 'week' | 'month' | 'all'
    const limit = parseInt(searchParams.get('limit') || '100');

    if (action === 'stats') {
      // Calculate stats from signalHistory
      const filtered = signalHistory.filter((s) => s.symbol === symbol);
      
      const stats = {
        totalSignals: filtered.length,
        buySignals: filtered.filter((s) => s.signalType === 'BUY').length,
        sellSignals: filtered.filter((s) => s.signalType === 'SELL').length,
        noTradeSignals: filtered.filter((s) => s.signalType === 'NO_TRADE').length,
        winRate: calculateWinRate(filtered),
        avgWin: calculateAvgWin(filtered),
        avgLoss: calculateAvgLoss(filtered),
        profitFactor: calculateProfitFactor(filtered),
        totalPnL: calculateTotalPnL(filtered),
        totalTrades: filtered.filter((s) => s.status === 'CLOSED').length,
        successTrades: filtered.filter((s) => s.pnl > 0).length,
        failedTrades: filtered.filter((s) => s.pnl < 0).length,
        period,
      };

      return NextResponse.json({ success: true, stats }, { status: 200 });
    }

    // Default: Return history
    const history = signalHistory
      .filter((s) => s.symbol === symbol)
      .slice(0, limit);

    return NextResponse.json(
      { success: true, history, count: history.length },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('History retrieval error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve history' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { signal, action } = body;

    if (action === 'log') {
      // Add signal to history
      signalHistory.push({
        ...signal,
        id: Date.now().toString(),
        loggedAt: new Date(),
      });

      return NextResponse.json(
        { success: true, message: 'Signal logged', signalHistory },
        { status: 201 }
      );
    }

    if (action === 'update_trade') {
      // Update trade outcome
      const { signalId, exitPrice, pnl } = body;
      const signal = signalHistory.find((s) => s.id === signalId);
      
      if (signal) {
        signal.exitPrice = exitPrice;
        signal.pnl = pnl;
        signal.status = 'CLOSED';
      }

      return NextResponse.json(
        { success: true, message: 'Trade updated', signal },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}

/**
 * Helper functions for statistics
 */
function calculateWinRate(signals: any[]): number {
  const closedTrades = signals.filter((s) => s.status === 'CLOSED');
  if (closedTrades.length === 0) return 0;
  const wins = closedTrades.filter((s) => s.pnl > 0).length;
  return (wins / closedTrades.length) * 100;
}

function calculateAvgWin(signals: any[]): number {
  const wins = signals.filter((s) => s.pnl > 0);
  if (wins.length === 0) return 0;
  return wins.reduce((sum, s) => sum + s.pnl, 0) / wins.length;
}

function calculateAvgLoss(signals: any[]): number {
  const losses = signals.filter((s) => s.pnl < 0);
  if (losses.length === 0) return 0;
  return Math.abs(losses.reduce((sum, s) => sum + s.pnl, 0) / losses.length);
}

function calculateProfitFactor(signals: any[]): number {
  const wins = signals.filter((s) => s.pnl > 0).reduce((sum, s) => sum + s.pnl, 0);
  const losses = Math.abs(signals.filter((s) => s.pnl < 0).reduce((sum, s) => sum + s.pnl, 0));
  if (losses === 0) return wins > 0 ? Infinity : 0;
  return wins / losses;
}

function calculateTotalPnL(signals: any[]): number {
  return signals.reduce((sum, s) => sum + (s.pnl || 0), 0);
}
