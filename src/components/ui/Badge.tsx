import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeStatus = "success" | "warning" | "danger" | "info" | "neutral";

const STATUS_CLASSES: Record<BadgeStatus, string> = {
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
  info: "bg-info-tint text-info",
  neutral: "bg-surface-sunken text-ink-secondary",
};

const STATUS_LABEL: Record<BadgeStatus, string> = {
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  info: "Info",
  neutral: "Neutral",
};

interface BadgeProps {
  status?: BadgeStatus;
  /** Required for the Status and Dot variants; unused (and omittable) for the Count variant. */
  children?: ReactNode;
  /** Renders a small leading dot instead of a pill — for compact table cells. */
  dot?: boolean;
  count?: number;
}

/**
 * Badge — Deliverable 3.1
 * Purpose: communicate status or count at a glance.
 * Variants: Status (Success/Warning/Danger/Info/Neutral), Count, Dot-indicator.
 * Accessibility: status is always paired with text — color is never the only signal.
 * Usage rule: one status badge per record card maximum.
 */
export function Badge({ status = "neutral", children, dot = false, count }: BadgeProps) {
  if (typeof count === "number") {
    return (
      <span
        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-on-brand"
        aria-label={`${count} notifications`}
      >
        {count > 99 ? "99+" : count}
      </span>
    );
  }

  if (dot) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
        <span
          className={cn("h-2 w-2 rounded-full", {
            "bg-success": status === "success",
            "bg-warning": status === "warning",
            "bg-danger": status === "danger",
            "bg-info": status === "info",
            "bg-ink-muted": status === "neutral",
          })}
          aria-hidden
        />
        {children}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_CLASSES[status]
      )}
    >
      <span className="sr-only">{STATUS_LABEL[status]}: </span>
      {children}
    </span>
  );
}
