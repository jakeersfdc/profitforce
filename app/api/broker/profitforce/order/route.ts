import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { placePFOrder, placePFPendingOrder, cancelPFPendingOrder } from "@/lib/profitforceAccount";
import { fetchQuote } from "@/lib/stockUtils";

export const dynamic = "force-dynamic";

// POST → place an order (market | limit | stop | stoplimit, optional bracket SL/target)
//
// Body:
// {
//   symbol: string,
//   qty: number,
//   side: "BUY" | "SELL",
//   type: "market" | "limit" | "stop" | "stoplimit",   // default "market"
//   limitPrice?: number,
//   stopPrice?: number,
//   price?: number,                                     // optional client hint for market fills
//   bracket?: { sl?: number; target?: number }          // only for BUY market/limit
// }
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { symbol, qty, side, type = "market", limitPrice, stopPrice, price, bracket } = body ?? {};

  if (!symbol || !qty || !side) {
    return NextResponse.json({ error: "symbol, qty, side are required" }, { status: 400 });
  }

  const cleanSide: "BUY" | "SELL" = String(side).toUpperCase() === "SELL" ? "SELL" : "BUY";
  const cleanQty = Math.abs(Number(qty) || 0);
  if (cleanQty <= 0) return NextResponse.json({ error: "qty must be > 0" }, { status: 400 });

  // MARKET → fill immediately at live LTP (with client-hint fallback)
  if (type === "market") {
    let fill = Number(price);
    try {
      const q = await fetchQuote(String(symbol));
      if (q?.price > 0) fill = q.price;
    } catch {}
    if (!Number.isFinite(fill) || fill <= 0) {
      return NextResponse.json({ error: "Could not fetch live price" }, { status: 503 });
    }

    const res = await placePFOrder(userId, { symbol, qty: cleanQty, side: cleanSide, price: fill, type: "market" });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.order.reason ?? "Rejected", order: res.order }, { status: 400 });

    // If BUY with bracket SL/target, queue pending children
    if (cleanSide === "BUY" && bracket && (bracket.sl || bracket.target)) {
      if (bracket.sl && Number(bracket.sl) > 0) {
        await placePFPendingOrder(userId, {
          symbol, qty: cleanQty, side: "SELL", type: "stop", stopPrice: Number(bracket.sl),
          bracket: { sl: Number(bracket.sl), target: bracket.target ? Number(bracket.target) : undefined },
          clientOrderId: `${res.order.id}_sl`,
        });
      }
      if (bracket.target && Number(bracket.target) > 0) {
        await placePFPendingOrder(userId, {
          symbol, qty: cleanQty, side: "SELL", type: "limit", limitPrice: Number(bracket.target),
          bracket: { target: Number(bracket.target), sl: bracket.sl ? Number(bracket.sl) : undefined },
          clientOrderId: `${res.order.id}_tp`,
        });
      }
    }

    return NextResponse.json({ ok: true, order: res.order, account: res.account });
  }

  // LIMIT / STOP / STOPLIMIT → queue as pending
  const res = await placePFPendingOrder(userId, {
    symbol, qty: cleanQty, side: cleanSide, type,
    limitPrice: limitPrice ? Number(limitPrice) : undefined,
    stopPrice: stopPrice ? Number(stopPrice) : undefined,
    bracket: bracket ? { sl: bracket.sl ? Number(bracket.sl) : undefined, target: bracket.target ? Number(bracket.target) : undefined } : undefined,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.reason, order: res.order }, { status: 400 });
  return NextResponse.json({ ok: true, order: res.order, account: res.account });
}

// DELETE /api/broker/profitforce/order?id=xxx → cancel a pending order
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const res = await cancelPFPendingOrder(userId, id);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 404 });
  return NextResponse.json({ ok: true, account: res.account });
}
