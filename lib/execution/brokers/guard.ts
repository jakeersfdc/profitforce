/**
 * SEBI compliance gate for live-broker order placement.
 *
 * SEBI Research Analyst Regulations 2014 §16 prohibit guaranteed-return claims.
 * We never auto-execute on a user's live account. Orders require:
 *   1) Active subscription (paid plan)
 *   2) Explicit acknowledgment of the risk disclosure on each request
 */
import { isSubscriber } from "@/lib/auth";

export interface OrderGuardInput {
  clerkId: string;
  acknowledgeRisk: boolean;
  isLive: boolean; // true = real broker, false = paper (ProfitForce)
}

export interface OrderGuardResult {
  ok: boolean;
  reason?: string;
}

export async function guardLiveOrder(input: OrderGuardInput): Promise<OrderGuardResult> {
  if (!input.isLive) return { ok: true }; // paper-trading is unrestricted
  if (!input.acknowledgeRisk) {
    return { ok: false, reason: "risk_disclosure_not_acknowledged" };
  }
  const subscribed = await isSubscriber(input.clerkId).catch(() => false);
  if (!subscribed) {
    return { ok: false, reason: "subscription_required" };
  }
  return { ok: true };
}

/** Static text shown before live orders. Keep wording compliant. */
export const RISK_DISCLOSURE_TEXT =
  "Investments in securities markets are subject to market risks. Past performance " +
  "is not indicative of future returns. Signals provided here are research opinions, " +
  "NOT guarantees. By proceeding you confirm that this trade is your own decision " +
  "executed via your own SEBI-registered broker account. ProfitForce does not " +
  "custody your funds and does not guarantee profits.";
