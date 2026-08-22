"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Package, ClipboardList, Building2, ShieldCheck, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";
import { usePortalHost, portalHref } from "@/lib/portal-links";

// Bare, /portal-less paths -- portalHref() below adds the /portal prefix
// back on hosts where the middleware doesn't rewrite it for us.
const NAV = [
  { href: "/products", label: "Products", icon: Package },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/account", label: "Account", icon: Building2 },
  { href: "/security", label: "Security", icon: ShieldCheck },
];

export function PortalTopBar({
  companyName,
  fullName,
  email,
}: {
  companyName: string;
  fullName: string | null;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const onPortalHost = usePortalHost();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push(portalHref("/login", onPortalHost));
    router.refresh();
  }

  const cartHref = portalHref("/orders/new", onPortalHost);

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Link href={portalHref("/", onPortalHost)} className="flex items-center gap-2">
            {/*
              MMDI's own real logo (the same file already used in the
              estimate-PDF builder), not the bold "M" placeholder square nor
              any Apple-shaped icon. This portal is a customer-facing MMDI
              product, not an Apple one -- an Apple logo mark here would be
              using Apple's actual trademark on a live commercial site
              without any brand-usage agreement covering that, which isn't
              something to do just because it'd look "more relevant."
            */}
            {/* eslint-disable-next-line @next/next/no-img-element -- small static local asset, next/image isn't used anywhere else in this app */}
            <img src="/brand/mmdi-logo-sm.png" alt="MMDI" className="h-8 w-8 shrink-0 rounded-md object-cover" />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-ink">{companyName || "Customer Portal"}</span>
              <span className="text-xs text-ink-muted">{fullName || email}</span>
            </span>
          </Link>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const resolvedHref = portalHref(href, onPortalHost);
            const active = pathname === resolvedHref || pathname?.startsWith(resolvedHref + "/");
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
          <Link
            href={cartHref}
            aria-label="Cart — start a new order"
            title="Cart"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <ShoppingCart size={16} />
          </Link>
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
