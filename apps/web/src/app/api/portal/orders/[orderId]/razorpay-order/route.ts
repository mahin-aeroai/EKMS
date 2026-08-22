import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Creates a Razorpay Order for an approved-but-unpaid portal order, and
// returns just enough for the browser to open Razorpay's Checkout widget.
// Runs as the caller's own session (createRouteSupabaseClient) — no
// service-role key needed here, unlike the webhook/verify routes, because
// every check below is a normal RLS-backed read/write as the customer who
// owns this order (see portal_orders_update_customer's WITH CHECK in
// supabase-customer-portal-schema.sql: it explicitly allows a customer to
// touch their own 'approved'+'unpaid' order and explicitly forbids them
// from writing payment_status themselves — this route only ever sets
// razorpay_order_id, never payment_status).
//
// POST /api/portal/orders/[orderId]/razorpay-order

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json(
      { error: "not_configured", message: "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const { orderId } = await params;

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: order, error: orderErr } = await supabase
    .from("portal_orders")
    .select("id, order_no, status, payment_status, total_amount, razorpay_order_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (order.status !== "approved" || order.payment_status !== "unpaid") {
    return NextResponse.json(
      { error: "not_payable", message: "This order isn't in an approved, unpaid state." },
      { status: 409 }
    );
  }

  // Re-use the existing Razorpay order if checkout was opened before but
  // never completed, instead of creating a duplicate on every retry.
  if (order.razorpay_order_id) {
    return NextResponse.json({
      key_id: process.env.RAZORPAY_KEY_ID,
      razorpay_order_id: order.razorpay_order_id,
      amount: Math.round(order.total_amount * 100),
      currency: "INR",
      order_no: order.order_no,
    });
  }

  const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });

  const amountPaise = Math.round(order.total_amount * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }

  let razorpayOrder;
  try {
    razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: order.order_no,
      notes: { portal_order_id: order.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "razorpay_error", message }, { status: 502 });
  }

  const { error: updateErr } = await supabase
    .from("portal_orders")
    .update({ razorpay_order_id: razorpayOrder.id })
    .eq("id", orderId);
  if (updateErr) {
    return NextResponse.json({ error: "save_failed", message: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    key_id: process.env.RAZORPAY_KEY_ID,
    razorpay_order_id: razorpayOrder.id,
    amount: amountPaise,
    currency: "INR",
    order_no: order.order_no,
  });
}
