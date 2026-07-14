"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

/**
 * Tabs — Deliverable 3.4
 * Purpose: switch between sibling views within one workspace.
 * Behaviour: URL-addressable (deep-linkable) per tab in production — this demo manages
 * state in-memory since it has no router-backed URL to bind to.
 * Usage rule: this is the mechanism behind every section of the Universal Workspace
 * Pattern (Deliverable 6) — Overview, Insights, Timeline, Documents, etc. are all Tabs.
 */
export function Tabs({ items, defaultId }: { items: TabItem[]; defaultId?: string }) {
  const [active, setActive] = useState(defaultId ?? items[0]?.id);
  const activeItem = items.find((i) => i.id === active);

  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((item) => (
          <button
            key={item.id}
            role="tab"
            disabled={item.disabled}
            aria-selected={active === item.id}
            onClick={() => setActive(item.id)}
            className={cn(
              "shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-ink-muted",
              active === item.id
                ? "border-primary text-primary"
                : "border-transparent text-ink-secondary hover:text-ink"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-4">
        {activeItem?.content}
      </div>
    </div>
  );
}
