"use client";

import { Bell, Search, Sparkles } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { Badge } from "./Badge";

/**
 * Top Navigation — Deliverable 3.4 / Navigation System Deliverable 5
 * Purpose: persistent chrome housing Search, Notifications, Profile, and the AI entry point.
 * Usage rule: identical across every workspace — never customized per module.
 */
export function TopNav({
  onOpenSearch,
  onOpenAI,
  notificationCount = 0,
}: {
  onOpenSearch?: () => void;
  onOpenAI?: () => void;
  notificationCount?: number;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <span className="font-semibold text-ink">MMDI ONE</span>
      <span className="text-ink-muted">/</span>
      <span className="text-sm text-ink-secondary">Design System</span>

      <button
        onClick={onOpenSearch}
        className="ml-4 flex flex-1 max-w-md items-center gap-2 rounded-md border border-line-strong bg-surface-sunken px-3 py-1.5 text-sm text-ink-muted hover:border-primary"
      >
        <Search size={15} />
        Search MMDI ONE…
        <kbd className="ml-auto rounded border border-line-strong bg-surface px-1.5 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <ThemeSwitcher />
        <button
          onClick={onOpenAI}
          className="flex items-center gap-1.5 rounded-md bg-ai-tint px-3 py-1.5 text-sm font-medium text-ai hover:opacity-90"
        >
          <Sparkles size={15} />
          Ask AI
        </button>
        <button aria-label="Notifications" className="relative rounded-md p-2 text-ink-secondary hover:bg-surface-sunken">
          <Bell size={18} />
          {notificationCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5">
              <Badge count={notificationCount} />
            </span>
          )}
        </button>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-on-brand">
          MK
        </span>
      </div>
    </header>
  );
}
