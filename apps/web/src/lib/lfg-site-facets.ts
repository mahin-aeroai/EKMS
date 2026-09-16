import { LFG_STATUSES, type LfgStatus, lfgBenchmarkStatus } from "@/lib/lfgStatus";

// Shared facet-filter definitions for LFG Connect's Site Master (16 Sept
// 2026 task feedback: "this filter are becoming meaningless so remove
// some thing we are not updating frpom cards ... the filetr of statusses
// should be like Active / inactive Site Survey Available / non available
// Creative received / not received printed / not printed shipped/not
// shipped delivered/ not delivered installed / not installed") --
// replaces the single 18-value site_status dropdown (which mixed
// early-pipeline statuses like "new"/"survey_pending" no one was actually
// keeping current with the site's real shipping/creative/installation
// progress) with seven independent yes/no toggles, one per real-world
// checkpoint. Each one is backed by whichever signal is actually kept up
// to date in practice, not just site_status's own rank:
//   - active: derived from site_status (deactivated/deactivation_requested
//     = inactive, everything else visible = active) -- archived sites
//     stay fully hidden always, same as today, regardless of this facet
//     (both callers already unconditionally filter `.is("archived_at",
//     null)` before this ever runs).
//   - survey: real signal -- a Site Survey document is actually on file
//     (lfg_site_documents, category "survey"), the same thing that
//     decides whether a card's own "Site Survey" button is enabled or
//     reads "Survey Not Saved".
//   - creative / printed: no better signal exists than site_status's own
//     rank for "printed" (lfg_production is written but never read
//     anywhere in the UI), so these two reuse lfgBenchmarkStatus()'s exact
//     "creative_received"/"in_production" definitions -- the same ones
//     LfgBenchmarkStrip already renders on every card, so this filter can
//     never disagree with what the card itself is showing.
//   - shipped: real signal -- a shipment row exists with an AWB number on
//     it (lfg_shipments), the same predicate the card's own AWB/Blue Dart
//     section already uses, not "site_status reached dispatched".
//   - delivered: site_status reaching "delivered" or later, OR the site's
//     latest shipment's own current_status says "delivered" -- exactly
//     the same either/or trackingSummary() (LfgSiteCardGrid.tsx) already
//     uses for the card's "Tracking" badge.
//   - installed: real signal -- lfg_installations.installation_status is
//     "completed", the same field the card's own bottom "Installation"
//     badge reads.
//
// Shared between the staff Site Master (workspaces/lfg/page.tsx) and the
// LFG partner home page (app/lfg/(app)/page.tsx) so the two surfaces can
// never end up with a second, conflicting definition of what "Shipped" or
// "Delivered" means.
export type FacetKey = "active" | "survey" | "creative" | "printed" | "shipped" | "delivered" | "installed";
export type FacetValue = "" | "yes" | "no";

export const EMPTY_FACETS: Record<FacetKey, FacetValue> = {
  active: "",
  survey: "",
  creative: "",
  printed: "",
  shipped: "",
  delivered: "",
  installed: "",
};

export const FACET_DEFS: { key: FacetKey; label: string; yes: string; no: string }[] = [
  { key: "active", label: "Status", yes: "Active", no: "Inactive" },
  { key: "survey", label: "Site Survey", yes: "Available", no: "Not available" },
  { key: "creative", label: "Creative", yes: "Received", no: "Not received" },
  { key: "printed", label: "Printed", yes: "Printed", no: "Not printed" },
  { key: "shipped", label: "Shipped", yes: "Shipped", no: "Not shipped" },
  { key: "delivered", label: "Delivered", yes: "Delivered", no: "Not delivered" },
  { key: "installed", label: "Installed", yes: "Installed", no: "Not installed" },
];

export interface SiteFacets {
  active: boolean;
  survey: boolean;
  creative: boolean;
  printed: boolean;
  shipped: boolean;
  delivered: boolean;
  installed: boolean;
}

// site_id -> whether a shipment with an AWB is on file, and whether that
// shipment's own current_status says delivered -- the two shipment-derived
// facts computeSiteFacets() below needs, fetched once per currently loaded
// row set (see each caller's own effect), same idea as
// LfgSiteCardGrid.tsx's own awbBySite lookup but keyed to what filtering
// needs rather than what a single card displays.
export interface ShipmentSignal {
  hasAwb: boolean;
  deliveredByShipment: boolean;
}

export function computeSiteFacets(
  row: { site_status: string; creative_received_at: string | null },
  shipmentSignal: ShipmentSignal | undefined,
  surveyAvailable: boolean,
  installed: boolean
): SiteFacets {
  const rank = LFG_STATUSES.indexOf(row.site_status as LfgStatus);
  const benchmarks = lfgBenchmarkStatus(row.site_status, row.creative_received_at);
  const creative = benchmarks.find((b) => b.key === "creative_received")?.crossed ?? false;
  const printed = benchmarks.find((b) => b.key === "in_production")?.crossed ?? false;
  return {
    active: row.site_status !== "deactivated" && row.site_status !== "deactivation_requested",
    survey: surveyAvailable,
    creative,
    printed,
    shipped: shipmentSignal?.hasAwb ?? false,
    delivered: rank >= LFG_STATUSES.indexOf("delivered") || (shipmentSignal?.deliveredByShipment ?? false),
    installed,
  };
}

// Splits a big id list into URL-safe-sized chunks for .in() lookups --
// same reasoning as the site fetch's own .range() paging (a single .in()
// over every currently loaded site would risk an oversized request once
// there are a few hundred+ rows on screen). Each caller runs its own
// three chunked queries (survey docs / shipments / installations) against
// its own already-imported `supabase` client -- not abstracted into a
// shared query function here, since supabase-js's chainable builder type
// doesn't narrow cleanly through an extra function boundary; only the
// pure filtering logic above (FACET_DEFS/computeSiteFacets) is shared, so
// the two callers can never disagree on what each facet MEANS, even
// though the query code itself is duplicated (identical) in both.
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
