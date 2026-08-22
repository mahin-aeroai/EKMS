import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Staff action: after uploading a design-proof file to R2 (via
// .../files/upload-url with kind="proof"), this records that file against
// the order AND moves the order into 'proof_uploaded' with the revision
// number bumped, as one request — doing this as two separate client-side
// writes (insert file row, then update order) risks the order's
// current_revision_number and the file's own revision_number drifting
// apart if one succeeds and the other doesn't.
//
// POST /api/portal/orders/[orderId]/publish-proof
// Body: { relative_path: string, file_name: string, file_size?: number }

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  let body: { relative_path?: string; file_name?: string; file_size?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.relative_path || !body.file_name) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
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
    .select("id, current_revision_number, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (order.status === "in_production" || order.status === "completed" || order.status === "cancelled") {
    return NextResponse.json({ error: "wrong_state", message: `Can't upload a new proof once an order is ${order.status}.` }, { status: 409 });
  }

  const nextRevision = order.current_revision_number + 1;

  const { error: fileErr } = await supabase.from("portal_order_files").insert({
    order_id: orderId,
    uploaded_by_role: "staff",
    uploaded_by: user.id,
    relative_path: body.relative_path,
    file_name: body.file_name,
    file_size: body.file_size ?? null,
    kind: "proof",
    revision_number: nextRevision,
  });
  if (fileErr) {
    return NextResponse.json({ error: "file_insert_failed", message: fileErr.message }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("portal_orders")
    .update({ status: "proof_uploaded", current_revision_number: nextRevision })
    .eq("id", orderId);
  if (updateErr) {
    return NextResponse.json({ error: "update_failed", message: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, revision_number: nextRevision });
}
