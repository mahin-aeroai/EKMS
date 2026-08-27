import { ShieldCheck } from "lucide-react";
import { MMDI_COMPANY } from "@/lib/mmdi-company";
import { PolicyHeader, PolicySection } from "@/components/portal/PolicyPageChrome";

export const metadata = { title: "Privacy Policy — MMDI" };

export default function PrivacyPolicyPage() {
  return (
    <article>
      <PolicyHeader icon={<ShieldCheck size={22} />} title="Privacy Policy" />

      <p className="text-sm leading-relaxed text-ink-secondary">
        This policy explains what information {MMDI_COMPANY.legalName} collects through the Customer Portal, and
        how it&apos;s used.
      </p>

      <PolicySection title="Information we collect">
        <ul>
          <li>Account details: name, email address, and organization, for portal accounts we provision for you.</li>
          <li>Order details: items ordered, delivery address, GSTIN, and any artwork/files you upload for production.</li>
          <li>Payment details: handled entirely by Razorpay, our payment processor — we never see or store your full card, UPI, or bank account details, only a payment reference and status against your order.</li>
          <li>Usage information: standard technical logs (like sign-in activity) needed to operate and secure the portal.</li>
        </ul>
      </PolicySection>

      <PolicySection title="How we use it">
        <p>
          We use this information to process and deliver your orders, communicate with you about them, maintain your
          portal account, and meet our legal/tax obligations (such as GST invoicing). We do not sell your information
          to third parties.
        </p>
      </PolicySection>

      <PolicySection title="Who we share it with">
        <p>
          Only the parties needed to fulfil your order and its payment: Razorpay (payment processing) and the courier
          or freight partner used to deliver a given order. We don&apos;t share your data with anyone else without
          your consent, except where required by law.
        </p>
      </PolicySection>

      <PolicySection title="Data retention">
        <p>
          We retain order and account records for as long as your organization has an active portal relationship
          with us, and afterward for as long as required to meet accounting, tax and legal record-keeping
          obligations.
        </p>
      </PolicySection>

      <PolicySection title="Your choices">
        <p>
          You can review your organization&apos;s account and order details directly in the portal at any time.
          To request a correction, or to ask what information we hold about your organization, contact us — see{" "}
          <em>Contact Us</em>.
        </p>
      </PolicySection>

      <PolicySection title="Changes to this policy">
        <p>
          We may update this policy from time to time; the &ldquo;Last updated&rdquo; date above reflects the most
          recent revision.
        </p>
      </PolicySection>
    </article>
  );
}
