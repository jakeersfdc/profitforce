import type { BrokerProvider, IBroker } from "./types";
import { zerodha } from "./zerodha";
import { upstox } from "./upstox";
import { angelone } from "./angelone";
import { dhan } from "./dhan";
import { profitforce } from "./profitforce";

const BROKERS: Record<BrokerProvider, IBroker> = {
  zerodha,
  upstox,
  angelone,
  dhan,
  profitforce,
};

export function getBroker(provider: BrokerProvider): IBroker {
  const b = BROKERS[provider];
  if (!b) throw new Error(`unknown broker: ${provider}`);
  return b;
}

export function listBrokers(): { provider: BrokerProvider; displayName: string; authMode: IBroker["authMode"]["kind"] }[] {
  return (Object.values(BROKERS) as IBroker[]).map((b) => ({
    provider: b.provider,
    displayName: b.displayName,
    authMode: b.authMode.kind,
  }));
}

export function isBrokerProvider(s: string): s is BrokerProvider {
  return s in BROKERS;
}
