"use client";
/**
 * Broker connect panel.
 *
 * Lists the brokers we support, shows connection status per broker, and lets
 * the user start the connect flow (OAuth redirect or manual creds form).
 *
 * Driven entirely by the unified API:
 *   GET    /api/broker/connections
 *   GET    /api/broker/connect/{provider}/start
 *   POST   /api/broker/connect/{provider}/callback   (manual flow)
 *   POST   /api/broker/connect/{provider}/disconnect
 *   PATCH  /api/broker/connections                  ({defaultBroker})
 */
import { useCallback, useEffect, useMemo, useState } from "react";

type Provider = "zerodha" | "upstox" | "angelone" | "dhan" | "profitforce";

interface AvailableBroker {
  provider: Provider;
  displayName: string;
  authMode: "oauth" | "manual";
}

interface Connection {
  id: number;
  provider: Provider;
  accountId: string | null;
  accountName: string | null;
  status: "active" | "revoked" | "expired";
  expiresAt: string | null;
}

interface ConnectionsPayload {
  available: AvailableBroker[];
  connections: Connection[];
  defaultBroker: Provider | null;
}

interface ManualField {
  name: string;
  label: string;
  secret: boolean;
}

const LABELS: Record<Provider, string> = {
  zerodha: "Zerodha",
  upstox: "Upstox",
  angelone: "Angel One",
  dhan: "Dhan",
  profitforce: "ProfitForce (Paper)",
};

export default function BrokerConnectPanel() {
  const [data, setData] = useState<ConnectionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [manual, setManual] = useState<{ provider: Provider; fields: ManualField[]; submitUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/broker/connections", { cache: "no-store" });
      if (r.status === 401) {
        setNeedsAuth(true);
        setData(null);
        setError(null);
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as ConnectionsPayload;
      setNeedsAuth(false);
      setData(j);
    } catch (e) {
      setError(`Could not load connections: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connByProvider = useMemo(() => {
    const m = new Map<Provider, Connection>();
    for (const c of data?.connections || []) m.set(c.provider, c);
    return m;
  }, [data]);

  async function startConnect(provider: Provider) {
    setError(null);
    setBusy(provider);
    try {
      const r = await fetch(`/api/broker/connect/${provider}/start?returnUrl=/dashboard`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      if (j.mode === "oauth" && j.loginUrl) {
        window.location.href = j.loginUrl;
        return;
      }
      if (j.mode === "manual") {
        setManual({ provider, fields: j.fields || [], submitUrl: j.submitUrl });
        return;
      }
      throw new Error("Unsupported connect mode");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submitManual(values: Record<string, string>) {
    if (!manual) return;
    setBusy(manual.provider);
    try {
      const r = await fetch(manual.submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const j = await r.json();
      if (!r.ok || j?.ok === false) throw new Error(j?.details || j?.error || `HTTP ${r.status}`);
      setManual(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(provider: Provider) {
    if (!confirm(`Disconnect ${LABELS[provider]}?`)) return;
    setBusy(provider);
    try {
      const r = await fetch(`/api/broker/connect/${provider}/disconnect`, { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function makeDefault(provider: Provider) {
    setBusy(provider);
    try {
      const r = await fetch("/api/broker/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultBroker: provider }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0a1224] p-4 text-sm text-white/60">
        Loading brokers…
      </div>
    );
  }

  if (needsAuth) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0a1224] p-4 text-sm text-white/70">
        <h3 className="font-semibold text-white mb-1">Connect Broker</h3>
        <p className="text-[12px]">
          <a href="/sign-in" className="text-emerald-300 underline">Sign in</a> to connect
          Upstox, Dhan, Zerodha, Angel One, or use ProfitForce paper trading.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0a1224] p-4 text-sm text-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white">Connect Broker</h3>
        <span className="text-[11px] text-white/50">
          Default: <b className="text-white/80">{data?.defaultBroker ? LABELS[data.defaultBroker] : "—"}</b>
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="rounded border border-amber-500/40 bg-amber-500/5 px-3 py-2 mb-3 text-[11px] leading-snug text-amber-200">
        We never custody your funds. Trades execute on your own SEBI-registered broker
        account using your OAuth-issued access token (encrypted at rest, AES-256-GCM).
        You can disconnect at any time. Markets are subject to risk; signals are
        research opinions, not guarantees.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {(data?.available || []).map((b) => {
          const conn = connByProvider.get(b.provider);
          const connected = !!conn && conn.status === "active";
          const expired = !!(conn?.expiresAt && new Date(conn.expiresAt).getTime() < Date.now());
          const isDefault = data?.defaultBroker === b.provider;
          return (
            <div key={b.provider} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0c1530] px-3 py-2">
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  {b.displayName}
                  {isDefault && <span className="text-[10px] uppercase tracking-wide bg-emerald-500/20 text-emerald-300 rounded px-1.5 py-0.5">Default</span>}
                </div>
                <div className="text-[11px] text-white/50">
                  {connected
                    ? `${conn?.accountName || conn?.accountId || "Connected"}${expired ? " · token expired" : ""}`
                    : b.authMode === "oauth"
                      ? "Connect via OAuth"
                      : b.provider === "profitforce"
                        ? "Built-in paper trading"
                        : "Paste API access token"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {connected ? (
                  <>
                    {!isDefault && (
                      <button
                        disabled={busy === b.provider}
                        onClick={() => makeDefault(b.provider)}
                        className="text-[11px] px-2 py-1 rounded border border-white/15 hover:bg-white/5"
                      >
                        Make default
                      </button>
                    )}
                    {(expired || b.authMode === "oauth") && (
                      <button
                        disabled={busy === b.provider}
                        onClick={() => startConnect(b.provider)}
                        className="text-[11px] px-2 py-1 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                      >
                        {expired ? "Refresh" : "Reconnect"}
                      </button>
                    )}
                    {b.provider !== "profitforce" && (
                      <button
                        disabled={busy === b.provider}
                        onClick={() => disconnect(b.provider)}
                        className="text-[11px] px-2 py-1 rounded border border-red-500/40 text-red-300 hover:bg-red-500/10"
                      >
                        Disconnect
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    disabled={busy === b.provider}
                    onClick={() => startConnect(b.provider)}
                    className="text-[11px] px-2 py-1 rounded bg-emerald-500/90 hover:bg-emerald-500 text-black font-medium"
                  >
                    {busy === b.provider ? "…" : "Connect"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {manual && (
        <ManualConnectModal
          provider={manual.provider}
          fields={manual.fields}
          busy={busy === manual.provider}
          onCancel={() => setManual(null)}
          onSubmit={submitManual}
        />
      )}
    </div>
  );
}

function ManualConnectModal(props: {
  provider: Provider;
  fields: ManualField[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit(values);
        }}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-[#0a1224] p-4 text-sm text-white"
      >
        <h4 className="font-semibold mb-3">Connect {LABELS[props.provider]}</h4>
        {props.fields.length === 0 && (
          <p className="text-white/60 text-xs mb-3">No fields required — click Connect to provision.</p>
        )}
        <div className="space-y-2">
          {props.fields.map((f) => (
            <label key={f.name} className="block">
              <div className="text-[11px] text-white/60 mb-1">{f.label}</div>
              <input
                type={f.secret ? "password" : "text"}
                autoComplete={f.secret ? "off" : undefined}
                value={values[f.name] || ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className="w-full rounded border border-white/10 bg-[#0c1530] px-2 py-1.5 text-sm focus:outline-none focus:border-emerald-400/60"
                required
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="text-[12px] px-3 py-1.5 rounded border border-white/15 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={props.busy}
            className="text-[12px] px-3 py-1.5 rounded bg-emerald-500/90 hover:bg-emerald-500 text-black font-medium"
          >
            {props.busy ? "Connecting…" : "Connect"}
          </button>
        </div>
      </form>
    </div>
  );
}
