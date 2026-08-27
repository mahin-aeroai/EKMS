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
 * Coarse pipeline stages for the Program Dashboard (grouping every site by
 * program/chain -- APP, APR, Mono AAR, Multi AAR, Croma, Reliance, Vijay
 * Sales, WC, etc. -- and showing where each group's sites sit end to end).
 * Every LFG_STATUSES value maps to exactly one bucket here, so the
 * dashboard's totals always add up to the same count as the Site Master
 * list -- nothing is silently dropped. lfgStageBucketOf() falls back to
 * "issues" for any status that somehow isn't in LFG_STATUSES (schema drift)
 * rather than losing the site from every bucket's total.
 */
export const LFG_STAGE_BUCKETS = [
  { key: "survey", label: "New / Survey", statuses: ["new", "survey_pending", "survey_completed", "survey_approved"] },
  { key: "production", label: "Printing / Production", statuses: ["production_pending", "in_production"] },
  { key: "shipped", label: "Shipped", statuses: ["ready_for_dispatch", "dispatched", "in_transit", "delivered"] },
  { key: "installation", label: "Installation", statuses: ["installation_planned", "installation_in_progress", "installation_completed"] },
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "inactive", label: "Inactive", statuses: ["deactivation_requested", "deactivated"] },
  { key: "issues", label: "On Hold / Issues", statuses: ["on_hold", "issue_attention_required"] },
] as const;

export type LfgStageBucketKey = (typeof LFG_STAGE_BUCKETS)[number]["key"];

export const LFG_STAGE_BUCKET_BADGE: Record<LfgStageBucketKey, BadgeStatus> = {
  survey: "neutral",
  production: "warning",
  shipped: "info",
  installation: "info",
  active: "success",
  inactive: "neutral",
  issues: "danger",
};

export function lfgStageBucketOf(status: string): LfgStageBucketKey {
  const bucket = LFG_STAGE_BUCKETS.find((b) => (b.statuses as readonly string[]).includes(status));
  return bucket ? bucket.key : "issues";
}

/** ₹ with Indian digit grouping — lfg_site_financials/lfg_installation_costs
 * figures are typically in the thousands/lakhs, not crores, so
 * dashboard-queries.ts's formatCrore() (÷1e7) isn't the right shape here. */
export function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
