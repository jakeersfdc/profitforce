/**
 * Unified broker types.
 *
 * Every adapter under lib/execution/brokers/*.ts implements `IBroker`.
 * Adapters never persist tokens themselves — that's the responsibility of
 * `lib/execution/brokers/store.ts` (the encrypted vault).
 *
 * SEBI compliance: orders here may execute on a regulated exchange via the
 * user's own broker account. We never custody funds and never make
 * performance guarantees. The /api/broker/unified/order endpoint enforces
 * that callers acknowledge the SEBI risk disclosure on every request.
 */

export type BrokerProvider =
  | "zerodha"
  | "upstox"
  | "angelone"
  | "dhan"
  | "profitforce"; // in-house paper broker

export type Side = "BUY" | "SELL";
export type OrderKind = "MARKET" | "LIMIT" | "SL" | "SL-M";
export type Product = "INTRADAY" | "DELIVERY" | "MARGIN" | "MTF" | "CO" | "BO";
export type Validity = "DAY" | "IOC";

export interface UnifiedQuote {
  symbol: string;
  ltp: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  ts: number;
}

export interface UnifiedPosition {
  symbol: string;
  exchange?: string;
  product?: string;
  qty: number;
  avgPrice: number;
  ltp?: number;
  pnl?: number;
}

export interface UnifiedHolding {
  symbol: string;
  exchange?: string;
  isin?: string;
  qty: number;
  avgPrice: number;
  ltp?: number;
  pnl?: number;
}

export interface UnifiedFunds {
  available: number;
  used?: number;
  total?: number;
  currency: "INR" | "USD";
}

export interface PlaceOrderInput {
  symbol: string;
  exchange?: string;          // NSE | BSE | MCX | NFO
  side: Side;
  qty: number;
  type: OrderKind;
  price?: number | null;
  triggerPrice?: number | null;
  product?: Product;
  validity?: Validity;
  clientOrderId?: string;
  // Per-broker hints for instruments that need numeric/composite ids
  meta?: {
    instrumentKey?: string;   // Upstox e.g. "NSE_EQ|INE848E01016"
    securityId?: string;      // Dhan numeric id
    symbolToken?: string;     // Angel numeric token
  };
}

export interface PlaceOrderResult {
  ok: boolean;
  provider: BrokerProvider;
  brokerOrderId?: string;
  status: "submitted" | "filled" | "rejected" | "pending" | "error";
  raw?: unknown;
  error?: string;
}

export interface BrokerCredentials {
  // Only the adapter knows the shape. Stored encrypted; never logged.
  [key: string]: unknown;
}

export interface ConnectStartArgs {
  clerkId: string;
  state: string;       // CSRF nonce
  redirectUri: string;
}

export interface ConnectCallbackArgs {
  clerkId: string;
  query: Record<string, string>;
  redirectUri: string;
}

export interface ConnectCallbackResult {
  accountId?: string;
  accountName?: string;
  credentials: BrokerCredentials;
  expiresAt?: Date | null;
  scope?: string;
  metadata?: Record<string, unknown>;
}

/** Auth strategy for the connect flow. */
export type AuthMode =
  | { kind: "oauth"; loginUrl: (args: ConnectStartArgs) => string }
  | { kind: "manual"; fields: { name: string; label: string; secret: boolean }[] };

export interface IBroker {
  readonly provider: BrokerProvider;
  readonly displayName: string;
  readonly authMode: AuthMode;

  /** Exchange a callback (or manual form) for stored credentials. */
  finishConnect(args: ConnectCallbackArgs): Promise<ConnectCallbackResult>;

  placeOrder(creds: BrokerCredentials, input: PlaceOrderInput): Promise<PlaceOrderResult>;
  getPositions?(creds: BrokerCredentials): Promise<UnifiedPosition[]>;
  getHoldings?(creds: BrokerCredentials): Promise<UnifiedHolding[]>;
  getFunds?(creds: BrokerCredentials): Promise<UnifiedFunds>;
  getQuote?(creds: BrokerCredentials, symbol: string): Promise<UnifiedQuote | null>;
}
