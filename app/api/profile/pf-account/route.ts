import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPFAccount, resetPFAccount } from "@/lib/profitforceAccount";

// GET → full account state (funds, positions, recent orders)
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const acct = await getPFAccount(userId);
  return NextResponse.json(acct);
}

// DELETE → reset to default (₹10L cash, no positions, no orders)
export async function DELETE(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const acct = await resetPFAccount(userId);
  return NextResponse.json({ ok: true, account: acct });
}
