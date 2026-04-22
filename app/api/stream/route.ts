import { NextRequest } from 'next/server';
import { getIndexPrices } from '@/lib/stockUtils';
import { scanMarket } from '@/lib/engine/SignalEngine';

export const dynamic = 'force-dynamic';

// SSE streaming endpoint — pushes indices every 3s, signals every 10s
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { closed = true; }
      };

      // Send heartbeat immediately
      send('connected', { ts: Date.now() });

      // --- Indices tick (every 3 seconds) ---
      const tickIndices = async () => {
        if (closed) return;
        try {
          const indices = await getIndexPrices();
          send('indices', { indices, ts: Date.now() });
        } catch (e) {
          console.error('SSE indices error:', e);
        }
      };

      // --- Signals tick (every 10 seconds) ---
      let signalCache: any[] = [];
      let lastSignalTs = 0;
      const tickSignals = async () => {
        if (closed) return;
        try {
          const results = await scanMarket();
          signalCache = results;
          lastSignalTs = Date.now();
          send('signals', { results, ts: lastSignalTs });
        } catch (e) {
          console.error('SSE signals error:', e);
        }
      };

      // Fire initial data immediately (parallel)
      await Promise.all([tickIndices(), tickSignals()]);

      // Set up intervals (conservative to avoid Yahoo rate limits)
      const indicesInterval = setInterval(tickIndices, 5000);
      const signalsInterval = setInterval(tickSignals, 30000);
      const heartbeat = setInterval(() => {
        if (closed) return;
        send('heartbeat', { ts: Date.now() });
      }, 15000);

      // Cleanup on abort
      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(indicesInterval);
        clearInterval(signalsInterval);
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
