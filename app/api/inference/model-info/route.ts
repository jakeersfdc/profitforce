import { NextResponse } from 'next/server';

export async function GET() {
  const inferenceUrl = process.env.INFERENCE_URL || 'http://localhost:8000';
  try {
    const res = await fetch(`${inferenceUrl}/model-info`, { cache: 'no-store' });
    const j = await res.json();
    return NextResponse.json(j);
  } catch (e) {
    // When the inference service is down, return a safe, consistent payload
    // so the frontend can continue to display the app without errors.
    console.error('inference/model-info fetch failed', e);
    return NextResponse.json({ model_loaded: false, available: false, error: 'inference unreachable' });
  }
}
