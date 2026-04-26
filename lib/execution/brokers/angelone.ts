/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Angel One SmartAPI adapter (Publisher login flow).
 * Docs: https://smartapi.angelbroking.com/docs
 *
 * Publisher login flow (recommended for web apps):
 *   1) Redirect user to https://smartapi.angelbroking.com/publisher-login?api_key=...&state=...
 *   2) Angel redirects back with ?auth_token=...&feed_token=...&refresh_token=...&state=...
 *   3) We store auth_token (= jwtToken) directly. (No code exchange.)
 *
 * Required env:
 *   ANGELONE_API_KEY
 *   ANGELONE_API_SECRET   // not used in publisher flow but kept for completeness
 */
import type {
  IBroker, AuthMode, ConnectStartArgs, ConnectCallbackArgs, ConnectCallbackResult,
  PlaceOrderInput, PlaceOrderResult, BrokerCredentials, UnifiedPosition, UnifiedHolding, UnifiedFunds,
} from "./types";

const ANGEL_BASE = "https://apiconnect.angelbroking.com";

interface AngelCreds extends BrokerCredentials {
  apiKey: string;
  jwtToken: string;
  refreshToken?: string;
  feedToken?: string;
  clientCode?: string;
}

function headers(c: AngelCreds) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00",
    "X-PrivateKey": c.apiKey,
    Authorization: `Bearer ${c.jwtToken}`,
  };
}

function exchangeFor(symbol: string, override?: string) {
  if (override) return { tradingsymbol: symbol, exchange: override };
  const s = symbol.toUpperCase();
  if (s.endsWith(".NS")) return { tradingsymbol: s.slice(0, -3), exchange: "NSE" };
  if (s.endsWith(".BO") || s.endsWith(".BS")) return { tradingsymbol: s.slice(0, -3), exchange: "BSE" };
  if (s.endsWith("=F")) return { tradingsymbol: s.slice(0, -2), exchange: "MCX" };
  return { tradingsymbol: s, exchange: "NSE" };
}

const auth: AuthMode = {
  kind: "oauth",
  loginUrl: (a: ConnectStartArgs) => {
    const apiKey = process.env.ANGELONE_API_KEY;
    if (!apiKey) throw new Error("ANGELONE_API_KEY not configured");
    return `https://smartapi.angelbroking.com/publisher-login?api_key=${encodeURIComponent(apiKey)}&state=${encodeURIComponent(a.state)}`;
  },
};

export const angelone: IBroker = {
  provider: "angelone",
  displayName: "Angel One (SmartAPI)",
  authMode: auth,

  async finishConnect(args: ConnectCallbackArgs): Promise<ConnectCallbackResult> {
    const { auth_token, feed_token, refresh_token } = args.query;
    if (!auth_token) throw new Error("missing auth_token");
    const apiKey = process.env.ANGELONE_API_KEY;
    if (!apiKey) throw new Error("ANGELONE_API_KEY not configured");

    // Try to fetch profile to capture client code / name.
    let accountId: string | undefined;
    let accountName: string | undefined;
    try {
      const res = await fetch(`${ANGEL_BASE}/rest/secure/angelbroking/user/v1/getProfile`, {
        headers: headers({ apiKey, jwtToken: auth_token } as AngelCreds),
      });
      const j: any = await res.json().catch(() => ({}));
      accountId = j?.data?.clientcode;
      accountName = j?.data?.name;
    } catch {}

    return {
      accountId,
      accountName,
      credentials: {
        apiKey,
        jwtToken: auth_token,
        feedToken: feed_token,
        refreshToken: refresh_token,
        clientCode: accountId,
      } as AngelCreds,
      // Angel JWTs typically expire in ~12-24h; require daily relogin.
      expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
      scope: "orders portfolio funds",
    };
  },

  async placeOrder(creds: BrokerCredentials, input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const c = creds as AngelCreds;
    const { tradingsymbol, exchange } = exchangeFor(input.symbol, input.exchange);
    if (!input.meta?.symbolToken) {
      return { ok: false, provider: "angelone", status: "rejected",
        error: "Angel One requires meta.symbolToken (numeric instrument token)" };
    }
    const body = {
      variety: input.type === "SL" || input.type === "SL-M" ? "STOPLOSS" : "NORMAL",
      tradingsymbol,
      symboltoken: input.meta.symbolToken,
      transactiontype: input.side,
      exchange,
      ordertype: input.type === "LIMIT" ? "LIMIT" : input.type === "SL" ? "STOPLOSS_LIMIT" : input.type === "SL-M" ? "STOPLOSS_MARKET" : "MARKET",
      producttype: input.product === "DELIVERY" ? "DELIVERY" : "INTRADAY",
      duration: input.validity || "DAY",
      price: input.type === "LIMIT" && input.price ? String(input.price) : "0",
      triggerprice: input.triggerPrice ? String(input.triggerPrice) : "0",
      squareoff: "0",
      stoploss: "0",
      quantity: String(input.qty),
      ordertag: input.clientOrderId?.slice(0, 20),
    };
    const res = await fetch(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/placeOrder`, {
      method: "POST",
      headers: headers(c),
      body: JSON.stringify(body),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j?.status === false) {
      return { ok: false, provider: "angelone", status: "rejected", error: j?.message || `HTTP ${res.status}`, raw: j };
    }
    return { ok: true, provider: "angelone", status: "submitted", brokerOrderId: j?.data?.orderid, raw: j };
  },

  async getPositions(creds: BrokerCredentials): Promise<UnifiedPosition[]> {
    const c = creds as AngelCreds;
    const res = await fetch(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/getPosition`, { headers: headers(c) });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j?.data || []).map((p: any) => ({
      symbol: p.tradingsymbol,
      exchange: p.exchange,
      product: p.producttype,
      qty: Number(p.netqty || 0),
      avgPrice: Number(p.avgnetprice || 0),
      ltp: Number(p.ltp || 0),
      pnl: Number(p.pnl || 0),
    }));
  },

  async getHoldings(creds: BrokerCredentials): Promise<UnifiedHolding[]> {
    const c = creds as AngelCreds;
    const res = await fetch(`${ANGEL_BASE}/rest/secure/angelbroking/portfolio/v1/getHolding`, { headers: headers(c) });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j?.data || []).map((p: any) => ({
      symbol: p.tradingsymbol,
      exchange: p.exchange,
      isin: p.isin,
      qty: Number(p.quantity || 0),
      avgPrice: Number(p.averageprice || 0),
      ltp: Number(p.ltp || 0),
      pnl: Number(p.profitandloss || 0),
    }));
  },

  async getFunds(creds: BrokerCredentials): Promise<UnifiedFunds> {
    const c = creds as AngelCreds;
    const res = await fetch(`${ANGEL_BASE}/rest/secure/angelbroking/user/v1/getRMS`, { headers: headers(c) });
    if (!res.ok) return { available: 0, currency: "INR" };
    const j: any = await res.json();
    const d = j?.data || {};
    return {
      available: Number(d?.availablecash ?? 0),
      used: Number(d?.utiliseddebits ?? 0),
      total: Number(d?.net ?? 0),
      currency: "INR",
    };
  },
};
