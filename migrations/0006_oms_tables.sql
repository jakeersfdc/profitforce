-- ============================================================================
-- 0006_oms_tables.sql — Order Management System tables
--
-- Design principles:
--  • Append-only orders/fills (status changes are new rows in oms_order_events)
--  • Tamper-evident audit_log via prev_hash → hash chain
--  • Positions are derived (rebuilt from fills) but cached here for speed
--  • Kill switch is a singleton row (id=1) for global + per-user overrides
-- ============================================================================

-- 1. Orders --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oms_orders (
  id                  TEXT PRIMARY KEY,                  -- our client_order_id
  clerk_id            TEXT NOT NULL,
  provider            TEXT NOT NULL,                     -- zerodha | upstox | ... | profitforce
  broker_order_id     TEXT,                              -- broker's id (assigned after placement)
  symbol              TEXT NOT NULL,
  exchange            TEXT,
  side                TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  qty                 INTEGER NOT NULL CHECK (qty > 0),
  filled_qty          INTEGER NOT NULL DEFAULT 0,
  type                TEXT NOT NULL CHECK (type IN ('MARKET','LIMIT','SL','SL-M')),
  product             TEXT NOT NULL DEFAULT 'INTRADAY',
  validity            TEXT NOT NULL DEFAULT 'DAY',
  price               NUMERIC(18,4),
  trigger_price       NUMERIC(18,4),
  avg_fill_price      NUMERIC(18,4),
  status              TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','SUBMITTED','OPEN','PARTIAL','FILLED','CANCELLED','REJECTED','ERROR')),
  reject_reason       TEXT,
  strategy_id         TEXT,                              -- which strategy generated it
  signal_id           TEXT,                              -- linked signal row
  paper               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_oms_orders_user ON oms_orders (clerk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oms_orders_status ON oms_orders (status) WHERE status IN ('PENDING','SUBMITTED','OPEN','PARTIAL');
CREATE INDEX IF NOT EXISTS idx_oms_orders_symbol ON oms_orders (clerk_id, symbol);

-- 2. Fills (executions) --------------------------------------------------------
CREATE TABLE IF NOT EXISTS oms_fills (
  id                  BIGSERIAL PRIMARY KEY,
  order_id            TEXT NOT NULL REFERENCES oms_orders(id) ON DELETE CASCADE,
  clerk_id            TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  side                TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  qty                 INTEGER NOT NULL CHECK (qty > 0),
  price               NUMERIC(18,4) NOT NULL,
  fees                NUMERIC(18,4) NOT NULL DEFAULT 0,   -- total cost incl STT/brokerage/GST etc.
  fee_breakdown       JSONB DEFAULT '{}'::jsonb,
  filled_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oms_fills_order ON oms_fills (order_id);
CREATE INDEX IF NOT EXISTS idx_oms_fills_user ON oms_fills (clerk_id, filled_at DESC);

-- 3. Positions (derived snapshot, refreshed on each fill) ----------------------
CREATE TABLE IF NOT EXISTS oms_positions (
  id                  BIGSERIAL PRIMARY KEY,
  clerk_id            TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  exchange            TEXT,
  net_qty             INTEGER NOT NULL DEFAULT 0,        -- positive=long, negative=short
  avg_price           NUMERIC(18,4) NOT NULL DEFAULT 0,
  realized_pnl        NUMERIC(18,4) NOT NULL DEFAULT 0,  -- closed P&L for the day
  unrealized_pnl      NUMERIC(18,4) NOT NULL DEFAULT 0,  -- last MTM
  ltp                 NUMERIC(18,4),
  ltp_at              TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clerk_id, symbol, exchange)
);
CREATE INDEX IF NOT EXISTS idx_oms_pos_user ON oms_positions (clerk_id) WHERE net_qty <> 0;

-- 4. Signals (every signal we generate, regardless of execution) ---------------
CREATE TABLE IF NOT EXISTS oms_signals (
  id                  TEXT PRIMARY KEY,
  clerk_id            TEXT,                              -- null for global broadcast signals
  strategy_id         TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  side                TEXT NOT NULL,
  entry               NUMERIC(18,4) NOT NULL,
  stop                NUMERIC(18,4),
  target              NUMERIC(18,4),
  confidence          NUMERIC(5,4),                      -- 0..1
  payload             JSONB DEFAULT '{}'::jsonb,
  acted               BOOLEAN NOT NULL DEFAULT FALSE,    -- did we send to OMS?
  order_id            TEXT,                              -- linked OMS order if acted
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oms_signals_user ON oms_signals (clerk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oms_signals_strategy ON oms_signals (strategy_id, created_at DESC);

-- 5. Kill switch (singleton + per-user override) -------------------------------
CREATE TABLE IF NOT EXISTS oms_kill_switch (
  id                  INTEGER PRIMARY KEY,               -- 0 = global, otherwise hash(clerk_id)
  clerk_id            TEXT,                              -- null when global
  enabled             BOOLEAN NOT NULL DEFAULT FALSE,    -- true = trading HALTED
  reason              TEXT,
  enabled_by          TEXT,
  enabled_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO oms_kill_switch (id, enabled, reason)
  VALUES (0, FALSE, 'global')
  ON CONFLICT (id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_oms_kill_user ON oms_kill_switch (clerk_id);

-- 6. Risk profile (per-user limits) --------------------------------------------
CREATE TABLE IF NOT EXISTS oms_risk_profile (
  clerk_id                 TEXT PRIMARY KEY,
  capital                  NUMERIC(18,2) NOT NULL DEFAULT 100000,
  max_daily_loss_pct       NUMERIC(5,4) NOT NULL DEFAULT 0.03,   -- 3% of capital
  max_position_pct         NUMERIC(5,4) NOT NULL DEFAULT 0.20,   -- 20% of capital per symbol
  max_open_positions       INTEGER NOT NULL DEFAULT 5,
  risk_per_trade_pct       NUMERIC(5,4) NOT NULL DEFAULT 0.01,   -- 1% per trade
  max_orders_per_minute    INTEGER NOT NULL DEFAULT 10,
  auto_execute             BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Audit log (tamper-evident hash chain) -------------------------------------
CREATE TABLE IF NOT EXISTS oms_audit_log (
  id                  BIGSERIAL PRIMARY KEY,
  clerk_id            TEXT,
  category            TEXT NOT NULL,                     -- ORDER | FILL | RISK | KILL | SIGNAL | AUTH
  action              TEXT NOT NULL,
  ref_id              TEXT,                              -- order_id / signal_id / etc.
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash           TEXT NOT NULL DEFAULT '',
  hash                TEXT NOT NULL,                     -- SHA-256(prev_hash | row)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oms_audit_user ON oms_audit_log (clerk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oms_audit_cat ON oms_audit_log (category, created_at DESC);

-- 8. Order events (state-transition log for forensics) -------------------------
CREATE TABLE IF NOT EXISTS oms_order_events (
  id                  BIGSERIAL PRIMARY KEY,
  order_id            TEXT NOT NULL REFERENCES oms_orders(id) ON DELETE CASCADE,
  status              TEXT NOT NULL,
  detail              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oms_evt_order ON oms_order_events (order_id, created_at);
