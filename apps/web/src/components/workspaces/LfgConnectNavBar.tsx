"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarRange,
  Store as StoreIcon,
  ArrowLeftRight,
  FileClock,
  Users,
  type LucideIcon,
} from "lucide-react";

// Shared top nav for every LFG Connect page (Site Master, Dashboard,
// Programs, Stores, Status Sheet, Activity Log, Partners) -- built per the
// reference mockup the user supplied ("alter the menu design like this")
// showing stacked icon-over-label tiles in a single bordered segmented
// container, with the current section highlighted. Replaces the old
// per-page ad hoc button row (Site Master's row of plain secondary
// Buttons) and each sub-page's lone "Back to Site Master"/"Site Master"
// button -- one component, one look, everywhere in the module.
//
// Active tab is derived from the real route via usePathname() rather than
// a prop each page has to remember to pass -- Site Master itself is
// "/workspaces/lfg" exactly (not a prefix match, or every sub-route would
// also light up Dashboard... no, Site Master, since it's the shortest
// path); every other tab matches by prefix so a page like
// /workspaces/lfg/sites/[id] (Site 360, which does NOT get this nav bar --
// see its own header) never accidentally lights one up if it ever did.
const TABS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/workspaces/lfg/dashboard", icon: LayoutDashboard },
  { label: "Programs", href: "/workspaces/lfg/programs", icon: CalendarRange },
  { label: "Stores", href: "/workspaces/lfg/stores", icon: StoreIcon },
  { label: "Status Sheet", href: "/workspaces/lfg/status-sheet", icon: ArrowLeftRight },
  { label: "Activity Log", href: "/workspaces/lfg/activity", icon: FileClock },
  { label: "Partners", href: "/workspaces/lfg/partners", icon: Users },
];

export function LfgConnectNavBar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-line bg-surface-sunken/60 p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(tab.href + "/");
        const Icon = tab.icon;
        return (
          <button
            key={tab.href}
            type="button"
            onClick={() => router.push(tab.href)}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-[4.25rem] flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
              active
                ? "bg-primary-tint text-primary shadow-[inset_0_-2px_0_0_var(--color-primary)]"
                : "text-ink-secondary hover:bg-surface hover:text-ink"
            }`}
          >
            <Icon size={16} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
