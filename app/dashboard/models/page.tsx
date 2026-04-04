"use client";

import React, { useEffect, useState } from 'react';

export default function ModelsPage() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/model');
      const json = await res.json();
      setModels(json.results ?? []);
    } catch (e) {
      console.error('Failed to fetch models', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchModels(); }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Model Registry</h2>
        <div className="flex gap-2">
          <button onClick={fetchModels} className="px-3 py-1 rounded bg-white/5">Refresh</button>
          <a href="/dashboard/experiment" className="px-3 py-1 rounded bg-white/5">Experiments</a>
        </div>
      </div>
      {loading && <div>Loading…</div>}
      {!loading && models.length === 0 && <div>No models registered</div>}
      <div className="space-y-3">
        {models.map((m, i) => (
          <div key={i} className="p-3 rounded bg-white/3">
            <div className="font-semibold">{m.model}</div>
            <div className="text-sm text-[--bf-muted]">Source: {m.source} — {new Date(m.uploadedAt).toLocaleString()}</div>
            {m.meta && <pre className="text-xs mt-2 bg-black/5 p-2 rounded">{JSON.stringify(m.meta, null, 2)}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}
