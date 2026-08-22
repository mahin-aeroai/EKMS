"use client";

import { ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { orderStatusBadge, orderStatusLabel } from "./orderStatus";
import type { PortalOrderRow, PortalOrderItemRow } from "@mmdi/shared/rows";

// A customer's "Cart" — every order of theirs that's still unpaid.
// Payment happens at checkout (see NewOrderForm), before the design-
// approval/production workflow even starts, so "unpaid" is exactly
// "unfinished" here: nothing further has happened to it yet. Each row
// gets a real choice — pay for it, or cancel it (a genuine delete, not a
// status flag — see DELETE /api/portal/orders/[orderId]) — instead of
// unpaid attempts (including ones left behind by a checkout failure)
// silently piling up in Order history forever.
export type CartOrder = PortalOrderRow & { items: Pick<PortalOrderItemRow, "id" | "product_code" | "product_name" | "quantity">[] };

export function CartPanel({
  orders,
  storeNames,
  payingId,
  cancellingId,
  onPay,
  onCancel,
}: {
  orders: CartOrder[];
  storeNames: Record<string, string>;
  payingId: string | null;
  cancellingId: string | null;
  onPay: (order: CartOrder) => void;
  onCancel: (order: CartOrder) => void;
}) {
  if (orders.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <ShoppingCart size={16} className="text-primary" />
        <h2 className="text-sm font-semibold text-ink">
          Your cart — {orders.length} unfinished order{orders.length > 1 ? "s" : ""}
        </h2>
      </div>
      <p className="text-xs text-ink-muted">
        Placed but not paid for yet. Pay now to send it to MMDI, or cancel to remove it — cancelling deletes it for good.
      </p>

      <div className="flex flex-col gap-2">
        {orders.map((order) => (
          <div
            key={order.id}
            className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunken p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{order.order_no}</span>
                <Badge status={orderStatusBadge(order.status)}>{orderStatusLabel(order.status)}</Badge>
              </div>
              <p className="text-xs text-ink-muted">
                {storeNames[order.store_id] ?? "Unknown store"} · {order.items.map((it) => `${it.product_code} ×${it.quantity}`).join(", ") || "no items"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-ink">₹{order.total_amount.toLocaleString("en-IN")}</span>
              <Button
                type="button"
                size="sm"
                loading={payingId === order.id}
                disabled={cancellingId === order.id}
                onClick={() => onPay(order)}
              >
                Pay now
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                loading={cancellingId === order.id}
                disabled={payingId === order.id}
                onClick={() => onCancel(order)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
