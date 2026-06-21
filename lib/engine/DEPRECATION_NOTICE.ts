/**
 * DEPRECATION NOTICE - Legacy Signal Engines
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * The following engines are DEPRECATED as of this refactor:
 * - SignalEngine.ts
 * - v2_1_signal_engine.ts
 * - nits_signal_engine.ts
 * - TimedSignalScheduler.ts
 * 
 * MIGRATION PATH:
 * Use the new SAS (Smart Automated System) engine instead.
 * See lib/engine/archive/README.md for detailed migration guide.
 * 
 * NEW ENDPOINT:
 * POST /api/signals/sas - Generate SAS signals
 * GET /api/signals/sas - Fetch signal history
 * 
 * OLD ENDPOINTS (DEPRECATED):
 * POST /api/signal - DEPRECATED
 * POST /api/signals/v2.1 - DEPRECATED
 * POST /api/signals/nits - DEPRECATED
 * POST /api/signals/timed - DEPRECATED
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface DeprecationWarning {
  deprecated: true;
  reason: string;
  replacementEngine: string;
  replacementEndpoint: string;
  migrationGuide: string;
  removalDate?: string;
}

export const DEPRECATION_NOTICES = {
  SignalEngine: {
    deprecated: true,
    reason: 'Legacy multi-indicator engine replaced by SAS foundation',
    replacementEngine: 'SASEngine',
    replacementEndpoint: '/api/signals/sas',
    migrationGuide: 'lib/engine/archive/README.md',
  } as DeprecationWarning,
  V2_1SignalEngine: {
    deprecated: true,
    reason: 'Ichimoku + Stoch RSI engine replaced by SAS foundation',
    replacementEngine: 'SASEngine',
    replacementEndpoint: '/api/signals/sas',
    migrationGuide: 'lib/engine/archive/README.md',
  } as DeprecationWarning,
  NITSSignalEngine: {
    deprecated: true,
    reason:
      'NITS institutional engine replaced by SAS with Volume Profile (Stage 2)',
    replacementEngine: 'SASEngine + volumeProfile.ts (Stage 2)',
    replacementEndpoint: '/api/signals/sas',
    migrationGuide: 'lib/engine/archive/README.md',
  } as DeprecationWarning,
  TimedSignalScheduler: {
    deprecated: true,
    reason: 'Timed signal scheduler replaced by SAS event-driven approach',
    replacementEngine: 'SASEngine + scheduled triggers',
    replacementEndpoint: '/api/signals/sas',
    migrationGuide: 'lib/engine/archive/README.md',
  } as DeprecationWarning,
};

/**
 * Emit deprecation warning for developers
 */
export function warnDeprecated(engineName: keyof typeof DEPRECATION_NOTICES) {
  const notice = DEPRECATION_NOTICES[engineName];
  if (notice) {
    console.warn(`
╔═══════════════════════════════════════════════════════════╗
║ DEPRECATION WARNING: ${engineName}
║ ───────────────────────────────────────────────────────────
║ Reason: ${notice.reason}
║ Use: ${notice.replacementEngine}
║ Endpoint: ${notice.replacementEndpoint}
║ Guide: ${notice.migrationGuide}
╚═══════════════════════════════════════════════════════════╝
    `);
  }
}

/**
 * Check if an engine is deprecated
 */
export function isDeprecated(
  engineName: keyof typeof DEPRECATION_NOTICES
): boolean {
  return engineName in DEPRECATION_NOTICES;
}

/**
 * Get deprecation info for an engine
 */
export function getDeprecationInfo(
  engineName: keyof typeof DEPRECATION_NOTICES
): DeprecationWarning | null {
  return DEPRECATION_NOTICES[engineName] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAS ENGINE FEATURES vs OLD ENGINES
// ═══════════════════════════════════════════════════════════════════════════

export const FEATURE_COMPARISON = `
┌──────────────────┬────────────┬────────────┬────────────┬──────────────┐
│ Feature          │ SignalEngine│ V2.1       │ NITS       │ SAS (New)    │
├──────────────────┼────────────┼────────────┼────────────┼──────────────┤
│ Pivot Zones      │ No         │ No         │ Partial    │ ✓ Full 6-zone│
│ No-Trade Zone    │ No         │ No         │ No         │ ✓ Yes        │
│ Confluence Score │ 3+ indicator│ 0-11 point │ Ad-hoc    │ ✓ Unified    │
│ Volume Profile   │ Partial    │ No         │ POC/VAH/VAL│ ✓ Stage 2    │
│ VIX Integration  │ No         │ No         │ No         │ ✓ Stage 2    │
│ Risk Management  │ Manual     │ Manual     │ Manual     │ ✓ Automatic  │
│ Trades/Day       │ 10-15      │ 5-8        │ 2-4        │ 10+ (tunable)│
│ Win Rate         │ 45-50%     │ 50-55%     │ 55-60%     │ 65%+ (target)│
│ Code Quality     │ Complex    │ Complex    │ Complex    │ Clean/Modular│
│ Maintenance      │ Difficult  │ Difficult  │ Difficult  │ ✓ Easy       │
│ Testing          │ None       │ None       │ None       │ ✓ Planned    │
└──────────────────┴────────────┴────────────┴────────────┴──────────────┘

SAS Foundation (Stage 1) provides:
✓ Professional pivot-based trading
✓ 6-zone heatmap for risk assessment
✓ No-Trade Zone (NTZ) to block choppy trades
✓ Unified confluence scoring
✓ Automatic risk management (SL/targets)
✓ Clean, maintainable code
✓ Modular architecture for Stage 2 additions

Stage 2 Additions (coming next):
✓ Volume Profile (POC, VAH, VAL) - 70% Value Area
✓ India VIX integration - Dynamic strikes
✓ Enhanced UI - NTZ badge, VP display, VIX regime
✓ Strike recommendation engine

Stage 3 Enhancements (future):
✓ OI analysis - Strike heatmap, trends
✓ Gamma exposure calculation
✓ FII/DII sentiment analysis
`;

console.log(FEATURE_COMPARISON);
