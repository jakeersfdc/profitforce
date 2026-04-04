"use client";

import React from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

// Keep a lightweight client-safe type here to avoid importing server-only modules
type IndexPrice = {
  id?: string;
  name?: string;
  price?: number | null;
  change?: number | null;
};

export default function TopHeader({ indices }: { indices: IndexPrice[] }) {
  return (
    <div className="w-full bg-transparent mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {indices.map((idx) => {
          const isPos = (idx.change ?? 0) >= 0;
          return (
            <div key={idx.id ?? idx.name} className="p-4 rounded-md bg-gradient-to-b from-white/1 to-white/0 border border-white/3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-[var(--bf-muted)]">{idx.name}</div>
                  <div className="text-xl font-semibold mt-1">{idx.price != null ? Number(idx.price).toFixed(2) : '0.00'}</div>
                </div>
                <div className={`flex items-center gap-2 ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPos ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                  <div className="text-sm">{idx.change != null ? Number(idx.change).toFixed(2) + '%' : '0.00%'}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
