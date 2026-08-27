import { Truck } from "lucide-react";
import { MMDI_COMPANY } from "@/lib/mmdi-company";
import { PolicyHeader, PolicySection } from "@/components/portal/PolicyPageChrome";

export const metadata = { title: "Shipping Policy — MMDI" };

export default function ShippingPolicyPage() {
  return (
    <article>
      <PolicyHeader icon={<Truck size={22} />} title="Shipping Policy" />

      <p className="text-sm leading-relaxed text-ink-secondary">
        This policy covers how orders placed through the {MMDI_COMPANY.legalName} Customer Portal are produced,
        packed and delivered.
      </p>

      <PolicySection title="Made-to-order production">
        <p>
          Most items ordered through the portal (signage, displays and related printed/fabricated products) are
          manufactured to order rather than shipped from stock. Production begins once an order is confirmed and
          payment is received, and the order&apos;s status is visible to you in the portal at every stage from
          submission through dispatch.
        </p>
      </PolicySection>

      <PolicySection title="Dispatch & delivery">
        <ul>
          <li>Orders are dispatched from our Hyderabad facility ({MMDI_COMPANY.address}) via third-party courier or freight partners.</li>
          <li>Delivery timelines depend on the product, order volume and delivery location, and are communicated for each order rather than fixed in advance — check your order&apos;s status in the portal or contact us for a specific estimate.</li>
          <li>Delivery is made to the address on file for the store/site the order was placed against. Please make sure that address is accurate and reachable before confirming an order.</li>
          <li>A shipment tracking reference (courier and AWB/tracking number) is added to the order once it is dispatched, where applicable.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Damaged or incorrect deliveries">
        <p>
          Please inspect items on delivery. If something arrives damaged, incomplete, or different from what was
          ordered, contact us within 48 hours of delivery (see <em>Contact Us</em>) with your order number and photos
          of the issue, and we&apos;ll work with you to resolve it.
        </p>
      </PolicySection>

      <PolicySection title="Questions">
        <p>
          For anything not covered here — an order-specific delivery estimate, a change of delivery address before
          dispatch, or a shipping issue — reach out via the details on our <em>Contact Us</em> page.
        </p>
      </PolicySection>
    </article>
  );
}
