import { MMDI_COMPANY } from "@/lib/mmdi-company";

export const metadata = { title: "Shipping Policy — MMDI" };

export default function ShippingPolicyPage() {
  return (
    <article>
      <h1 className="text-xl font-semibold text-ink">Shipping Policy</h1>
      <p className="mt-1 text-xs text-ink-muted">Last updated: August 2026</p>

      <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
        This policy covers how orders placed through the {MMDI_COMPANY.legalName} Customer Portal are produced,
        packed and delivered.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Made-to-order production</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Most items ordered through the portal (signage, displays and related printed/fabricated products) are
        manufactured to order rather than shipped from stock. Production begins once an order is confirmed and
        payment is received, and the order&apos;s status is visible to you in the portal at every stage from
        submission through dispatch.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Dispatch &amp; delivery</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-secondary">
        <li>Orders are dispatched from our Hyderabad facility ({MMDI_COMPANY.address}) via third-party courier or freight partners.</li>
        <li>Delivery timelines depend on the product, order volume and delivery location, and are communicated for each order rather than fixed in advance — check your order&apos;s status in the portal or contact us for a specific estimate.</li>
        <li>Delivery is made to the address on file for the store/site the order was placed against. Please make sure that address is accurate and reachable before confirming an order.</li>
        <li>A shipment tracking reference (courier and AWB/tracking number) is added to the order once it is dispatched, where applicable.</li>
      </ul>

      <h2 className="mt-6 text-sm font-semibold text-ink">Damaged or incorrect deliveries</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Please inspect items on delivery. If something arrives damaged, incomplete, or different from what was
        ordered, contact us within 48 hours of delivery (see <em>Contact Us</em>) with your order number and photos
        of the issue, and we&apos;ll work with you to resolve it.
      </p>

      <h2 className="mt-6 text-sm font-semibold text-ink">Questions</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        For anything not covered here — an order-specific delivery estimate, a change of delivery address before
        dispatch, or a shipping issue — reach out via the details on our <em>Contact Us</em> page.
      </p>
    </article>
  );
}
