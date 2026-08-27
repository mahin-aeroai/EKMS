import { RotateCcw } from "lucide-react";
import { PolicyHeader, PolicySection } from "@/components/portal/PolicyPageChrome";

export const metadata = { title: "Cancellation & Refunds — MMDI" };

export default function CancellationRefundsPage() {
  return (
    <article>
      <PolicyHeader icon={<RotateCcw size={22} />} title="Cancellation & Refunds" />

      <p className="text-sm leading-relaxed text-ink-secondary">
        Because most items ordered through the Customer Portal are custom-manufactured to your specifications
        (dimensions, materials, artwork), our cancellation and refund terms reflect that rather than a standard
        retail return policy.
      </p>

      <PolicySection title="Cancelling an order">
        <ul>
          <li>An order can be cancelled free of charge any time before payment is completed — simply don&apos;t proceed to payment, or contact us if it&apos;s already submitted.</li>
          <li>Once payment is completed and production has begun, the order generally cannot be cancelled, since materials are cut/printed and labour committed specifically for it.</li>
          <li>If you need to cancel after payment but believe production hasn&apos;t started yet, contact us immediately (see <em>Contact Us</em>) — we&apos;ll do our best to stop it in time, but can&apos;t guarantee it.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Refunds">
        <ul>
          <li>If an order is cancelled before production begins, any amount already paid is refunded in full to the original payment method.</li>
          <li>If an item arrives damaged, defective, or materially different from what was ordered, contact us within 48 hours of delivery with your order number and photos — we&apos;ll repair, replace, or refund the affected item at our discretion.</li>
          <li>Approved refunds are processed back to the original Razorpay payment method and typically reflect within 5–7 business days, depending on your bank/card issuer.</li>
        </ul>
      </PolicySection>

      <PolicySection title="What isn't covered">
        <p>
          Change-of-mind returns are not available once production has begun, since items are made specifically to
          your order. Minor variations inherent to the production process (small tolerances in colour, cut, or
          material grain) are not considered defects.
        </p>
      </PolicySection>

      <PolicySection title="Questions">
        <p>
          For anything about a specific order&apos;s cancellation or refund status, contact us — see{" "}
          <em>Contact Us</em> — with your order number.
        </p>
      </PolicySection>
    </article>
  );
}
