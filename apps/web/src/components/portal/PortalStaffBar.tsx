"use client";

import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePortalHost, portalHref } from "@/lib/portal-links";
import { APP_HOST } from "@/lib/app-host";

// Shown instead of PortalTopBar when an MMDI staff account (admin/editor/
// viewer -- no portal_users row of its own) is previewing a /portal/*
// page. Deliberately minimal: no Products/Account/Security nav, since
// those pages assume a real portal_users identity (getPortalIdentity()
// returning non-null) and would 404/redirect for staff -- staff reach a
// specific order via a direct link from the internal app's Customer
// Portal workspace (OrdersTab.tsx), not by browsing this nav.
//
// signOut() here ends the STAFF session -- same as PortalTopBar's own
// sign-out -- since portal.mmdi.in and app.mmdi.in are the same Supabase
// project/session, just different hostnames.
export function PortalStaffBar() {
  const onPortalHost = usePortalHost();

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = portalHref("/login", onPortalHost);
  }

  return (
    <header className="border-b border-line bg-warning-tint">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- same small local asset PortalTopBar uses */}
          <img src="/brand/mmdi-logo-sm.png" alt="MMDI" className="h-6 w-6 shrink-0 rounded-md object-cover" />
          <span className="text-xs font-medium text-ink">
            MMDI staff preview — this account has no customer-portal login of its own.
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* A plain cross-host link, not next/link -- MMDI ONE (app.mmdi.in) is a
              different hostname from wherever this portal page is being
              previewed from (portal.mmdi.in, app.mmdi.in/portal/*, or a
              Vercel preview URL), so client-side routing can't take us there. */}
          <a href={`https://${APP_HOST}/`} className="text-xs font-medium text-ink-secondary hover:text-ink hover:underline">
            Back to MMDI ONE
          </a>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-ink"
            aria-label="Sign out"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
