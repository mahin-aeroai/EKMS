"use client";

import { useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
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
 * Responsive: below md, the rail is replaced by an off-canvas drawer opened via
 * TopNav's hamburger button (mobileOpen/onMobileClose) -- there is no room for a
 * permanent 240px rail at phone width.
 */
export function Sidebar({
  sections,
  activeId,
  onNavigate,
  mobileOpen = false,
  onMobileClose,
}: {
  sections: SidebarSection[];
  activeId: string;
  onNavigate: (id: string) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Navigating from the mobile drawer should also close it -- staying open
  // over the newly-navigated page would just re-cover it until dismissed
  // separately, which is a wasted extra tap on every link.
  function handleNavigate(id: string) {
    onNavigate(id);
    onMobileClose?.();
  }

  // Shared between the desktop rail and the mobile drawer so section/item
  // markup isn't maintained twice -- `expanded` controls label visibility
  // since the rail can collapse to icon-only but the mobile drawer never
  // does (there's no icon-rail equivalent worth showing full-screen).
  // paddingBottom/Left below are additive via env() -- 0 outside
  // standalone/notched devices, so they only matter for the mobile drawer
  // variant below: clearing the home indicator, and the left sensor-housing
  // inset in landscape.
  function navList(expanded: boolean) {
    return (
      <nav
        className="flex-1 overflow-y-auto px-2 py-4"
        style={{
          paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
          paddingLeft: "calc(0.5rem + env(safe-area-inset-left))",
        }}
      >
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            {expanded && (
              <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {section.title}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleNavigate(item.id)}
                    title={expanded ? undefined : item.label}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      activeId === item.id
                        ? "bg-primary-tint text-primary"
                        : "text-ink-secondary hover:bg-surface-sunken hover:text-ink"
                    )}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    {expanded && <span className="truncate">{item.label}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <>
      {/* Desktop/tablet rail -- unchanged behaviour, just hidden below md now
          that the mobile drawer exists as the phone-width equivalent. */}
      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-[var(--dur-standard)] md:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {navList(!collapsed)}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs font-medium text-ink-muted hover:text-ink"
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!collapsed && "Collapse"}
        </button>
      </aside>

      {/* Mobile off-canvas drawer -- the "slide-out drawer on Mobile" this
          component's own doc comment always promised but never implemented. */}
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/30 transition-opacity duration-[var(--dur-page)]",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={onMobileClose}
        />
        <aside
          className={cn(
            "absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-surface shadow-4 transition-transform duration-[var(--dur-page)] ease-[var(--ease-out)]",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Panel is left-anchored (absolute left-0 top-0 h-full) -- in
              standalone iOS this sits under the notch/Dynamic Island, and in
              landscape with the device rotated so the sensor housing is on
              the left, under that too. env() is 0 everywhere else. */}
          <div
            className="flex items-center justify-between border-b border-line px-4 py-3"
            style={{
              paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
              paddingLeft: "calc(1rem + env(safe-area-inset-left))",
            }}
          >
            <span className="text-sm font-semibold text-ink">Menu</span>
            <button aria-label="Close menu" onClick={onMobileClose} className="rounded p-1 text-ink-muted hover:bg-surface-sunken">
              <X size={16} />
            </button>
          </div>
          {navList(true)}
        </aside>
      </div>
    </>
  );
}
