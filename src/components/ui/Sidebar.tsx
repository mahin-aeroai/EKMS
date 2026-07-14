"use client";

import { useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SidebarSection {
  title: string;
  items: { id: string; label: string; icon: ReactNode; href: string }[];
}

/**
 * Sidebar — Deliverable 3.4 / Navigation System Deliverable 5
 * Purpose: primary top-level workspace navigation.
 * Behaviour: collapsible to icon-only rail; user-pinnable favorites persist at top
 * (favorites omitted from this generic demo — compose them as another SidebarSection).
 * Responsive: becomes a slide-out drawer triggered from a bottom tab bar on Mobile.
 */
export function Sidebar({
  sections,
  activeId,
  onNavigate,
}: {
  sections: SidebarSection[];
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-[var(--dur-standard)]",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {section.title}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => onNavigate(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      activeId === item.id
                        ? "bg-primary-tint text-primary"
                        : "text-ink-secondary hover:bg-surface-sunken hover:text-ink"
                    )}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs font-medium text-ink-muted hover:text-ink"
      >
        {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
