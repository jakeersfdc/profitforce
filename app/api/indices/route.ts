import { getIndexPrices } from '@/lib/stockUtils';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const indices = await getIndexPrices();
    return NextResponse.json({ indices });
  } catch (error) {
    console.error('Index fetch error:', error);
    return NextResponse.json({ indices: [] }, { status: 500 });
  }
}