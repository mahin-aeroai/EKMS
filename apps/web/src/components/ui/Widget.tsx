"use client";

import { useState, type ReactNode } from "react";
import { GripVertical, Maximize2, MoreVertical, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type WidgetSize = "sm" | "md" | "lg" | "full";

const SIZE_CLASSES: Record<WidgetSize, string> = {
  sm: "col-span-3",
  md: "col-span-6",
  lg: "col-span-9",
  full: "col-span-12",
};

/**
 * Widgets (base) — Deliverable 3.9
 * Purpose: the generic resizable, configurable building block for Homepage and Dashboards.
 * Behaviour: drag to reorder, resize (S/M/L/full-width), remove, or add from the widget catalog.
 * Usage rule: all Homepage/Dashboard content is composed exclusively from Widgets — every
 * specific widget (Today's Production, KPI, AI Widget, etc.) is a configured variant of this.
 */
export function Widget({
  title,
  size = "md",
  loading = false,
  ai = false,
  onResize,
  onRemove,
  children,
}: {
  title: string;
  size?: WidgetSize;
  loading?: boolean;
  ai?: boolean;
  onResize?: (size: WidgetSize) => void;
  onRemove?: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-surface shadow-1",
        SIZE_CLASSES[size],
        ai ? "border-ai/30 bg-ai-tint" : "border-line"
      )}
    >
      <div className="flex items-center gap-2 border-b border-line/60 px-4 py-2.5">
        <GripVertical size={14} className="cursor-grab text-ink-muted" />
        <h4 className={cn("flex-1 text-sm font-semibold", ai ? "text-ai" : "text-ink")}>{title}</h4>
        <div className="relative">
          <button onClick={() => setMenuOpen((o) => !o)} className="rounded p-1 text-ink-muted hover:bg-surface-sunken">
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <ul className="absolute right-0 z-20 mt-1 w-36 rounded-md border border-line bg-surface-overlay p-1 text-xs shadow-3">
              {(["sm", "md", "lg", "full"] as WidgetSize[]).map((s) => (
                <li key={s}>
                  <button
                    onClick={() => {
                      onResize?.(s);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left hover:bg-surface-sunken"
                  >
                    <Maximize2 size={11} /> {s.toUpperCase()}
                  </button>
                </li>
              ))}
              {onRemove && (
                <li>
                  <button
                    onClick={onRemove}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-danger hover:bg-surface-sunken"
                  >
                    <X size={11} /> Remove
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
      <div className="flex-1 p-4">
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-sunken" />
            <div className="h-4 w-full animate-pulse rounded bg-surface-sunken" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-surface-sunken" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** WidgetGrid — the 12-column responsive grid every Homepage/Dashboard Layout uses. */
export function WidgetGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-12 gap-4">{children}</div>;
}
