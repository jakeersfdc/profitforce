import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/clerkServer';

export async function POST(req: Request) {
  try {
    try { requireUser(); } catch (e) { return NextResponse.json({ error: 'unauthenticated' }, { status: 401 }); }
    const body = await req.json();
    const name = body?.name;
    if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
    const src = path.join(process.cwd(), 'models', name);
    const dest = path.join(process.cwd(), 'models', 'current_model.joblib');
    // ensure source exists
    try {
      await fs.access(src);
    } catch (e) {
      return NextResponse.json({ error: 'source not found' }, { status: 404 });
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    // attempt to notify local inference service to reload the model
    let reloaded = false;
    const inferenceUrl = process.env.INFERENCE_URL || 'http://localhost:8000';
    try {
      // call reload with a short timeout so this route never hangs
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 3000);
      try {
        const r = await fetch(`${inferenceUrl}/reload-local`, { method: 'POST', signal: controller.signal });
        reloaded = r.ok;
      } finally {
        clearTimeout(to);
      }
    } catch (e) {
      // log for diagnostics but continue - inference may be remote or down
      // keep `reloaded` as false so caller knows reload didn't happen
      // eslint-disable-next-line no-console
      console.error('models/swap: reload-local request failed', String(e));
    }
    return NextResponse.json({ ok: true, model: name, reloaded });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
