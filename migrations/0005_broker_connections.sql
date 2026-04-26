-- Per-user broker connections.
-- Stores AES-256-GCM encrypted access tokens. Never select the raw column to logs.
CREATE TABLE IF NOT EXISTS broker_connections (
  id SERIAL PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  provider TEXT NOT NULL,                  -- zerodha | upstox | angelone | dhan | profitforce
  account_id TEXT,                         -- broker's user/client id (e.g. Kite user_id, Dhan clientId)
  account_name TEXT,
  enc_payload TEXT NOT NULL,               -- base64(iv|tag|ciphertext)
  scope TEXT,
  status TEXT NOT NULL DEFAULT 'active',   -- active | revoked | expired
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clerk_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_broker_conn_user ON broker_connections (clerk_id);
CREATE INDEX IF NOT EXISTS idx_broker_conn_provider ON broker_connections (provider);

-- Short-lived OAuth state values (CSRF protection during the redirect dance).
CREATE TABLE IF NOT EXISTS broker_oauth_states (
  state TEXT PRIMARY KEY,
  clerk_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  return_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_broker_states_expires ON broker_oauth_states (expires_at);

-- Selected default broker per user (which one new orders route to).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_broker TEXT;
