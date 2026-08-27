import { Phone } from "lucide-react";
import { MMDI_COMPANY } from "@/lib/mmdi-company";
import { PolicyHeader, PolicySection } from "@/components/portal/PolicyPageChrome";

export const metadata = { title: "Contact Us — MMDI" };

export default function ContactUsPage() {
  return (
    <article>
      <PolicyHeader icon={<Phone size={22} />} title="Contact Us" />

      <p className="text-sm leading-relaxed text-ink-secondary">
        For anything related to an order, payment, or account on the Customer Portal, reach us at:
      </p>

      <div className="mt-4 rounded-lg border border-line bg-surface p-5 shadow-1">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-muted">Company</dt>
            <dd className="mt-0.5 text-sm text-ink">{MMDI_COMPANY.legalName}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">GSTIN</dt>
            <dd className="mt-0.5 text-sm text-ink">{MMDI_COMPANY.gstin}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-ink-muted">Registered / operating address</dt>
            <dd className="mt-0.5 text-sm text-ink">{MMDI_COMPANY.address}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Phone</dt>
            <dd className="mt-0.5 text-sm text-ink">{MMDI_COMPANY.phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Email</dt>
            <dd className="mt-0.5 text-sm text-ink">{MMDI_COMPANY.email}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-ink-muted">Website</dt>
            <dd className="mt-0.5 text-sm text-ink">{MMDI_COMPANY.web}</dd>
          </div>
        </dl>
      </div>

      <PolicySection title="Order or payment queries">
        <p>
          Have your order number ready (visible on the Orders tab of the portal) when you get in touch — it helps us
          find and resolve your query faster. For account access issues (invite, login, password), a staff member at
          your organization&apos;s MMDI point of contact can also request a new invite on your behalf.
        </p>
      </PolicySection>

      <PolicySection title="Business hours">
        <p>
          Our team is available Monday–Saturday during standard Indian business hours (IST). Queries received outside
          these hours are picked up the next working day.
        </p>
      </PolicySection>
    </article>
  );
}
