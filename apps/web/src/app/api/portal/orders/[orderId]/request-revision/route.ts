import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Customer decision: ask MMDI for a revision instead of approving.
// A comment explaining what needs to change is required — an empty
// "revision requested" with nothing else is exactly the kind of message
// that sends this order in a circle without MMDI knowing what to fix.
//
// POST /api/portal/orders/[orderId]/request-revision
// Body: { comment: string }

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  let body: { comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const comment = body.comment?.trim();
  if (!comment) {
    return NextResponse.json({ error: "missing_comment", message: "Describe what needs to change." }, { status: 400 });
  }

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

  const { error: updateErr } = await supabase.from("portal_orders").update({ status: "revision_requested" }).eq("id", orderId);
  if (updateErr) {
    return NextResponse.json({ error: "update_failed", message: updateErr.message }, { status: 500 });
  }

  const { error: logErr } = await supabase.from("portal_order_approvals").insert({
    order_id: orderId,
    revision_number: order.current_revision_number,
    decision: "revision_requested",
    comment,
    decided_by: user.id,
  });
  if (logErr) {
    return NextResponse.json({ error: "log_failed", message: logErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
