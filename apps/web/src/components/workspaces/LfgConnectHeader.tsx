"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LfgConnectNavBar } from "./LfgConnectNavBar";

// Shared page header for every LFG Connect page -- icon + "LFG Connect"
// brand title + a small pill naming the current section (matches the
// reference mockup's "LFG Connect" + "Site Master" pill treatment) +
// subtitle on the left, the LfgConnectNavBar tab strip + an optional
// primary action (e.g. "+ New Site") on the right. Every LFG Connect page
// (Site Master, Dashboard, Programs, Stores, Status Sheet, Activity Log,
// Partners) renders this instead of its own one-off title block + button
// row, so the "menu design" reads identically everywhere, not just on
// Site Master where the reference screenshot was taken. Site 360
// (workspaces/lfg/sites/[id]) deliberately does NOT use this -- it's a
// record detail page, not a section of the module nav.
export function LfgConnectHeader({
  icon: Icon,
  section,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  section: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <Icon size={22} />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">LFG Connect</h1>
            <span className="inline-flex items-center rounded-full bg-info-tint px-2.5 py-0.5 text-[11px] font-semibold text-info">
              {section}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-ink-secondary">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <LfgConnectNavBar />
        {action}
      </div>
    </div>
  );
}
