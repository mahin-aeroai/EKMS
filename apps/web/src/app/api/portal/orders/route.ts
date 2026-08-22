import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Places a new portal order: validates the product/store/quantity server
// side (never trusts a client-supplied price), snapshots the product's
// current price/name/preview image onto the line item so order history
// stays accurate even after the catalog changes later, and inserts both
// portal_orders and portal_order_items rows as the caller's own session —
// RLS (portal_orders_insert_customer / portal_order_items_insert_customer)
// still does the real enforcement of "only for your own company/store,
// only starting in 'submitted'"; this route's job is the arithmetic and
// doing both inserts as one request instead of two round trips the
// browser could interleave with something else.
//
// POST /api/portal/orders
// Body: { store_id: string, notes?: string, items: { product_id: string, quantity: number }[] }

interface OrderItemInput {
  product_id?: string;
  quantity?: number;
}

export async function POST(request: Request) {
  let body: { store_id?: string; notes?: string; items?: OrderItemInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const storeId = body.store_id;
  const items = body.items;
  if (!storeId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "missing_fields", message: "store_id and at least one item are required" }, { status: 400 });
  }
  for (const item of items) {
    if (!item.product_id || !Number.isInteger(item.quantity) || (item.quantity ?? 0) < 1) {
      return NextResponse.json({ error: "invalid_item", message: "each item needs product_id and a positive integer quantity" }, { status: 400 });
    }
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: portalUser, error: portalUserErr } = await supabase
    .from("portal_users")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (portalUserErr || !portalUser) {
    return NextResponse.json({ error: "forbidden", message: "This account isn't a customer-portal user." }, { status: 403 });
  }

  const { data: store, error: storeErr } = await supabase
    .from("portal_company_stores")
    .select("id, company_id, address, gstin")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr || !store || store.company_id !== portalUser.company_id) {
    return NextResponse.json({ error: "invalid_store" }, { status: 400 });
  }
  // Enforced here, not just in the store picker's own filtering client-side
  // — a store missing either field must never end up on an order, and the
  // UI check alone isn't load-bearing (see NewOrderForm's comment on why).
  if (!store.address?.trim() || !store.gstin?.trim()) {
    return NextResponse.json(
      {
        error: "store_incomplete",
        message: "This store is missing a delivery address or GSTN — ask MMDI to add it before ordering for this location.",
      },
      { status: 400 }
    );
  }

  const productIds = [...new Set(items.map((i) => i.product_id as string))];
  const { data: products, error: productsErr } = await supabase
    .from("portal_products")
    .select("id, code, name, unit_price, gst_percent, preview_image_path, active")
    .in("id", productIds);
  if (productsErr) {
    return NextResponse.json({ error: "lookup_failed", message: productsErr.message }, { status: 500 });
  }
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  for (const id of productIds) {
    const product = productMap.get(id);
    if (!product || !product.active) {
      return NextResponse.json({ error: "invalid_product", message: `Product ${id} isn't available.` }, { status: 400 });
    }
  }

  let subtotal = 0;
  let gstAmount = 0;
  const lineItems = items.map((item) => {
    const product = productMap.get(item.product_id as string)!;
    const quantity = item.quantity as number;
    const lineSubtotal = product.unit_price * quantity;
    const lineGst = Math.round(lineSubtotal * (product.gst_percent / 100) * 100) / 100;
    const lineTotal = lineSubtotal + lineGst;
    subtotal += lineSubtotal;
    gstAmount += lineGst;
    return {
      product_id: product.id,
      product_code: product.code,
      product_name: product.name,
      unit_price: product.unit_price,
      gst_percent: product.gst_percent,
      preview_image_path: product.preview_image_path,
      quantity,
      line_subtotal: lineSubtotal,
      line_gst_amount: lineGst,
      line_total: lineTotal,
    };
  });
  const totalAmount = subtotal + gstAmount;

  const { data: order, error: orderErr } = await supabase
    .from("portal_orders")
    .insert({
      company_id: portalUser.company_id,
      store_id: storeId,
      created_by: user.id,
      notes: body.notes ?? null,
      subtotal,
      gst_amount: gstAmount,
      total_amount: totalAmount,
    })
    .select("id, order_no")
    .single();
  if (orderErr) {
    return NextResponse.json({ error: "insert_failed", message: orderErr.message }, { status: 500 });
  }

  // .select() (not just .insert()) so the response carries each inserted
  // row's real id — NewOrderForm needs these to attach each item's
  // mandatory design PDF to the correct line item (order_item_id), and
  // Postgres/PostgREST returns a multi-row insert's rows in the same order
  // they were given, so matching by array index (not by product_id, which
  // isn't unique when the same product appears twice in one order) is safe.
  const { data: insertedItems, error: itemsErr } = await supabase
    .from("portal_order_items")
    .insert(lineItems.map((li) => ({ ...li, order_id: order.id })))
    .select("id, product_id");
  if (itemsErr) {
    // Best-effort cleanup so a failed item insert doesn't leave an empty
    // order behind — the customer's own RLS covers deleting their own
    // still-'submitted' order (no explicit delete policy needed beyond
    // admin's, so this only succeeds if a customer-delete policy is added
    // later; harmless no-op today, order just stays empty and visible to
    // staff to clean up).
    return NextResponse.json({ error: "items_insert_failed", message: itemsErr.message, order_id: order.id }, { status: 500 });
  }

  return NextResponse.json({
    id: order.id,
    order_no: order.order_no,
    total_amount: totalAmount,
    items: insertedItems ?? [],
  });
}
