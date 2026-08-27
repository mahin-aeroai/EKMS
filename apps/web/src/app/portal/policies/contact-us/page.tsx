import { MMDI_COMPANY } from "@/lib/mmdi-company";

export const metadata = { title: "Contact Us — MMDI" };

export default function ContactUsPage() {
  return (
    <article>
      <h1 className="text-xl font-semibold text-ink">Contact Us</h1>
      <p className="mt-1 text-xs text-ink-muted">Last updated: August 2026</p>

      <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
        For anything related to an order, payment, or account on the Customer Portal, reach us at:
      </p>

      <dl className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2">
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

      <h2 className="mt-6 text-sm font-semibold text-ink">Order or payment queries</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Have your order number ready (visible on the Orders tab of the portal) when you get in touch — it helps us
        find and resolve your query faster. For account access issues (invite, login, password), a staff member at
        your organization&apos;s MMDI point of contact can also request a new invite on your behalf.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Business hours</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Our team is available Monday–Saturday during standard Indian business hours (IST). Queries received outside
        these hours are picked up the next working day.
      </p>
    </article>
  );
}
