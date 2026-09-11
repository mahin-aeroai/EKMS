import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { trackAwb, mapBlueDartStatusToLfg } from "@/lib/blueDart";

export const dynamic = "force-dynamic";

// Live Blue Dart tracking bridge for a portal order's shipment -- staff
// only (the customer sees the resulting timeline read-only on their order
// page, same as LFG's shipments/[shipmentId]/track/route.ts, which this
// deliberately mirrors almost line-for-line: same trackAwb()/
// mapBlueDartStatusToLfg() functions, same event-log shape, so there's
// exactly one Blue Dart integration in this codebase, not two).
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

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: shipment } = await supabase
    .from("portal_order_shipments")
    .select("id, awb_number")
    .eq("id", shipmentId)
    .maybeSingle();
  if (!shipment) {
    return NextResponse.json({ error: "shipment_not_found" }, { status: 404 });
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

  if (events.length > 0) {
    await supabase.from("portal_shipment_events").insert(
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

    await supabase.from("portal_order_shipments").update(update).eq("id", shipmentId);
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

  return NextResponse.json({ events: refreshed ?? [], shipment: shipmentNow ?? null });
}
