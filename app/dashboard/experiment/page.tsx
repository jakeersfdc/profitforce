"use client";

import React, { useEffect, useState } from 'react';

export default function ExperimentPage() {
  const [models, setModels] = useState<any[]>([]);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('My AB Test');
  const [mA, setMA] = useState('');
  const [mB, setMB] = useState('');
  const [weightA, setWeightA] = useState<number>(50);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/model');
      const j = await res.json();
      setModels(j.results ?? []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const fetchExps = async () => {
    try {
      const res = await fetch('/api/experiment');
      const j = await res.json();
      setExperiments(j.experiments ?? []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchModels(); fetchExps(); }, []);

  const save = async () => {
    const body = { name, models: [mA, mB], weights: { [mA]: weightA, [mB]: 100 - weightA } };
    const res = await fetch('/api/experiment', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-model-secret': process.env.NEXT_PUBLIC_MODEL_DEPLOY_SECRET || '' }, body: JSON.stringify(body) });
    const j = await res.json();
    if (j.ok) fetchExps();
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-3">A/B Experiment</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-sm text-[--bf-muted]">Name</div>
          <input value={name} onChange={e => setName(e.target.value)} className="px-2 py-1 rounded bg-[#0b1220] text-white w-full" />
        </div>
        <div>
          <div className="text-sm text-[--bf-muted]">Model A</div>
          <select value={mA} onChange={e => setMA(e.target.value)} className="px-2 py-1 rounded bg-[#0b1220] text-white w-full">
            <option value="">(select)</option>
            {models.map(m => <option key={m.model} value={m.model}>{m.model}</option>)}
          </select>
        </div>
        <div>
          <div className="text-sm text-[--bf-muted]">Model B</div>
          <select value={mB} onChange={e => setMB(e.target.value)} className="px-2 py-1 rounded bg-[#0b1220] text-white w-full">
            <option value="">(select)</option>
            {models.map(m => <option key={m.model} value={m.model}>{m.model}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="text-sm text-[--bf-muted]">Weight A (%)</div>
        <input type="number" value={weightA} onChange={e => setWeightA(Number(e.target.value))} className="w-20 px-2 py-1 rounded bg-[#0b1220] text-white" />
        <button onClick={save} className="px-3 py-1 rounded bg-emerald-500 text-black">Save Experiment</button>
      </div>

      <div>
        <h3 className="text-md font-semibold">Existing Experiments</h3>
        <div className="mt-3 space-y-2">
          {experiments.map((e: any) => (
            <div key={e.id} className="p-2 rounded bg-white/3">
              <div className="font-semibold">{e.name}</div>
              <div className="text-sm text-[--bf-muted]">Models: {JSON.stringify(e.models)} — Weights: {JSON.stringify(e.weights)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
