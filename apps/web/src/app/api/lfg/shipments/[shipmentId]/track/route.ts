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

  let events;
  try {
    events = await trackAwb(shipment.awb_number);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "bluedart_error", message }, { status: 502 });
  }

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

    const latest = events[events.length - 1];
    const mappedStatus = mapBlueDartStatusToLfg(latest.status);
    const update: Record<string, unknown> = {
      current_status: mappedStatus,
      last_tracked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (mappedStatus === "delivered") {
      update.delivery_date = latest.time.slice(0, 10);
    }
    // last_tracked_at is an optional column
    // (supabase-lfg-shipments-last-tracked-migration.sql) -- if it hasn't
    // been run yet, drop it and retry rather than failing the whole
    // tracking call over a purely cosmetic field.
    const { error: updateError } = await supabase.from("lfg_shipments").update(update).eq("id", shipmentId);
    if (updateError) {
      delete update.last_tracked_at;
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
