"use client";

import React, { useState, useEffect } from 'react';
import SignalTable from '../../components/SignalTable';
import SuperCharts from '../../components/SuperCharts';

export default function DashboardClient() {
  const [allIndices, setAllIndices] = useState<any[]>([
    { sym: '^NSEI', name: 'NIFTY 50', price: null, change: null, id: 'NIFTY' },
    { sym: '^BSESN', name: 'SENSEX', price: null, change: null, id: 'SENSEX' },
    { sym: '^NSEBANK', name: 'BANKNIFTY', price: null, change: null, id: 'BANKNIFTY' },
    { sym: '^DJI', name: 'DOW JONES', price: null, change: null, id: 'DOWJ' },
    { sym: '^GSPC', name: 'S&P 500', price: null, change: null, id: 'SP500' },
    { sym: '^IXIC', name: 'NASDAQ', price: null, change: null, id: 'NASDAQ' },
    { sym: '^FTSE', name: 'FTSE 100', price: null, change: null, id: 'FTSE' },
    { sym: '^N225', name: 'NIKKEI 225', price: null, change: null, id: 'NIKKEI' },
    { sym: '^HSI', name: 'HANG SENG', price: null, change: null, id: 'HANGSENG' },
  ]);

  const [marketStatus, setMarketStatus] = useState('Checking market status...');
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [signals, setSignals] = useState<any[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(true);

  const [backtestSymbol, setBacktestSymbol] = useState<string>('^NSEI');
  const [btStart, setBtStart] = useState<string>('');
  const [btEnd, setBtEnd] = useState<string>('');
  const [backtestResults, setBacktestResults] = useState<any[] | null>(null);
  const [startingCapitalInput, setStartingCapitalInput] = useState<number>(100000);
  const [riskPerTradeInput, setRiskPerTradeInput] = useState<number>(0.01);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [optionSide, setOptionSide] = useState<'CALL' | 'PUT'>('CALL');
  const [targetDelta, setTargetDelta] = useState<number>(0.3);
  const [maxPremium, setMaxPremium] = useState<number>(5000);
  const [daysToExpiry, setDaysToExpiry] = useState<number>(30);
  const [optionCandidates, setOptionCandidates] = useState<any[] | null>(null);
  const [optionBest, setOptionBest] = useState<any | null>(null);
  const [optionLoading, setOptionLoading] = useState(false);
  const [prediction, setPrediction] = useState<any | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [models, setModels] = useState<any[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelInfo, setModelInfo] = useState<any | null>(null);
  const [modelInfoLoading, setModelInfoLoading] = useState(false);
  const [modelInfoCheckedAt, setModelInfoCheckedAt] = useState<string | null>(null);
  const [expandedBacktests, setExpandedBacktests] = useState<Record<string, boolean>>({});

  const fetchRealIndices = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/indices', { cache: 'no-store' });
      const json = await res.json();
      const fresh = json?.indices ?? json?.data ?? [];
      const updated = allIndices.map((idx) => {
        const found = fresh.find((f: any) => f.sym === idx.sym || f.name === idx.name || f.id === idx.id);
        return {
          ...idx,
          price: found?.price != null ? Number(found.price) : idx.price,
          change: found?.change != null ? Number(found.change) : idx.change,
        };
      });
      setAllIndices(updated);

      const anyLive = updated.some((u) => u.price != null && u.price !== 0);
      if (anyLive) {
        setMarketStatus('✅ Market Open - Live Data');
        setIsMarketOpen(true);
      } else {
        setMarketStatus('❌ Market Closed (Weekend / Holiday)');
        setIsMarketOpen(false);
      }
    } catch (err) {
      console.error('Market fetch failed', err);
      setMarketStatus('❌ Market Closed (Weekend / Holiday)');
      setIsMarketOpen(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRealIndices();
    const interval = setInterval(() => {
      if (isMarketOpen) fetchRealIndices();
    }, 45000);
    return () => clearInterval(interval);
  }, [isMarketOpen]);

  const fetchSignals = async () => {
    setSignalsLoading(true);
    try {
      const res = await fetch('/api/scan', { cache: 'no-store' });
        const json = await res.json();
        // prefer full scan results (`all`) so the dashboard shows HOLD and actionable signals
        const results = json?.all ?? json?.results ?? [];
        setSignals(results);
    } catch (err) {
      console.error('Failed to fetch signals', err);
      setToast({ message: 'Failed to fetch signals', type: 'error' });
    } finally {
      setSignalsLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals();
    const id = setInterval(fetchSignals, 60000);
    return () => clearInterval(id);
  }, []);

  const fetchModels = async () => {
    setModelsLoading(true);
    try {
      const res = await fetch('/api/model', { cache: 'no-store' });
      const j = await res.json();
      setModels(j?.models ?? j?.results?.models ?? j?.results ?? null);
    } catch (e) {
      console.error('Failed to fetch models', e);
      setModels(null);
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModelInfo = async () => {
    setModelInfoLoading(true);
    try {
      const res = await fetch('/api/inference/model-info', { cache: 'no-store' });
      const j = await res.json();
      setModelInfo({ ...j });
      setModelInfoCheckedAt(new Date().toISOString());
    } catch (e) {
      console.error('Failed to fetch model-info', e);
      setModelInfo(null);
    } finally {
      setModelInfoLoading(false);
    }
  };

  useEffect(() => {
    fetchModelInfo();
  }, []);

  // poll model-info periodically for live status
  useEffect(() => {
    const id = setInterval(() => {
      fetchModelInfo();
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // connect to server-sent events for continuous alerts with reconnect
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: any = null;

    const connect = () => {
      try {
        es = new EventSource('/api/alerts');

        es.onopen = () => {
          console.info('SSE connected');
        };

        es.onmessage = async (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data?.results) {
              // enhance any result missing entry/stop/target by fetching full signal details
              const enhancedResults = await Promise.all(
                data.results.map(async (r: any) => {
                  const missingEntry = r.entryPrice == null && r.entry == null;
                  const missingStop = r.stopLoss == null && r.stop == null;
                  const missingTarget = r.targetPrice == null && r.target == null;
                  if ((missingEntry || missingStop || missingTarget) && r.symbol) {
                    try {
                      const resp = await fetch(`/api/signal?symbol=${encodeURIComponent(r.symbol)}`);
                      if (resp.ok) {
                        const j = await resp.json();
                        return {
                          ...r,
                          entryPrice: r.entryPrice ?? j.entryPrice ?? j.entry ?? null,
                          stopLoss: r.stopLoss ?? j.stopLoss ?? j.stop ?? null,
                          targetPrice: r.targetPrice ?? j.targetPrice ?? j.target ?? null,
                          signal: r.signal ?? j.signal ?? r.signal,
                          name: r.name ?? j.name ?? r.name,
                        };
                      }
                    } catch (e) {
                      // ignore fetch error and keep original r
                      console.error('Failed to fetch signal details for alert', r.symbol, e);
                    }
                  }
                  return r;
                })
              );

              const enhanced = { ...data, results: enhancedResults };
              setAlerts((prev) => [enhanced, ...prev].slice(0, 40));
              // show a small toast for the first signal
              const first = enhanced.results && enhanced.results[0];
              if (first) setToast({ message: `${first.symbol} -> ${first.signal}`, type: first.signal === 'BUY' ? 'success' : 'info' });
            }
          } catch (e) {
            console.error('Failed parse SSE', e);
          }
        };

        es.onerror = (err) => {
          console.error('SSE error', err);
          // Do not forcibly close - allow EventSource auto-reconnect.
          try {
            if (es && (es as any).readyState === EventSource.CLOSED) {
              reconnectTimer = setTimeout(() => {
                try { es?.close(); } catch (e) {}
                connect();
              }, 3000);
            }
          } catch (e) {
            console.error('SSE reconnect check failed', e);
          }
        };
      } catch (e) {
        console.error('Failed to connect SSE', e);
        reconnectTimer = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { es?.close(); } catch (e) {}
    };
  }, []);

  const displaySignals = signals.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    currentPrice: s.entryPrice ?? s.currentPrice ?? null,
    signal: s.signal,
    entryPrice: s.entryPrice ?? null,
    stopLoss: s.stopLoss ?? null,
    targetPrice: s.targetPrice ?? null,
    strength: s.strength ?? 0,
    reason: s.reason ?? '',
  }));

  // actionable signals only (ready to BUY / SELL / EXIT)
  const actionableSignals = displaySignals.filter((d) => ['BUY', 'SELL', 'EXIT'].includes(String(d.signal).toUpperCase()));

  useEffect(() => {
    // prefer an actionable symbol for backtest, otherwise use the first available signal
    const defaultSymbol = actionableSignals[0]?.symbol ?? displaySignals[0]?.symbol;
    if (defaultSymbol) setBacktestSymbol(defaultSymbol);
  }, [displaySignals]);

  const runBacktest = async () => {
    setToast({ message: 'Running backtest...', type: 'info' });
    try {
      const resp = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [backtestSymbol], startDate: btStart || undefined, endDate: btEnd || undefined, mode: 'signal', startingCapital: startingCapitalInput, riskPerTradePct: riskPerTradeInput }),
      });
      const json = await resp.json();
      if (json?.results) {
        setBacktestResults(json.results);
        setToast({ message: 'Backtest completed', type: 'success' });
      } else {
        setToast({ message: 'Backtest failed', type: 'error' });
      }
    } catch (e) {
      setToast({ message: 'Backtest request failed', type: 'error' });
    }
  };

  const handleSelect = async (row: any) => {
    try {
      setModalOpen(true);
      // fetch fresh signal + history from server
      const [sResp, stResp, ocResp] = await Promise.all([
        fetch(`/api/signal?symbol=${encodeURIComponent(row.symbol)}`),
        fetch(`/api/strikes?symbol=${encodeURIComponent(row.symbol)}`),
        fetch(`/api/optionchain?symbol=${encodeURIComponent(row.symbol)}&side=CALL&targetDelta=0.3&maxPremium=99999`),
      ]);
      const sJson = await sResp.json();
      const stJson = await stResp.json();
      const ocJson = await ocResp.json();
      const sig = sJson?.signal ?? row;
      if (sJson?.hist) sig.hist = sJson.hist;
      sig.strikes = stJson?.strikes ?? null;
      sig.recommendation = stJson?.recommendation ?? null;
      sig.optionchain = ocJson ?? null;
      setSelectedSignal(sig);

      // fetch ML prediction for this symbol
      setPredictionLoading(true);
      try {
        const pResp = await fetch(`/api/predict?symbol=${encodeURIComponent(row.symbol)}`);
        const pJson = await pResp.json();
        setPrediction(pJson);
      } catch (e) {
        console.error('predict fetch failed', e);
        setPrediction(null);
      } finally {
        setPredictionLoading(false);
      }

      // initialize option UI with returned data
      if (ocJson?.side) setOptionSide((ocJson.side || 'CALL') as 'CALL' | 'PUT');
      if (ocJson?.targetDelta) setTargetDelta(Number(ocJson.targetDelta) || 0.3);
      if (ocJson?.best) setOptionBest(ocJson.best);
      if (ocJson?.candidates) setOptionCandidates(ocJson.candidates.slice(0,50));
    } catch (e) {
      console.error('Failed to fetch symbol signal', e);
      setSelectedSignal(row);
      setModalOpen(true);
    }
  };

  const queryOptionChain = async (side?: string, delta?: number, maxP?: number, days?: number) => {
    if (!selectedSignal) return;
    setOptionLoading(true);
    try {
      const url = `/api/optionchain?symbol=${encodeURIComponent(selectedSignal.symbol)}&side=${encodeURIComponent(side ?? optionSide)}&targetDelta=${encodeURIComponent(String(delta ?? targetDelta))}&maxPremium=${encodeURIComponent(String(maxP ?? maxPremium))}&days=${encodeURIComponent(String(days ?? daysToExpiry))}`;
      const resp = await fetch(url);
      const json = await resp.json();
      setOptionBest(json?.best ?? null);
      setOptionCandidates(json?.candidates ?? null);
    } catch (e) {
      console.error('optionchain query failed', e);
      setOptionBest(null);
      setOptionCandidates(null);
    } finally {
      setOptionLoading(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div className={`text-left py-3 rounded-2xl font-medium text-lg flex-1 ${isMarketOpen ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
          {marketStatus}
        </div>
        <div className="ml-4 text-right">
          <button onClick={() => document.getElementById('models-panel')?.scrollIntoView({ behavior: 'smooth' })} className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${modelInfo?.model_loaded ? 'bg-emerald-400 text-black' : modelInfo ? 'bg-rose-400 text-black' : 'bg-gray-500 text-white'}`}>
            {modelInfo?.model_loaded ? 'Model: Loaded' : modelInfo ? 'Model: None' : 'Model: Unknown'}
          </button>
          <div className="text-xs text-[--bf-muted] mt-1">{modelInfoCheckedAt ? `Checked ${new Date(modelInfoCheckedAt).toLocaleTimeString()}` : 'Not checked'}</div>
        </div>
      </div>

      <div>
        <h3 className="text-md font-semibold text-[--bf-muted]">India Markets</h3>
        <div className="grid grid-cols-3 gap-8 mt-3">
          {allIndices
            .filter((i) => ['NIFTY', 'SENSEX', 'BANKNIFTY', '^NSEI', '^BSESN', '^NSEBANK'].includes(i.id ?? i.sym))
            .map((idx, i) => {
              const isUp = idx.change != null && idx.change >= 0;
              const points = idx.price != null && idx.change != null ? (idx.price * idx.change) / 100 : null;
              return (
                <div key={i} className={`text-center p-8 rounded-3xl border ${isUp ? 'border-emerald-600 bg-gradient-to-br from-emerald-900/8' : 'border-rose-600 bg-gradient-to-br from-rose-900/8'}`}>
                  <div className="text-sm text-[--bf-muted] mb-2">{idx.name}</div>
                  <div className={`text-4xl font-extrabold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>{idx.price != null ? idx.price.toFixed(2) : '—'}</div>
                  <div className={`text-lg mt-2 ${isUp ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {idx.change != null ? (isUp ? '↑' : '↓') : ''} {idx.change != null ? `${idx.change.toFixed(2)}%` : ''} {points != null ? `(${isUp ? '+' : ''}${points.toFixed(2)} pts)` : ''}
                  </div>
                </div>
              );
            })}
        </div>

        <h3 className="text-md font-semibold text-[--bf-muted] mt-8">Global Markets</h3>
        <div className="grid grid-cols-3 gap-8 mt-3">
          {allIndices
            .filter((i) => !['NIFTY', 'SENSEX', 'BANKNIFTY', '^NSEI', '^BSESN', '^NSEBANK'].includes(i.id ?? i.sym))
            .map((idx, i) => {
              const isUp = idx.change != null && idx.change >= 0;
              const points = idx.price != null && idx.change != null ? (idx.price * idx.change) / 100 : null;
              return (
                <div key={i} className={`text-center p-6 rounded-2xl border ${isUp ? 'border-emerald-600 bg-gradient-to-br from-emerald-900/6' : 'border-rose-600 bg-gradient-to-br from-rose-900/6'}`}>
                  <div className="text-sm text-[--bf-muted] mb-1">{idx.name}</div>
                  <div className={`text-3xl font-bold ${isUp ? 'text-emerald-300' : 'text-rose-300'}`}>{idx.price != null ? idx.price.toFixed(2) : '—'}</div>
                  <div className={`text-sm mt-1 ${isUp ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {idx.change != null ? (isUp ? '↑' : '↓') : ''} {idx.change != null ? `${idx.change.toFixed(2)}%` : ''} {points != null ? `(${isUp ? '+' : ''}${points.toFixed(2)} pts)` : ''}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="text-center text-gray-400 text-sm">Note: Real live data is only available during market hours (9:15 AM - 3:30 PM IST, Monday to Friday)</div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold mb-3">Signals</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[--bf-muted]">Backtest:</label>
            <select value={backtestSymbol} onChange={(e) => setBacktestSymbol(e.target.value)} className="px-3 py-1 rounded bg-[#0b1220] text-white">
              {displaySignals.map((d) => (
                <option key={d.symbol} value={d.symbol}>
                  {d.symbol}
                </option>
              ))}
            </select>
            <input value={btStart} onChange={(e) => setBtStart(e.target.value)} type="date" className="px-2 py-1 rounded bg-[#0b1220] text-white" />
            <input value={btEnd} onChange={(e) => setBtEnd(e.target.value)} type="date" className="px-2 py-1 rounded bg-[#0b1220] text-white" />
            <input value={startingCapitalInput} onChange={(e) => setStartingCapitalInput(Number(e.target.value))} type="number" className="w-28 px-2 py-1 rounded bg-[#0b1220] text-white" placeholder="Capital" />
            <input value={riskPerTradeInput} onChange={(e) => setRiskPerTradeInput(Number(e.target.value))} type="number" step="0.001" className="w-24 px-2 py-1 rounded bg-[#0b1220] text-white" placeholder="Risk %" />
            <button onClick={runBacktest} className="px-3 py-2 rounded bg-gradient-to-r from-emerald-400 to-teal-400 text-black font-semibold">Run</button>
          </div>
        </div>

        <div>
          <SignalTable data={displaySignals} loading={signalsLoading} onSelect={handleSelect} />
        </div>

        <div>
          <h3 className="text-md font-semibold mt-6">Live Alerts</h3>
          <div className="mt-2 max-h-48 overflow-y-auto text-sm text-[--bf-muted]">
            {alerts.length === 0 && <div className="py-2">No recent alerts</div>}
            {alerts.map((a, i) => (
              <div key={i} className="py-1 border-b border-[#0f1724]">
                <div className="text-xs text-[--bf-muted]">{new Date(a.ts).toLocaleTimeString()}</div>
                {a.results && a.results.length > 0 ? (
                  a.results.map((r: any, j: number) => {
                    const sig = String(r.signal ?? '').toUpperCase();
                    const badgeClass = sig === 'BUY' ? 'bg-emerald-400 text-black' : sig === 'SELL' ? 'bg-rose-400 text-black' : 'bg-gray-500 text-white';
                    return (
                      <div key={j} className="py-1">
                        <div className="flex items-center gap-3">
                          <div className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeClass}`}>{sig || '—'}</div>
                          <div className="font-medium">{r.symbol ?? '—'}{r.name ? ` — ${r.name}` : ''}</div>
                        </div>
                        <div className="text-xs text-[--bf-muted]">Entry: {r.entryPrice ?? r.entry ?? '—'} &nbsp; Stop: {r.stopLoss ?? r.stop ?? '—'} &nbsp; Target: {r.targetPrice ?? r.target ?? '—'}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="font-medium">No results</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div id="models-panel" className="mt-6">
          <h3 className="text-md font-semibold">Models</h3>
          <div className="mt-2 text-sm">
              {modelsLoading && <div>Loading models…</div>}
              {modelInfo && (
                <div className="mb-3 p-3 rounded bg-white/5">
                  <div className="text-sm text-[--bf-muted]">Loaded model</div>
                  <div className="font-medium">{modelInfo.class ?? modelInfo.model_path ?? '—'}</div>
                  {modelInfo.params_sample && <div className="text-xs text-[--bf-muted]">{Object.keys(modelInfo.params_sample).join(', ')}</div>}
                </div>
              )}
            {!modelsLoading && (!models || models.length === 0) && <div className="py-2">No local models found. Run <code>python ml/api/create_example_model.py</code>.</div>}
            {models && models.length > 0 && (
              <div className="mt-2 space-y-2">
                {models.map((m: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-white/3 rounded">
                    <div>
                      <div className="font-medium">{m.name || m}</div>
                      <div className="text-xs text-[--bf-muted]">{m.mtime ? new Date(m.mtime).toLocaleString() : ''} {m.size ? `• ${Math.round(m.size/1024)} KB` : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a className="px-2 py-1 rounded bg-white/5 text-sm" href={`/api/models/${encodeURIComponent(m.name || m)}`}>Download</a>
                      <button onClick={async ()=>{
                        try {
                          setToast({ message: 'Setting active model…', type: 'info' });
                          const r = await fetch('/api/models/swap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: m.name || m }) });
                          const j = await r.json();
                          if (r.ok) {
                            setToast({ message: `Set active model: ${m.name || m}`, type: 'success' });
                            fetchModels();
                          } else {
                            setToast({ message: `Failed: ${j?.error ?? 'unknown'}`, type: 'error' });
                          }
                        } catch (e) {
                          setToast({ message: 'Set active failed', type: 'error' });
                        }
                      }} className="px-2 py-1 rounded bg-emerald-500 text-black text-sm">Set Active</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <SuperCharts items={displaySignals.slice(0,3)} />

        {modalOpen && selectedSignal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => { setModalOpen(false); setSelectedSignal(null); }} />
            <div className="relative w-11/12 md:w-3/4 lg:w-2/3 bg-[#071026] rounded-xl p-6 z-60">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{selectedSignal.symbol}</h3>
                  <div className="text-sm text-[--bf-muted]">Signal: {selectedSignal.signal}</div>
                  <div className="mt-2">
                    {predictionLoading && <div className="text-sm text-[--bf-muted]">Loading AI prediction…</div>}
                    {prediction && !prediction.error && (
                      <div className="text-sm">
                        <div><strong>AI:</strong> {prediction.action} ({(prediction.confidence ?? prediction.prob_buy ?? 0).toString().slice(0,4)})</div>
                        <div className="text-xs text-[--bf-muted]">Entry: {prediction.entry} Stop: {prediction.stop} Target: {prediction.target}</div>
                        <button onClick={() => {
                          setPredictionLoading(true);
                          fetch(`/api/predict?symbol=${encodeURIComponent(selectedSignal.symbol)}`).then(r=>r.json()).then(j=>setPrediction(j)).catch(()=>{}).finally(()=>setPredictionLoading(false));
                        }} className="mt-1 px-2 py-1 rounded bg-white/5 text-sm">Refresh AI</button>
                      </div>
                    )}
                    {prediction && prediction.error && <div className="text-sm text-rose-400">Prediction error: {String(prediction.error)}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-[--bf-muted]">Strength: {selectedSignal.strength}%</div>
                  <button onClick={() => { setModalOpen(false); setSelectedSignal(null); }} className="px-3 py-1 rounded bg-white/5">Close</button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <SuperCharts items={[selectedSignal]} />
                </div>
                <div className="p-4 rounded-md bg-white/3">
                  <div className="text-sm text-[--bf-muted] mb-2">Details</div>
                  <div className="text-sm mb-1"><strong>Entry:</strong> {selectedSignal.entryPrice ?? '—'}</div>
                  <div className="text-sm mb-1"><strong>Stop:</strong> {selectedSignal.stopLoss ?? '—'}</div>
                  <div className="text-sm mb-1"><strong>Target:</strong> {selectedSignal.targetPrice ?? '—'}</div>
                  <div className="text-sm mt-3 text-[--bf-muted]">{selectedSignal.reason}</div>
                  <div className="mt-4">
                    <div className="text-sm text-[--bf-muted] mb-2">Option Finder</div>
                    <div className="flex gap-2 items-center">
                      <select value={optionSide} onChange={(e) => setOptionSide(e.target.value as any)} className="px-2 py-1 bg-[#0b1220] rounded text-white">
                        <option value="CALL">CALL</option>
                        <option value="PUT">PUT</option>
                      </select>
                      <input type="number" step="0.05" value={targetDelta} onChange={(e) => setTargetDelta(Number(e.target.value))} className="px-2 py-1 rounded bg-[#0b1220] text-white" />
                      <input type="number" value={maxPremium} onChange={(e) => setMaxPremium(Number(e.target.value))} className="px-2 py-1 rounded bg-[#0b1220] text-white" />
                      <input type="number" value={daysToExpiry} onChange={(e) => setDaysToExpiry(Number(e.target.value))} className="px-2 py-1 rounded bg-[#0b1220] text-white" />
                      <button onClick={() => queryOptionChain(optionSide, targetDelta, maxPremium, daysToExpiry)} className="px-3 py-1 rounded bg-emerald-500 text-black font-semibold">Find Best Strike</button>
                    </div>
                    {optionLoading && <div className="text-sm text-[--bf-muted] mt-2">Searching options…</div>}
                    {optionBest && (
                      <div className="mt-3 p-2 bg-black/10 rounded">
                        <div className="text-sm">Best: <strong>{optionBest.strike}</strong> — Premium: {optionBest.lastPrice}</div>
                        <div className="text-xs text-[--bf-muted]">Delta: {optionBest.delta?.toFixed(3)} IV: {optionBest.iv?.toFixed(3)} Days: {Math.round(optionBest.days ?? 0)}</div>
                        <div className="mt-2">
                          <button onClick={() => navigator.clipboard?.writeText(String(optionBest.strike))} className="px-2 py-1 rounded bg-white/10">Copy Strike</button>
                        </div>
                      </div>
                    )}
                    {optionCandidates && (
                      <div className="mt-3 max-h-48 overflow-y-auto text-sm">
                        <table className="w-full text-sm">
                          <thead><tr className="text-[--bf-muted]"><th>strike</th><th>prem</th><th>delta</th><th>iv</th><th>days</th><th>score</th></tr></thead>
                          <tbody>
                            {optionCandidates.map((c: any, i: number) => (
                              <tr key={i} className="border-t"><td className="px-2 py-1">{c.strike}</td><td className="px-2 py-1">{c.lastPrice}</td><td className="px-2 py-1">{c.delta?.toFixed(3)}</td><td className="px-2 py-1">{(c.iv||0).toFixed(3)}</td><td className="px-2 py-1">{Math.round(c.days||0)}</td><td className="px-2 py-1">{Number(c.score).toFixed(2)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {backtestResults && (
          <div className="mt-6">
            <h3 className="text-md font-semibold">Backtest Results</h3>
            <div className="mt-3 space-y-3">
              {backtestResults.map((r: any, i: number) => {
                const key = r.symbol ?? `res-${i}`;
                const expanded = !!expandedBacktests[key];
                const summary = r.summary ?? r;
                return (
                  <div key={key} className="p-3 rounded bg-white/3 border">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{r.symbol ?? r.name}</div>
                        <div className="text-sm text-[--bf-muted]">ROI: {r.roi ?? (summary.avgReturn ?? '—')}% — Trades: {summary.trades ?? summary.closedTrades ?? (r.trades?.length ?? 0)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">Start: {r.startingCapital ?? '—'}</div>
                        <div className="text-sm">End: {r.endingCapital ?? '—'}</div>
                        <button onClick={() => setExpandedBacktests(prev => ({ ...prev, [key]: !prev[key] }))} className="mt-2 px-2 py-1 rounded bg-white/5 text-sm">{expanded ? 'Hide trades' : 'Show trades'}</button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm table-auto">
                          <thead>
                            <tr className="text-left text-[--bf-muted]"><th>Date</th><th>Type</th><th>Entry</th><th>Exit</th><th>Shares</th><th>P&L</th><th>P&L %</th></tr>
                          </thead>
                          <tbody>
                            {(r.trades || []).map((t: any, j: number) => (
                              <tr key={j} className="border-t">
                                <td className="py-2">{t.date ?? t.entryDate ?? '—'}</td>
                                <td className="py-2">{t.type ?? (t.exitType === 'STOP' ? 'SELL' : 'BUY')}</td>
                                <td className="py-2">{t.entry != null ? Number(t.entry).toFixed(2) : (t.entryPrice != null ? Number(t.entryPrice).toFixed(2) : '—')}</td>
                                <td className="py-2">{t.exit != null ? Number(t.exit).toFixed(2) : (t.exitPrice != null ? Number(t.exitPrice).toFixed(2) : '—')}</td>
                                <td className="py-2">{t.shares ?? '—'}</td>
                                <td className="py-2">{t.pnl != null ? Number(t.pnl).toFixed(2) : (t.ret != null ? Number(t.ret).toFixed(2) : '—')}</td>
                                <td className="py-2">{t.pnlPct != null ? `${t.pnlPct}%` : (t.ret != null ? `${t.ret}%` : '—')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed right-6 top-6 z-50">
          <div className={`px-4 py-2 rounded ${toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-rose-600' : 'bg-sky-600'} text-black`}>{toast.message}</div>
        </div>
      )}
    </div>
  );
}