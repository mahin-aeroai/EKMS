import Link from "next/link";
import { ArrowRight, Package, ClipboardCheck } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getPortalIdentity } from "@/lib/portal-auth";
import { getOnPortalHost } from "@/lib/portal-host-server";
import { portalHref } from "@/lib/portal-links-shared";
import { Badge } from "@/components/ui/Badge";
import { orderStatusBadge, orderStatusLabel } from "@/components/portal/orderStatus";
import { PortalHeroBanner } from "@/components/portal/PortalHeroBanner";
import { ProductGrid } from "@/components/portal/ProductGrid";
import type { PortalOrderRow, PortalProductRow } from "@mmdi/shared/rows";

export const dynamic = "force-dynamic";

// 11 Sept 2026: task feedback -- "remove products tab and add products
// here so that home page looks occupied and make it no compact design."
// The catalog (previously its own /products destination, see that page's
// own file for the identical query this mirrors) now renders directly on
// the home page -- same ProductGrid component, so there's still exactly
// one card-rendering implementation for a product, not two. Container
// widened (see portal/(app)/layout.tsx's max-w-6xl, up from max-w-4xl) to
// give a 3-column product grid room instead of squeezing it into a
// 2-column, form-width page.
export default async function PortalHomePage() {
  const identity = await getPortalIdentity();
  if (!identity) return null;

  const onPortalHost = await getOnPortalHost();
  const supabase = await createServerSupabaseClient();
  const [{ data: orders }, { data: products }] = await Promise.all([
    supabase
      .from("portal_orders")
      .select("id, order_no, status, payment_status, total_amount, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("portal_products")
      .select("id, code, name, description, unit_price, gst_percent, preview_image_path, version, active, updated_at")
      .eq("active", true)
      .order("code", { ascending: true }),
  ]);

  const rows = (orders ?? []) as Pick<PortalOrderRow, "id" | "order_no" | "status" | "payment_status" | "total_amount" | "created_at">[];
  const awaitingDecision = rows.filter((o) => o.status === "proof_uploaded" || o.status === "revision_requested").length;
  const readyToPay = rows.filter((o) => o.status === "approved" && o.payment_status === "unpaid").length;

  return (
    <div className="flex flex-col gap-8">
      <PortalHeroBanner ctaHref="#products" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <a
          href="#products"
          className="flex items-center justify-between rounded-xl border border-line bg-surface p-5 shadow-1 transition-shadow hover:shadow-2"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-tint text-primary">
              <Package size={19} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Browse the catalog</p>
              <p className="text-xs text-ink-muted">GPX04 / GPX05 — pick a product below and order for any of your stores</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-ink-muted" />
        </a>

        <Link
          href={portalHref("/orders", onPortalHost)}
          className="flex items-center justify-between rounded-xl border border-line bg-surface p-5 shadow-1 transition-shadow hover:shadow-2"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-warning-tint text-warning">
              <ClipboardCheck size={19} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Orders needing your review</p>
              <p className="text-xs text-ink-muted">
                {awaitingDecision > 0 ? `${awaitingDecision} awaiting a decision` : "None right now"}
                {readyToPay > 0 ? ` · ${readyToPay} approved, ready to pay` : ""}
              </p>
            </div>
          </div>
          <ArrowRight size={16} className="text-ink-muted" />
        </Link>
      </div>

      <div id="products">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-ink">Shop the Catalog</h2>
          <p className="text-sm text-ink-muted">Pick a product to order for any of your store locations.</p>
        </div>
        <ProductGrid products={(products ?? []) as PortalProductRow[]} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Recent orders</h2>
          <Link href={portalHref("/orders", onPortalHost)} className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-5 text-sm text-ink-muted">
            No orders yet — pick a product above to place your first one.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((order) => (
              <Link
                key={order.id}
                href={portalHref(`/orders/${order.id}`, onPortalHost)}
                className="flex items-center justify-between rounded-xl border border-line bg-surface p-4 text-sm shadow-1 transition-shadow hover:shadow-2"
              >
                <div>
                  <p className="font-medium text-ink">{order.order_no}</p>
                  <p className="text-xs text-ink-muted">{new Date(order.created_at).toLocaleDateString("en-IN")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-secondary">₹{order.total_amount.toLocaleString("en-IN")}</span>
                  <Badge status={orderStatusBadge(order.status)}>{orderStatusLabel(order.status)}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
