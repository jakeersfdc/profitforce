import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlists.json');

function readWatchlists(): Record<string, string[]> {
  try {
    if (fs.existsSync(WATCHLIST_FILE)) {
      return JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf-8'));
    }
  } catch { /* empty */ }
  return {};
}

function writeWatchlists(data: Record<string, string[]>) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(data, null, 2));
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    const all = readWatchlists();
    const symbols = all[userId] ?? [];
    return NextResponse.json({ symbols });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    const body = await req.json();
    const symbol = String(body?.symbol ?? '').trim().toUpperCase();
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const all = readWatchlists();
    const list = all[userId] ?? [];
    if (!list.includes(symbol)) {
      list.push(symbol);
    }
    all[userId] = list.slice(0, 50); // cap at 50
    writeWatchlists(all);
    return NextResponse.json({ ok: true, symbols: all[userId] });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    const body = await req.json();
    const symbol = String(body?.symbol ?? '').trim().toUpperCase();
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const all = readWatchlists();
    const list = all[userId] ?? [];
    all[userId] = list.filter(s => s !== symbol);
    writeWatchlists(all);
    return NextResponse.json({ ok: true, symbols: all[userId] });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
