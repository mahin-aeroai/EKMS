import Link from "next/link";
import { getOnPortalHost } from "@/lib/portal-host-server";
import { portalHref } from "@/lib/portal-links-shared";

export const metadata = { title: "Policies — MMDI" };

const PAGES = [
  { href: "/policies/shipping", label: "Shipping Policy", blurb: "How and when orders placed on the portal are dispatched and delivered." },
  { href: "/policies/contact-us", label: "Contact Us", blurb: "How to reach us about an order, a payment, or anything else." },
  { href: "/policies/pricing", label: "Pricing Details", blurb: "How pricing works for products and services ordered through the portal." },
  { href: "/policies/terms", label: "Terms & Conditions", blurb: "The terms that apply to using the portal and placing an order." },
  { href: "/policies/privacy", label: "Privacy Policy", blurb: "What information we collect through the portal and how it's used." },
  { href: "/policies/cancellation-refunds", label: "Cancellation & Refunds", blurb: "When an order can be cancelled and how refunds are handled." },
];

export default async function PoliciesIndexPage() {
  const onPortalHost = await getOnPortalHost();

  return (
    <div>
      <h1 className="text-xl font-semibold text-ink">Policies</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        Everything below applies to orders placed through the MMDI Customer Portal.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        {PAGES.map((p) => (
          <Link
            key={p.href}
            href={portalHref(p.href, onPortalHost)}
            className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-sunken"
          >
            <div className="text-sm font-medium text-ink">{p.label}</div>
            <div className="mt-1 text-xs text-ink-secondary">{p.blurb}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
