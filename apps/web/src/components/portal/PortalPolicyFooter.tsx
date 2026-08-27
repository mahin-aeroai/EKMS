import Link from "next/link";
import { portalHref } from "@/lib/portal-links-shared";
import { MMDI_COMPANY } from "@/lib/mmdi-company";

// No "use client" directive on purpose -- rendered from both a Server
// Component ((app)/layout.tsx) and a Client Component (login/page.tsx), so
// it needs to work as either. Plain links to the public policy pages under
// /portal/policies/* (see supabase-middleware.ts's PUBLIC_PATH_PREFIXES) --
// this is the actual discoverable footer link Razorpay's business-website
// review looks for; the pages being merely URL-reachable isn't enough on
// its own. Shown on every portal page, signed in or not, so it's visible
// to a customer, a reviewer, or an unauthenticated visitor on /login alike.
//
// Deliberately a plain black band rather than the theme's surface/ink
// tokens -- those flip between light and near-black across the app's
// light/dark themes (see globals.css), which would make this footer WHITE
// in light mode. A footer band is meant to read as a fixed, theme-invariant
// strip the way a real site footer does, so the colors here are literal.
const LINKS = [
  { href: "/policies/shipping", label: "Shipping Policy" },
  { href: "/policies/contact-us", label: "Contact Us" },
  { href: "/policies/pricing", label: "Pricing Details" },
  { href: "/policies/terms", label: "Terms & Conditions" },
  { href: "/policies/privacy", label: "Privacy Policy" },
  { href: "/policies/cancellation-refunds", label: "Cancellation & Refunds" },
];

export function PortalPolicyFooter({ onPortalHost }: { onPortalHost: boolean }) {
  return (
    <footer className="w-full bg-black">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-8 sm:px-6">
        <nav className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
          {LINKS.map((l, i) => (
            <span key={l.href} className="flex items-center">
              {i > 0 && <span className="mx-3 text-white/20">·</span>}
              <Link href={portalHref(l.href, onPortalHost)} className="text-xs text-white/70 transition-colors hover:text-white">
                {l.label}
              </Link>
            </span>
          ))}
        </nav>

        <div className="h-px w-full max-w-xs bg-white/10" />

        <div className="text-center text-xs leading-relaxed text-white/40">
          {MMDI_COMPANY.legalName} · {MMDI_COMPANY.address}
          <br />
          {MMDI_COMPANY.phone} · {MMDI_COMPANY.email} · GSTIN {MMDI_COMPANY.gstin}
        </div>
      </div>
    </footer>
  );
}
