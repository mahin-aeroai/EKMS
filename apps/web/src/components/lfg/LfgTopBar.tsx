"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, MapPin, ClipboardCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";
import { useLfgHost, lfgHref } from "@/lib/lfg-links";

// Bare, /lfg-less paths -- lfgHref() below adds the /lfg prefix back on
// hosts where the middleware doesn't rewrite it for us. Just "Sites" for
// now -- the Site Master / Site 360 view (task #19) is LfgPartnerSitesPage
// (src/app/lfg/(app)/page.tsx) + LfgPartnerSiteClient.tsx, which reuse the
// same Survey/Production/Shipment/Installation/Documents tab components as
// the staff workspace. Add more entries here (Account/etc.) as those land,
// mirroring PortalTopBar's NAV.
const NAV = [
  { href: "/", label: "Sites", icon: MapPin },
  { href: "/site-survey-reports", label: "Site Surveys", icon: ClipboardCheck },
];

export function LfgTopBar({
  partnerName,
  fullName,
  email,
}: {
  partnerName: string;
  fullName: string | null;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const onLfgHost = useLfgHost();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push(lfgHref("/login", onLfgHost));
    router.refresh();
  }

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Link href={lfgHref("/", onLfgHost)} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static local asset, same as PortalTopBar */}
            <img src="/brand/lfg-connect-logo.png" alt="LFG Connect" className="h-8 w-8 shrink-0 rounded-md object-cover" />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-ink">{partnerName || "LFG Connect"}</span>
              <span className="text-xs text-ink-muted">{fullName || email}</span>
            </span>
          </Link>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const resolvedHref = lfgHref(href, onLfgHost);
            const active = pathname === resolvedHref || (href !== "/" && pathname?.startsWith(resolvedHref + "/"));
            return (
              <Link
                key={href}
                href={resolvedHref}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-primary text-on-brand" : "text-ink-secondary hover:bg-surface-sunken hover:text-ink"
                )}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
            aria-label="Sign out"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
