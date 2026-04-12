import { NextResponse } from 'next/server';
import { scanMarket } from '../../../lib/engine/SignalEngine';
import { broadcastAlert } from '../../../lib/engine/AutoTrader';

export async function GET(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      let lastAlertedSymbols = new Set<string>();

      async function pushScan() {
        try {
          const results = await scanMarket();
          const actionable = results.filter(r => ['BUY', 'SELL', 'EXIT'].includes(r.signal) && r.strength >= 50);

          // Broadcast new actionable signals to subscribers (not already alerted this cycle)
          for (const sig of actionable) {
            if (!lastAlertedSymbols.has(`${sig.symbol}-${sig.signal}`)) {
              try {
                await broadcastAlert(sig);
              } catch (e) {
                console.error('broadcastAlert failed', sig.symbol, e);
              }
              lastAlertedSymbols.add(`${sig.symbol}-${sig.signal}`);
            }
          }

          // Reset alerted symbols every 15 minutes
          if (lastAlertedSymbols.size > 200) lastAlertedSymbols = new Set();

          const payload = JSON.stringify({ ts: Date.now(), results, actionable: actionable.length, error: null });
          controller.enqueue(new TextEncoder().encode(`retry: 3000\n`));
          controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`));
        } catch (e) {
          const payload = JSON.stringify({ ts: Date.now(), results: [], error: String(e) });
          controller.enqueue(new TextEncoder().encode(`retry: 3000\n`));
          controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`));
        }
      }

      await pushScan();
      const interval = setInterval(pushScan, 30000);

      const signal = (req as any).signal as AbortSignal | undefined;
      if (signal) {
        signal.addEventListener('abort', () => {
          clearInterval(interval);
          try { controller.close(); } catch {}
        });
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
