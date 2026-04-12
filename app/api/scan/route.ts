import { scanMarket } from '@/lib/engine/SignalEngine';
import { runFullScan } from '@/lib/stockUtils';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get('symbols');
    const limitParam = url.searchParams.get('limit');
    const minStrengthParam = url.searchParams.get('minStrength');
    const engine = url.searchParams.get('engine'); // 'v2' for new engine

    const symbols = symbolsParam ? symbolsParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const limit = limitParam ? Math.max(1, Number(limitParam) || 10) : 10;
    const minStrength = minStrengthParam ? Number(minStrengthParam) : undefined;

    // Use new multi-indicator confluence engine by default
    let results: any[];
    if (engine === 'v1') {
      results = await runFullScan(symbols);
    } else {
      results = await scanMarket(symbols);
    }

    // By default return top actionable signals sorted by `strength` desc.
    const actionable = (results ?? []).filter((r: any) => ['BUY', 'SELL', 'EXIT'].includes(String(r.signal).toUpperCase()));
    const filtered = actionable.filter((r: any) => (minStrength == null ? true : (Number(r.strength ?? 0) >= minStrength)));
    const sorted = filtered.sort((a: any, b: any) => (Number(b.strength ?? 0) - Number(a.strength ?? 0)));
    const top = sorted.slice(0, limit);

    return NextResponse.json({ results: top, all: results, engine: engine === 'v1' ? 'v1' : 'v2', scannedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}