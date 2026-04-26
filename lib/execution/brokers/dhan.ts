/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Dhan adapter.
 * Docs: https://dhanhq.co/docs/v2/
 *
 * Dhan does NOT have OAuth. The user generates an Access Token from
 * https://web.dhan.co  →  My Profile  →  DhanHQ Trading APIs  →  Generate token
 * and pastes (clientId + accessToken) into our manual form. Token is valid ~30 days.
 */
import type {
  IBroker, AuthMode, ConnectCallbackArgs, ConnectCallbackResult,
  PlaceOrderInput, PlaceOrderResult, BrokerCredentials, UnifiedPosition, UnifiedHolding, UnifiedFunds,
} from "./types";

const DHAN_BASE = "https://api.dhan.co";

interface DhanCreds extends BrokerCredentials {
  clientId: string;
  accessToken: string;
}

const auth: AuthMode = {
  kind: "manual",
  fields: [
    { name: "clientId",    label: "Dhan Client ID",  secret: false },
    { name: "accessToken", label: "Access Token",    secret: true },
  ],
};

function exchangeSegment(symbol: string, override?: string): string {
  if (override) return override;
  const s = symbol.toUpperCase();
  if (s.endsWith("=F")) return "MCX_COMM";
  if (s.endsWith(".BO") || s.endsWith(".BS")) return "BSE_EQ";
  return "NSE_EQ";
}

export const dhan: IBroker = {
  provider: "dhan",
  displayName: "Dhan",
  authMode: auth,

  async finishConnect(args: ConnectCallbackArgs): Promise<ConnectCallbackResult> {
    const clientId = args.query.clientId?.trim();
    const accessToken = args.query.accessToken?.trim();
    if (!clientId || !accessToken) throw new Error("clientId and accessToken are required");
    // Validate by fetching fund limit.
    const probe = await fetch(`${DHAN_BASE}/v2/fundlimit`, {
      headers: { "access-token": accessToken, Accept: "application/json" },
    });
    if (!probe.ok) {
      throw new Error(`Dhan token validation failed: HTTP ${probe.status}`);
    }
    return {
      accountId: clientId,
      accountName: `Dhan ${clientId}`,
      credentials: { clientId, accessToken } as DhanCreds,
      // Dhan tokens expire ~30 days; we don't get an exact expiry back.
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    };
  },

  async placeOrder(creds: BrokerCredentials, input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const c = creds as DhanCreds;
    if (!input.meta?.securityId) {
      return { ok: false, provider: "dhan", status: "rejected", error: "Dhan requires meta.securityId" };
    }
    const body = {
      dhanClientId: c.clientId,
      correlationId: input.clientOrderId?.slice(0, 25),
      transactionType: input.side,
      exchangeSegment: exchangeSegment(input.symbol, input.exchange),
      productType: input.product === "DELIVERY" ? "CNC" : "INTRADAY",
      orderType: input.type === "LIMIT" ? "LIMIT" : input.type === "SL" ? "STOP_LOSS" : input.type === "SL-M" ? "STOP_LOSS_MARKET" : "MARKET",
      validity: input.validity || "DAY",
      securityId: String(input.meta.securityId),
      quantity: input.qty,
      disclosedQuantity: 0,
      price: input.type === "LIMIT" && input.price ? Number(input.price) : 0,
      triggerPrice: input.triggerPrice || 0,
      afterMarketOrder: false,
    };
    const res = await fetch(`${DHAN_BASE}/v2/orders`, {
      method: "POST",
      headers: { "access-token": c.accessToken, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j?.errorCode) {
      return { ok: false, provider: "dhan", status: "rejected", error: j?.errorMessage || j?.message || `HTTP ${res.status}`, raw: j };
    }
    return { ok: true, provider: "dhan", status: "submitted", brokerOrderId: j?.orderId, raw: j };
  },

  async getPositions(creds: BrokerCredentials): Promise<UnifiedPosition[]> {
    const c = creds as DhanCreds;
    const res = await fetch(`${DHAN_BASE}/v2/positions`, {
      headers: { "access-token": c.accessToken, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j?.data || j || []).map((p: any) => ({
      symbol: p.tradingSymbol || p.securityId,
      exchange: p.exchangeSegment,
      product: p.productType,
      qty: Number(p.netQty || 0),
      avgPrice: Number(p.avgCostPrice || 0),
      ltp: Number(p.ltp || 0),
      pnl: Number(p.unrealizedProfit || 0) + Number(p.realizedProfit || 0),
    }));
  },

  async getHoldings(creds: BrokerCredentials): Promise<UnifiedHolding[]> {
    const c = creds as DhanCreds;
    const res = await fetch(`${DHAN_BASE}/v2/holdings`, {
      headers: { "access-token": c.accessToken, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j?.data || j || []).map((p: any) => ({
      symbol: p.tradingSymbol || p.securityId,
      exchange: p.exchange,
      isin: p.isin,
      qty: Number(p.totalQty || p.availableQty || 0),
      avgPrice: Number(p.avgCostPrice || 0),
      ltp: Number(p.lastTradedPrice || 0),
      pnl: 0,
    }));
  },

  async getFunds(creds: BrokerCredentials): Promise<UnifiedFunds> {
    const c = creds as DhanCreds;
    const res = await fetch(`${DHAN_BASE}/v2/fundlimit`, {
      headers: { "access-token": c.accessToken, Accept: "application/json" },
    });
    if (!res.ok) return { available: 0, currency: "INR" };
    const j: any = await res.json();
    return {
      available: Number(j?.availabelBalance ?? j?.availableBalance ?? 0),
      used: Number(j?.utilizedAmount ?? 0),
      total: Number(j?.sodLimit ?? 0),
      currency: "INR",
    };
  },
};
