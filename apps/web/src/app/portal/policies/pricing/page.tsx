export const metadata = { title: "Pricing Details — MMDI" };

export default function PricingPage() {
  return (
    <article>
      <h1 className="text-xl font-semibold text-ink">Pricing Details</h1>
      <p className="mt-1 text-xs text-ink-muted">Last updated: August 2026</p>

      <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
        Products and services ordered through the Customer Portal are priced on a per-order basis rather than a
        fixed public catalogue, since most items are made to order (custom dimensions, materials, and finishing).
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">How an order is priced</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-secondary">
        <li>The rate for each line item is agreed with your organization in advance (by quotation/contract) and reflected against the product when you place an order in the portal.</li>
        <li>Every order shows a line-item breakdown — quantity, rate, and line total — before you confirm it.</li>
        <li>Applicable taxes (GST) are shown separately and added to the order subtotal at checkout, calculated per prevailing Indian GST rates.</li>
        <li>The final amount charged is the amount shown on the order at the time of payment — there are no hidden fees added afterward.</li>
      </ul>

      <h2 className="mt-6 text-sm font-semibold text-ink">Payments</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Payments are collected securely through Razorpay. We do not store your card, UPI, or bank details — Razorpay
        processes the payment directly and only a payment reference is recorded against your order.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Questions about a quote or price</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        If a rate on your order looks different from what was quoted, contact us before completing payment — see{" "}
        <em>Contact Us</em> — and we&apos;ll review it with you.
      </p>
    </article>
  );
}
