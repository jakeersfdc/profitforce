import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const EXP_PATH = path.join(process.cwd(), 'data', 'experiments.json');

async function readExp() {
  try {
    const raw = await fs.readFile(EXP_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { experiments: [] };
  }
}

async function writeExp(obj: any) {
  try {
    await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
    await fs.writeFile(EXP_PATH, JSON.stringify(obj, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('writeExp failed', e);
    return false;
  }
}

export async function GET() {
  const d = await readExp();
  return NextResponse.json(d);
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-model-secret');
  if (process.env.MODEL_DEPLOY_SECRET && process.env.MODEL_DEPLOY_SECRET !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const obj = await readExp();
    obj.experiments = obj.experiments || [];
    // upsert by id
    const id = body.id ?? `exp-${Date.now()}`;
    const existing = obj.experiments.find((e: any) => e.id === id);
    const entry = { id, name: body.name ?? 'A/B Test', models: body.models ?? [], weights: body.weights ?? {}, updatedAt: new Date().toISOString() };
    if (existing) {
      Object.assign(existing, entry);
    } else {
      obj.experiments.unshift(entry);
    }
    await writeExp(obj);
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    console.error('experiment post failed', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
