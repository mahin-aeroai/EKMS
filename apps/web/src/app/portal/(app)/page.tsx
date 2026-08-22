import Link from "next/link";
import { ArrowRight, Package, ClipboardCheck } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getPortalIdentity } from "@/lib/portal-auth";
import { Badge } from "@/components/ui/Badge";
import { orderStatusBadge, orderStatusLabel } from "@/components/portal/orderStatus";
import type { PortalOrderRow } from "@mmdi/shared/rows";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const identity = await getPortalIdentity();
  if (!identity) return null;

  const supabase = await createServerSupabaseClient();
  const { data: orders } = await supabase
    .from("portal_orders")
    .select("id, order_no, status, payment_status, total_amount, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const rows = (orders ?? []) as Pick<PortalOrderRow, "id" | "order_no" | "status" | "payment_status" | "total_amount" | "created_at">[];
  const awaitingDecision = rows.filter((o) => o.status === "proof_uploaded" || o.status === "revision_requested").length;
  const readyToPay = rows.filter((o) => o.status === "approved" && o.payment_status === "unpaid").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Welcome, {identity.fullName || identity.companyName}</h1>
        <p className="text-sm text-ink-muted">Order GPX04/GPX05 signage and track design approval and delivery.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/portal/products"
          className="flex items-center justify-between rounded-lg border border-line bg-surface p-4 shadow-1 transition-shadow hover:shadow-2"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-tint text-primary">
              <Package size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Place a new order</p>
              <p className="text-xs text-ink-muted">Browse GPX04 / GPX05 and order for any of your stores</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-ink-muted" />
        </Link>

        <Link
          href="/portal/orders"
          className="flex items-center justify-between rounded-lg border border-line bg-surface p-4 shadow-1 transition-shadow hover:shadow-2"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-warning-tint text-warning">
              <ClipboardCheck size={18} />
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

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Recent orders</h2>
          <Link href="/portal/orders" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-muted">
            No orders yet — head to Products to place your first one.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((order) => (
              <Link
                key={order.id}
                href={`/portal/orders/${order.id}`}
                className="flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-sm shadow-1 transition-shadow hover:shadow-2"
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
