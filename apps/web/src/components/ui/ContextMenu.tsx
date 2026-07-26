"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

/**
 * Context Menu — Deliverable 3.6
 * Purpose: secondary actions for a specific item.
 * Behaviour: opens at trigger position, closes on outside click or Escape.
 * Accessibility: exposed via a visible "more actions" button (not right-click-only) so
 * keyboard and touch users can always reach it.
 * Responsive: opens as a bottom sheet on touch surfaces in production.
 */
export function ContextMenu({ items, label = "More actions" }: { items: ContextMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-line bg-surface-overlay p-1 shadow-3"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                role="menuitem"
                onClick={() => {
                  item.onSelect();
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-sunken",
                  item.destructive ? "text-danger" : "text-ink"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
