/**
 * SAS Engine - Usage Examples & Quick Start
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file demonstrates how to use the new SAS engine for:
 * 1. Generating signals
 * 2. Configuring the engine
 * 3. Parsing signal results
 * 4. Integration with paper trading and auto-execution
 */

import { SASEngine, createSASEngine } from './SASEngine';
import { OHLCV, SASSignal } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 1: Basic Signal Generation
// ═══════════════════════════════════════════════════════════════════════════

async function example1_basicSignal() {
  console.log('═══ Example 1: Basic Signal Generation ═══\n');

  // Create engine with default config
  const engine = createSASEngine();

  // Current candle (today's 1-minute or 15-minute close)
  const currentOHLCV: OHLCV = {
    time: new Date(),
    open: 19100,
    high: 19250,
    low: 19050,
    close: 19200,
    volume: 15000000,
  };

  // Previous day's OHLC (REQUIRED for pivot calculation)
  const previousDayOHLC: OHLCV = {
    time: new Date(Date.now() - 24 * 60 * 60 * 1000),
    open: 19050,
    high: 19300,
    low: 18950,
    close: 19150,
    volume: 25000000,
  };

  // Indicator values
  const indicators = {
    adx: 28,                    // Trend strength (20+ = trend)
    trend: 'UP' as const,       // Current trend direction
    rsi: 65,                    // Momentum (14-period)
    volumeRegime: 'HIGH' as const,
  };

  // Generate signal
  const signal = await engine.generateSignal(
    'NIFTY50',
    currentOHLCV,
    previousDayOHLC,
    { indicators }
  );

  console.log('Generated Signal:');
  console.log(JSON.stringify(signal, null, 2));
  console.log('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 2: Understanding Signal Components
// ═══════════════════════════════════════════════════════════════════════════

async function example2_understandSignal() {
  console.log('═══ Example 2: Understanding Signal Components ═══\n');

  const engine = createSASEngine();

  const currentOHLCV: OHLCV = {
    time: new Date(),
    open: 19100,
    high: 19250,
    low: 19050,
    close: 19200,
    volume: 15000000,
  };

  const previousDayOHLC: OHLCV = {
    time: new Date(Date.now() - 24 * 60 * 60 * 1000),
    open: 19050,
    high: 19300,
    low: 18950,
    close: 19150,
    volume: 25000000,
  };

  const signal = await engine.generateSignal(
    'NIFTY50',
    currentOHLCV,
    previousDayOHLC,
    { indicators: { adx: 28, trend: 'UP', rsi: 65, volumeRegime: 'HIGH' } }
  );

  console.log('Signal Components Breakdown:');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  console.log(`\n📊 SIGNAL DECISION:`);
  console.log(`  Signal: ${signal.signal}`);
  console.log(`  Confidence: ${signal.confidence}%`);
  console.log(`  Price: ${signal.price}`);

  console.log(`\n📍 PIVOT ZONES:`);
  console.log(`  R2 (Resistance 2): ${signal.pivotZones.r2.toFixed(2)}`);
  console.log(`  R1 (Resistance 1): ${signal.pivotZones.r1.toFixed(2)}`);
  console.log(`  PP (Pivot Point):  ${signal.pivotZones.pp.toFixed(2)}`);
  console.log(`  S1 (Support 1):    ${signal.pivotZones.s1.toFixed(2)}`);
  console.log(`  S2 (Support 2):    ${signal.pivotZones.s2.toFixed(2)}`);
  console.log(`  Price Zone: ${signal.priceZone}`);

  console.log(`\n⚠️  NO-TRADE ZONE (NTZ):`);
  console.log(`  Active: ${signal.noTradeZone.isActive}`);
  console.log(`  Reason: ${signal.noTradeZone.reason}`);
  console.log(`  ADX: ${signal.noTradeZone.adxValue}`);
  console.log(`  Distance from PP: ${signal.noTradeZone.pricePct.toFixed(2)}%`);

  console.log(`\n🎯 CONFLUENCE SCORES:`);
  console.log(`  Pivot Zone:     ${signal.confluenceScores.pivotZone > 0 ? '+' : ''}${signal.confluenceScores.pivotZone}`);
  console.log(`  Trend:          ${signal.confluenceScores.trend > 0 ? '+' : ''}${signal.confluenceScores.trend}`);
  console.log(`  ADX:            ${signal.confluenceScores.adx > 0 ? '+' : ''}${signal.confluenceScores.adx.toFixed(1)}`);
  console.log(`  Momentum:       ${signal.confluenceScores.momentum > 0 ? '+' : ''}${signal.confluenceScores.momentum}`);
  console.log(`  Volume Profile: ${signal.confluenceScores.volumeProfile} (Stage 2)`);
  console.log(`  VIX:            ${signal.confluenceScores.vix} (Stage 2)`);
  console.log(`  ──────────────────`);
  console.log(`  TOTAL:          ${signal.confluenceScores.total > 0 ? '+' : ''}${signal.confluenceScores.total}`);

  console.log(`\n💡 CONFLUENCE FACTORS:`);
  signal.confluenceFactors.forEach((factor) => {
    console.log(`  • ${factor}`);
  });

  console.log(`\n💰 RISK MANAGEMENT:`);
  console.log(`  Entry:    ${signal.entry.toFixed(2)}`);
  console.log(`  Stop Loss: ${signal.stopLoss.toFixed(2)}`);
  console.log(`  Target 1: ${signal.target1.toFixed(2)}`);
  console.log(`  Target 2: ${signal.target2.toFixed(2)}`);
  console.log(`  Target 3: ${signal.target3.toFixed(2)}`);
  console.log(`\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 3: Custom Configuration
// ═══════════════════════════════════════════════════════════════════════════

async function example3_customConfig() {
  console.log('═══ Example 3: Custom Configuration ═══\n');

  // Create engine with custom config for aggressive trading
  const engine = createSASEngine({
    minConfluence: 1,        // Lower threshold = more signals
    ntzThreshold: 3,         // Lower NTZ override threshold
    adxMaxChop: 25,          // Higher tolerance for chop
    riskRewardRatio: 1.5,    // Smaller targets
    trailingStopPct: 3,      // Larger trailing stop
  });

  console.log('Custom Config:');
  console.log(JSON.stringify(engine.getConfig(), null, 2));
  console.log('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 4: Multiple Symbols
// ═══════════════════════════════════════════════════════════════════════════

async function example4_multipleSymbols() {
  console.log('═══ Example 4: Multiple Symbols ═══\n');

  const engine = createSASEngine();

  const symbols = [
    { name: 'NIFTY50', current: 19200, prev: 19150 },
    { name: 'BANKNIFTY', current: 47500, prev: 47450 },
    { name: 'FINNIFTY', current: 22100, prev: 22050 },
  ];

  const currentOHLCV: OHLCV = {
    time: new Date(),
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 15000000,
  };

  const previousDayOHLC: OHLCV = {
    time: new Date(Date.now() - 24 * 60 * 60 * 1000),
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 25000000,
  };

  console.log('Generating signals for multiple symbols:\n');

  for (const symbol of symbols) {
    currentOHLCV.close = symbol.current;
    currentOHLCV.high = symbol.current + 100;
    currentOHLCV.low = symbol.current - 100;
    currentOHLCV.open = symbol.current - 50;

    previousDayOHLC.close = symbol.prev;
    previousDayOHLC.high = symbol.prev + 150;
    previousDayOHLC.low = symbol.prev - 150;
    previousDayOHLC.open = symbol.prev - 50;

    const signal = await engine.generateSignal(
      symbol.name,
      currentOHLCV,
      previousDayOHLC,
      { indicators: { adx: 28, trend: 'UP', rsi: 65 } }
    );

    console.log(`${symbol.name}: ${signal.signal} (${signal.confidence}%)`);
  }
  console.log('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 5: Integration with Auto-Execution
// ═══════════════════════════════════════════════════════════════════════════

async function example5_autoExecution() {
  console.log('═══ Example 5: Integration with Auto-Execution ═══\n');

  const engine = createSASEngine();

  const currentOHLCV: OHLCV = {
    time: new Date(),
    open: 19100,
    high: 19250,
    low: 19050,
    close: 19200,
    volume: 15000000,
  };

  const previousDayOHLC: OHLCV = {
    time: new Date(Date.now() - 24 * 60 * 60 * 1000),
    open: 19050,
    high: 19300,
    low: 18950,
    close: 19150,
    volume: 25000000,
  };

  const signal = await engine.generateSignal(
    'NIFTY50',
    currentOHLCV,
    previousDayOHLC,
    { indicators: { adx: 28, trend: 'UP', rsi: 65, volumeRegime: 'HIGH' } }
  );

  // Check if we should trade
  if (signal.signal === 'BUY' && signal.confidence >= 60) {
    console.log(`✓ TRADE SIGNAL: ${signal.signal} (${signal.confidence}%)`);
    console.log(`  Entry:    ${signal.entry.toFixed(2)}`);
    console.log(`  Stop Loss: ${signal.stopLoss.toFixed(2)}`);
    console.log(`  Risk:     ${(signal.entry - signal.stopLoss).toFixed(2)} pts`);
    console.log(`  Target 1: ${signal.target1.toFixed(2)}`);
    console.log(`  Reward:   ${(signal.target1 - signal.entry).toFixed(2)} pts`);
    console.log(`  R:R Ratio: 1:${((signal.target1 - signal.entry) / (signal.entry - signal.stopLoss)).toFixed(2)}`);
    console.log('\n  Ready for execution via autoExecuteSignal()');
  } else if (signal.noTradeZone.isActive) {
    console.log(`⚠️  NO-TRADE ZONE ACTIVE: ${signal.noTradeZone.reason}`);
    console.log(`   Skip trading until conditions improve`);
  } else {
    console.log(`⊘ NO SIGNAL: Confidence too low or conflicting signals`);
  }
  console.log('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 6: Paper Trading Simulation
// ═══════════════════════════════════════════════════════════════════════════

async function example6_paperTrading() {
  console.log('═══ Example 6: Paper Trading Simulation ═══\n');

  const engine = createSASEngine();

  // Simulate 5 candles
  const candles = [
    { close: 19100, high: 19150, low: 19050, open: 19050, volume: 10000000 },
    { close: 19150, high: 19200, low: 19100, open: 19100, volume: 12000000 },
    { close: 19200, high: 19250, low: 19150, open: 19150, volume: 15000000 },
    { close: 19180, high: 19210, low: 19160, open: 19200, volume: 11000000 },
    { close: 19220, high: 19280, low: 19180, open: 19180, volume: 16000000 },
  ];

  const previousDayOHLC: OHLCV = {
    time: new Date(Date.now() - 24 * 60 * 60 * 1000),
    open: 19050,
    high: 19300,
    low: 18950,
    close: 19150,
    volume: 25000000,
  };

  console.log('Simulating 5 candles with paper trading:\n');

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const currentOHLCV: OHLCV = {
      time: new Date(),
      ...candle,
    };

    const signal = await engine.generateSignal(
      'NIFTY50',
      currentOHLCV,
      previousDayOHLC,
      { indicators: { adx: 25 + Math.random() * 10, trend: 'UP', rsi: 60 + Math.random() * 10 } }
    );

    console.log(`Candle ${i + 1}: ${signal.signal} | Confidence: ${signal.confidence}%`);
    if (signal.signal !== 'HOLD') {
      console.log(`  Entry: ${signal.entry.toFixed(2)} | SL: ${signal.stopLoss.toFixed(2)}`);
    }
  }
  console.log('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL EXAMPLES
// ═══════════════════════════════════════════════════════════════════════════

export async function runAllExamples() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║          SAS ENGINE - USAGE EXAMPLES & QUICK START        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  await example1_basicSignal();
  await example2_understandSignal();
  await example3_customConfig();
  await example4_multipleSymbols();
  await example5_autoExecution();
  await example6_paperTrading();

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    EXAMPLES COMPLETE                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
}

// Uncomment to run examples
// runAllExamples();
