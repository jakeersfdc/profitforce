import { clerkClient } from '@clerk/nextjs/server';

// ProfitForce in-house virtual broker.
// Self-contained paper broker — no external API. State lives in Clerk privateMetadata
// under `pfAccount`. Gives every user an isolated ledger: funds, positions, order history.

export type PFPosition = {
  symbol: string;
  qty: number;           // positive = long, negative = short
  avgPrice: number;      // weighted average entry
  realizedPnl: number;   // running realized P&L on closes
  lastUpdated: string;
};

export type PFOrder = {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;         // fill price
  amount: number;        // qty * price
  type: 'market' | 'limit';
  status: 'filled' | 'rejected';
  reason?: string;
  createdAt: string;
};

export type PFAccount = {
  funds: number;         // cash balance in INR (default 1,000,000 virtual)
  positions: Record<string, PFPosition>;
  orders: PFOrder[];     // last N orders (ring-buffer to keep metadata small)
};

const DEFAULT_FUNDS = 1_000_000; // ₹10 lakh virtual starting capital
const MAX_ORDER_HISTORY = 200;

function defaultAccount(): PFAccount {
  return { funds: DEFAULT_FUNDS, positions: {}, orders: [] };
}

export async function getPFAccount(userId: string): Promise<PFAccount> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const meta = (user.privateMetadata || {}) as Record<string, unknown>;
    const acct = meta.pfAccount as PFAccount | undefined;
    if (!acct) return defaultAccount();
    // Backfill missing fields for older accounts
    return {
      funds: typeof acct.funds === 'number' ? acct.funds : DEFAULT_FUNDS,
      positions: acct.positions || {},
      orders: Array.isArray(acct.orders) ? acct.orders : [],
    };
  } catch (e) {
    console.error('getPFAccount error:', e);
    return defaultAccount();
  }
}

async function savePFAccount(userId: string, acct: PFAccount): Promise<void> {
  const client = await clerkClient();
  // Trim order history to keep metadata under Clerk's limit
  const trimmed: PFAccount = { ...acct, orders: acct.orders.slice(-MAX_ORDER_HISTORY) };
  await client.users.updateUserMetadata(userId, { privateMetadata: { pfAccount: trimmed } });
}

export async function resetPFAccount(userId: string): Promise<PFAccount> {
  const fresh = defaultAccount();
  await savePFAccount(userId, fresh);
  return fresh;
}

export type PlacePFOrderInput = {
  symbol: string;
  qty: number;
  side: 'BUY' | 'SELL';
  price: number;          // execution price (caller supplies live quote)
  type?: 'market' | 'limit';
  clientOrderId?: string;
};

export async function placePFOrder(userId: string, input: PlacePFOrderInput): Promise<{ ok: boolean; order: PFOrder; account: PFAccount }> {
  const acct = await getPFAccount(userId);
  const symbol = String(input.symbol).toUpperCase();
  const qty = Math.abs(Number(input.qty) || 0);
  const side = input.side === 'SELL' ? 'SELL' : 'BUY';
  const price = Number(input.price);
  const type = input.type === 'limit' ? 'limit' : 'market';
  const amount = qty * price;

  const orderBase: Omit<PFOrder, 'status'> & { status?: PFOrder['status'] } = {
    id: input.clientOrderId || `pf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    symbol,
    side,
    qty,
    price,
    amount,
    type,
    createdAt: new Date().toISOString(),
  };

  // --- Validate ---
  if (!symbol || qty <= 0 || !Number.isFinite(price) || price <= 0) {
    const rejected: PFOrder = { ...orderBase, status: 'rejected', reason: 'Invalid symbol/qty/price' };
    acct.orders.push(rejected);
    await savePFAccount(userId, acct);
    return { ok: false, order: rejected, account: acct };
  }

  const existing = acct.positions[symbol];
  const currentQty = existing?.qty ?? 0;

  // --- Fund / inventory checks ---
  if (side === 'BUY' && acct.funds < amount) {
    const rejected: PFOrder = { ...orderBase, status: 'rejected', reason: `Insufficient funds (need ₹${amount.toFixed(2)}, have ₹${acct.funds.toFixed(2)})` };
    acct.orders.push(rejected);
    await savePFAccount(userId, acct);
    return { ok: false, order: rejected, account: acct };
  }
  if (side === 'SELL' && currentQty < qty) {
    // No short-selling in the virtual broker (keeps it simple)
    const rejected: PFOrder = { ...orderBase, status: 'rejected', reason: `Not enough shares to sell (holding ${currentQty}, selling ${qty})` };
    acct.orders.push(rejected);
    await savePFAccount(userId, acct);
    return { ok: false, order: rejected, account: acct };
  }

  // --- Apply fill ---
  if (side === 'BUY') {
    const newQty = currentQty + qty;
    const newAvg = existing
      ? (existing.avgPrice * currentQty + price * qty) / newQty
      : price;
    acct.positions[symbol] = {
      symbol,
      qty: newQty,
      avgPrice: newAvg,
      realizedPnl: existing?.realizedPnl ?? 0,
      lastUpdated: new Date().toISOString(),
    };
    acct.funds -= amount;
  } else {
    // SELL (reduce long)
    const realized = (price - (existing?.avgPrice ?? price)) * qty;
    const newQty = currentQty - qty;
    if (newQty === 0) {
      delete acct.positions[symbol];
    } else {
      acct.positions[symbol] = {
        ...(existing as PFPosition),
        qty: newQty,
        realizedPnl: (existing?.realizedPnl ?? 0) + realized,
        lastUpdated: new Date().toISOString(),
      };
    }
    acct.funds += amount;
  }

  const filled: PFOrder = { ...orderBase, status: 'filled' };
  acct.orders.push(filled);
  await savePFAccount(userId, acct);
  return { ok: true, order: filled, account: acct };
}
