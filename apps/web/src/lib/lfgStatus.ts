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
