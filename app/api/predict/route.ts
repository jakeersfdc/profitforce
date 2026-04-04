import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function GET(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    const modelPath = url.searchParams.get('model') ?? `ml/models/${(symbol ?? 'model').replace('/', '_')}.joblib`;

    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const script = path.resolve(process.cwd(), 'ml', 'predict.py');
    let modelPathResolved = path.resolve(process.cwd(), modelPath);
    // if model does not exist, try current_model or any model in ml/models as fallback
    if (!fs.existsSync(modelPathResolved)) {
      const fallback1 = path.resolve(process.cwd(), 'models', 'current_model.joblib');
      if (fs.existsSync(fallback1)) modelPathResolved = fallback1;
      else {
        const modelsDir = path.resolve(process.cwd(), 'ml', 'models');
        try {
          const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.joblib'));
          if (files.length > 0) modelPathResolved = path.join(modelsDir, files[0]);
        } catch (e) {
          // ignore
        }
      }
    }
    const args = [script, '--symbol', symbol!, '--model', modelPathResolved];
    // If INFERENCE_URL is configured, proxy the request to the inference service (production)
    const inferenceUrl = process.env.INFERENCE_URL;
    if (inferenceUrl) {
      try {
        const headers: any = {};
        if (process.env.INFERENCE_SERVICE_TOKEN) headers['Authorization'] = `Bearer ${process.env.INFERENCE_SERVICE_TOKEN}`;
        const proxied = await fetch(`${inferenceUrl}/predict?symbol=${encodeURIComponent(symbol || '')}`, { headers });
        const j = await proxied.json();
        return NextResponse.json(j);
      } catch (e) {
        console.error('proxy to inference failed', e);
        // fall back to local python runner
      }
    }

    // spawn python process with timeout and clear error messages
    // prefer project's virtualenv python if present
    const envPython = process.env.PYTHON_CMD;
    let pythonCmd = envPython || 'python';
    try {
      const winVenv = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
      const nixVenv = path.join(process.cwd(), '.venv', 'bin', 'python');
      if (!envPython) {
        if (fs.existsSync(winVenv)) pythonCmd = winVenv;
        else if (fs.existsSync(nixVenv)) pythonCmd = nixVenv;
      }
    } catch (e) {
      // ignore
    }
    const py = spawn(pythonCmd, args, { cwd: process.cwd() });

    let out = '';
    let err = '';
    py.stdout.on('data', (d) => { out += d.toString(); });
    py.stderr.on('data', (d) => { err += d.toString(); });

    const timeoutMs = 10000; // 10s
    let killedByTimeout = false;
    const exitCode: number = await new Promise((resolve) => {
      const to = setTimeout(() => {
        try { py.kill(); } catch (e) {}
        killedByTimeout = true;
      }, timeoutMs);
      py.on('close', (code) => { clearTimeout(to); resolve(code ?? 0); });
      py.on('error', (e) => { clearTimeout(to); resolve(1); });
    });

    if (killedByTimeout) {
      return NextResponse.json({ error: 'prediction timed out', detail: 'python process exceeded timeout' });
    }

    if (exitCode !== 0) {
      return NextResponse.json({ error: 'prediction failed', code: exitCode, out, err });
    }

    try {
      const json = JSON.parse(out);
      return NextResponse.json(json);
    } catch (e) {
      return NextResponse.json({ error: 'invalid output', out, err });
    }
  } catch (e) {
    console.error('predict route error', e);
    return NextResponse.json({ error: String(e) });
  }
}
