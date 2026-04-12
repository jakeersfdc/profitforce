import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateSignal } from '../../../../lib/engine/SignalEngine';

/**
 * GET /api/predict/ensemble?symbol=INFY.NS
 * Returns combined signal from both technical analysis and ML model (if available).
 * Public-facing endpoint for mobile apps.
 */
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    // 1. Technical analysis signal (multi-indicator confluence)
    const taSignal = await generateSignal(symbol);

    // 2. ML model prediction (optional, may fail)
    let mlPrediction: any = null;
    try {
      const inferenceUrl = process.env.INFERENCE_URL;
      if (inferenceUrl) {
        const headers: Record<string, string> = {};
        if (process.env.INFERENCE_SERVICE_TOKEN) {
          headers['Authorization'] = `Bearer ${process.env.INFERENCE_SERVICE_TOKEN}`;
        }
        const res = await fetch(`${inferenceUrl}/predict`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ features: [[]] }), // features computed server-side
        });
        if (res.ok) mlPrediction = await res.json();
      } else {
        // Fallback: hit our own /api/predict
        const origin = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
        const res = await fetch(`${origin}/api/predict?symbol=${encodeURIComponent(symbol)}`, {
          headers: { 'Cookie': '' }, // internal call
        });
        if (res.ok) mlPrediction = await res.json();
      }
    } catch (e) {
      // ML prediction unavailable, proceed with TA only
    }

    // 3. Combine signals
    const combined = {
      symbol,
      technical: taSignal,
      ml: mlPrediction,
      // Ensemble decision: weight ML higher when available
      signal: mlPrediction?.action || taSignal?.signal || 'HOLD',
      entry: mlPrediction?.entry ?? taSignal?.entryPrice ?? null,
      stop: mlPrediction?.stop ?? taSignal?.stopLoss ?? null,
      target: mlPrediction?.target ?? taSignal?.targetPrice ?? null,
      confidence: mlPrediction?.confidence ?? (taSignal?.strength ? taSignal.strength / 100 : 0.5),
      strength: mlPrediction?.strength ?? taSignal?.strength ?? 0,
      source: mlPrediction ? 'ensemble' : 'technical',
    };

    return NextResponse.json(combined);
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
