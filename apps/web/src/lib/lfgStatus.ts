import type { BadgeStatus } from "@mmdi/shared/rows";

/**
 * The 18-value lfg_sites.site_status enum (supabase-lfg-site-management-
 * schema.sql's check constraint) -- single source of truth for its order,
 * human-readable label, and Badge color, so the Site Master list, the New
 * Site form's default, and the Site 360 status-change control never drift
 * from each other or from the DB constraint.
 */
export const LFG_STATUSES = [
  "new",
  "survey_pending",
  "survey_completed",
  "survey_approved",
  "production_pending",
  "in_production",
  "ready_for_dispatch",
  "dispatched",
  "in_transit",
  "delivered",
  "installation_planned",
  "installation_in_progress",
  "installation_completed",
  "active",
  "deactivation_requested",
  "deactivated",
  "on_hold",
  "issue_attention_required",
] as const;

export type LfgStatus = (typeof LFG_STATUSES)[number];

/**
 * Statuses only MMDI staff may set -- production and everything up
 * through dispatch/transit ("In production after creative approval so
 * MMDI will update that status too" / "Shipped will be updated by MMDI
 * once printed and shipped"). Delivered and every installation status
 * stay open to both MMDI and the installation partner, same as before,
 * per the same task's "Delivered can be updated by I&S or MMDI" /
 * "Installed: both 2 parties."
 *
 * This is the UI-side mirror of the REAL enforcement, the
 * lfg_sites_guard_partner_update() trigger in
 * supabase-lfg-site-management-schema.sql, which rejects a partner
 * setting any of these regardless of what the UI shows -- keep the two
 * lists in sync if either changes. Used to filter the partner-facing
 * status picker (LfgPartnerSiteClient.tsx) so a partner never even sees
 * an option the database would reject.
 */
export const LFG_PARTNER_RESTRICTED_STATUSES: readonly LfgStatus[] = [
  "production_pending",
  "in_production",
  "ready_for_dispatch",
  "dispatched",
  "in_transit",
];

export const LFG_STATUS_LABEL: Record<LfgStatus, string> = {
  new: "New",
  survey_pending: "Survey Pending",
  survey_completed: "Survey Completed",
  survey_approved: "Survey Approved",
  production_pending: "Production Pending",
  in_production: "In Production",
  ready_for_dispatch: "Ready for Dispatch",
  dispatched: "Dispatched",
  in_transit: "In Transit",
  delivered: "Delivered",
  installation_planned: "Installation Planned",
  installation_in_progress: "Installation In Progress",
  installation_completed: "Installation Completed",
  active: "Active",
  deactivation_requested: "Deactivation Requested",
  deactivated: "Deactivated",
  on_hold: "On Hold",
  issue_attention_required: "Issue / Attention Required",
};

export const LFG_STATUS_BADGE: Record<LfgStatus, BadgeStatus> = {
  new: "neutral",
  survey_pending: "warning",
  survey_completed: "info",
  survey_approved: "info",
  production_pending: "warning",
  in_production: "info",
  ready_for_dispatch: "info",
  dispatched: "info",
  in_transit: "info",
  delivered: "success",
  installation_planned: "info",
  installation_in_progress: "info",
  installation_completed: "success",
  active: "success",
  deactivation_requested: "warning",
  deactivated: "neutral",
  on_hold: "warning",
  issue_attention_required: "danger",
};

export function lfgStatusLabel(status: string): string {
  return LFG_STATUS_LABEL[status as LfgStatus] ?? status;
}

export function lfgStatusBadge(status: string): BadgeStatus {
  return LFG_STATUS_BADGE[status as LfgStatus] ?? "neutral";
}

/**
 * lfg_shipments.current_status -- the broad shipment-lifecycle enum shown
 * as the timeline on Site 360's Shipment tab (task #18, courier/AWB
 * tracking). Same single-source-of-truth pattern as LFG_STATUSES above.
 */
export const SHIPMENT_STATUSES = [
  "shipment_created",
  "dispatched",
  "in_transit",
  "at_hub",
  "out_for_delivery",
  "delivered",
  "delayed",
  "delivery_exception",
  "undelivered",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  shipment_created: "Shipment Created",
  dispatched: "Dispatched",
  in_transit: "In Transit",
  at_hub: "At Hub",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  delayed: "Delayed",
  delivery_exception: "Delivery Exception",
  undelivered: "Undelivered",
};

export const SHIPMENT_STATUS_BADGE: Record<ShipmentStatus, BadgeStatus> = {
  shipment_created: "neutral",
  dispatched: "info",
  in_transit: "info",
  at_hub: "info",
  out_for_delivery: "info",
  delivered: "success",
  delayed: "warning",
  delivery_exception: "danger",
  undelivered: "danger",
};

export function shipmentStatusLabel(status: string): string {
  return SHIPMENT_STATUS_LABEL[status as ShipmentStatus] ?? status;
}

export function shipmentStatusBadge(status: string): BadgeStatus {
  return SHIPMENT_STATUS_BADGE[status as ShipmentStatus] ?? "neutral";
}

/** lfg_shipments.delivery_status -- proof-of-delivery tracking, separate
 * from the lifecycle status above (a shipment can be "delivered" while its
 * POD is still "pod_pending"). */
export const DELIVERY_STATUSES = ["pod_pending", "pod_received", "not_applicable"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  pod_pending: "POD Pending",
  pod_received: "POD Received",
  not_applicable: "Not Applicable",
};

export const DELIVERY_STATUS_BADGE: Record<DeliveryStatus, BadgeStatus> = {
  pod_pending: "warning",
  pod_received: "success",
  not_applicable: "neutral",
};

export function deliveryStatusLabel(status: string): string {
  return DELIVERY_STATUS_LABEL[status as DeliveryStatus] ?? status;
}

export function deliveryStatusBadge(status: string): BadgeStatus {
  return DELIVERY_STATUS_BADGE[status as DeliveryStatus] ?? "neutral";
}

/**
 * The 10 pipeline stages for the Program Dashboard (task #20), in the exact
 * order given for the dashboard: Active, Inactive, New/Surveys, Creative
 * Receipt, Printing, Shipping, Delivery, Schedule, Installation Status,
 * Issues. lfgPipelineStageOf() maps every site to exactly one of these, so
 * a program's stage totals always add up to its full site count -- nothing
 * is silently dropped (an unrecognized status falls back to "issues" rather
 * than disappearing).
 *
 * Every LFG_STATUSES value maps 1:1 EXCEPT the new/survey_* statuses, which
 * split two ways using creative_received_at (see that column's comment in
 * the schema): a site sitting in new/survey_pending/survey_completed/
 * survey_approved with a creative on file is "Creative Receipt", not
 * "New / Surveys" -- printing/shipping/delivery/etc. already imply the
 * creative came in, so this split only matters pre-production. Because of
 * that, lfgPipelineStageOf() takes creativeReceivedAt as a second argument
 * (LFG_STATUSES-only callers that don't have it can pass null/undefined --
 * every site correctly falls back to "survey").
 */
export const LFG_PIPELINE_STAGES = [
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "inactive", label: "Inactive", statuses: ["deactivation_requested", "deactivated"] },
  { key: "survey", label: "New / Surveys", statuses: ["new", "survey_pending", "survey_completed", "survey_approved"] },
  { key: "creative_receipt", label: "Creative Receipt", statuses: [] },
  { key: "printing", label: "Printing", statuses: ["production_pending", "in_production"] },
  { key: "shipping", label: "Shipping", statuses: ["ready_for_dispatch", "dispatched"] },
  { key: "delivery", label: "Delivery", statuses: ["in_transit", "delivered"] },
  { key: "schedule", label: "Schedule", statuses: ["installation_planned"] },
  { key: "installation", label: "Installation Status", statuses: ["installation_in_progress", "installation_completed"] },
  { key: "issues", label: "Issues", statuses: ["on_hold", "issue_attention_required"] },
] as const;

export type LfgPipelineStageKey = (typeof LFG_PIPELINE_STAGES)[number]["key"];

export const LFG_PIPELINE_STAGE_BADGE: Record<LfgPipelineStageKey, BadgeStatus> = {
  active: "success",
  inactive: "neutral",
  survey: "neutral",
  creative_receipt: "info",
  printing: "warning",
  shipping: "danger",
  delivery: "success",
  schedule: "neutral",
  installation: "info",
  issues: "danger",
};

export function lfgPipelineStageOf(status: string, creativeReceivedAt?: string | null): LfgPipelineStageKey {
  if (status === "new" || status === "survey_pending" || status === "survey_completed" || status === "survey_approved") {
    return creativeReceivedAt ? "creative_receipt" : "survey";
  }
  const stage = LFG_PIPELINE_STAGES.find((b) => (b.statuses as readonly string[]).includes(status));
  return stage ? stage.key : "issues";
}

/**
 * Site Cards' tracking bar (task #76) -- a coarse, purely visual "how far
 * along" percent for a single site, in LFG_STATUSES' own lifecycle order.
 * This is NOT a second status taxonomy: LFG_STATUSES/lfgStatusLabel/
 * lfgStatusBadge above stay the single source of truth for the actual
 * status shown on the pill next to the bar -- this map only decides how
 * full the bar paints for it. active/deactivation_requested/deactivated
 * all read as a completed journey (100%) since none of them are "earlier"
 * than active. on_hold/issue_attention_required are flags a site can hit
 * from any real stage, not a further position of their own, so they're
 * pinned at a fixed mid-bar value (paired with the danger/warning badge
 * color the bar already inherits from lfgStatusBadge) rather than
 * pretending to know how far that specific site actually got.
 */
const LFG_STATUS_TRACKING_PERCENT: Record<LfgStatus, number> = {
  new: 5,
  survey_pending: 12,
  survey_completed: 20,
  survey_approved: 27,
  production_pending: 35,
  in_production: 44,
  ready_for_dispatch: 53,
  dispatched: 60,
  in_transit: 68,
  delivered: 76,
  installation_planned: 84,
  installation_in_progress: 91,
  installation_completed: 97,
  active: 100,
  deactivation_requested: 100,
  deactivated: 100,
  on_hold: 50,
  issue_attention_required: 50,
};

export function lfgTrackingPercent(status: string): number {
  return LFG_STATUS_TRACKING_PERCENT[status as LfgStatus] ?? 0;
}

/**
 * Six fixed "benchmark" checkpoints (task: "we have benchmark statuses...
 * we should display all of on each site... so we will know the stages
 * that are crossed") -- coarser than the full 18-value LFG_STATUSES
 * lifecycle or the 10 Program Dashboard pipeline stages
 * (LFG_PIPELINE_STAGES): just six milestones, always shown together as a
 * checklist (crossed / not yet), not a continuous bar -- the Site Cards
 * tracking bar this same idea could have resembled was explicitly removed
 * per earlier feedback ("remove the bar"), so this is deliberately a row
 * of discrete labeled checkpoints instead.
 *
 * `throughStatus` is the LAST LFG_STATUSES value that still counts as "at"
 * that checkpoint -- a site crosses it once its own status sits at or past
 * that point in LFG_STATUSES' own fixed order (that array's own comment:
 * "single source of truth for its order"). Creative Received is the one
 * exception: it also counts as crossed the moment creativeReceivedAt is
 * set, even while the site is still sitting in New/Survey -- same split
 * lfgPipelineStageOf() already makes for the same reason (creative can
 * arrive before a site formally leaves the survey stage).
 *
 * Same simplification LFG_STATUS_TRACKING_PERCENT's own comment already
 * accepts for on_hold/issue_attention_required/deactivation_requested/
 * deactivated: they're flags/end-states a site can reach from any real
 * stage, but LFG_STATUSES still places them at the very end of its
 * lifecycle array, so a site sitting in any of them shows every checkpoint
 * as crossed here -- not always literally true (a site can go on_hold
 * early), but reconstructing the real answer would mean reading each
 * site's full lfg_site_status_history, not just its current row, which
 * every surface this renders on (Status Sheet, Site Cards) fetches many
 * sites at once and can't afford per-site.
 */
export interface LfgBenchmark {
  key: string;
  label: string;
  throughStatus: LfgStatus;
}

export const LFG_BENCHMARKS: LfgBenchmark[] = [
  { key: "survey_completed", label: "Site Survey Completed", throughStatus: "survey_completed" },
  { key: "creative_received", label: "Creative Received (New)", throughStatus: "production_pending" },
  // Label is "Printed" here (Srinivas's own wording for this checkpoint)
  // while LFG_STATUS_LABEL.in_production stays "In Production" -- this is
  // a separate, display-only checklist label keyed to the same
  // `in_production` status; the actual site_status value, the Production
  // tab, and the Change Status dropdown are unaffected and still say "In
  // Production".
  { key: "in_production", label: "Printed", throughStatus: "in_production" },
  { key: "shipped", label: "Shipped", throughStatus: "dispatched" },
  { key: "delivered", label: "Delivered", throughStatus: "delivered" },
  { key: "installed", label: "Installed", throughStatus: "installation_completed" },
];

export interface LfgBenchmarkState {
  key: string;
  label: string;
  crossed: boolean;
}

export function lfgBenchmarkStatus(status: string, creativeReceivedAt?: string | null): LfgBenchmarkState[] {
  const rank = LFG_STATUSES.indexOf(status as LfgStatus);
  return LFG_BENCHMARKS.map((b) => {
    if (b.key === "creative_received" && creativeReceivedAt) {
      return { key: b.key, label: b.label, crossed: true };
    }
    return { key: b.key, label: b.label, crossed: rank >= LFG_STATUSES.indexOf(b.throughStatus) };
  });
}

/**
 * The priority order given for the Program Dashboard's format/chain
 * groups -- everything else follows, alphabetically. Matched
 * case-insensitively and by substring in both directions (so "Reliance"
 * matches a format value of "Reliance Digital" or vice versa) since
 * `lfg_sites.format` is free text carried through from two different
 * legacy imports, not a controlled vocabulary.
 *
 * Named LFG_FORMAT_PRIORITY/lfgFormatPriorityRank() -- was
 * LFG_PROGRAM_PRIORITY/lfgProgramPriorityRank() before the retail
 * chain/format field was renamed away from "program" to avoid clashing
 * with the separate, seasonal-wave lfg_programs concept (Spring Refresh
 * 2025, etc. -- see lfg_programs in the schema).
 */
export const LFG_FORMAT_PRIORITY = ["app", "apr", "mono aar", "multi aar", "croma", "reliance", "vijay sales", "pai international"];

export function lfgFormatPriorityRank(format: string): number {
  const f = format.trim().toLowerCase();
  const idx = LFG_FORMAT_PRIORITY.findIndex((keyword) => f.includes(keyword) || keyword.includes(f));
  return idx === -1 ? LFG_FORMAT_PRIORITY.length : idx;
}

/** ₹ with Indian digit grouping — lfg_site_financials/lfg_installation_costs
 * figures are typically in the thousands/lakhs, not crores, so
 * dashboard-queries.ts's formatCrore() (÷1e7) isn't the right shape here. */
export function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
