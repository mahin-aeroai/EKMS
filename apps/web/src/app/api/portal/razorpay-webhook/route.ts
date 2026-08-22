import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { verifyWebhookSignature, markOrderPaid } from "@/lib/portal-payments";

export const dynamic = "force-dynamic";

// Razorpay calls this directly from its own servers — there is no browser
// session, no cookie, nothing @supabase/ssr can resolve a user from, so
// this is one of exactly two routes in this app that uses the
// service-role client (see supabase-admin.ts's header comment for the
// other, and for why that's safe here specifically).
//
// This is the DURABLE confirmation path: razorpay-verify (the browser's
// Checkout.js success callback) usually lands first, but if the customer's
// tab closes or their connection drops between "payment succeeded" and
// that callback firing, this webhook is what actually marks the order
// paid. markOrderPaid is idempotent, so it's harmless if both fire.
//
// Setup (see OPERATIONS.md): Razorpay dashboard -> Settings -> Webhooks ->
// add https://app.mmdi.in/api/portal/razorpay-webhook, subscribe to
// "payment.captured", set a webhook secret, put that secret in Vercel as
// RAZORPAY_WEBHOOK_SECRET.
//
// POST /api/portal/razorpay-webhook

export async function POST(request: Request) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  // Must verify against the exact raw bytes, not a re-serialized JSON
  // object — re-serializing can reorder keys or alter whitespace and
  // silently break the signature check.
  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let payload: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Only payment.captured actually means "money received" — order.paid
  // fires around the same event but payment.captured is Razorpay's own
  // documented signal for a successfully captured payment. Any other
  // event (refund, failure, etc.) is acknowledged with 200 so Razorpay
  // doesn't keep retrying, but does nothing here — refunds/failures are
  // handled as a manual admin action for now (see PROJECT_STATUS.md gap).
  if (payload.event !== "payment.captured") {
    return NextResponse.json({ ok: true, skipped: payload.event ?? "unknown" });
  }

  const entity = payload.payload?.payment?.entity;
  const razorpayOrderId = entity?.order_id;
  const razorpayPaymentId = entity?.id;
  if (!razorpayOrderId || !razorpayPaymentId) {
    return NextResponse.json({ error: "malformed_payload" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json({ error: "not_configured", message: "SUPABASE_SERVICE_ROLE_KEY must be set." }, { status: 503 });
  }

  const { error } = await markOrderPaid(admin, razorpayOrderId, razorpayPaymentId);
  if (error) {
    // 500 so Razorpay retries the webhook later rather than treating this as final.
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
