/**
 * Idempotent OMS schema bootstrap.
 * Reads the canonical migration SQL and applies it on first DB call.
 * Every CREATE/INSERT in 0006_oms_tables.sql is IF NOT EXISTS / ON CONFLICT,
 * so re-running is safe.
 *
 * This avoids the operational footgun where the production DB hasn't had
 * the migration run yet — first request to /api/oms/* lazily creates tables.
 */
import fs from "node:fs";
import path from "node:path";
import { pool } from "./db";

let bootstrapped: Promise<void> | null = null;

const SQL_FILE = "0006_oms_tables.sql";

async function applyBootstrap(): Promise<void> {
  const candidates = [
    path.join(process.cwd(), "migrations", SQL_FILE),
    path.join(process.cwd(), "..", "migrations", SQL_FILE),
  ];
  let sql: string | null = null;
  for (const p of candidates) {
    try {
      sql = fs.readFileSync(p, "utf8");
      break;
    } catch {
      /* try next */
    }
  }
  if (!sql) {
    sql = INLINE_SQL;
  }
  const client = await pool().connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
}

export function ensureOmsSchema(): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = applyBootstrap().catch((e) => {
      // Reset so a subsequent call retries instead of caching a failure forever.
      bootstrapped = null;
      throw e;
    });
  }
  return bootstrapped;
}

/**
 * Inline fallback for serverless environments where the /migrations
 * directory is not bundled. Mirrors migrations/0006_oms_tables.sql.
 */
const INLINE_SQL = `
CREATE TABLE IF NOT EXISTS oms_orders (
  id TEXT PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  broker_order_id TEXT,
  symbol TEXT NOT NULL,
  exchange TEXT,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  qty INTEGER NOT NULL CHECK (qty > 0),
  filled_qty INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('MARKET','LIMIT','SL','SL-M')),
  product TEXT NOT NULL DEFAULT 'INTRADAY',
  validity TEXT NOT NULL DEFAULT 'DAY',
  price NUMERIC(18,4),
  trigger_price NUMERIC(18,4),
  avg_fill_price NUMERIC(18,4),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SUBMITTED','OPEN','PARTIAL','FILLED','CANCELLED','REJECTED','ERROR')),
  reject_reason TEXT,
  strategy_id TEXT,
  signal_id TEXT,
  paper BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_oms_orders_user ON oms_orders (clerk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oms_orders_status ON oms_orders (status) WHERE status IN ('PENDING','SUBMITTED','OPEN','PARTIAL');
CREATE INDEX IF NOT EXISTS idx_oms_orders_symbol ON oms_orders (clerk_id, symbol);

CREATE TABLE IF NOT EXISTS oms_fills (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES oms_orders(id) ON DELETE CASCADE,
  clerk_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  qty INTEGER NOT NULL CHECK (qty > 0),
  price NUMERIC(18,4) NOT NULL,
  fees NUMERIC(18,4) NOT NULL DEFAULT 0,
  fee_breakdown JSONB DEFAULT '{}'::jsonb,
  filled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oms_fills_order ON oms_fills (order_id);
CREATE INDEX IF NOT EXISTS idx_oms_fills_user ON oms_fills (clerk_id, filled_at DESC);

CREATE TABLE IF NOT EXISTS oms_positions (
  id BIGSERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  exchange TEXT,
  net_qty INTEGER NOT NULL DEFAULT 0,
  avg_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  realized_pnl NUMERIC(18,4) NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC(18,4) NOT NULL DEFAULT 0,
  ltp NUMERIC(18,4),
  ltp_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clerk_id, symbol, exchange)
);
CREATE INDEX IF NOT EXISTS idx_oms_pos_user ON oms_positions (clerk_id) WHERE net_qty <> 0;

CREATE TABLE IF NOT EXISTS oms_signals (
  id TEXT PRIMARY KEY,
  clerk_id TEXT,
  strategy_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry NUMERIC(18,4) NOT NULL,
  stop NUMERIC(18,4),
  target NUMERIC(18,4),
  confidence NUMERIC(5,4),
  payload JSONB DEFAULT '{}'::jsonb,
  acted BOOLEAN NOT NULL DEFAULT FALSE,
  order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oms_signals_user ON oms_signals (clerk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oms_signals_strategy ON oms_signals (strategy_id, created_at DESC);

CREATE TABLE IF NOT EXISTS oms_kill_switch (
  id INTEGER PRIMARY KEY,
  clerk_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  enabled_by TEXT,
  enabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO oms_kill_switch (id, enabled, reason)
  VALUES (0, FALSE, 'global')
  ON CONFLICT (id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_oms_kill_user ON oms_kill_switch (clerk_id);

CREATE TABLE IF NOT EXISTS oms_risk_profile (
  clerk_id TEXT PRIMARY KEY,
  capital NUMERIC(18,2) NOT NULL DEFAULT 100000,
  max_daily_loss_pct NUMERIC(5,4) NOT NULL DEFAULT 0.03,
  max_position_pct NUMERIC(5,4) NOT NULL DEFAULT 0.20,
  max_open_positions INTEGER NOT NULL DEFAULT 5,
  risk_per_trade_pct NUMERIC(5,4) NOT NULL DEFAULT 0.01,
  max_orders_per_minute INTEGER NOT NULL DEFAULT 10,
  auto_execute BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oms_audit_log (
  id BIGSERIAL PRIMARY KEY,
  clerk_id TEXT,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  ref_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash TEXT NOT NULL DEFAULT '',
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oms_audit_user ON oms_audit_log (clerk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oms_audit_cat ON oms_audit_log (category, created_at DESC);

CREATE TABLE IF NOT EXISTS oms_order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES oms_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oms_evt_order ON oms_order_events (order_id, created_at);
`;
