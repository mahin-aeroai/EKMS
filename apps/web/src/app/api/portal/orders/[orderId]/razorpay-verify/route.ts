import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { verifyPaymentSignature, markOrderPaid } from "@/lib/portal-payments";

export const dynamic = "force-dynamic";

// Called by the browser the instant Razorpay's Checkout widget reports
// success (its `handler` callback) — marks the order paid immediately
// rather than waiting on the webhook, which can lag by several seconds.
// The webhook (razorpay-webhook/route.ts) still runs independently and is
// the durable fallback if the browser tab closes before this fires;
// markOrderPaid is idempotent so whichever of the two lands first wins and
// the second is a harmless no-op.
//
// Trusting this route is NOT "trusting the client" — verifyPaymentSignature
// recomputes the HMAC Razorpay itself would have produced using
// RAZORPAY_KEY_SECRET (never sent to the browser); only someone holding
// that secret could produce a signature that passes. Still requires a
// signed-in session (the order's own owner or staff) on top of that, same
// as every other route here.
//
// POST /api/portal/orders/[orderId]/razorpay-verify
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { orderId } = await params;

  let body: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: signature } = body;
  if (!razorpayOrderId || !razorpayPaymentId || !signature) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  // Confirm this razorpay_order_id actually belongs to the order the
  // caller is allowed to see (RLS-scoped read) before trusting anything.
  const { data: order, error: orderErr } = await supabase
    .from("portal_orders")
    .select("id, razorpay_order_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order || order.razorpay_order_id !== razorpayOrderId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature, process.env.RAZORPAY_KEY_SECRET)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json({ error: "not_configured", message: "SUPABASE_SERVICE_ROLE_KEY must be set." }, { status: 503 });
  }

  const { data: updated, error: updateErr } = await markOrderPaid(admin, razorpayOrderId, razorpayPaymentId);
  if (updateErr) {
    return NextResponse.json({ error: "update_failed", message: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, order: updated });
}
