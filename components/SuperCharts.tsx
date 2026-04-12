"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, LineStyle } from 'lightweight-charts';

type Item = { symbol: string; entryPrice?: number | null; stopLoss?: number | null; targetPrice?: number | null; signal?: string };

export default function SuperCharts({ items }: { items: Item[] }) {
  return (
    <div className="grid grid-cols-3 gap-4 mt-6">
      {items.slice(0, 3).map((it, i) => (
        <ChartCard key={it.symbol || i} item={it} />
      ))}
    </div>
  );
}

function ChartCard({ item }: { item: Item }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function init() {
      if (!ref.current) return;
      // fetch history
      try {
        const resp = await fetch(`/api/history?symbol=${encodeURIComponent(item.symbol)}&interval=1d`);
        const json = await resp.json();
        const hist = json?.hist ?? [];
        const data = hist.map((h: any) => ({ time: h.date.slice(0,10), value: Number(h.close) }));

        // create chart
        chartRef.current?.remove();
        const chart = createChart(ref.current!, { width: ref.current!.clientWidth, height: 260, layout: { background: { color: '#071026' }, textColor: '#9aa7bd' }, grid: { vertLines: { color: '#0b1220' }, horzLines: { color: '#0b1220' } }, rightPriceScale: { borderColor: '#0b1220' }, timeScale: { borderColor: '#0b1220' } });
        chartRef.current = chart;
        const line = chart.addLineSeries({ color: '#26a69a', lineWidth: 2, lineStyle: LineStyle.Solid });
        line.setData(data);
        seriesRef.current = line;

        // price lines for entry/stop/target
        if (item.entryPrice) line.createPriceLine({ price: item.entryPrice, color: '#00ff99', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'ENTRY' });
        if (item.stopLoss) line.createPriceLine({ price: item.stopLoss, color: '#ff4d4f', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'STOP' });
        if (item.targetPrice) line.createPriceLine({ price: item.targetPrice, color: '#66b3ff', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'TARGET' });

        // resize observer
        const ro = new ResizeObserver(() => {
          if (!ref.current) return;
          chart.applyOptions({ width: ref.current.clientWidth });
        });
        ro.observe(ref.current);

        if (mounted) setLoading(false);
      } catch (e) {
        console.error('chart init failed', e);
        if (mounted) setLoading(false);
      }
    }
    init();
    return () => {
      mounted = false;
      try { chartRef.current?.remove(); } catch (e) {}
      chartRef.current = null;
    };
  }, [item.symbol]);

  return (
    <div className="rounded-xl overflow-hidden bg-[#071026] p-3" style={{ minHeight: 300 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{item.symbol}</div>
        <div className="text-sm text-[--bf-muted]">{item.signal ?? ''}</div>
      </div>
      <div ref={ref} style={{ width: '100%', height: 260 }} />
      {loading && <div className="text-sm text-[--bf-muted] mt-2">Loading chart…</div>}
    </div>
  );
}
