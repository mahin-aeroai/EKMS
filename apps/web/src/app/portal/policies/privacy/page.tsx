import { MMDI_COMPANY } from "@/lib/mmdi-company";

export const metadata = { title: "Privacy Policy — MMDI" };

export default function PrivacyPolicyPage() {
  return (
    <article>
      <h1 className="text-xl font-semibold text-ink">Privacy Policy</h1>
      <p className="mt-1 text-xs text-ink-muted">Last updated: August 2026</p>

      <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
        This policy explains what information {MMDI_COMPANY.legalName} collects through the Customer Portal, and
        how it&apos;s used.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Information we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-secondary">
        <li>Account details: name, email address, and organization, for portal accounts we provision for you.</li>
        <li>Order details: items ordered, delivery address, GSTIN, and any artwork/files you upload for production.</li>
        <li>Payment details: handled entirely by Razorpay, our payment processor — we never see or store your full card, UPI, or bank account details, only a payment reference and status against your order.</li>
        <li>Usage information: standard technical logs (like sign-in activity) needed to operate and secure the portal.</li>
      </ul>

      <h2 className="mt-6 text-sm font-semibold text-ink">How we use it</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        We use this information to process and deliver your orders, communicate with you about them, maintain your
        portal account, and meet our legal/tax obligations (such as GST invoicing). We do not sell your information
        to third parties.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Who we share it with</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Only the parties needed to fulfil your order and its payment: Razorpay (payment processing) and the courier
        or freight partner used to deliver a given order. We don&apos;t share your data with anyone else without
        your consent, except where required by law.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Data retention</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        We retain order and account records for as long as your organization has an active portal relationship
        with us, and afterward for as long as required to meet accounting, tax and legal record-keeping
        obligations.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Your choices</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        You can review your organization&apos;s account and order details directly in the portal at any time.
        To request a correction, or to ask what information we hold about your organization, contact us — see{" "}
        <em>Contact Us</em>.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Changes to this policy</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        We may update this policy from time to time; the &ldquo;Last updated&rdquo; date above reflects the most
        recent revision.
      </p>
    </article>
  );
}
