import { NextRequest } from 'next/server';
import { getIndexPrices, fetchQuote, suggestOptionStrikes } from '@/lib/stockUtils';
import { scanMarket, generateSignal } from '@/lib/engine/SignalEngine';

export const dynamic = 'force-dynamic';

const INDEX_OPT_SYMBOLS = [
  { sym: '^NSEI', label: 'NIFTY 50', strikeSym: '^NSEI' },
  { sym: '^BSESN', label: 'SENSEX', strikeSym: '^BSESN' },
  { sym: 'NIFTY_FIN_SERVICE.NS', label: 'FINNIFTY', strikeSym: 'NIFTY_FIN_SERVICE.NS' },
  { sym: '^NSEBANK', label: 'BANK NIFTY', strikeSym: '^NSEBANK' },
  { sym: '^GNIFTY', label: 'GIFT NIFTY', strikeSym: '^NSEI' }, // proxy chain
];

// SSE streaming endpoint — pushes indices every 2s, signals + indexOptions every 5s
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

      send('connected', { ts: Date.now() });

      const tickIndices = async () => {
        if (closed) return;
        try {
          const indices = await getIndexPrices();
          send('indices', { indices, ts: Date.now() });
        } catch (e) {
          console.error('SSE indices error:', e);
        }
      };

      const tickSignals = async () => {
        if (closed) return;
        try {
          const results = await scanMarket();
          send('signals', { results, ts: Date.now() });
        } catch (e) {
          console.error('SSE signals error:', e);
        }
      };

      // --- Index options (per-index strikes + signal) tick ---
      const tickIndexOptions = async () => {
        if (closed) return;
        try {
          const items = await Promise.all(
            INDEX_OPT_SYMBOLS.map(async ({ sym, label, strikeSym }) => {
              try {
                const [sig, lq] = await Promise.all([generateSignal(sym), fetchQuote(sym)]);
                const livePrice = lq.price > 0 ? lq.price : sig.entryPrice;
                const strikes = await suggestOptionStrikes(strikeSym, livePrice, undefined, 3);
                return { sym, label, signal: { ...sig, symbol: sym, name: label }, strikes, error: null };
              } catch (err) {
                return { sym, label, signal: null, strikes: null, error: String((err as Error)?.message ?? err) };
              }
            })
          );
          send('indexOptions', { items, ts: Date.now() });
        } catch (e) {
          console.error('SSE indexOptions error:', e);
        }
      };

      // Fire initial data immediately (parallel)
      await Promise.all([tickIndices(), tickSignals(), tickIndexOptions()]);

      // Cadence — bounded by upstream caches, safe for Yahoo/NSE.
      const indicesInterval = setInterval(tickIndices, 2000);
      const signalsInterval = setInterval(tickSignals, 5000);
      const indexOptInterval = setInterval(tickIndexOptions, 5000);
      const heartbeat = setInterval(() => {
        if (closed) return;
        send('heartbeat', { ts: Date.now() });
      }, 15000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(indicesInterval);
        clearInterval(signalsInterval);
        clearInterval(indexOptInterval);
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
