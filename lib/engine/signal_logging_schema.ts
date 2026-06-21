/**
 * Signal Logging Schema - Database types for signal persistence
 */

export interface SignalLog {
  id: string;
  symbol: string;
  signal_type: string;
  side: string;
  confidence: number;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  priceZone: string;
  confluenceScore: number;
  timestamp: Date;
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED';
}

export interface TradeLog {
  id: string;
  signalId: string;
  symbol: string;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  pnl?: number;
  status: 'OPEN' | 'CLOSED';
  entryTime: Date;
  exitTime?: Date;
}

export interface StrategyStats {
  totalSignals: number;
  successfulTrades: number;
  failedTrades: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
  totalPnL: number;
  period: 'daily' | 'weekly' | 'monthly';
  lastUpdated: Date;
}

export interface SignalData {
  symbol: string;
  side: string;
  confidence: number;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  priceZone: string;
  confluenceScore: number;
  timestamp: Date;
}
