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
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-sunken">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
