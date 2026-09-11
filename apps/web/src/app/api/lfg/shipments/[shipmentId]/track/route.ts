import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { trackAwb, mapBlueDartStatusToLfg } from "@/lib/blueDart";
import { LFG_STATUSES } from "@/lib/lfgStatus";

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

  // 11 Sept 2026: matching hardening applied to the Portal's equivalent
  // route after task feedback there ("it si still nor showing actual
  // tracking on bluedart website it is in transit but it is stuck at
  // creared") -- neither write below used to check its own error, and
  // Supabase/PostgREST returns 200 with zero rows AFFECTED (no thrown
  // error) when an authenticated write is silently blocked by RLS. This
  // route wasn't the one reported broken, but it has the exact same
  // unchecked-write shape, so it gets the same fix rather than waiting
  // for someone to hit it here too.
  let warning: string | null = null;

  if (events.length > 0) {
    const { error: eventsError } = await supabase.from("lfg_shipment_events").insert(
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

  // Prefer Blue Dart's own top-level <Status> (authoritative "current
  // status of this shipment") over inferring it from the scan list --
  // falls back to the most recent scan (events is oldest-first) if the
  // response had a scan history but no top-level Status for some reason.
  const latest = events[events.length - 1];
  const statusSource = currentStatus ?? latest?.status;
  let mappedShipmentStatus: ReturnType<typeof mapBlueDartStatusToLfg> | null = null;
  if (statusSource || currentLocation || expectedDeliveryDate) {
    const update: Record<string, unknown> = {
      last_tracked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (statusSource) {
      const mappedStatus = mapBlueDartStatusToLfg(statusSource);
      mappedShipmentStatus = mappedStatus;
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
    // whole tracking call over a couple of cosmetic fields. Either attempt
    // also re-selects the row it just touched, so a silent 0-rows-affected
    // RLS block (no thrown error, just nothing returned) is caught too,
    // not just a hard Postgres/missing-column error.
    let { data: updatedRow, error: updateError } = await supabase
      .from("lfg_shipments")
      .update(update)
      .eq("id", shipmentId)
      .select("id")
      .maybeSingle();
    if (updateError) {
      delete update.last_tracked_at;
      delete update.current_location;
      ({ data: updatedRow, error: updateError } = await supabase
        .from("lfg_shipments")
        .update(update)
        .eq("id", shipmentId)
        .select("id")
        .maybeSingle());
    }
    if (updateError) {
      warning = `Blue Dart says "${statusSource}", but saving it failed: ${updateError.message}`;
    } else if (!updatedRow) {
      warning = `Blue Dart says "${statusSource}", but this account doesn't have permission to save it on this shipment.`;
    }
  }

  // Auto-advance the SITE's own status to "delivered" the instant Blue
  // Dart confirms delivery, instead of leaving it to a separate manual
  // status update (task feedback: "When Bluedart courier is tracked it
  // says delivered then it should be marked as delivered. should not
  // wait for update."). Previously this route only ever touched the
  // SHIPMENT's own current_status -- lfg_sites.site_status (what every
  // dashboard/program card and the Status Sheet actually reads) stayed
  // wherever a human had last set it, so "Blue Dart says delivered" and
  // "the site shows Delivered" could silently disagree.
  //
  // Rank-guarded against LFG_STATUSES' own fixed order the same way
  // LfgPartnerSiteSurveyReportBridge.tsx guards its own auto-advance --
  // lfg_change_site_status() itself does no such check, so skipping this
  // for a site that's already past Delivered (fully Installed, or Active)
  // is on us; otherwise a late or duplicate tracking call could silently
  // walk a further-along site backwards.
  if (mappedShipmentStatus === "delivered") {
    const { data: siteNow } = await supabase
      .from("lfg_sites")
      .select("site_status")
      .eq("id", shipment.site_id)
      .maybeSingle();
    const currentRank = siteNow ? LFG_STATUSES.indexOf(siteNow.site_status as (typeof LFG_STATUSES)[number]) : -1;
    const deliveredRank = LFG_STATUSES.indexOf("delivered");
    if (currentRank >= 0 && currentRank < deliveredRank) {
      await supabase.rpc("lfg_change_site_status", {
        p_site_id: shipment.site_id,
        p_new_status: "delivered",
        p_remarks: "Auto-marked Delivered from Blue Dart tracking",
      });
    }
  }

  const { data: refreshed } = await supabase
    .from("lfg_shipment_events")
    .select("*")
    .eq("shipment_id", shipmentId)
    .order("event_time", { ascending: false });

  // Also hand back the shipment's own post-update status fields, not just
  // the event list -- both call sites (the Shipment tab's ShipmentCard and
  // the Site Cards grid's inline "Track via Blue Dart") previously only
  // updated their local `events` state from this response and relied on a
  // full page refresh (router.refresh()) to ever see the new
  // current_status/current_location/last_tracked_at. That left the
  // "Tracking" badge and the (now-added) no-scans fallback line showing
  // stale data until the next reload even though the courier call that
  // just ran DID update them. Reading them back from the DB here (rather
  // than trusting the in-memory `update` object above, which may have
  // been trimmed if the optional columns weren't migrated yet) keeps this
  // response as the single source of truth for "what got saved".
  const { data: shipmentNow } = await supabase
    .from("lfg_shipments")
    .select("current_status, current_location, last_tracked_at")
    .eq("id", shipmentId)
    .maybeSingle();

  return NextResponse.json({ events: refreshed ?? [], shipment: shipmentNow ?? null, warning });
}
