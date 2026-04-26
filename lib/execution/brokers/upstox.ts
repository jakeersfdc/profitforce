/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Upstox v2 adapter.
 * Docs: https://upstox.com/developer/api-documentation/v2/
 *
 * OAuth 2.0 standard flow:
 *   1) GET https://api.upstox.com/v2/login/authorization/dialog?client_id=...&redirect_uri=...&response_type=code&state=...
 *   2) Callback ?code=...&state=...
 *   3) POST /v2/login/authorization/token (client_id, client_secret, code, redirect_uri, grant_type=authorization_code)
 *      → access_token expires daily at 03:30 AM IST.
 *
 * Required env:
 *   UPSTOX_CLIENT_ID
 *   UPSTOX_CLIENT_SECRET
 */
import type {
  IBroker, AuthMode, ConnectStartArgs, ConnectCallbackArgs, ConnectCallbackResult,
  PlaceOrderInput, PlaceOrderResult, BrokerCredentials, UnifiedPosition, UnifiedHolding, UnifiedFunds,
} from "./types";

const UPSTOX_BASE = "https://api.upstox.com";

interface UpstoxCreds extends BrokerCredentials {
  accessToken: string;
  userId?: string;
}

const auth: AuthMode = {
  kind: "oauth",
  loginUrl: (a: ConnectStartArgs) => {
    const clientId = process.env.UPSTOX_CLIENT_ID;
    if (!clientId) throw new Error("UPSTOX_CLIENT_ID not configured");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: a.redirectUri,
      response_type: "code",
      state: a.state,
    });
    return `${UPSTOX_BASE}/v2/login/authorization/dialog?${params.toString()}`;
  },
};

export const upstox: IBroker = {
  provider: "upstox",
  displayName: "Upstox",
  authMode: auth,

  async finishConnect(args: ConnectCallbackArgs): Promise<ConnectCallbackResult> {
    const { code } = args.query;
    if (!code) throw new Error("missing code");
    const clientId = process.env.UPSTOX_CLIENT_ID;
    const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("UPSTOX_CLIENT_ID / UPSTOX_CLIENT_SECRET not configured");

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: args.redirectUri,
      grant_type: "authorization_code",
    });
    const res = await fetch(`${UPSTOX_BASE}/v2/login/authorization/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || !j?.access_token) {
      throw new Error(`Upstox token exchange failed: ${j?.errors?.[0]?.message || j?.message || res.status}`);
    }
    // Daily expiry at 03:30 IST = 22:00 UTC previous day. Approximate: next 03:30 IST.
    const expiresAt = (() => {
      const d = new Date();
      d.setUTCHours(22, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
      return d;
    })();
    return {
      accountId: j.user_id,
      accountName: j.user_name || j.user_id,
      credentials: { accessToken: j.access_token, userId: j.user_id } as UpstoxCreds,
      expiresAt,
      scope: "orders portfolio funds",
      metadata: { broker: j.broker, email: j.email },
    };
  },

  async placeOrder(creds: BrokerCredentials, input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const c = creds as UpstoxCreds;
    if (!input.meta?.instrumentKey) {
      return { ok: false, provider: "upstox", status: "rejected",
        error: "Upstox requires meta.instrumentKey (e.g. NSE_EQ|INE848E01016)" };
    }
    const body = {
      quantity: input.qty,
      product: input.product === "DELIVERY" ? "D" : input.product === "MTF" ? "MTF" : "I",
      validity: input.validity || "DAY",
      price: input.type === "LIMIT" && input.price ? input.price : 0,
      tag: (input.clientOrderId || "profitforce").slice(0, 20),
      instrument_token: input.meta.instrumentKey,
      order_type: input.type === "LIMIT" ? "LIMIT" : input.type.startsWith("SL") ? "SL" : "MARKET",
      transaction_type: input.side,
      disclosed_quantity: 0,
      trigger_price: input.triggerPrice || 0,
      is_amo: false,
    };
    const res = await fetch(`${UPSTOX_BASE}/v2/order/place`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j?.status === "error") {
      return { ok: false, provider: "upstox", status: "rejected", error: j?.errors?.[0]?.message || j?.message || `HTTP ${res.status}`, raw: j };
    }
    return { ok: true, provider: "upstox", status: "submitted", brokerOrderId: j?.data?.order_id, raw: j };
  },

  async getPositions(creds: BrokerCredentials): Promise<UnifiedPosition[]> {
    const c = creds as UpstoxCreds;
    const res = await fetch(`${UPSTOX_BASE}/v2/portfolio/short-term-positions`, {
      headers: { Authorization: `Bearer ${c.accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j?.data || []).map((p: any) => ({
      symbol: p.tradingsymbol || p.trading_symbol,
      exchange: p.exchange,
      product: p.product,
      qty: Number(p.quantity || 0),
      avgPrice: Number(p.average_price || 0),
      ltp: Number(p.last_price || 0),
      pnl: Number(p.pnl || 0),
    }));
  },

  async getHoldings(creds: BrokerCredentials): Promise<UnifiedHolding[]> {
    const c = creds as UpstoxCreds;
    const res = await fetch(`${UPSTOX_BASE}/v2/portfolio/long-term-holdings`, {
      headers: { Authorization: `Bearer ${c.accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j?.data || []).map((p: any) => ({
      symbol: p.tradingsymbol || p.trading_symbol,
      exchange: p.exchange,
      isin: p.isin,
      qty: Number(p.quantity || 0),
      avgPrice: Number(p.average_price || 0),
      ltp: Number(p.last_price || 0),
      pnl: Number(p.pnl || 0),
    }));
  },

  async getFunds(creds: BrokerCredentials): Promise<UnifiedFunds> {
    const c = creds as UpstoxCreds;
    const res = await fetch(`${UPSTOX_BASE}/v2/user/get-funds-and-margin`, {
      headers: { Authorization: `Bearer ${c.accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) return { available: 0, currency: "INR" };
    const j: any = await res.json();
    const eq = j?.data?.equity || j?.data || {};
    return {
      available: Number(eq?.available_margin ?? 0),
      used: Number(eq?.used_margin ?? 0),
      total: Number(eq?.payin_amount ?? 0) + Number(eq?.available_margin ?? 0),
      currency: "INR",
    };
  },
};
