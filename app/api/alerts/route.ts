import { NextResponse } from 'next/server';
import { runFullScan } from '../../../lib/stockUtils';

export async function GET(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      // helper to push a scan result as SSE; always send structured JSON
      async function pushScan() {
        try {
          const results = await runFullScan();
          const payload = JSON.stringify({ ts: Date.now(), results, error: null });
          controller.enqueue(new TextEncoder().encode(`retry: 3000\n`));
          controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`));
        } catch (e) {
          const payload = JSON.stringify({ ts: Date.now(), results: [], error: String(e) });
          controller.enqueue(new TextEncoder().encode(`retry: 3000\n`));
          controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`));
        }
      }

      // push initial scan immediately
      await pushScan();

      // then push regularly every 30s
      const interval = setInterval(pushScan, 30000);

      // close stream if client disconnects
      const signal = (req as any).signal as AbortSignal | undefined;
      if (signal) {
        signal.addEventListener('abort', () => {
          clearInterval(interval);
          try {
            controller.close();
          } catch (e) {}
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
