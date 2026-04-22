"use client";
import { useState, useEffect, useCallback } from "react";

const BROKERS = [
  { id: "profitforce", name: "🏦 ProfitForce (built-in virtual broker)" },
  { id: "alpaca", name: "Alpaca (US stocks, paper by default)" },
  { id: "zerodha", name: "Zerodha — Kite Connect" },
  { id: "angel", name: "Angel One — SmartAPI" },
  { id: "upstox", name: "Upstox — API v2" },
  { id: "dhan", name: "Dhan — API v2" },
];

type RedactedSummary = {
  broker: string;
  zerodha: { apiKey: string | null; hasSecret: boolean; hasAccessToken: boolean };
  angel: { apiKey: string | null; clientCode: string | null; hasJwt: boolean };
  alpaca: { apiKey: string | null; hasSecret: boolean; baseUrl: string | null };
  upstox: { hasAccessToken: boolean };
  dhan: { clientId: string | null; hasAccessToken: boolean };
};

export default function BrokerSettings({ userBroker, onSave }: { userBroker?: string; onSave?: (broker: string) => void }) {
  const [broker, setBroker] = useState(userBroker || "alpaca");
  const [summary, setSummary] = useState<RedactedSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // Form fields per broker
  const [zKey, setZKey] = useState("");
  const [zSecret, setZSecret] = useState("");
  const [zToken, setZToken] = useState("");
  const [aKey, setAKey] = useState("");
  const [aClient, setAClient] = useState("");
  const [aJwt, setAJwt] = useState("");
  const [uToken, setUToken] = useState("");
  const [dToken, setDToken] = useState("");
  const [dClient, setDClient] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile/broker-creds");
      if (res.ok) {
        const data: RedactedSummary = await res.json();
        setSummary(data);
        if (!userBroker && data.broker) setBroker(data.broker);
      }
    } finally {
      setLoading(false);
    }
  }, [userBroker]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveBrokerChoice = async (next: string) => {
    setSaving(true);
    try {
      await fetch("/api/profile/broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker: next }),
      });
      setBroker(next);
      onSave?.(next);
      setMsg("Broker selected");
      await refresh();
    } catch {
      setMsg("Failed to save broker");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 2500);
    }
  };

  const saveCreds = async (which: "zerodha" | "angel" | "upstox" | "dhan") => {
    setSaving(true);
    try {
      const creds =
        which === "zerodha"
          ? { apiKey: zKey, apiSecret: zSecret, accessToken: zToken }
          : which === "angel"
          ? { apiKey: aKey, clientCode: aClient, jwtToken: aJwt }
          : which === "upstox"
          ? { accessToken: uToken }
          : { accessToken: dToken, clientId: dClient };
      const res = await fetch("/api/profile/broker-creds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker: which, creds }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg(`${which} credentials saved`);
      if (which === "zerodha") { setZKey(""); setZSecret(""); setZToken(""); }
      else if (which === "angel") { setAKey(""); setAClient(""); setAJwt(""); }
      else if (which === "upstox") { setUToken(""); }
      else { setDToken(""); setDClient(""); }
      await refresh();
    } catch (e: unknown) {
      setMsg(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const wipeCreds = async (which: "zerodha" | "angel" | "alpaca" | "upstox" | "dhan") => {
    if (!confirm(`Remove saved ${which} credentials?`)) return;
    setSaving(true);
    try {
      await fetch("/api/profile/broker-creds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker: which }),
      });
      setMsg(`${which} credentials cleared`);
      await refresh();
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 2500);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-5 bg-[#0a1628] rounded-xl border border-blue-500/20 mt-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold mb-2">Broker Selection</h2>
        <p className="text-xs text-white/50 mb-3">Choose which broker ProfitForce should route live orders to.</p>
        <select
          className="w-full p-2 rounded border border-gray-700 bg-[#071026] text-white mb-3"
          value={broker}
          onChange={e => setBroker(e.target.value)}
          disabled={saving || loading}
        >
          {BROKERS.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <button
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
          onClick={() => saveBrokerChoice(broker)}
          disabled={saving || loading}
        >
          {saving ? "Saving..." : "Use this broker"}
        </button>
      </div>

      {/* Zerodha */}
      <section className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-white">Zerodha — Kite Connect</h3>
          {summary?.zerodha?.hasAccessToken && (
            <button onClick={() => wipeCreds("zerodha")} className="text-xs text-red-400 hover:text-red-300">Clear</button>
          )}
        </div>
        {summary && (
          <div className="text-[11px] text-white/50 mb-2">
            API key: {summary.zerodha.apiKey || <span className="text-yellow-400">not set</span>}
            {" · "}Secret: {summary.zerodha.hasSecret ? "✓" : <span className="text-yellow-400">missing</span>}
            {" · "}Access token: {summary.zerodha.hasAccessToken ? "✓" : <span className="text-yellow-400">missing</span>}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <input className="p-2 rounded bg-[#071026] border border-gray-700 text-xs" placeholder="API Key" value={zKey} onChange={e => setZKey(e.target.value)} />
          <input className="p-2 rounded bg-[#071026] border border-gray-700 text-xs" placeholder="API Secret" type="password" value={zSecret} onChange={e => setZSecret(e.target.value)} />
          <input className="p-2 rounded bg-[#071026] border border-gray-700 text-xs" placeholder="Access Token" type="password" value={zToken} onChange={e => setZToken(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => saveCreds("zerodha")} disabled={saving} className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-bold disabled:opacity-50">Save Zerodha</button>
          <a href="https://kite.trade/connect/login" target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:underline">Get access token ↗</a>
        </div>
        <div className="text-[10px] text-white/40 mt-1">Leave a field blank to keep the existing saved value.</div>
      </section>

      {/* Angel One */}
      <section className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-white">Angel One — SmartAPI</h3>
          {summary?.angel?.hasJwt && (
            <button onClick={() => wipeCreds("angel")} className="text-xs text-red-400 hover:text-red-300">Clear</button>
          )}
        </div>
        {summary && (
          <div className="text-[11px] text-white/50 mb-2">
            API key: {summary.angel.apiKey || <span className="text-yellow-400">not set</span>}
            {" · "}Client: {summary.angel.clientCode || <span className="text-yellow-400">missing</span>}
            {" · "}JWT: {summary.angel.hasJwt ? "✓" : <span className="text-yellow-400">missing</span>}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <input className="p-2 rounded bg-[#071026] border border-gray-700 text-xs" placeholder="API Key (X-PrivateKey)" value={aKey} onChange={e => setAKey(e.target.value)} />
          <input className="p-2 rounded bg-[#071026] border border-gray-700 text-xs" placeholder="Client Code" value={aClient} onChange={e => setAClient(e.target.value)} />
          <input className="p-2 rounded bg-[#071026] border border-gray-700 text-xs" placeholder="JWT Token" type="password" value={aJwt} onChange={e => setAJwt(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => saveCreds("angel")} disabled={saving} className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-bold disabled:opacity-50">Save Angel One</button>
          <a href="https://smartapi.angelbroking.com/" target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:underline">Get JWT ↗</a>
        </div>
      </section>

      {/* Upstox */}
      <section className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-white">Upstox — API v2</h3>
          {summary?.upstox?.hasAccessToken && (
            <button onClick={() => wipeCreds("upstox")} className="text-xs text-red-400 hover:text-red-300">Clear</button>
          )}
        </div>
        {summary && (
          <div className="text-[11px] text-white/50 mb-2">
            Access token: {summary.upstox.hasAccessToken ? "✓" : <span className="text-yellow-400">missing</span>}
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 mb-2">
          <input className="p-2 rounded bg-[#071026] border border-gray-700 text-xs" placeholder="Access Token (Bearer)" type="password" value={uToken} onChange={e => setUToken(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => saveCreds("upstox")} disabled={saving} className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-bold disabled:opacity-50">Save Upstox</button>
          <a href="https://upstox.com/developer/api-documentation/authentication" target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:underline">Get access token ↗</a>
        </div>
        <div className="text-[10px] text-white/40 mt-1">Orders require <code>instrumentKey</code> (e.g. <code>NSE_EQ|INE848E01016</code>). Dashboard Track buttons currently send raw symbols — wire instrument lookup before going live.</div>
      </section>

      {/* Dhan */}
      <section className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-white">Dhan — API v2</h3>
          {summary?.dhan?.hasAccessToken && (
            <button onClick={() => wipeCreds("dhan")} className="text-xs text-red-400 hover:text-red-300">Clear</button>
          )}
        </div>
        {summary && (
          <div className="text-[11px] text-white/50 mb-2">
            Client ID: {summary.dhan.clientId || <span className="text-yellow-400">missing</span>}
            {" · "}Access token: {summary.dhan.hasAccessToken ? "✓" : <span className="text-yellow-400">missing</span>}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <input className="p-2 rounded bg-[#071026] border border-gray-700 text-xs" placeholder="Client ID" value={dClient} onChange={e => setDClient(e.target.value)} />
          <input className="p-2 rounded bg-[#071026] border border-gray-700 text-xs" placeholder="Access Token" type="password" value={dToken} onChange={e => setDToken(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => saveCreds("dhan")} disabled={saving} className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-bold disabled:opacity-50">Save Dhan</button>
          <a href="https://dhanhq.co/docs/v2/authentication/" target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:underline">Get access token ↗</a>
        </div>
        <div className="text-[10px] text-white/40 mt-1">Orders require numeric <code>securityId</code> (instrument id from Dhan scrip master).</div>
      </section>

      {msg && <div className="text-green-400 text-sm">{msg}</div>}
      <div className="text-[10px] text-white/40">
        ⚠️ Live orders execute real trades with your broker. Start with tiny quantities to verify symbol/token/exchange. Credentials are stored in your private Clerk metadata and never logged.
      </div>
    </div>
  );
}

