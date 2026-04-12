-- Orders and trade journal table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    clerk_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    qty INTEGER NOT NULL,
    order_type TEXT DEFAULT 'market',
    price NUMERIC(14, 4),
    broker TEXT DEFAULT 'paper',
    broker_order_id TEXT,
    status TEXT DEFAULT 'pending',
    fill_price NUMERIC(14, 4),
    fill_qty INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_orders_clerk ON orders(clerk_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Trade ledger for PnL tracking
CREATE TABLE IF NOT EXISTS ledger (
    id SERIAL PRIMARY KEY,
    clerk_id TEXT NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price NUMERIC(14, 4) NOT NULL,
    pnl NUMERIC(14, 4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_clerk ON ledger(clerk_id);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger(created_at);

-- Watchlists table
CREATE TABLE IF NOT EXISTS watchlists (
    id SERIAL PRIMARY KEY,
    clerk_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(clerk_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_watchlists_clerk ON watchlists(clerk_id);

-- Subscriptions table for Stripe tracking
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    clerk_id TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT DEFAULT 'free',
    status TEXT DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_clerk ON subscriptions(clerk_id);
