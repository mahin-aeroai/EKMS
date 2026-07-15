"use client";

import { useState } from "react";
import { Bell, LogOut, Search, Sparkles } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { Badge } from "./Badge";

function initialsFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "?";
}

/**
 * Top Navigation — Deliverable 3.4 / Navigation System Deliverable 5
 * Purpose: persistent chrome housing Search, Notifications, Profile, and the AI entry point.
 * Usage rule: identical across every workspace — never customized per module.
 */
export function TopNav({
  onOpenSearch,
  onOpenAI,
  notificationCount = 0,
  userEmail,
  onSignOut,
}: {
  onOpenSearch?: () => void;
  onOpenAI?: () => void;
  notificationCount?: number;
  userEmail?: string | null;
  onSignOut?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

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

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Account menu"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-on-brand"
          >
            {userEmail ? initialsFromEmail(userEmail) : "?"}
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-20 w-56 rounded-md border border-line bg-surface p-1 shadow-lg">
                {userEmail && (
                  <div className="truncate border-b border-line px-3 py-2 text-xs text-ink-muted">
                    {userEmail}
                  </div>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
