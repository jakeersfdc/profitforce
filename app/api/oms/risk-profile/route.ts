import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRiskProfile, setRiskProfile } from "@/lib/risk/RiskEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await getRiskProfile(userId);
  return NextResponse.json({ profile });
}

export async function PUT(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<Awaited<ReturnType<typeof getRiskProfile>>>;
  const updated = await setRiskProfile(userId, body);
  return NextResponse.json({ profile: updated });
}
