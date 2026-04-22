import { clerkClient } from '@clerk/nextjs/server';

// Per-user broker configuration stored in Clerk privateMetadata (server-only, never sent to client).

export type ZerodhaCreds = { apiKey?: string; apiSecret?: string; accessToken?: string };
export type AngelCreds = { apiKey?: string; clientCode?: string; jwtToken?: string; refreshToken?: string };
export type AlpacaCreds = { apiKey?: string; apiSecret?: string; baseUrl?: string };
export type UpstoxCreds = { accessToken?: string };
export type DhanCreds = { accessToken?: string; clientId?: string };

export type BrokerConfig = {
  broker?: 'alpaca' | 'zerodha' | 'angel' | 'upstox' | 'dhan' | 'profitforce';
  zerodha?: ZerodhaCreds;
  angel?: AngelCreds;
  alpaca?: AlpacaCreds;
  upstox?: UpstoxCreds;
  dhan?: DhanCreds;
};

export async function getBrokerConfig(userId: string): Promise<BrokerConfig> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const meta = (user.privateMetadata || {}) as Record<string, unknown>;
    const cfg = (meta.brokerConfig as BrokerConfig | undefined) || {};
    return cfg;
  } catch (e) {
    console.error('getBrokerConfig error:', e);
    return {};
  }
}

export async function setBrokerConfig(userId: string, patch: Partial<BrokerConfig>): Promise<BrokerConfig> {
  const client = await clerkClient();
  const current = await getBrokerConfig(userId);
  const merged: BrokerConfig = {
    ...current,
    ...patch,
    // deep merge nested creds so partial updates don't wipe siblings
    zerodha: { ...(current.zerodha || {}), ...(patch.zerodha || {}) },
    angel: { ...(current.angel || {}), ...(patch.angel || {}) },
    alpaca: { ...(current.alpaca || {}), ...(patch.alpaca || {}) },
    upstox: { ...(current.upstox || {}), ...(patch.upstox || {}) },
    dhan: { ...(current.dhan || {}), ...(patch.dhan || {}) },
  };
  await client.users.updateUserMetadata(userId, { privateMetadata: { brokerConfig: merged } });
  return merged;
}

// Public-safe summary (no secrets) for the settings UI
export function redactConfig(cfg: BrokerConfig) {
  const mask = (v?: string) => (v ? `••••${v.slice(-4)}` : null);
  return {
    broker: cfg.broker || 'alpaca',
    zerodha: {
      apiKey: mask(cfg.zerodha?.apiKey),
      hasSecret: !!cfg.zerodha?.apiSecret,
      hasAccessToken: !!cfg.zerodha?.accessToken,
    },
    angel: {
      apiKey: mask(cfg.angel?.apiKey),
      clientCode: cfg.angel?.clientCode || null,
      hasJwt: !!cfg.angel?.jwtToken,
    },
    alpaca: {
      apiKey: mask(cfg.alpaca?.apiKey),
      hasSecret: !!cfg.alpaca?.apiSecret,
      baseUrl: cfg.alpaca?.baseUrl || null,
    },
    upstox: {
      hasAccessToken: !!cfg.upstox?.accessToken,
    },
    dhan: {
      clientId: cfg.dhan?.clientId || null,
      hasAccessToken: !!cfg.dhan?.accessToken,
    },
  };
}
