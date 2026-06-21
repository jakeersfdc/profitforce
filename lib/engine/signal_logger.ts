/**
 * Signal Logging Service
 * Stores, retrieves, and analyzes signal history
 */

import { SignalLog, TradeLog, StrategyStats } from './signal_logging_schema';
import { SignalData } from '@/lib/engine/v2_1_signal_engine';

export class SignalLogger {
  private db: any; // Database connection

  constructor(db: any) {
    this.db = db;
  }

  /**
   * Log a generated signal
   */
  async logSignal(signal: SignalData): Promise<SignalLog> {
    const query = `
      INSERT INTO signal_logs (
        symbol, signal_type, entry_price, bull_score, bear_score, 
        confidence, indicators, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const result = await this.db.query(query, [
      signal.symbol,
      signal.signalStatus,
      signal.price,
      signal.bullScore,
      signal.bearScore,
      signal.confidence,
      JSON.stringify(signal.indicators),
      'ACTIVE',
    ]);

    return result.rows[0];
  }

  /**
   * Log a trade execution
   */
  async logTrade(signalId: string, trade: TradeLog): Promise<TradeLog> {
    const query = `
      INSERT INTO trade_logs (
        signal_id, entry_time, entry_price, quantity, 
        stop_loss, target1, target2, target3, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const result = await this.db.query(query, [
      signalId,
      trade.entryTime,
      trade.entryPrice,
      trade.quantity,
      trade.stopLoss,
      trade.target1,
      trade.target2,
      trade.target3,
      'OPEN',
    ]);

    return result.rows[0];
  }

  /**
   * Close a trade
   */
  async closeTrade(
    tradeId: string,
    exitPrice: number,
    exitReason: string
  ): Promise<TradeLog> {
    const query = `
      UPDATE trade_logs 
      SET exit_price = $2, exit_time = NOW(), exit_reason = $3, status = 'CLOSED'
      WHERE id = $1
      RETURNING *;
    `;

    const result = await this.db.query(query, [tradeId, exitPrice, exitReason]);
    
    // Update parent signal
    await this.updateSignalStatus(result.rows[0].signal_id, exitPrice);

    return result.rows[0];
  }

  /**
   * Get all signals for a symbol
   */
  async getSignalHistory(
    symbol: string = 'NSE:NIFTY',
    limit: number = 100
  ): Promise<SignalLog[]> {
    const query = `
      SELECT * FROM signal_logs
      WHERE symbol = $1
      ORDER BY timestamp DESC
      LIMIT $2;
    `;

    const result = await this.db.query(query, [symbol, limit]);
    return result.rows;
  }

  /**
   * Calculate strategy statistics
   */
  async getStrategyStats(period: 'today' | 'week' | 'month' | 'all'): Promise<StrategyStats> {
    const dateFilter = this.getDateFilter(period);
    
    // Map period to StrategyStats format
    const periodMap: Record<string, 'daily' | 'weekly' | 'monthly'> = {
      today: 'daily',
      week: 'weekly',
      month: 'monthly',
      all: 'monthly'
    };
    const mappedPeriod = periodMap[period];
    
    const query = `
      SELECT 
        COUNT(*) as total_signals,
        SUM(CASE WHEN signal_type = 'BUY' THEN 1 ELSE 0 END) as buy_signals,
        SUM(CASE WHEN signal_type = 'SELL' THEN 1 ELSE 0 END) as sell_signals,
        SUM(CASE WHEN signal_type = 'NO_TRADE' THEN 1 ELSE 0 END) as no_trade_signals,
        AVG(confidence) as avg_confidence,
        (SELECT COUNT(*) FROM trade_logs WHERE status = 'CLOSED') as total_trades,
        (SELECT COUNT(*) FROM trade_logs WHERE status = 'CLOSED' AND pnl > 0) as success_trades,
        (SELECT SUM(pnl) FROM trade_logs WHERE status = 'CLOSED' AND pnl > 0) as total_wins,
        (SELECT SUM(ABS(pnl)) FROM trade_logs WHERE status = 'CLOSED' AND pnl < 0) as total_losses,
        (SELECT SUM(pnl) FROM trade_logs WHERE status = 'CLOSED') as total_pnl
      FROM signal_logs
      WHERE timestamp >= ${dateFilter};
    `;

    const result = await this.db.query(query);
    const stats = result.rows[0];

    return {
      totalSignals: stats.total_signals || 0,
      successfulTrades: stats.success_trades || 0,
      failedTrades: (stats.total_trades || 0) - (stats.success_trades || 0),
      winRate: stats.success_trades > 0 && stats.total_trades > 0 ? (stats.success_trades / stats.total_trades) * 100 : 0,
      avgProfit: stats.total_wins > 0 && stats.success_trades > 0 ? stats.total_wins / stats.success_trades : 0,
      avgLoss: stats.total_losses > 0 && stats.total_trades > stats.success_trades ? stats.total_losses / (stats.total_trades - stats.success_trades) : 0,
      profitFactor: stats.total_losses > 0 ? stats.total_wins / stats.total_losses : 0,
      totalPnL: stats.total_pnl || 0,
      period: mappedPeriod,
      lastUpdated: new Date(),
    };
  }

  /**
   * Private: Update signal status after trade close
   */
  private async updateSignalStatus(signalId: string, exitPrice: number): Promise<void> {
    const query = `
      UPDATE signal_logs
      SET exit_price = $2, exit_time = NOW(), status = 'CLOSED'
      WHERE id = $1;
    `;

    await this.db.query(query, [signalId, exitPrice]);
  }

  /**
   * Private: Get date filter for period
   */
  private getDateFilter(period: string): string {
    const now = new Date();
    switch (period) {
      case 'today':
        return `DATE_TRUNC('day', NOW())`;
      case 'week':
        return `NOW() - INTERVAL '7 days'`;
      case 'month':
        return `NOW() - INTERVAL '30 days'`;
      default:
        return `'2000-01-01'`;
    }
  }
}
