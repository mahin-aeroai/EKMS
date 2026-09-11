"use client";

import { Check } from "lucide-react";

// The happy-path shipment lifecycle, in order, for the horizontal tracking
// stepper (task feedback, Customer Portal: "Tracking needs a beautiful
// horizontal card design"; task feedback, LFG Connect: "i love the bar
// card. implement the same at lfg connect too") -- shared between the
// Customer Portal (OrderDetailClient.tsx) and LFG Connect
// (LfgSiteWorkspaceClient.tsx's ShipmentCard), which track the exact same
// lfgStatus.ts SHIPMENT_STATUSES vocabulary (one Blue Dart integration,
// one shipment-status enum, now one tracking-card component too, instead
// of two copies of this drifting apart). The other 3 SHIPMENT_STATUSES
// entries -- delayed, delivery_exception, undelivered -- are exception
// states, not points on this line, so they get their own alert row
// instead of a step.
const TRACKING_STEPS: { status: string; label: string }[] = [
  { status: "shipment_created", label: "Created" },
  { status: "dispatched", label: "Dispatched" },
  { status: "in_transit", label: "In transit" },
  { status: "at_hub", label: "At hub" },
  { status: "out_for_delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
];
const TRACKING_EXCEPTION_STATUSES = new Set(["delayed", "delivery_exception", "undelivered"]);

export function ShipmentTrackingStepper({
  status,
  statusLabel,
  exceptionLocation,
}: {
  status: string;
  /** Human label for `status` -- caller passes shipmentStatusLabel(status) so this component doesn't need its own copy of that mapping. */
  statusLabel: string;
  /** Shown only in the exception alert row (delayed/delivery_exception/undelivered) -- the happy-path stepper doesn't show location inline; callers show "Currently at ..." in their own line below this component instead. */
  exceptionLocation?: string | null;
}) {
  const isException = TRACKING_EXCEPTION_STATUSES.has(status);
  const stepIndex = TRACKING_STEPS.findIndex((step) => step.status === status);

  if (isException) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">
        <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
        <span className="font-medium">{statusLabel}</span>
        {exceptionLocation && <span className="text-danger/80">· {exceptionLocation}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {TRACKING_STEPS.map((step, i) => {
        const done = stepIndex >= 0 && i < stepIndex;
        const current = i === stepIndex;
        return (
          <div key={step.status} className={i === 0 ? "flex flex-1 flex-col items-start" : "flex flex-1 flex-col items-center"}>
            <div className="flex w-full items-center">
              {i > 0 && <div className={`h-0.5 flex-1 ${done || current ? "bg-primary" : "bg-line"}`} aria-hidden="true" />}
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold ${
                  done
                    ? "border-primary bg-primary text-on-brand"
                    : current
                      ? "border-primary bg-surface text-primary"
                      : "border-line bg-surface text-ink-muted"
                }`}
              >
                {done ? <Check size={12} /> : i + 1}
              </div>
              {i < TRACKING_STEPS.length - 1 && <div className={`h-0.5 flex-1 ${done ? "bg-primary" : "bg-line"}`} aria-hidden="true" />}
            </div>
            <p
              className={`mt-1.5 text-center text-[10px] leading-tight ${
                current ? "font-semibold text-ink" : done ? "text-ink-secondary" : "text-ink-muted"
              }`}
            >
              {step.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
