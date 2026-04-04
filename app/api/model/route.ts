import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const REGISTRY_PATH = path.join(process.cwd(), 'data', 'model_registry.json');

async function readRegistry() {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

async function writeRegistry(data: any) {
  try {
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
    await fs.writeFile(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to write registry', e);
    return false;
  }
}

export async function GET() {
  const list = await readRegistry();
  // also include models found in the local models/ directory
  const modelsDir = path.join(process.cwd(), 'models');
  let files: any[] = [];
  try {
    const names = await fs.readdir(modelsDir);
    for (const n of names) {
      try {
        const stat = await fs.stat(path.join(modelsDir, n));
        if (stat.isFile()) {
          files.push({ name: n, size: stat.size, mtime: stat.mtime.toISOString() });
        }
      } catch (e) {
        // ignore file stat errors
      }
    }
  } catch (e) {
    // models dir may not exist, that's fine
  }

  return NextResponse.json({ results: list, models: files });
}

export async function POST(req: Request) {
  // protected webhook: set MODEL_DEPLOY_SECRET in your deployment
  const secret = req.headers.get('x-model-secret');
  if (process.env.MODEL_DEPLOY_SECRET && process.env.MODEL_DEPLOY_SECRET !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const registry = await readRegistry();
    const entry = {
      model: body.model ?? `model-${Date.now()}`,
      source: body.source ?? 'unknown',
      uploadedAt: new Date().toISOString(),
      meta: body.meta ?? {}
    };
    registry.unshift(entry);
    await writeRegistry(registry.slice(0, 50));
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    console.error('Model deploy failed', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
