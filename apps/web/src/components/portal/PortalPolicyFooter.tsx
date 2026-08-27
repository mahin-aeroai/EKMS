import Link from "next/link";
import { portalHref } from "@/lib/portal-links-shared";

// No "use client" directive on purpose -- rendered from both a Server
// Component ((app)/layout.tsx) and a Client Component (login/page.tsx), so
// it needs to work as either. Plain links to the public policy pages under
// /portal/policies/* (see supabase-middleware.ts's PUBLIC_PATH_PREFIXES) --
// this is the actual discoverable footer link Razorpay's business-website
// review looks for; the pages being merely URL-reachable isn't enough on
// its own. Shown on every portal page, signed in or not, so it's visible
// to a customer, a reviewer, or an unauthenticated visitor on /login alike.
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
    <footer className="mx-auto flex max-w-4xl flex-wrap justify-center gap-x-4 gap-y-1.5 px-4 py-6 text-xs text-ink-muted sm:px-6">
      {LINKS.map((l) => (
        <Link key={l.href} href={portalHref(l.href, onPortalHost)} className="hover:text-ink hover:underline">
          {l.label}
        </Link>
      ))}
    </footer>
  );
}
