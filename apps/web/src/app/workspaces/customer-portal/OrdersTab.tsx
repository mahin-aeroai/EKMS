"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/Badge";
import { orderStatusBadge, orderStatusLabel, paymentStatusBadge, paymentStatusLabel } from "@/components/portal/orderStatus";
import type { PortalOrderRow } from "@mmdi/shared/rows";

interface OrderRowWithNames extends PortalOrderRow {
  portal_companies: { name: string } | null;
  portal_company_stores: { store_name: string } | null;
}

export function OrdersTab() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRowWithNames[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("portal_orders")
        .select("*, portal_companies(name), portal_company_stores(store_name)")
        .order("created_at", { ascending: false });
      setOrders((data ?? []) as unknown as OrderRowWithNames[]);
      setLoading(false);
    })();
  }, []);

  const filtered = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-ink-muted">Filter:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="proof_uploaded">Proof uploaded</option>
          <option value="revision_requested">Revision requested</option>
          <option value="approved">Approved</option>
          <option value="in_production">In production</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Store</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <tr
                key={order.id}
                onClick={() => router.push(`/portal/orders/${order.id}`)}
                className="cursor-pointer border-t border-line bg-surface transition-colors hover:bg-surface-sunken"
              >
                <td className="px-3 py-2 font-medium text-ink">{order.order_no}</td>
                <td className="px-3 py-2 text-ink-secondary">{order.portal_companies?.name ?? "—"}</td>
                <td className="px-3 py-2 text-ink-secondary">{order.portal_company_stores?.store_name ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge status={orderStatusBadge(order.status)}>{orderStatusLabel(order.status)}</Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge status={paymentStatusBadge(order.payment_status)}>{paymentStatusLabel(order.payment_status)}</Badge>
                </td>
                <td className="px-3 py-2 text-right text-ink-secondary">₹{order.total_amount.toLocaleString("en-IN")}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-ink-muted">
                  No orders match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
