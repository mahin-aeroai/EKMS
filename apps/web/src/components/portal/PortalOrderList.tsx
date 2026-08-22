"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { orderStatusBadge, orderStatusLabel, paymentStatusBadge, paymentStatusLabel } from "./orderStatus";
import { usePortalHost, portalHref } from "@/lib/portal-links";
import type { PortalOrderRow } from "@mmdi/shared/rows";

export function PortalOrderList({
  orders,
  storeNames,
}: {
  orders: PortalOrderRow[];
  storeNames: Record<string, string>;
}) {
  const router = useRouter();
  const onPortalHost = usePortalHost();

  if (orders.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-ink-muted">
        No orders yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-2">Order</th>
            <th className="px-3 py-2">Store</th>
            <th className="hidden px-3 py-2 sm:table-cell">Placed</th>
            <th className="px-3 py-2">Status</th>
            <th className="hidden px-3 py-2 sm:table-cell">Payment</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              onClick={() => router.push(portalHref(`/orders/${order.id}`, onPortalHost))}
              className="cursor-pointer border-t border-line bg-surface transition-colors hover:bg-surface-sunken"
            >
              <td className="px-3 py-2 font-medium text-ink">{order.order_no}</td>
              <td className="px-3 py-2 text-ink-secondary">{storeNames[order.store_id] ?? "—"}</td>
              <td className="hidden px-3 py-2 text-ink-secondary sm:table-cell">
                {new Date(order.created_at).toLocaleDateString("en-IN")}
              </td>
              <td className="px-3 py-2">
                <Badge status={orderStatusBadge(order.status)}>{orderStatusLabel(order.status)}</Badge>
              </td>
              <td className="hidden px-3 py-2 sm:table-cell">
                <Badge status={paymentStatusBadge(order.payment_status)}>{paymentStatusLabel(order.payment_status)}</Badge>
              </td>
              <td className="px-3 py-2 text-right text-ink-secondary">₹{order.total_amount.toLocaleString("en-IN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
