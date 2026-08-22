import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Staff-only operational status moves: approved+paid -> in_production ->
// completed, or -> cancelled from most states. Deliberately separate from
// the customer's approve/request-revision routes above (different actor,
// different legal transitions) rather than one shared "set status" route
// that would have to re-derive who's allowed to do what.
//
// POST /api/portal/orders/[orderId]/status
// Body: { status: "in_production" | "completed" | "cancelled", admin_notes?: string }

const STAFF_SETTABLE = new Set(["in_production", "completed", "cancelled"]);

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  let body: { status?: string; admin_notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.status || !STAFF_SETTABLE.has(body.status)) {
    return NextResponse.json({ error: "invalid_status", message: `status must be one of: ${[...STAFF_SETTABLE].join(", ")}` }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: order, error: orderErr } = await supabase
    .from("portal_orders")
    .select("id, status, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (body.status === "in_production" && (order.status !== "approved" || order.payment_status !== "paid")) {
    return NextResponse.json({ error: "not_ready", message: "Order must be approved and paid before starting production." }, { status: 409 });
  }
  if (body.status === "completed" && order.status !== "in_production") {
    return NextResponse.json({ error: "not_ready", message: "Order must be in production before it can be marked completed." }, { status: 409 });
  }

  const update: { status: string; admin_notes?: string } = { status: body.status };
  if (body.admin_notes !== undefined) update.admin_notes = body.admin_notes;

  const { error: updateErr } = await supabase.from("portal_orders").update(update).eq("id", orderId);
  if (updateErr) {
    return NextResponse.json({ error: "update_failed", message: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
