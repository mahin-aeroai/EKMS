"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LfgConnectNavBar } from "./LfgConnectNavBar";

// Shared page header for every LFG Connect page -- icon + "LFG Connect"
// brand title + a small pill naming the current section (matches the
// reference mockup's "LFG Connect" + "Site Master" pill treatment) +
// subtitle on the left, with the primary action (e.g. "+ New Site")
// pinned top-right on that SAME row -- and the LfgConnectNavBar tab strip
// on its own row underneath. Two rows rather than cramming the action
// button in beside the (now 7-tab) nav strip: at real content widths the
// title's subtitle text and the nav strip both want room on the same
// line as a trailing action button, and a shared flex-wrap container
// wrapped the button below the WHOLE nav strip instead of just letting
// the row wrap normally -- exactly the "New Site ended up below the menu
// line" bug. Splitting into two rows removes that fight for space
// entirely: the action button always sits at the top right next to the
// title, never below the nav strip, on every viewport width. Every LFG
// Connect page (Site Master, Dashboard, Programs, Stores, Status Sheet,
// Activity Log, Partners) renders this instead of its own one-off title
// block + button row, so the "menu design" reads identically everywhere.
// Site 360 (workspaces/lfg/sites/[id]) deliberately does NOT use this --
// it's a record detail page, not a section of the module nav.
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
    <div className="mt-4 border-b border-line pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-4 overflow-x-auto sm:flex sm:justify-end">
        <LfgConnectNavBar />
      </div>
    </div>
  );
}
