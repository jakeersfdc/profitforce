/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * In-house ProfitForce paper-trading adapter.
 * Wraps lib/profitforceAccount.ts so the same unified UI can switch between
 * "paper" (ProfitForce) and "live" (Zerodha/Upstox/Angel/Dhan) seamlessly.
 *
 * No OAuth. Connection is implicit (always available once the user is signed in).
 */
import type {
  IBroker, AuthMode, ConnectCallbackArgs, ConnectCallbackResult,
  PlaceOrderInput, PlaceOrderResult, BrokerCredentials, UnifiedPosition, UnifiedFunds,
} from "./types";

import {
  getPFAccount, placePFOrder, placePFPendingOrder, computeEquity,
} from "@/lib/profitforceAccount";

interface PFCreds extends BrokerCredentials {
  clerkId: string;
}

const auth: AuthMode = {
  kind: "manual",
  fields: [], // nothing required — auto-provisioned per signed-in user
};

export const profitforce: IBroker = {
  provider: "profitforce",
  displayName: "ProfitForce (Paper)",
  authMode: auth,

  async finishConnect(args: ConnectCallbackArgs): Promise<ConnectCallbackResult> {
    return {
      accountId: args.clerkId,
      accountName: "ProfitForce Paper",
      credentials: { clerkId: args.clerkId } as PFCreds,
      expiresAt: null,
    };
  },

  async placeOrder(creds: BrokerCredentials, input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const c = creds as PFCreds;
    try {
      if (input.type === "MARKET" || !input.price) {
        const r = await placePFOrder(c.clerkId, {
          symbol: input.symbol,
          side: input.side,
          qty: input.qty,
          price: input.price ?? undefined,
        } as any);
        return { ok: true, provider: "profitforce", status: "filled", brokerOrderId: (r as any)?.id, raw: r };
      }
      const r = await placePFPendingOrder(c.clerkId, {
        symbol: input.symbol,
        side: input.side,
        qty: input.qty,
        type: input.type === "LIMIT" ? "limit" : input.type === "SL" ? "stoplimit" : "stop",
        price: input.price ?? undefined,
        triggerPrice: input.triggerPrice ?? undefined,
      } as any);
      return { ok: true, provider: "profitforce", status: "pending", brokerOrderId: (r as any)?.id, raw: r };
    } catch (e: any) {
      return { ok: false, provider: "profitforce", status: "rejected", error: String(e?.message || e) };
    }
  },

  async getPositions(creds: BrokerCredentials): Promise<UnifiedPosition[]> {
    const c = creds as PFCreds;
    const acc = await getPFAccount(c.clerkId);
    return Object.entries(acc.positions || {}).map(([symbol, p]: [string, any]) => ({
      symbol,
      qty: Number(p.qty || 0),
      avgPrice: Number(p.avgPrice || 0),
      ltp: Number(p.ltp || 0),
      pnl: Number(p.pnl || 0),
    }));
  },

  async getFunds(creds: BrokerCredentials): Promise<UnifiedFunds> {
    const c = creds as PFCreds;
    const acc = await getPFAccount(c.clerkId);
    let total = Number(acc.funds || 0);
    try {
      const eq = computeEquity(acc, {});
      total = Number(eq.equity ?? total);
    } catch {}
    return {
      available: Number(acc.funds || 0),
      total,
      currency: "INR",
    };
  },
};
