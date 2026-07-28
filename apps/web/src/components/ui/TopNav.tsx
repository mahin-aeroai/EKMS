"use client";

import { useState } from "react";
import { Bell, LogOut, Menu, Search, ShieldCheck, Sparkles } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { Badge, type BadgeStatus } from "./Badge";
import type { UserRole } from "@mmdi/shared/rows";

const ROLE_BADGE_STATUS: Record<UserRole, BadgeStatus> = {
  admin: "success",
  editor: "info",
  viewer: "neutral",
};

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

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
  onOpenNav,
  onOpenSearch,
  onOpenAI,
  notificationCount = 0,
  userEmail,
  userRole,
  onSignOut,
  onOpenAccount,
}: {
  onOpenNav?: () => void;
  onOpenSearch?: () => void;
  onOpenAI?: () => void;
  notificationCount?: number;
  userEmail?: string | null;
  userRole?: UserRole | null;
  onSignOut?: () => void;
  onOpenAccount?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:gap-3 sm:px-4"
      // Installed standalone on iOS (viewportFit: "cover" in the root
      // layout), the header would otherwise sit directly under the notch/
      // Dynamic Island with no clearance. env() resolves to 0 in a normal
      // browser tab, so this is a no-op outside standalone display.
      style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}
    >
      <button
        onClick={onOpenNav}
        aria-label="Open menu"
        className="rounded-md p-2 text-ink-secondary hover:bg-surface-sunken md:hidden"
      >
        <Menu size={18} />
      </button>

      <span className="font-semibold text-ink">MMDI ONE</span>
      {/* Below md there's no room for the breadcrumb once the hamburger and a
          usable search target are both in the row -- the brand mark alone is
          enough chrome at phone width. */}
      <span className="hidden text-ink-muted sm:inline">/</span>
      <span className="hidden text-sm text-ink-secondary sm:inline">Design System</span>

      <button
        onClick={onOpenSearch}
        aria-label="Search MMDI ONE"
        className="ml-1 flex items-center gap-2 rounded-md border border-line-strong bg-surface-sunken p-2 text-sm text-ink-muted hover:border-primary sm:ml-4 sm:flex-1 sm:max-w-md sm:px-3 sm:py-1.5"
      >
        <Search size={15} />
        <span className="hidden sm:inline">Search MMDI ONE…</span>
        <kbd className="ml-auto hidden rounded border border-line-strong bg-surface px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <div className="hidden md:flex">
          <ThemeSwitcher />
        </div>
        <button
          onClick={onOpenAI}
          className="flex items-center gap-1.5 rounded-md bg-ai-tint px-2.5 py-1.5 text-sm font-medium text-ai hover:opacity-90 sm:px-3"
        >
          <Sparkles size={15} />
          <span className="hidden sm:inline">Ask AI</span>
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
                  <div className="flex items-center justify-between gap-2 truncate border-b border-line px-3 py-2 text-xs text-ink-muted">
                    <span className="truncate">{userEmail}</span>
                    {userRole && (
                      <Badge status={ROLE_BADGE_STATUS[userRole]}>{ROLE_LABEL[userRole]}</Badge>
                    )}
                  </div>
                )}
                {/* Theme has nowhere else to live below md -- the pill switcher
                    in the header itself is hidden there for space, so it's
                    folded into this menu instead of just disappearing. */}
                <div className="border-b border-line px-3 py-2 md:hidden">
                  <ThemeSwitcher />
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAccount?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
                >
                  <ShieldCheck size={14} />
                  Account &amp; Security
                </button>
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
