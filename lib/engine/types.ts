/**
 * Core Types for Profitforce Trading Engine
 */

export interface OHLCV {
  time: number | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradingSignal {
  symbol: string;
  timestamp: Date;
  type: 'BUY' | 'SELL' | 'CLOSE_BUY' | 'CLOSE_SELL';
  price: number;
  confidence: number; // 0-100
  version: string; // 'v2.0' | 'v2.1'
  metadata?: Record<string, any>;
}

export interface TradeExecution {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  pnl?: number;
  createdAt: Date;
  closedAt?: Date;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAS (Smart Automated System) - New Professional Trading Signal Architecture
 * ═══════════════════════════════════════════════════════════════════════════
 * Based on 20+ years trader experience:
 * - Pivot zones (R1, R2, S1, S2) with heatmap scoring
 * - No-Trade Zone (NTZ) detection
 * - Volume Profile (POC, VAH, VAL) with confluence
 * - India VIX integration with dynamic strike selection
 * - Confluence-based buy/sell/exit signals
 */

// ──────────────────────────────────────────────────────────────────────────────
// Pivot Zone Definitions
// ──────────────────────────────────────────────────────────────────────────────
export interface PivotZones {
  pp: number;        // Pivot Point (mid-point)
  r1: number;        // Resistance 1
  r2: number;        // Resistance 2
  s1: number;        // Support 1
  s2: number;        // Support 2
  daysHigh: number;
  daysLow: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Zone Classification (6-zone heatmap)
// ──────────────────────────────────────────────────────────────────────────────
export type PriceZone = 
  | 'BELOW_S2'       // -3 score (bearish)
  | 'S2_TO_S1'       // -2 score
  | 'S1_TO_PP'       // -1 score
  | 'PP_TO_R1'       // +1 score
  | 'R1_TO_R2'       // +2 score (bullish)
  | 'ABOVE_R2';      // -2 score (overbought, pullback risk)

// ──────────────────────────────────────────────────────────────────────────────
// No-Trade Zone (NTZ) Definition
// ──────────────────────────────────────────────────────────────────────────────
export interface NoTradeZone {
  isActive: boolean;
  reason: 'CHOPPY_ZONE' | 'ADX_LOW' | 'BETWEEN_PIVOTS' | null;
  adxValue: number;
  pricePct: number;  // % away from PP
}

// ──────────────────────────────────────────────────────────────────────────────
// Volume Profile Basics (foundation for Stage 2)
// ──────────────────────────────────────────────────────────────────────────────
export interface VolumeProfileBasic {
  poc: number;       // Point of Control (highest volume price)
  vah: number;       // Value Area High (70% range top)
  val: number;       // Value Area Low (70% range bottom)
  pocScore: number;  // Signal contribution from POC proximity
}

// ──────────────────────────────────────────────────────────────────────────────
// Confluence Scoring System
// ──────────────────────────────────────────────────────────────────────────────
export interface ConfluenceScores {
  pivotZone: number;      // -3 to +2 from zone heatmap
  volumeProfile: number;  // -2 to +2 from VP levels
  trend: number;          // -2 to +2 from trend analysis
  momentum: number;       // -2 to +2 from momentum
  vix: number;            // -1 to +1 from VIX regime
  adx: number;            // -1 to +1 from trend strength
  total: number;          // Sum of all scores
}

// ──────────────────────────────────────────────────────────────────────────────
// SAS Signal - Core Output
// ──────────────────────────────────────────────────────────────────────────────
export interface SASSignal {
  // Core Signal
  symbol: string;
  timestamp: Date;
  version: 'SAS_v1';
  
  // Signal Decision
  signal: 'BUY' | 'SELL' | 'EXIT' | 'HOLD';
  confidence: number;  // 0-100 (0 = NTZ, 100 = max confluence)
  
  // Price Action
  price: number;
  priceZone: PriceZone;
  
  // Risk Management
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  
  // Zones & Levels
  pivotZones: PivotZones;
  noTradeZone: NoTradeZone;
  
  // Confluence Details
  confluenceScores: ConfluenceScores;
  confluenceFactors: string[];  // ['PP_Above', 'Uptrend', 'High_Volume', ...]
  
  // Volume Profile (Stage 2)
  volumeProfile?: VolumeProfileBasic;
  
  // VIX Integration (Stage 2)
  vixValue?: number;
  vixRegime?: 'VERY_LOW' | 'LOW' | 'NORMAL' | 'HIGH' | 'CRISIS';
  
  // F&O Specific
  strikePrice?: number;
  optionType?: 'CE' | 'PE';
  strikeWidth?: number;  // Dynamic based on VIX
  
  // Metadata
  metadata?: {
    adx?: number;
    trend?: 'UP' | 'DOWN' | 'NEUTRAL';
    volumeRegime?: 'HIGH' | 'NORMAL' | 'LOW';
    daysSinceLastSignal?: number;
    [key: string]: any;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// SAS Configuration
// ──────────────────────────────────────────────────────────────────────────────
export interface SASConfig {
  minConfluence: number;        // Minimum confluence score for signal (-6 to +8)
  ntzThreshold: number;         // Confluence required to override NTZ (default: 5)
  adxMinTrend: number;          // ADX threshold for trend (default: 20)
  adxMaxChop: number;           // ADX threshold for choppy (default: 20)
  pricePctToPP: number;         // Max % from PP for NTZ (default: 0.3%)
  riskRewardRatio: number;      // Min R:R for trade (default: 1:2)
  trailingStopPct: number;      // Trailing stop % (default: 2%)
}
