import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Creates ONE Razorpay Order covering several sibling portal_orders at
// once — the multi-store-cart checkout in NewOrderForm creates one
// portal_orders row per store (each store still gets its own design
// proof/approval/production tracking, unchanged), but the customer pays
// for the whole cart in a single Razorpay Checkout popup rather than one
// popup per store. Every order in the batch gets the SAME
// razorpay_order_id written onto it; markOrderPaid (portal-payments.ts)
// already updates every row sharing a razorpay_order_id, so the existing
// single-order razorpay-verify route — called once, with any one of these
// orders' id — marks all of them paid together. No separate "combined
// verify" route needed.
//
// Runs as the caller's own session, same as razorpay-order/route.ts — RLS
// (portal_orders_update_customer) is what actually enforces "only your own
// company's orders, only while unpaid".
//
// POST /api/portal/orders/razorpay-combined-order
// Body: { order_ids: string[] }

export async function POST(request: Request) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json(
      { error: "not_configured", message: "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  let body: { order_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const orderIds = [...new Set(body.order_ids ?? [])];
  if (orderIds.length === 0) {
    return NextResponse.json({ error: "missing_order_ids" }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: orders, error: ordersErr } = await supabase
    .from("portal_orders")
    .select("id, order_no, status, payment_status, total_amount, razorpay_order_id")
    .in("id", orderIds);
  if (ordersErr) {
    return NextResponse.json({ error: "lookup_failed", message: ordersErr.message }, { status: 500 });
  }
  // RLS already scopes the select above to the caller's own company — a
  // shorter result than requested means at least one id wasn't theirs (or
  // doesn't exist), either way this whole checkout can't proceed.
  if (!orders || orders.length !== orderIds.length) {
    return NextResponse.json({ error: "not_found", message: "One or more orders in this checkout couldn't be found." }, { status: 404 });
  }
  const unpayable = orders.find((o) => o.payment_status !== "unpaid" || o.status === "cancelled");
  if (unpayable) {
    return NextResponse.json(
      { error: "not_payable", message: `Order ${unpayable.order_no} isn't payable — it's already paid or has been cancelled.` },
      { status: 409 }
    );
  }

  const totalPaise = Math.round(orders.reduce((sum, o) => sum + o.total_amount, 0) * 100);
  if (!Number.isFinite(totalPaise) || totalPaise <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  // Reuse the existing Razorpay order only if every order in THIS batch
  // already carries the exact same one (a retry after the popup was
  // closed without completing payment) — anything less than full agreement
  // (a partial retry, or a cart whose composition changed since) just
  // creates a fresh one and overwrites razorpay_order_id on all of them,
  // same as the single-order route's own retry behavior.
  const sharedExistingId = orders[0].razorpay_order_id;
  const allShareIt = sharedExistingId && orders.every((o) => o.razorpay_order_id === sharedExistingId);

  let razorpayOrderId: string;
  if (allShareIt) {
    razorpayOrderId = sharedExistingId!;
  } else {
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: totalPaise,
        currency: "INR",
        // Razorpay's receipt field is capped at 40 characters — a batch of
        // order numbers can easily exceed that, so this is a best-effort
        // human-readable label, not a lookup key. notes.portal_order_ids
        // below is the real cross-reference.
        receipt: orders.map((o) => o.order_no).join(",").slice(0, 40),
        notes: { portal_order_ids: orders.map((o) => o.id).join(",") },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: "razorpay_error", message }, { status: 502 });
    }
    razorpayOrderId = razorpayOrder.id;

    const { error: updateErr } = await supabase
      .from("portal_orders")
      .update({ razorpay_order_id: razorpayOrderId })
      .in("id", orderIds);
    if (updateErr) {
      return NextResponse.json({ error: "save_failed", message: updateErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    key_id: process.env.RAZORPAY_KEY_ID,
    razorpay_order_id: razorpayOrderId,
    amount: totalPaise,
    currency: "INR",
    order_ids: orders.map((o) => o.id),
    order_nos: orders.map((o) => o.order_no),
  });
}
