import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Customer "Cancel" on an order still sitting in their Cart -- a genuine
// DELETE, not a status flag. An order is only ever unfinished (a "cart"
// item, in the sense the portal's cart icon should actually mean) while
// it's unpaid: payment happens at checkout, before design-approval/
// production starts, so once payment_status flips to 'paid' the order is
// real and must never be deletable by the customer again. Runs as the
// caller's own session (createRouteSupabaseClient) -- portal_orders_
// delete_customer in supabase-customer-portal-schema.sql is the real
// gate (company ownership + payment_status = 'unpaid'); the checks below
// just turn "RLS silently deleted 0 rows" into an actual error message
// instead of a misleading 200.
//
// portal_order_items / portal_order_files rows for this order are removed
// automatically (existing "on delete cascade" FKs) -- see that migration's
// comment. The underlying R2 file objects for any already-uploaded design
// PDFs are NOT deleted here; nothing in this app deletes R2 objects on any
// delete path today (same as admin's product/store/order deletes), so this
// stays consistent with that existing, accepted behavior rather than
// introducing R2 cleanup on just this one path.
//
// DELETE /api/portal/orders/[orderId]

export async function DELETE(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: order, error: orderErr } = await supabase
    .from("portal_orders")
    .select("id, order_no, payment_status, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (order.payment_status !== "unpaid" || ["in_production", "completed", "cancelled"].includes(order.status)) {
    return NextResponse.json(
      { error: "not_cancellable", message: "This order is already paid or in progress and can't be cancelled from here — contact MMDI." },
      { status: 409 }
    );
  }

  const { error: deleteErr } = await supabase.from("portal_orders").delete().eq("id", orderId);
  if (deleteErr) {
    return NextResponse.json({ error: "delete_failed", message: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
