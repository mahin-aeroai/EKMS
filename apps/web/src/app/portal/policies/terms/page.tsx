import { MMDI_COMPANY } from "@/lib/mmdi-company";

export const metadata = { title: "Terms & Conditions — MMDI" };

export default function TermsPage() {
  return (
    <article>
      <h1 className="text-xl font-semibold text-ink">Terms &amp; Conditions</h1>
      <p className="mt-1 text-xs text-ink-muted">Last updated: August 2026</p>

      <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
        These terms apply to your use of the {MMDI_COMPANY.legalName} Customer Portal and to any order placed
        through it. By creating an account, signing in, or placing an order, you agree to these terms on behalf of
        the organization you represent.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Account access</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Portal accounts are provisioned by MMDI for authorized representatives of our customer organizations
        (invite-only — there is no public self-registration). Keep your login credentials confidential; you are
        responsible for activity on your account.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Orders</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Placing an order through the portal is an offer to purchase the listed items at the rates shown, which we
        accept by confirming and beginning production. Pricing is described in full in our{" "}
        <em>Pricing Details</em> page. Once payment is completed, an order moves into production per our{" "}
        <em>Shipping Policy</em> and <em>Cancellation &amp; Refunds</em> terms.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Product accuracy</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        We take reasonable care to ensure product descriptions, dimensions and specifications shown in the portal
        are accurate. Since most items are custom-manufactured, please confirm specifications with us before
        ordering if you have any doubt — corrections after production has begun may not be possible.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Intellectual property</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Artwork, designs and files you upload through the portal remain your property; you confirm you have the
        rights necessary to have them produced. Templates, tools and content provided by MMDI through the portal
        remain our property.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Limitation of liability</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Our liability for any order is limited to the value of that order. We are not liable for indirect or
        consequential losses arising from a delayed or defective delivery, beyond replacement or remedy of the
        affected items as described in our <em>Cancellation &amp; Refunds</em> policy.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Governing law</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        These terms are governed by the laws of India, and any dispute is subject to the exclusive jurisdiction of
        the courts at Hyderabad, Telangana.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Changes to these terms</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        We may update these terms from time to time; the &ldquo;Last updated&rdquo; date above reflects the most
        recent revision. Continued use of the portal after an update constitutes acceptance of the revised terms.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Contact</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Questions about these terms — see <em>Contact Us</em>.
      </p>
    </article>
  );
}
