import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/clerkServer';

export async function GET(_req: Request, { params }: any) {
  try { await requireUser(); } catch (e) { return NextResponse.json({ error: 'unauthenticated' }, { status: 401 }); }
  const name = params?.name;
  if (!name || !/^[a-zA-Z0-9_.-]+$/.test(name)) {
    return NextResponse.json({ error: 'invalid model name' }, { status: 400 });
  }
  const p = path.join(process.cwd(), 'models', name);
  try {
    const data = await fs.readFile(p);
    return new Response(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
