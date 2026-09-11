import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { trackAwb, mapBlueDartStatusToLfg } from "@/lib/blueDart";

export const dynamic = "force-dynamic";

// Live Blue Dart tracking bridge for a portal order's shipment -- staff
// OR the order's own company's portal customer (task feedback: customers
// had no way to pull a fresh status themselves). Mirrors LFG Connect's own
// precedent exactly -- lfg_shipments_write already grants a partner full
// write access to their own site's shipments -- via
// supabase-portal-shipment-tracking-customer-migration.sql's matching RLS
// grant, rather than a service-role bypass (see supabase-admin.ts's own
// header comment on why that's reserved for requests with no real user
// session, which this has). Also deliberately mirrors LFG's
// shipments/[shipmentId]/track/route.ts almost line-for-line otherwise --
// same trackAwb()/mapBlueDartStatusToLfg() functions, same event-log
// shape, so there's exactly one Blue Dart integration in this codebase,
// not two.
//
// POST /api/portal/shipments/[shipmentId]/track
export async function POST(request: Request, { params }: { params: Promise<{ shipmentId: string }> }) {
  const { shipmentId } = await params;

  if (!process.env.BLUEDART_CONSUMER_KEY || !process.env.BLUEDART_CONSUMER_SECRET || !process.env.BLUEDART_LOGIN_ID || !process.env.BLUEDART_LICENSE_KEY) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "BLUEDART_CONSUMER_KEY / BLUEDART_CONSUMER_SECRET / BLUEDART_LOGIN_ID / BLUEDART_LICENSE_KEY must be set as Vercel environment variables.",
      },
      { status: 503 }
    );
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: shipment } = await supabase
    .from("portal_order_shipments")
    .select("id, awb_number, order_id")
    .eq("id", shipmentId)
    .maybeSingle();
  if (!shipment) {
    return NextResponse.json({ error: "shipment_not_found" }, { status: 404 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaffWriter = profile?.role === "admin" || profile?.role === "editor";
  if (!isStaffWriter) {
    // Mirrors LFG Connect's own site.partner_id === partnerUser.partner_id
    // check for the same route.
    const { data: order } = await supabase.from("portal_orders").select("company_id").eq("id", shipment.order_id).maybeSingle();
    const { data: portalUser } = await supabase.from("portal_users").select("company_id").eq("id", user.id).maybeSingle();
    if (!order || !portalUser || order.company_id !== portalUser.company_id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  if (!shipment.awb_number) {
    return NextResponse.json({ error: "no_awb", message: "This shipment has no AWB number set yet." }, { status: 400 });
  }

  let result;
  try {
    result = await trackAwb(shipment.awb_number);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "bluedart_error", message }, { status: 502 });
  }
  const { events, currentStatus, currentStatusTime, currentLocation, expectedDeliveryDate } = result;

  // 11 Sept 2026: task feedback -- "it si still nor showing actual
  // tracking on bluedart website it is in transit but it is stuck at
  // creared." Root cause, found by inspection (not guessed): neither
  // write below ever checked for an error, and Supabase/PostgREST
  // returns 200 with zero rows AFFECTED (no thrown error) when an
  // authenticated write is silently blocked by RLS -- so if this
  // customer's session somehow didn't satisfy
  // portal_order_shipments_update_customer's own-company check, the
  // shipment's current_status would stay at whatever it already was
  // (the 'shipment_created' default, since it may never have been
  // written successfully even once) with NO error surfaced anywhere --
  // exactly this symptom. Both writes now check their own error, and the
  // status update additionally re-selects the row it just touched so a
  // silent 0-rows-affected RLS block (no thrown error, just nothing
  // returned) is caught too, not just a hard Postgres error.
  let warning: string | null = null;

  if (events.length > 0) {
    const { error: eventsError } = await supabase.from("portal_shipment_events").insert(
      events.map((ev) => ({
        shipment_id: shipmentId,
        event_status: ev.status,
        location: ev.location,
        event_time: ev.time,
        source: "api" as const,
        raw_payload: ev.raw,
        created_by: user.id,
      }))
    );
    if (eventsError) {
      warning = `Blue Dart responded, but the scan history couldn't be saved: ${eventsError.message}`;
    }
  }

  const latest = events[events.length - 1];
  const statusSource = currentStatus ?? latest?.status;
  if (statusSource || currentLocation || expectedDeliveryDate) {
    const update: Record<string, unknown> = {
      last_tracked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (statusSource) {
      const mappedStatus = mapBlueDartStatusToLfg(statusSource);
      update.current_status = mappedStatus;
      if (mappedStatus === "delivered") {
        update.delivery_date = (currentStatusTime ?? latest?.time)?.slice(0, 10);
      }
    }
    if (currentLocation) update.current_location = currentLocation;
    if (expectedDeliveryDate) update.expected_delivery_date = expectedDeliveryDate;

    const { data: updatedRow, error: updateError } = await supabase
      .from("portal_order_shipments")
      .update(update)
      .eq("id", shipmentId)
      .select("id")
      .maybeSingle();
    if (updateError) {
      warning = `Blue Dart says "${statusSource}", but saving it failed: ${updateError.message}`;
    } else if (!updatedRow) {
      warning = `Blue Dart says "${statusSource}", but this account doesn't have permission to save it on this shipment.`;
    }
  }

  const { data: refreshed } = await supabase
    .from("portal_shipment_events")
    .select("*")
    .eq("shipment_id", shipmentId)
    .order("event_time", { ascending: false });

  const { data: shipmentNow } = await supabase
    .from("portal_order_shipments")
    .select("*")
    .eq("id", shipmentId)
    .maybeSingle();

  return NextResponse.json({ events: refreshed ?? [], shipment: shipmentNow ?? null, warning });
}
