/**
 * API Route: /api/paper-trading
 * Manage paper trading positions and portfolio
 */

import { NextRequest, NextResponse } from 'next/server';

interface TradePosition {
  id: string;
  signalId: any;
  symbol: string;
  side: string;
  entryPrice: number;
  quantity: number;
  entryTime: Date;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  status: string;
  currentPrice: number;
  unrealizedPnL: number;
  exitPrice?: number;
  exitTime?: Date;
  exitReason?: string;
  pnl?: number;
}

interface Portfolio {
  cash: number;
  positions: TradePosition[];
  totalPnL: number;
  totalTrades: number;
  winRate: number;
  openTrades: number;
  maxDrawdown: number;
}

// In-memory paper trading state (replace with DB in production)
let paperPortfolio: Portfolio = {
  cash: 100000,
  positions: [],
  totalPnL: 0,
  totalTrades: 0,
  winRate: 0,
  openTrades: 0,
  maxDrawdown: 0,
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'portfolio';

    if (action === 'portfolio') {
      return NextResponse.json(
        {
          success: true,
          positions: paperPortfolio.positions.filter((p: any) => p.status === 'OPEN'),
          stats: {
            cash: paperPortfolio.cash,
            totalEquity:
              paperPortfolio.cash +
              paperPortfolio.positions.reduce((sum: number, p: any) => sum + (p.unrealizedPnL || 0), 0),
            totalPnL: paperPortfolio.totalPnL,
            winRate: paperPortfolio.winRate,
            openTrades: paperPortfolio.openTrades,
            totalTrades: paperPortfolio.totalTrades,
            maxDrawdown: paperPortfolio.maxDrawdown,
          },
        },
        { status: 200 }
      );
    }

    if (action === 'history') {
      const limit = parseInt(searchParams.get('limit') || '50');
      return NextResponse.json(
        {
          success: true,
          trades: paperPortfolio.positions
            .filter((p: any) => p.status === 'CLOSED')
            .slice(-limit),
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, trade } = body;

    if (action === 'open_trade') {
      const newTrade = {
        id: `PAPER-${Date.now()}`,
        signalId: trade.signalId,
        symbol: trade.symbol,
        side: trade.side,
        entryPrice: trade.entryPrice,
        quantity: trade.quantity,
        entryTime: new Date(),
        stopLoss: trade.stopLoss,
        target1: trade.target1,
        target2: trade.target2,
        target3: trade.target3,
        status: 'OPEN',
        currentPrice: trade.entryPrice,
        unrealizedPnL: 0,
      };

      paperPortfolio.cash -= trade.entryPrice * trade.quantity;
      paperPortfolio.positions.push(newTrade);
      paperPortfolio.openTrades++;

      return NextResponse.json(
        { success: true, trade: newTrade },
        { status: 201 }
      );
    }

    if (action === 'update_price') {
      const { tradeId, currentPrice } = body;
      const position = paperPortfolio.positions.find((p: any) => p.id === tradeId);

      if (position) {
        position.currentPrice = currentPrice;

        // Calculate unrealized P&L
        if (position.side === 'LONG') {
          position.unrealizedPnL = (currentPrice - position.entryPrice) * position.quantity;
        } else {
          position.unrealizedPnL = (position.entryPrice - currentPrice) * position.quantity;
        }

        // Check SL/TP
        if (
          (position.side === 'LONG' && currentPrice <= position.stopLoss) ||
          (position.side === 'SHORT' && currentPrice >= position.stopLoss)
        ) {
          return closeTrade(tradeId, position.stopLoss, 'SL_HIT');
        }

        if (
          (position.side === 'LONG' && currentPrice >= position.target3) ||
          (position.side === 'SHORT' && currentPrice <= position.target3)
        ) {
          return closeTrade(tradeId, position.target3, 'TP_HIT');
        }
      }

      return NextResponse.json({ success: true, position }, { status: 200 });
    }

    if (action === 'close_trade') {
      return closeTrade(body.tradeId, body.exitPrice, body.exitReason || 'MANUAL');
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function closeTrade(tradeId: string, exitPrice: number, reason: string) {
  const positionIndex = paperPortfolio.positions.findIndex((p: any) => p.id === tradeId);
  if (positionIndex === -1) {
    return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
  }

  const position = paperPortfolio.positions[positionIndex];
  let pnl = 0;

  if (position.side === 'LONG') {
    pnl = (exitPrice - position.entryPrice) * position.quantity;
  } else {
    pnl = (position.entryPrice - exitPrice) * position.quantity;
  }

  position.exitPrice = exitPrice;
  position.exitTime = new Date();
  position.exitReason = reason;
  position.status = 'CLOSED';
  position.pnl = pnl;

  paperPortfolio.cash += exitPrice * position.quantity;
  paperPortfolio.totalPnL += pnl;
  paperPortfolio.totalTrades++;
  paperPortfolio.openTrades--;

  // Update win rate
  const closedTrades = paperPortfolio.positions.filter((p: any) => p.status === 'CLOSED');
  const wins = closedTrades.filter((p: any) => (p.pnl || 0) > 0).length;
  paperPortfolio.winRate = (wins / closedTrades.length) * 100;

  return NextResponse.json({ success: true, position }, { status: 200 });
}
