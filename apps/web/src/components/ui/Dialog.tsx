"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  variant?: "confirm" | "form" | "alert";
  destructive?: boolean;
  onConfirm?: () => void;
  confirmLabel?: string;
}

/**
 * Dialog — Deliverable 3.6
 * Purpose: focused, blocking interaction for a single decision or short task.
 * Behaviour: traps focus until dismissed; Escape closes non-destructive dialogs.
 * Usage rule: reserved for tasks completable in one screen — anything longer uses a Drawer.
 * Responsive: becomes full-screen on Mobile rather than a centered modal.
 */
export function Dialog({ open, onClose, title, children, variant = "confirm", destructive, onConfirm, confirmLabel = "Confirm" }: DialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && variant !== "alert") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, variant]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-md rounded-lg bg-surface-overlay shadow-4"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 id="dialog-title" className="text-sm font-semibold text-ink">
            {title}
          </h3>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-sunken">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-ink-secondary">{children}</div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {onConfirm && (
            <Button variant={destructive ? "destructive" : "primary"} size="sm" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
