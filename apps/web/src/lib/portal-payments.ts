import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared Razorpay signature/payment-marking logic used by both
 * /api/portal/orders/[orderId]/razorpay-verify (the browser's Checkout.js
 * success callback — fires immediately, before the webhook necessarily
 * has) and /api/portal/razorpay-webhook (Razorpay's own server calling
 * back — the durable source of truth if the browser closes mid-flow).
 * Both routes independently verify a real Razorpay-issued HMAC before
 * calling markOrderPaid, so trusting either one here is equivalent —
 * neither is "trusting the client," both are verifying a signature only
 * Razorpay (holder of the secret) could have produced.
 */

function timingSafeEqualStrings(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Checkout.js success payload: HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret). */
export function verifyPaymentSignature(razorpayOrderId: string, razorpayPaymentId: string, signature: string, keySecret: string) {
  const expected = createHmac("sha256", keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
  return timingSafeEqualStrings(expected, signature);
}

/** Webhook payload: HMAC-SHA256(raw request body, webhook secret) in the X-Razorpay-Signature header. */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string) {
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return timingSafeEqualStrings(expected, signature);
}

/**
 * Marks every order sharing this razorpay_order_id paid — idempotent (a
 * second call for the same razorpay_order_id, whether from the verify
 * route firing then the webhook firing too, or the webhook retrying, is a
 * harmless no-op once payment_status is already 'paid'). Only updates rows
 * that are still 'unpaid' and whose razorpay_order_id matches, so a
 * stray/forged payment_id can't be pinned onto an unrelated order.
 *
 * Returns an ARRAY, not a single row: a multi-store checkout (see
 * razorpay-combined-order/route.ts) pays for several sibling portal_orders
 * — one per store — with ONE Razorpay order, by writing the same
 * razorpay_order_id onto all of them. This one update call is what marks
 * all of them paid together; a single-order checkout just happens to
 * produce a one-element array.
 */
export async function markOrderPaid(admin: SupabaseClient, razorpayOrderId: string, razorpayPaymentId: string) {
  return admin
    .from("portal_orders")
    .update({ payment_status: "paid", razorpay_payment_id: razorpayPaymentId, paid_at: new Date().toISOString() })
    .eq("razorpay_order_id", razorpayOrderId)
    .eq("payment_status", "unpaid")
    .select("id, order_no, company_id");
}
