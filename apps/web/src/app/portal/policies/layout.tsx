import type { ReactNode } from "react";
import Link from "next/link";
import { getOnPortalHost } from "@/lib/portal-host-server";
import { portalHref } from "@/lib/portal-links-shared";
import { MMDI_COMPANY } from "@/lib/mmdi-company";
import { PortalPolicyFooter } from "@/components/portal/PortalPolicyFooter";

export const dynamic = "force-dynamic";

// Public (no-login-required) policy pages -- see supabase-middleware.ts's
// PUBLIC_PATH_PREFIXES comment for why this whole /portal/policies/* tree
// is deliberately excluded from the auth redirect. These exist specifically
// so Razorpay's "registered business website" review of portal.mmdi.in (see
// the live-mode "Payment blocked as website does not match registered
// website(s)" error) has somewhere to find Shipping/Contact/Pricing/Terms/
// Privacy/Cancellation & Refunds -- and so a real customer can too. Content
// pages under this layout should stay plain server-rendered prose; no
// client interactivity needed here.
const NAV = [
  { href: "/policies", label: "All Policies" },
  { href: "/policies/shipping", label: "Shipping Policy" },
  { href: "/policies/contact-us", label: "Contact Us" },
  { href: "/policies/pricing", label: "Pricing Details" },
  { href: "/policies/terms", label: "Terms & Conditions" },
  { href: "/policies/privacy", label: "Privacy Policy" },
  { href: "/policies/cancellation-refunds", label: "Cancellation & Refunds" },
];

export default async function PoliciesLayout({ children }: { children: ReactNode }) {
  const onPortalHost = await getOnPortalHost();

  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:px-6">
          <Link href={portalHref("/", onPortalHost)} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static local asset, same as PortalTopBar */}
            <img src="/brand/mmdi-logo-sm.png" alt="MMDI" className="h-8 w-8 shrink-0 rounded-md object-cover" />
            <span className="text-sm font-semibold text-ink">{MMDI_COMPANY.legalName}</span>
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {NAV.map((item) => (
              <Link key={item.href} href={portalHref(item.href, onPortalHost)} className="text-ink-secondary hover:text-ink hover:underline">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="h-1 bg-gradient-to-r from-primary via-danger to-primary" />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>

      <PortalPolicyFooter onPortalHost={onPortalHost} />
    </div>
  );
}
