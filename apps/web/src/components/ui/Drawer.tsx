"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Drawer — Deliverable 3.6
 * Purpose: side-panel for a longer task without leaving the current page context.
 * Behaviour: slides in from the right at Elevation-3/4; page content dims behind it.
 * Usage rule: preferred over Dialog for anything with more than ~3 fields or multiple steps.
 * Responsive: becomes a full-screen sheet on Mobile/Tablet.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-40 transition-opacity duration-[var(--dur-page)]",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute right-0 top-0 flex h-full flex-col bg-surface-overlay shadow-4 transition-transform duration-[var(--dur-page)] ease-[var(--ease-out)]",
          wide ? "w-full max-w-2xl" : "w-full max-w-md",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* This panel is edge-to-edge (right/top/bottom) at phone width --
            "full-screen sheet on Mobile" per this component's own doc
            comment -- so in standalone iOS it sits directly under the
            notch/Dynamic Island and butts against the right-side sensor
            housing in landscape. env() resolves to 0 everywhere else, so
            these are additive, not a visual change outside standalone. */}
        <div
          className="flex items-center justify-between border-b border-line px-5 py-4"
          style={{
            paddingTop: "calc(1rem + env(safe-area-inset-top))",
            paddingRight: "calc(1.25rem + env(safe-area-inset-right))",
          }}
        >
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-sunken">
            <X size={16} />
          </button>
        </div>
        {/* The bottom edge here is the one that actually matters most: this
            is where the AI Assistant drawer's chat input (AIConversation ->
            PromptInput) lands, right at the physical bottom edge -- without
            this, it sits under the home-indicator gesture bar in standalone. */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4"
          style={{
            paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
            paddingRight: "calc(1.25rem + env(safe-area-inset-right))",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
