# SAS Refactor - Legacy Signal Engine Archive

## What Was Removed

This directory contains documentation of the legacy signal engines that were removed during the SAS (Smart Automated System) refactor.

### Removed Files

1. **SignalEngine.ts** (1500+ lines)
   - Multi-indicator confluence engine (10+ indicators)
   - GMMA, EMA, RSI, MACD, Bollinger Bands, VWAP, ATR, ADX, OBV, SuperTrend
   - Complex signal generation with 3+ indicator agreement requirement
   - Used in: alerts, stream, scan, strikes, signal, trade/auto endpoints

2. **v2_1_signal_engine.ts**
   - Ichimoku Cloud + Stochastic RSI engine
   - 0-11 point signal scoring system
   - Used in: /api/signals/v2.1, /api/v2.1, backtest engine

3. **nits_signal_engine.ts**
   - NITS (Institutional Trading System)
   - Opening Range Breakout (ORB) detection
   - Volume profile levels (POC, VAH, VAL)
   - Used in: /api/signals/nits, /api/nits

4. **TimedSignalScheduler.ts**
   - Market-hour triggered signals
   - Timings: market-open (9:30), mid-day (11:45), pre-close (3:15), post-market (4:00 IST)
   - Used in: /api/signals/timed

### API Endpoints Using Legacy Engines

- `/api/signal` → generateSignal from SignalEngine
- `/api/signals/v2.1` → V2_1SignalEngine
- `/api/signals/nits` → NITSSignalEngine
- `/api/signals/timed` → TimedSignalScheduler
- `/api/signals/history` → SignalLogger
- `/api/scan` → scanMarket
- `/api/stream` → scanMarket + generateSignal
- `/api/alerts` → scanMarket
- `/api/strikes` → generateSignal
- `/api/optionchain` → generateSignal
- `/api/trade/auto` → generateSignal
- `/api/predict/ensemble` → generateSignal

### Components Removed

- **V2_1SignalDisplay.tsx** - Displayed v2.1 signals with indicator breakdown
- **DualStrategyDashboard.tsx** - Compared v2.1 vs NITS signals

## Migration Path

### Stage 1: Foundation (Current) ✅
- ✅ New types.ts with SASSignal, PivotZones, ConfluenceScores
- ✅ pivot.ts - Pivot point calculations with 6-zone heatmap
- ✅ SASEngine.ts - Foundation with BUY/SELL/EXIT/HOLD signals based on pivots
- ✅ NTZ (No-Trade Zone) detection
- ✅ Confluence scoring system

### Stage 2: Volume Profile + VIX (Next Chat)
- volumeProfile.ts - POC, VAH, VAL calculations with 70% Value Area
- vixIntegration.ts - India VIX analysis with dynamic strike selection
- Enhanced confluence scoring with VP and VIX factors
- UI updates in SignalTable.tsx (NTZ badge, VP display, VIX regime)

### Stage 3: OI Analysis Enhancement (Future)
- Strike-wise OI heatmap
- OI change trends
- Gamma exposure & max pain calculation
- OI-based support/resistance

## New SAS Architecture

### Signal Generation
```
OHLCV Data
    ↓
Pivot Calculation (R1, R2, S1, S2)
    ↓
Price Zone Classification (6-zone heatmap)
    ↓
No-Trade Zone Detection (NTZ)
    ↓
Confluence Scoring (Pivots + Trend + ADX + Momentum)
    ↓
Signal Decision (BUY/SELL/EXIT/HOLD)
    ↓
Risk Management (Entry, SL, Targets)
    ↓
SASSignal Output
```

### Files to Keep (Not in Archive)

- `autoExecute.ts` - Signal-to-order bridge (still needed)
- `AutoTrader.ts` - Full automation (will be updated)
- `backtest_engine.ts` - Backtesting (will accept SAS signals)
- `market_data_service.ts` - Market data fetching (unchanged)
- `paper_trading.ts` - Paper trading (unchanged)
- `signal_logger.ts` - Signal logging (will accept SAS signals)
- `oiAnalysis.ts` - OI analysis (still used)
- `types.ts` - Core types (EXTENDED with SAS types)

## Configuration

Default SASConfig values:
```typescript
{
  minConfluence: 2,           // Minimum score for signal
  ntzThreshold: 5,            // Confluence to override NTZ
  adxMinTrend: 20,            // ADX for trend
  adxMaxChop: 20,             // ADX threshold for choppy
  pricePctToPP: 0.3,          // % distance for NTZ
  riskRewardRatio: 2,         // Minimum R:R ratio
  trailingStopPct: 2          // Trailing stop %
}
```

## Usage Example

```typescript
import { createSASEngine } from '@/lib/engine/SASEngine';

const engine = createSASEngine({
  minConfluence: 2,
  ntzThreshold: 5,
});

const signal = await engine.generateSignal(
  'NIFTY50',
  currentOHLCV,
  previousDayOHLC,
  {
    adx: 25,
    trend: 'UP',
    rsi: 65,
    volumeRegime: 'HIGH'
  }
);
```

## Notes

- Previous day OHLC is REQUIRED for pivot calculation
- All scores are normalized (0-100 for confidence)
- NTZ can be overridden with sufficient confluence (default: 5+)
- Stage 2 will add Volume Profile and VIX factors
- Volume Profile was partially implemented in old engines - will be rebuilt properly in Stage 2
