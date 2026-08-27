import { IndianRupee } from "lucide-react";
import { PolicyHeader, PolicySection } from "@/components/portal/PolicyPageChrome";

export const metadata = { title: "Pricing Details — MMDI" };

export default function PricingPage() {
  return (
    <article>
      <PolicyHeader icon={<IndianRupee size={22} />} title="Pricing Details" />

      <p className="text-sm leading-relaxed text-ink-secondary">
        Products and services ordered through the Customer Portal are priced on a per-order basis rather than a
        fixed public catalogue, since most items are made to order (custom dimensions, materials, and finishing).
      </p>

      <PolicySection title="How an order is priced">
        <ul>
          <li>The rate for each line item is agreed with your organization in advance (by quotation/contract) and reflected against the product when you place an order in the portal.</li>
          <li>Every order shows a line-item breakdown — quantity, rate, and line total — before you confirm it.</li>
          <li>Applicable taxes (GST) are shown separately and added to the order subtotal at checkout, calculated per prevailing Indian GST rates.</li>
          <li>The final amount charged is the amount shown on the order at the time of payment — there are no hidden fees added afterward.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Payments">
        <p>
          Payments are collected securely through Razorpay. We do not store your card, UPI, or bank details — Razorpay
          processes the payment directly and only a payment reference is recorded against your order.
        </p>
      </PolicySection>

      <PolicySection title="Questions about a quote or price">
        <p>
          If a rate on your order looks different from what was quoted, contact us before completing payment — see{" "}
          <em>Contact Us</em> — and we&apos;ll review it with you.
        </p>
      </PolicySection>
    </article>
  );
}
