"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Package, ClipboardList, Building2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/portal/products", label: "Products", icon: Package },
  { href: "/portal/orders", label: "Orders", icon: ClipboardList },
  { href: "/portal/account", label: "Account", icon: Building2 },
  { href: "/portal/security", label: "Security", icon: ShieldCheck },
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

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/portal/login");
    router.refresh();
  }

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/portal" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-on-brand">
              M
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-ink">{companyName || "Customer Portal"}</span>
              <span className="text-xs text-ink-muted">{fullName || email}</span>
            </span>
          </Link>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
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
