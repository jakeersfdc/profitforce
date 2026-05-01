"use client";

import React, { Suspense } from "react";
import DashboardClient from './DashboardClient';

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-white/50">Loading dashboard…</div>}>
      <DashboardClient />
    </Suspense>
  );
}
