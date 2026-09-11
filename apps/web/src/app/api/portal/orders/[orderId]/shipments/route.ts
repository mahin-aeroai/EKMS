import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Staff-only: record a courier dispatch against a paid portal order.
// POST /api/portal/orders/[orderId]/shipments
// Body: { courier, awb_number, dispatch_date, expected_delivery_date,
//         number_of_packages, package_details, internal_remarks }
//
// Row-ownership of the order is checked here (not left to RLS alone,
// since we also want the "must be paid" business rule enforced before a
// shipment can exist at all) -- mirrors track/route.ts's own auth
// sequencing for the LFG equivalent of this route.
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  let body: {
    courier?: string;
    awb_number?: string;
    dispatch_date?: string;
    expected_delivery_date?: string;
    number_of_packages?: number;
    package_details?: string;
    internal_remarks?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: order } = await supabase.from("portal_orders").select("id, payment_status").eq("id", orderId).maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // "after receipt of the order with payment we go and add shipping
  // details" -- Mahin's own description of the workflow.
  if (order.payment_status !== "paid") {
    return NextResponse.json(
      { error: "not_paid", message: "This order hasn't been paid yet — shipping details can only be added once payment is received." },
      { status: 409 }
    );
  }

  const { data: shipment, error: insertErr } = await supabase
    .from("portal_order_shipments")
    .insert({
      order_id: orderId,
      courier: body.courier || null,
      awb_number: body.awb_number || null,
      dispatch_date: body.dispatch_date || null,
      expected_delivery_date: body.expected_delivery_date || null,
      number_of_packages: body.number_of_packages ?? null,
      package_details: body.package_details || null,
      internal_remarks: body.internal_remarks || null,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (insertErr || !shipment) {
    return NextResponse.json({ error: "insert_failed", message: insertErr?.message }, { status: 500 });
  }

  return NextResponse.json({ shipment });
}
