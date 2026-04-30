/**
 * RiskEngine — pre-trade gate.
 *
 * Checks executed in order (fail-fast):
 *   1. Kill-switch (global + per-user)
 *   2. Risk profile loaded (capital, limits)
 *   3. Daily loss cap not breached
 *   4. Order rate limit (per-minute)
 *   5. Open-position count limit
 *   6. Per-symbol position notional limit
 *   7. Per-trade risk (capital × risk_per_trade_pct ≥ worst loss)
 *   8. SEBI sanity (qty > 0, price ≥ 0, etc.)
 *
 * Every check produces an audit row (RISK / approve | block).
 */
import { q } from "@/lib/oms/db";
import { appendAudit } from "@/lib/audit/AuditLog";
import { computeCosts, segmentFor } from "@/lib/risk/CostModel";

export interface RiskInput {
  clerkId: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;          // expected fill (use LTP for market orders)
  stopLoss?: number;      // for sizing checks
  isOption?: boolean;
  isFuture?: boolean;
  intraday?: boolean;
}

export interface RiskDecision {
  allow: boolean;
  reason?: string;
  detail?: string;
  meta?: {
    capital: number;
    realizedLossToday: number;
    maxDailyLoss: number;
    estCost: number;
    notional: number;
  };
}

interface RiskProfile {
  capital: number;
  max_daily_loss_pct: number;
  max_position_pct: number;
  max_open_positions: number;
  risk_per_trade_pct: number;
  max_orders_per_minute: number;
  auto_execute: boolean;
}

const DEFAULT_PROFILE: RiskProfile = {
  capital: 100000,
  max_daily_loss_pct: 0.03,
  max_position_pct: 0.20,
  max_open_positions: 5,
  risk_per_trade_pct: 0.01,
  max_orders_per_minute: 10,
  auto_execute: false,
};

async function loadProfile(clerkId: string): Promise<RiskProfile> {
  const res = await q<RiskProfile>(
    `SELECT capital::float, max_daily_loss_pct::float, max_position_pct::float,
            max_open_positions, risk_per_trade_pct::float, max_orders_per_minute, auto_execute
     FROM oms_risk_profile WHERE clerk_id = $1`,
    [clerkId]
  );
  return res.rows[0] ?? DEFAULT_PROFILE;
}

async function killSwitchOn(clerkId: string): Promise<{ on: boolean; scope: "global" | "user"; reason?: string }> {
  const res = await q<{ enabled: boolean; clerk_id: string | null; reason: string | null }>(
    `SELECT enabled, clerk_id, reason FROM oms_kill_switch WHERE id = 0 OR clerk_id = $1`,
    [clerkId]
  );
  for (const r of res.rows) {
    if (r.enabled) {
      return { on: true, scope: r.clerk_id ? "user" : "global", reason: r.reason ?? undefined };
    }
  }
  return { on: false, scope: "global" };
}

async function realizedLossToday(clerkId: string): Promise<number> {
  const res = await q<{ pnl: string }>(
    `SELECT COALESCE(SUM(realized_pnl),0)::text AS pnl FROM oms_positions WHERE clerk_id = $1`,
    [clerkId]
  );
  const pnl = Number(res.rows[0]?.pnl ?? 0);
  return pnl < 0 ? Math.abs(pnl) : 0;
}

async function ordersInLastMinute(clerkId: string): Promise<number> {
  const res = await q<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM oms_orders
     WHERE clerk_id = $1 AND created_at > NOW() - INTERVAL '60 seconds'`,
    [clerkId]
  );
  return Number(res.rows[0]?.c ?? 0);
}

async function openPositionsCount(clerkId: string): Promise<number> {
  const res = await q<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM oms_positions WHERE clerk_id = $1 AND net_qty <> 0`,
    [clerkId]
  );
  return Number(res.rows[0]?.c ?? 0);
}

async function notionalForSymbol(clerkId: string, symbol: string): Promise<number> {
  const res = await q<{ n: string }>(
    `SELECT COALESCE(ABS(net_qty * COALESCE(ltp, avg_price)),0)::text AS n
     FROM oms_positions WHERE clerk_id = $1 AND symbol = $2`,
    [clerkId, symbol]
  );
  return Number(res.rows[0]?.n ?? 0);
}

export async function evaluate(input: RiskInput): Promise<RiskDecision> {
  // 1. Kill switch
  const ks = await killSwitchOn(input.clerkId);
  if (ks.on) {
    const decision: RiskDecision = {
      allow: false,
      reason: `kill_switch_${ks.scope}`,
      detail: ks.reason,
    };
    await appendAudit({
      clerkId: input.clerkId,
      category: "RISK",
      action: "block",
      payload: { ...input, decision },
    });
    return decision;
  }

  // 2. Sanity
  if (!Number.isFinite(input.qty) || input.qty <= 0) {
    return await blocked(input, "invalid_qty");
  }
  if (!Number.isFinite(input.price) || input.price < 0) {
    return await blocked(input, "invalid_price");
  }

  const profile = await loadProfile(input.clerkId);
  const notional = input.qty * input.price;

  // 3. Daily loss cap
  const lossToday = await realizedLossToday(input.clerkId);
  const maxDailyLoss = profile.capital * profile.max_daily_loss_pct;
  if (lossToday >= maxDailyLoss) {
    return await blocked(input, "daily_loss_cap_breached", {
      capital: profile.capital,
      realizedLossToday: lossToday,
      maxDailyLoss,
      estCost: 0,
      notional,
    });
  }

  // 4. Order rate limit
  const recent = await ordersInLastMinute(input.clerkId);
  if (recent >= profile.max_orders_per_minute) {
    return await blocked(input, "rate_limit_orders_per_minute");
  }

  // 5. Open positions count
  const openCount = await openPositionsCount(input.clerkId);
  if (openCount >= profile.max_open_positions) {
    return await blocked(input, "max_open_positions");
  }

  // 6. Per-symbol position notional cap
  const existingNotional = await notionalForSymbol(input.clerkId, input.symbol);
  const maxPerSymbol = profile.capital * profile.max_position_pct;
  if (existingNotional + notional > maxPerSymbol) {
    return await blocked(input, "max_position_pct_for_symbol", {
      capital: profile.capital,
      realizedLossToday: lossToday,
      maxDailyLoss,
      estCost: 0,
      notional,
    });
  }

  // 7. Per-trade risk (only if stop loss provided — otherwise we use 5% worst-case)
  const worstLossPct = input.stopLoss
    ? Math.abs(input.price - input.stopLoss) / input.price
    : 0.05;
  const worstLoss = notional * worstLossPct;
  const maxTradeRisk = profile.capital * profile.risk_per_trade_pct;
  if (worstLoss > maxTradeRisk) {
    return await blocked(input, "exceeds_risk_per_trade", {
      capital: profile.capital,
      realizedLossToday: lossToday,
      maxDailyLoss,
      estCost: 0,
      notional,
    });
  }

  // 8. Cost preview (for logging — not a blocker)
  const seg = segmentFor(input.symbol, {
    isOption: input.isOption,
    isFuture: input.isFuture,
    intraday: input.intraday,
  });
  const cost = computeCosts({ segment: seg, side: input.side, qty: input.qty, price: input.price });

  const decision: RiskDecision = {
    allow: true,
    meta: {
      capital: profile.capital,
      realizedLossToday: lossToday,
      maxDailyLoss,
      estCost: cost.total,
      notional,
    },
  };
  await appendAudit({
    clerkId: input.clerkId,
    category: "RISK",
    action: "approve",
    payload: { ...input, decision, cost },
  });
  return decision;
}

async function blocked(
  input: RiskInput,
  reason: string,
  meta?: RiskDecision["meta"]
): Promise<RiskDecision> {
  const decision: RiskDecision = { allow: false, reason, meta };
  await appendAudit({
    clerkId: input.clerkId,
    category: "RISK",
    action: "block",
    payload: { ...input, decision },
  });
  return decision;
}

/** Toggle the kill-switch (admin or self). */
export async function setKillSwitch(opts: {
  enabled: boolean;
  clerkId: string | null; // null = global
  reason?: string;
  enabledBy: string;
}): Promise<void> {
  const id = opts.clerkId ? hashStringToInt(opts.clerkId) : 0;
  await q(
    `INSERT INTO oms_kill_switch (id, clerk_id, enabled, reason, enabled_by, enabled_at, updated_at)
     VALUES ($1,$2,$3,$4,$5, CASE WHEN $3 THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       reason = EXCLUDED.reason,
       enabled_by = EXCLUDED.enabled_by,
       enabled_at = CASE WHEN EXCLUDED.enabled THEN NOW() ELSE NULL END,
       updated_at = NOW()`,
    [id, opts.clerkId, opts.enabled, opts.reason ?? null, opts.enabledBy]
  );
  await appendAudit({
    clerkId: opts.clerkId,
    category: "KILL",
    action: opts.enabled ? "enable" : "disable",
    payload: { reason: opts.reason, by: opts.enabledBy, scope: opts.clerkId ? "user" : "global" },
  });
}

function hashStringToInt(s: string): number {
  // Stable 31-bit integer for the kill-switch row id (stays positive in INTEGER)
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

/** Upsert a user's risk profile. */
export async function setRiskProfile(clerkId: string, p: Partial<RiskProfile>): Promise<RiskProfile> {
  const merged: RiskProfile = { ...DEFAULT_PROFILE, ...(await loadProfile(clerkId)), ...p };
  await q(
    `INSERT INTO oms_risk_profile
       (clerk_id, capital, max_daily_loss_pct, max_position_pct, max_open_positions,
        risk_per_trade_pct, max_orders_per_minute, auto_execute, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (clerk_id) DO UPDATE SET
       capital = EXCLUDED.capital,
       max_daily_loss_pct = EXCLUDED.max_daily_loss_pct,
       max_position_pct = EXCLUDED.max_position_pct,
       max_open_positions = EXCLUDED.max_open_positions,
       risk_per_trade_pct = EXCLUDED.risk_per_trade_pct,
       max_orders_per_minute = EXCLUDED.max_orders_per_minute,
       auto_execute = EXCLUDED.auto_execute,
       updated_at = NOW()`,
    [
      clerkId,
      merged.capital,
      merged.max_daily_loss_pct,
      merged.max_position_pct,
      merged.max_open_positions,
      merged.risk_per_trade_pct,
      merged.max_orders_per_minute,
      merged.auto_execute,
    ]
  );
  return merged;
}

export { loadProfile as getRiskProfile };
