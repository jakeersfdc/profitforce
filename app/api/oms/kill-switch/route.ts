/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { setKillSwitch } from "@/lib/risk/RiskEngine";
import { q } from "@/lib/oms/db";
import { withOms } from "@/lib/oms/withOms";

export const dynamic = "force-dynamic";

export const GET = withOms(async () => {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized", switches: [] }, { status: 401 });
  const res = await q<{ id: number; clerk_id: string | null; enabled: boolean; reason: string | null; enabled_at: Date | null }>(
    `SELECT id, clerk_id, enabled, reason, enabled_at FROM oms_kill_switch WHERE id = 0 OR clerk_id = $1`,
    [userId]
  );
  return NextResponse.json({ switches: res.rows });
});

export const POST = withOms(async (req: Request) => {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as any;
  const enabled = !!body.enabled;
  const scope = body.scope === "global" ? "global" : "user";
  if (scope === "global") {
    const admins = (process.env.ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!admins.includes(userId)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }
  await setKillSwitch({
    enabled,
    clerkId: scope === "global" ? null : userId,
    reason: body.reason ? String(body.reason) : undefined,
    enabledBy: userId,
  });
  return NextResponse.json({ ok: true, enabled, scope });
});
