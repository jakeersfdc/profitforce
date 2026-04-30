import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPositions, dailyPnL } from "@/lib/oms/PositionTracker";
import { withOms } from "@/lib/oms/withOms";

export const dynamic = "force-dynamic";

const EMPTY = { positions: [], pnl: { realized: 0, unrealized: 0, total: 0 } };

export const GET = withOms(async () => {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized", ...EMPTY }, { status: 401 });
  const [positions, pnl] = await Promise.all([
    getPositions(userId),
    dailyPnL(userId),
  ]);
  return NextResponse.json({ positions, pnl });
});
