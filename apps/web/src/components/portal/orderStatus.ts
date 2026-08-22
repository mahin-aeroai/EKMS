import type { BadgeStatus } from "@mmdi/shared/rows";
import type { PortalOrderStatus, PortalPaymentStatus } from "@mmdi/shared/rows";

const STATUS_LABEL: Record<PortalOrderStatus, string> = {
  submitted: "Submitted",
  proof_uploaded: "Design proof ready — review it",
  revision_requested: "Revision requested",
  approved: "Approved",
  in_production: "In production",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_BADGE: Record<PortalOrderStatus, BadgeStatus> = {
  submitted: "info",
  proof_uploaded: "warning",
  revision_requested: "warning",
  approved: "info",
  in_production: "info",
  completed: "success",
  cancelled: "danger",
};

export function orderStatusLabel(status: PortalOrderStatus) {
  return STATUS_LABEL[status] ?? status;
}

export function orderStatusBadge(status: PortalOrderStatus): BadgeStatus {
  return STATUS_BADGE[status] ?? "neutral";
}

const PAYMENT_LABEL: Record<PortalPaymentStatus, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
};

const PAYMENT_BADGE: Record<PortalPaymentStatus, BadgeStatus> = {
  unpaid: "neutral",
  paid: "success",
  failed: "danger",
  refunded: "neutral",
};

export function paymentStatusLabel(status: PortalPaymentStatus) {
  return PAYMENT_LABEL[status] ?? status;
}

export function paymentStatusBadge(status: PortalPaymentStatus): BadgeStatus {
  return PAYMENT_BADGE[status] ?? "neutral";
}
