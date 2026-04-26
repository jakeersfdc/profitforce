/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Zerodha Kite Connect adapter.
 * Docs: https://kite.trade/docs/connect/v3/
 *
 * OAuth-like flow:
 *   1) Redirect user to https://kite.zerodha.com/connect/login?api_key=...&v=3
 *   2) On success Kite redirects to your registered URL with ?request_token=...&action=login
 *   3) Server POSTs to /session/token with checksum=SHA256(api_key + request_token + api_secret)
 *      → access_token (valid till 6:00 AM next day, must be refreshed daily by user re-login).
 *
 * App config (Kite developer console → https://kite.trade/connect/):
 *   - Redirect URL: https://<APP_ORIGIN>/api/broker/connect/zerodha/callback
 *   - Postback URL: optional
 *
 * Required env:
 *   ZERODHA_API_KEY
 *   ZERODHA_API_SECRET
 */
import { createHash } from "crypto";
import type {
  IBroker, AuthMode, ConnectStartArgs, ConnectCallbackArgs, ConnectCallbackResult,
  PlaceOrderInput, PlaceOrderResult, BrokerCredentials, UnifiedPosition, UnifiedHolding, UnifiedFunds,
} from "./types";

const KITE_BASE = "https://api.kite.trade";

interface ZerodhaCreds extends BrokerCredentials {
  apiKey: string;
  accessToken: string;
  publicToken?: string;
  userId?: string;
}

function authHeader(c: ZerodhaCreds): string {
  return `token ${c.apiKey}:${c.accessToken}`;
}

function exchangeFor(symbol: string, override?: string): { tradingsymbol: string; exchange: string } {
  if (override) return { tradingsymbol: symbol, exchange: override };
  const s = symbol.toUpperCase();
  if (s.endsWith(".NS")) return { tradingsymbol: s.slice(0, -3), exchange: "NSE" };
  if (s.endsWith(".BO") || s.endsWith(".BS")) return { tradingsymbol: s.slice(0, -3), exchange: "BSE" };
  if (s.endsWith("=F")) return { tradingsymbol: s.slice(0, -2), exchange: "MCX" };
  return { tradingsymbol: s, exchange: "NSE" };
}

const auth: AuthMode = {
  kind: "oauth",
  loginUrl: (_args: ConnectStartArgs) => {
    const apiKey = process.env.ZERODHA_API_KEY;
    if (!apiKey) throw new Error("ZERODHA_API_KEY not configured");
    // Kite carries state via the redirect URL we registered; query params are NOT forwarded.
    // We persist the CSRF state server-side keyed on a one-time row, then look it up by clerk_id.
    return `https://kite.zerodha.com/connect/login?api_key=${encodeURIComponent(apiKey)}&v=3`;
  },
};

export const zerodha: IBroker = {
  provider: "zerodha",
  displayName: "Zerodha (Kite Connect)",
  authMode: auth,

  async finishConnect(args: ConnectCallbackArgs): Promise<ConnectCallbackResult> {
    const { request_token, status } = args.query;
    if (status && status !== "success") throw new Error(`Kite login failed: ${status}`);
    if (!request_token) throw new Error("missing request_token");
    const apiKey = process.env.ZERODHA_API_KEY;
    const apiSecret = process.env.ZERODHA_API_SECRET;
    if (!apiKey || !apiSecret) throw new Error("ZERODHA_API_KEY / ZERODHA_API_SECRET not configured");

    const checksum = createHash("sha256")
      .update(apiKey + request_token + apiSecret)
      .digest("hex");
    const body = new URLSearchParams({ api_key: apiKey, request_token, checksum });
    const res = await fetch(`${KITE_BASE}/session/token`, {
      method: "POST",
      headers: { "X-Kite-Version": "3", "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j?.status === "error") {
      throw new Error(`Kite token exchange failed: ${j?.message || res.status}`);
    }
    const data = j.data || {};
    // Kite tokens expire daily at 06:00 IST. Approximate: tomorrow 06:00 IST.
    const expiresAt = (() => {
      const d = new Date();
      d.setUTCHours(0, 30, 0, 0); // 06:00 IST = 00:30 UTC
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    })();
    return {
      accountId: data.user_id,
      accountName: data.user_name || data.user_shortname || data.user_id,
      credentials: {
        apiKey,
        accessToken: data.access_token,
        publicToken: data.public_token,
        userId: data.user_id,
      } as ZerodhaCreds,
      expiresAt,
      scope: "orders profile holdings positions",
      metadata: { broker: data.broker, login_time: data.login_time },
    };
  },

  async placeOrder(creds: BrokerCredentials, input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const c = creds as ZerodhaCreds;
    const { tradingsymbol, exchange } = exchangeFor(input.symbol, input.exchange);
    const body = new URLSearchParams({
      tradingsymbol,
      exchange,
      transaction_type: input.side,
      order_type: input.type === "LIMIT" ? "LIMIT" : input.type === "SL" ? "SL" : input.type === "SL-M" ? "SL-M" : "MARKET",
      quantity: String(input.qty),
      product: input.product === "DELIVERY" ? "CNC" : input.product === "CO" ? "CO" : input.product === "BO" ? "BO" : "MIS",
      validity: input.validity || "DAY",
    });
    if ((input.type === "LIMIT" || input.type === "SL") && input.price) body.set("price", String(input.price));
    if ((input.type === "SL" || input.type === "SL-M") && input.triggerPrice) body.set("trigger_price", String(input.triggerPrice));
    if (input.clientOrderId) body.set("tag", input.clientOrderId.slice(0, 20));

    const res = await fetch(`${KITE_BASE}/orders/regular`, {
      method: "POST",
      headers: {
        "X-Kite-Version": "3",
        Authorization: authHeader(c),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j?.status === "error") {
      return { ok: false, provider: "zerodha", status: "rejected", error: j?.message || `HTTP ${res.status}`, raw: j };
    }
    return { ok: true, provider: "zerodha", status: "submitted", brokerOrderId: j?.data?.order_id, raw: j };
  },

  async getPositions(creds: BrokerCredentials): Promise<UnifiedPosition[]> {
    const c = creds as ZerodhaCreds;
    const res = await fetch(`${KITE_BASE}/portfolio/positions`, {
      headers: { "X-Kite-Version": "3", Authorization: authHeader(c) },
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    const net = j?.data?.net || [];
    return net.map((p: any) => ({
      symbol: p.tradingsymbol,
      exchange: p.exchange,
      product: p.product,
      qty: Number(p.quantity || 0),
      avgPrice: Number(p.average_price || 0),
      ltp: Number(p.last_price || 0),
      pnl: Number(p.pnl || 0),
    }));
  },

  async getHoldings(creds: BrokerCredentials): Promise<UnifiedHolding[]> {
    const c = creds as ZerodhaCreds;
    const res = await fetch(`${KITE_BASE}/portfolio/holdings`, {
      headers: { "X-Kite-Version": "3", Authorization: authHeader(c) },
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    const items = j?.data || [];
    return items.map((p: any) => ({
      symbol: p.tradingsymbol,
      exchange: p.exchange,
      isin: p.isin,
      qty: Number(p.quantity || 0),
      avgPrice: Number(p.average_price || 0),
      ltp: Number(p.last_price || 0),
      pnl: Number(p.pnl || 0),
    }));
  },

  async getFunds(creds: BrokerCredentials): Promise<UnifiedFunds> {
    const c = creds as ZerodhaCreds;
    const res = await fetch(`${KITE_BASE}/user/margins`, {
      headers: { "X-Kite-Version": "3", Authorization: authHeader(c) },
    });
    if (!res.ok) return { available: 0, currency: "INR" };
    const j: any = await res.json();
    const eq = j?.data?.equity || {};
    return {
      available: Number(eq?.available?.live_balance ?? eq?.net ?? 0),
      used: Number(eq?.utilised?.debits ?? 0),
      total: Number(eq?.net ?? 0),
      currency: "INR",
    };
  },
};
