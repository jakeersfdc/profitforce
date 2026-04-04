"use client";

import React, { useEffect, useRef } from 'react';

type Props = { symbols?: string[] };

export default function TradingViewCharts({ symbols = ['NSE:RELIANCE', 'NSE:HDFCBANK', 'NSE:INFY'] }: Props) {
  const containerRefs = [useRef<HTMLDivElement | null>(null), useRef<HTMLDivElement | null>(null), useRef<HTMLDivElement | null>(null)];

  useEffect(() => {
    // inject TradingView script once
    if (!(window as any).TradingView) {
      const s = document.createElement('script');
      s.src = 'https://s3.tradingview.com/tv.js';
      s.async = true;
      document.head.appendChild(s);
      s.onload = () => initWidgets();
    } else {
      initWidgets();
    }

    function initWidgets() {
      try {
        const TV = (window as any).TradingView;
        if (!TV || !TV.widget) return;
        for (let i = 0; i < 3; i++) {
          const el = containerRefs[i].current;
          if (!el) continue;
          // clear any previous
          el.innerHTML = '';
          new TV.widget({
            container_id: el.id,
            autosize: true,
            symbol: symbols[i] || symbols[0],
            interval: '60',
            timezone: 'Asia/Kolkata',
            theme: 'dark',
            style: '1',
            toolbar_bg: '#0b1220',
            hide_legend: true,
            withdateranges: true,
            allow_symbol_change: true,
            details: false,
            studies: [],
          });
        }
      } catch (e) {
        // fail silently
        console.error('TradingView init failed', e);
      }
    }
  }, [symbols]);

  return (
    <div className="grid grid-cols-3 gap-4 mt-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl overflow-hidden bg-[#071026] p-2" style={{ minHeight: 260 }}>
          <div id={`tv_chart_${i}`} ref={containerRefs[i]} style={{ width: '100%', height: 260 }} />
        </div>
      ))}
    </div>
  );
}
