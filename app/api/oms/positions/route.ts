import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPositions, dailyPnL } from "@/lib/oms/PositionTracker";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [positions, pnl] = await Promise.all([
    getPositions(userId),
    dailyPnL(userId),
  ]);
  return NextResponse.json({ positions, pnl });
}
