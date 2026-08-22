import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Customer decision: approve the current design proof. RLS
// (portal_orders_update_customer) already restricts this to the caller's
// own order and to a legal status transition ('proof_uploaded' or
// 'revision_requested' -> 'approved'/'revision_requested'); this route
// adds the one thing RLS can't express — that an "approve" specifically
// requires the order to currently be awaiting a decision at all, and logs
// the decision into portal_order_approvals against the exact revision
// being approved.
//
// POST /api/portal/orders/[orderId]/approve

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: order, error: orderErr } = await supabase
    .from("portal_orders")
    .select("id, status, current_revision_number")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (order.status !== "proof_uploaded" && order.status !== "revision_requested") {
    return NextResponse.json({ error: "not_awaiting_decision", message: "This order has no design proof currently awaiting your decision." }, { status: 409 });
  }

  const { error: updateErr } = await supabase.from("portal_orders").update({ status: "approved" }).eq("id", orderId);
  if (updateErr) {
    return NextResponse.json({ error: "update_failed", message: updateErr.message }, { status: 500 });
  }

  const { error: logErr } = await supabase.from("portal_order_approvals").insert({
    order_id: orderId,
    revision_number: order.current_revision_number,
    decision: "approved",
    decided_by: user.id,
  });
  if (logErr) {
    return NextResponse.json({ error: "log_failed", message: logErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
