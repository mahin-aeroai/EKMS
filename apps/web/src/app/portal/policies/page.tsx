import Link from "next/link";
import { LayoutList, Truck, Phone, IndianRupee, FileText, ShieldCheck, RotateCcw, ChevronRight } from "lucide-react";
import { getOnPortalHost } from "@/lib/portal-host-server";
import { portalHref } from "@/lib/portal-links-shared";
import { PolicyHeader } from "@/components/portal/PolicyPageChrome";

export const metadata = { title: "Policies — MMDI" };

const PAGES = [
  { href: "/policies/shipping", label: "Shipping Policy", blurb: "How and when orders placed on the portal are dispatched and delivered.", icon: Truck },
  { href: "/policies/contact-us", label: "Contact Us", blurb: "How to reach us about an order, a payment, or anything else.", icon: Phone },
  { href: "/policies/pricing", label: "Pricing Details", blurb: "How pricing works for products and services ordered through the portal.", icon: IndianRupee },
  { href: "/policies/terms", label: "Terms & Conditions", blurb: "The terms that apply to using the portal and placing an order.", icon: FileText },
  { href: "/policies/privacy", label: "Privacy Policy", blurb: "What information we collect through the portal and how it's used.", icon: ShieldCheck },
  { href: "/policies/cancellation-refunds", label: "Cancellation & Refunds", blurb: "When an order can be cancelled and how refunds are handled.", icon: RotateCcw },
];

export default async function PoliciesIndexPage() {
  const onPortalHost = await getOnPortalHost();

  return (
    <div>
      <PolicyHeader icon={<LayoutList size={22} />} title="Policies" />
      <p className="text-sm leading-relaxed text-ink-secondary">
        Everything below applies to orders placed through the MMDI Customer Portal.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {PAGES.map((p) => (
          <Link
            key={p.href}
            href={portalHref(p.href, onPortalHost)}
            className="group flex items-center gap-4 rounded-lg border border-line bg-surface p-4 shadow-1 transition-colors hover:border-primary/40 hover:bg-surface-sunken"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
              <p.icon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">{p.label}</div>
              <div className="mt-0.5 text-xs text-ink-secondary">{p.blurb}</div>
            </div>
            <ChevronRight size={16} className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}
