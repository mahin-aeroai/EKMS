import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { trackAwb, mapBlueDartStatusToLfg } from "@/lib/blueDart";

export const dynamic = "force-dynamic";

// Live Blue Dart tracking bridge -- POST /api/lfg/shipments/[shipmentId]/track
//
// No RLS/schema change needed for the writes this makes: lfg_shipments_write
// and lfg_shipment_events_insert already grant staff or the shipment's own
// site's partner write access (supabase-lfg-site-management-schema.sql).
// The auth/ownership check below mirrors
// lfg/shipments/[shipmentId]/pod/upload-url/route.ts's own pattern exactly
// (same reasoning: check before doing the (courier) call, not after).
//
// Every new lfg_shipment_events row this writes carries source: "api" and
// the full raw scan in raw_payload -- that table was explicitly designed
// as this integration's plug-point (see its own schema comment); this is
// the first thing that ever writes source: "api" to it.
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
    .from("lfg_shipments")
    .select("id, site_id, awb_number")
    .eq("id", shipmentId)
    .maybeSingle();
  if (!shipment) {
    return NextResponse.json({ error: "shipment_not_found" }, { status: 404 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaffWriter = profile?.role === "admin" || profile?.role === "editor";
  if (!isStaffWriter) {
    // Mirrors lfg_shipments_write's own-partner-only condition for anyone
    // who isn't staff -- same check as pod/upload-url/route.ts.
    const { data: site } = await supabase.from("lfg_sites").select("partner_id").eq("id", shipment.site_id).maybeSingle();
    const { data: partnerUser } = await supabase.from("lfg_partner_users").select("partner_id").eq("id", user.id).maybeSingle();
    if (!site || !partnerUser || site.partner_id !== partnerUser.partner_id) {
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

  if (events.length > 0) {
    await supabase.from("lfg_shipment_events").insert(
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

  // Prefer Blue Dart's own top-level <Status> (authoritative "current
  // status of this shipment") over inferring it from the scan list --
  // falls back to the most recent scan (events is oldest-first) if the
  // response had a scan history but no top-level Status for some reason.
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
    // current_location is set from the most recent scan's location; only
    // overwrite expected_delivery_date when Blue Dart actually returned
    // one -- it started life as a manually-entered field, so a courier
    // response with no ExpectedDeliveryDate (e.g. before pickup) should
    // never blank out a value someone typed in.
    if (currentLocation) update.current_location = currentLocation;
    if (expectedDeliveryDate) update.expected_delivery_date = expectedDeliveryDate;

    // last_tracked_at and current_location are optional columns
    // (supabase-lfg-shipments-last-tracked-migration.sql /
    // supabase-lfg-shipments-current-location-migration.sql) -- if either
    // hasn't been run yet, drop both and retry rather than failing the
    // whole tracking call over a couple of cosmetic fields.
    const { error: updateError } = await supabase.from("lfg_shipments").update(update).eq("id", shipmentId);
    if (updateError) {
      delete update.last_tracked_at;
      delete update.current_location;
      await supabase.from("lfg_shipments").update(update).eq("id", shipmentId);
    }
  }

  const { data: refreshed } = await supabase
    .from("lfg_shipment_events")
    .select("*")
    .eq("shipment_id", shipmentId)
    .order("event_time", { ascending: false });

  return NextResponse.json({ events: refreshed ?? [] });
}
