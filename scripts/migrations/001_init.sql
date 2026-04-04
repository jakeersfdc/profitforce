CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  symbol TEXT,
  qty NUMERIC,
  side TEXT,
  type TEXT,
  price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE,
  status TEXT,
  source TEXT,
  broker_response JSONB
);

CREATE TABLE IF NOT EXISTS ledger (
  id SERIAL PRIMARY KEY,
  order_id TEXT,
  user_id TEXT,
  symbol TEXT,
  qty NUMERIC,
  fill_price NUMERIC,
  pnl NUMERIC,
  recorded_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  active BOOLEAN DEFAULT true,
  started_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  payload JSONB
);
