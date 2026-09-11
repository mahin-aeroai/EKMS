"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Download, UploadCloud, CheckCircle2, RotateCcw, CreditCard, Truck, Radar, FileText, Eye, ExternalLink, X, Check, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { usePortalUser } from "@/lib/PortalUserContext";
import { orderStatusBadge, orderStatusLabel, paymentStatusBadge, paymentStatusLabel } from "./orderStatus";
// Reused as-is from the LFG Connect side of this app (see
// supabase-portal-shipping-invoicing-migration.sql's header comment) --
// portal_order_shipments.current_status speaks the exact same
// SHIPMENT_STATUSES vocabulary as lfg_shipments, and only Blue Dart has a
// live-tracking integration on either side, so the courier list/gate and
// the Blue Dart status mapping don't need a second copy here.
import { LFG_COURIERS, isBlueDartCourier, shipmentStatusLabel } from "@/lib/lfgStatus";
import type {
  PortalOrderRow,
  PortalOrderItemRow,
  PortalOrderFileRow,
  PortalOrderApprovalRow,
  PortalCompanyStoreRow,
  PortalOrderShipmentRow,
  PortalShipmentEventRow,
  PortalOrderInvoiceRow,
} from "@mmdi/shared/rows";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
}

async function downloadFile(fileId: string) {
  const headers = await authHeaders();
  const res = await fetch(`/api/portal/files/${fileId}/download-url`, { headers });
  const data = await res.json();
  if (res.ok) window.open(data.url, "_blank");
}

// The happy-path shipment lifecycle, in order, for the horizontal tracking
// stepper (task feedback: "Tracking needs a beautiful horizontal card
// design"). The other 3 SHIPMENT_STATUSES entries -- delayed,
// delivery_exception, undelivered -- are exception states, not points on
// this line, so they get their own alert treatment instead of a step.
const TRACKING_STEPS: { status: string; label: string }[] = [
  { status: "shipment_created", label: "Created" },
  { status: "dispatched", label: "Dispatched" },
  { status: "in_transit", label: "In transit" },
  { status: "at_hub", label: "At hub" },
  { status: "out_for_delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
];
const TRACKING_EXCEPTION_STATUSES = new Set(["delayed", "delivery_exception", "undelivered"]);

export function OrderDetailClient({
  order: initialOrder,
  items,
  files: initialFiles,
  approvals,
  store,
  isStaff,
  shipments: initialShipments,
  shipmentEvents: initialShipmentEvents,
  invoices: initialInvoices,
}: {
  order: PortalOrderRow;
  items: PortalOrderItemRow[];
  files: PortalOrderFileRow[];
  approvals: PortalOrderApprovalRow[];
  store: PortalCompanyStoreRow | null;
  isStaff: boolean;
  shipments: PortalOrderShipmentRow[];
  shipmentEvents: PortalShipmentEventRow[];
  invoices: PortalOrderInvoiceRow[];
}) {
  const router = useRouter();
  const portalUser = usePortalUser();
  const [order, setOrder] = useState(initialOrder);
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState(false);
  const [revisionComment, setRevisionComment] = useState("");
  const [showRevisionBox, setShowRevisionBox] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const [shipments, setShipments] = useState(initialShipments);
  const [shipmentEvents, setShipmentEvents] = useState(initialShipmentEvents);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [showAddShipment, setShowAddShipment] = useState(false);
  const [shipmentForm, setShipmentForm] = useState({ courier: LFG_COURIERS[0] as string, courierOther: "", awb_number: "", dispatch_date: "", expected_delivery_date: "" });
  const [trackingBusy, setTrackingBusy] = useState<string | null>(null);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ crn_number: "", invoice_number: "", invoice_date: "", amount: "" });
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  // In-page invoice preview (task feedback: "preview is opening in another
  // window lets open it in the same place") -- same overlay pattern as
  // LfgSiteCardGrid.tsx's document preview, so there's one large-preview
  // pattern in this app, not two.
  const [previewFile, setPreviewFile] = useState<{ name: string; url: string; kind: "pdf" } | null>(null);

  // Staff can preview /portal/* (see supabase-middleware.ts) but doesn't
  // have a portal_users row, so PortalUserContext is null for them — the
  // customer-only actions below all also check `portalUser` for that reason.
  const isCustomer = !!portalUser;
  const canDecide = isCustomer && (order.status === "proof_uploaded" || order.status === "revision_requested");
  // Payment happens at checkout now (see NewOrderForm) — this button is
  // the fallback for when that combined payment didn't complete (popup
  // closed, connection dropped) and someone comes back to finish paying
  // for just this one order. No longer gated on design approval — pay and
  // design-approval are independent tracks, same as payment_status and
  // status always were in the schema.
  const canPay = isCustomer && order.payment_status === "unpaid" && order.status !== "cancelled";

  async function refresh() {
    router.refresh();
    const [{ data: newOrder }, { data: newFiles }] = await Promise.all([
      supabase.from("portal_orders").select("*").eq("id", order.id).maybeSingle(),
      supabase.from("portal_order_files").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
    ]);
    if (newOrder) setOrder(newOrder as PortalOrderRow);
    if (newFiles) setFiles(newFiles as PortalOrderFileRow[]);
  }

  async function handleApprove() {
    setBusy(true);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch(`/api/portal/orders/${order.id}/approve`, { method: "POST", headers });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || data.error);
      return;
    }
    await refresh();
  }

  async function handleRequestRevision() {
    if (!revisionComment.trim()) {
      setError("Describe what needs to change first.");
      return;
    }
    setBusy(true);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch(`/api/portal/orders/${order.id}/request-revision`, {
      method: "POST",
      headers,
      body: JSON.stringify({ comment: revisionComment }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || data.error);
      return;
    }
    setRevisionComment("");
    setShowRevisionBox(false);
    await refresh();
  }

  async function handleUploadProof(file: File) {
    setBusy(true);
    setError(null);
    const headers = await authHeaders();
    const uploadRes = await fetch(`/api/portal/orders/${order.id}/files/upload-url`, {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "proof", file_name: file.name, content_type: file.type || "application/octet-stream" }),
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      setError(uploadData.message || uploadData.error);
      setBusy(false);
      return;
    }
    await fetch(uploadData.url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });

    const publishRes = await fetch(`/api/portal/orders/${order.id}/publish-proof`, {
      method: "POST",
      headers,
      body: JSON.stringify({ relative_path: uploadData.relative_path, file_name: file.name, file_size: file.size }),
    });
    const publishData = await publishRes.json();
    setBusy(false);
    if (!publishRes.ok) {
      setError(publishData.message || publishData.error);
      return;
    }
    await refresh();
  }

  async function handleSetStatus(status: "in_production" | "completed" | "cancelled") {
    setBusy(true);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch(`/api/portal/orders/${order.id}/status`, { method: "POST", headers, body: JSON.stringify({ status }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || data.error);
      return;
    }
    await refresh();
  }

  async function handlePay() {
    setBusy(true);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch(`/api/portal/orders/${order.id}/razorpay-order`, { method: "POST", headers });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || data.error);
      return;
    }
    if (!window.Razorpay) {
      setError("Payment isn't ready yet — wait a moment and try again.");
      return;
    }
    const razorpay = new window.Razorpay({
      key: data.key_id,
      amount: data.amount,
      currency: data.currency,
      order_id: data.razorpay_order_id,
      name: "MMDI",
      description: `Order ${data.order_no}`,
      prefill: { name: portalUser?.fullName ?? "", email: portalUser?.email ?? "" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verifyHeaders = await authHeaders();
        await fetch(`/api/portal/orders/${order.id}/razorpay-verify`, {
          method: "POST",
          headers: verifyHeaders,
          body: JSON.stringify(response),
        });
        await refresh();
      },
    });
    razorpay.open();
  }

  async function refreshShipping() {
    const [{ data: newShipments }, { data: newInvoices }] = await Promise.all([
      supabase.from("portal_order_shipments").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
      supabase.from("portal_order_invoices").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
    ]);
    const shipmentIds = (newShipments ?? []).map((s) => s.id);
    const { data: newEvents } = shipmentIds.length
      ? await supabase.from("portal_shipment_events").select("*").in("shipment_id", shipmentIds).order("event_time", { ascending: false })
      : { data: [] as PortalShipmentEventRow[] };
    if (newShipments) setShipments(newShipments as PortalOrderShipmentRow[]);
    if (newInvoices) setInvoices(newInvoices as PortalOrderInvoiceRow[]);
    setShipmentEvents((newEvents ?? []) as PortalShipmentEventRow[]);
  }

  async function handleAddShipment() {
    setBusy(true);
    setError(null);
    const headers = await authHeaders();
    const courier = shipmentForm.courier === "Other" ? shipmentForm.courierOther.trim() : shipmentForm.courier;
    const res = await fetch(`/api/portal/orders/${order.id}/shipments`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        courier,
        awb_number: shipmentForm.awb_number.trim() || undefined,
        dispatch_date: shipmentForm.dispatch_date || undefined,
        expected_delivery_date: shipmentForm.expected_delivery_date || undefined,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || data.error);
      return;
    }
    setShowAddShipment(false);
    setShipmentForm({ courier: LFG_COURIERS[0], courierOther: "", awb_number: "", dispatch_date: "", expected_delivery_date: "" });
    await refreshShipping();
  }

  async function handleTrack(shipmentId: string) {
    setTrackingBusy(shipmentId);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch(`/api/portal/shipments/${shipmentId}/track`, { method: "POST", headers });
    const data = await res.json();
    setTrackingBusy(null);
    if (!res.ok) {
      setError(data.message || data.error);
      return;
    }
    await refreshShipping();
  }

  async function handleUploadInvoice(file: File) {
    setBusy(true);
    setError(null);
    const headers = await authHeaders();
    const uploadRes = await fetch(`/api/portal/orders/${order.id}/invoices/upload-url`, {
      method: "POST",
      headers,
      body: JSON.stringify({ file_name: file.name, content_type: file.type || "application/pdf" }),
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      setError(uploadData.message || uploadData.error);
      setBusy(false);
      return;
    }
    await fetch(uploadData.url, { method: "PUT", headers: { "Content-Type": file.type || "application/pdf" }, body: file });

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    const { error: insertErr } = await supabase.from("portal_order_invoices").insert({
      order_id: order.id,
      crn_number: invoiceForm.crn_number.trim() || null,
      invoice_number: invoiceForm.invoice_number.trim() || null,
      invoice_date: invoiceForm.invoice_date || null,
      amount: invoiceForm.amount ? Number(invoiceForm.amount) : null,
      relative_path: uploadData.relative_path,
      file_name: file.name,
      uploaded_by: authUser?.id,
      uploaded_by_role: "staff",
    });
    setBusy(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setShowAddInvoice(false);
    setInvoiceForm({ crn_number: "", invoice_number: "", invoice_date: "", amount: "" });
    await refreshShipping();
  }

  // mode omitted: opens the in-page preview modal below, same place the
  // rest of the order page lives. mode=download: the route sets
  // Content-Disposition: attachment, forcing a real Save-As, so that one
  // stays a window.open (a genuine file-save action, not a view).
  async function openInvoice(invoiceId: string, mode?: "download") {
    const headers = await authHeaders();
    const url = `/api/portal/order-invoices/${invoiceId}/download-url${mode ? `?mode=${mode}` : ""}`;
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!res.ok) return;
    if (mode === "download") {
      window.open(data.url, "_blank");
    } else {
      setPreviewFile({ name: data.file_name as string, url: data.url as string, kind: "pdf" });
    }
  }

  const proofFiles = files.filter((f) => f.kind === "proof");
  // 'design' files show inline against their own line item in the Items
  // table above instead of in this generic list.
  const referenceFiles = files.filter((f) => f.kind !== "proof" && f.kind !== "design");
  const latestProof = proofFiles[0];

  return (
    <div className="flex flex-col gap-6">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">{order.order_no}</h1>
          <p className="text-sm text-ink-muted">
            {store?.store_name ?? "—"} · Placed {new Date(order.created_at).toLocaleDateString("en-IN")}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge status={orderStatusBadge(order.status)}>{orderStatusLabel(order.status)}</Badge>
          <Badge status={paymentStatusBadge(order.payment_status)}>{paymentStatusLabel(order.payment_status)}</Badge>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="mb-2 text-sm font-semibold text-ink">Delivery</p>
        {/*
          order.delivery_address/city/gstin, NOT store.address/gstin --
          this is a snapshot frozen at the moment the order was placed
          (see the migration comment on portal_orders). The store's own
          address can be edited later (by the customer or MMDI staff) and
          must never retroactively change what an already-placed order
          shows.
        */}
        <p className="text-sm text-ink">{store?.store_name ?? "—"}</p>
        <p className="text-sm text-ink-secondary">{order.delivery_address || "No delivery address on file for this order."}</p>
        {order.delivery_city && <p className="text-sm text-ink-secondary">{order.delivery_city}</p>}
        {order.delivery_gstin && <p className="mt-1 text-xs text-ink-muted">GSTIN: {order.delivery_gstin}</p>}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="mb-2 text-sm font-semibold text-ink">Items</p>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1">Product</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Unit price</th>
              <th className="py-1 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const designFile = files.find((f) => f.kind === "design" && f.order_item_id === item.id);
              return (
                <tr key={item.id} className="border-t border-line">
                  <td className="py-1.5">
                    <span className="font-medium text-ink">{item.product_code}</span>{" "}
                    <span className="text-ink-secondary">{item.product_name}</span>
                    {designFile && (
                      <button
                        onClick={() => downloadFile(designFile.id)}
                        className="mt-0.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Download size={11} /> {designFile.file_name}
                      </button>
                    )}
                  </td>
                  <td className="py-1.5 text-right text-ink-secondary">{item.quantity}</td>
                  <td className="py-1.5 text-right text-ink-secondary">₹{item.unit_price.toLocaleString("en-IN")}</td>
                  <td className="py-1.5 text-right text-ink-secondary">₹{item.line_total.toLocaleString("en-IN")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 flex flex-col items-end gap-0.5 text-sm">
          <p className="text-ink-secondary">Subtotal: ₹{order.subtotal.toLocaleString("en-IN")}</p>
          <p className="text-ink-secondary">GST: ₹{order.gst_amount.toLocaleString("en-IN")}</p>
          <p className="font-semibold text-ink">Total: ₹{order.total_amount.toLocaleString("en-IN")}</p>
        </div>
        {order.notes && (
          <p className="mt-3 rounded-md bg-surface-sunken p-2 text-xs text-ink-secondary">
            <span className="font-medium text-ink">Notes: </span>
            {order.notes}
          </p>
        )}
      </div>

      {latestProof && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Design proof — revision {latestProof.revision_number}</p>
            <button
              onClick={() => downloadFile(latestProof.id)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Download size={12} /> {latestProof.file_name}
            </button>
          </div>

          {canDecide && (
            <div className="flex flex-col gap-2">
              {!showRevisionBox ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleApprove} loading={busy}>
                    <CheckCircle2 size={14} /> Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowRevisionBox(true)} disabled={busy}>
                    <RotateCcw size={14} /> Request revision
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={revisionComment}
                    onChange={(e) => setRevisionComment(e.target.value)}
                    rows={3}
                    placeholder="What needs to change?"
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={handleRequestRevision} loading={busy}>
                      Send revision request
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowRevisionBox(false)} disabled={busy}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {canPay && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-sm font-semibold text-ink">Payment</p>
          <p className="mb-3 text-sm text-ink-secondary">
            {order.payment_status === "unpaid"
              ? `Pay ₹${order.total_amount.toLocaleString("en-IN")} to finish placing this order.`
              : ""}
          </p>
          <Button onClick={handlePay} loading={busy}>
            <CreditCard size={14} /> Pay now
          </Button>
        </div>
      )}

      {(shipments.length > 0 || (isStaff && order.payment_status === "paid")) && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Shipping</p>
            {isStaff && (
              <Button size="sm" variant="secondary" onClick={() => setShowAddShipment((v) => !v)} disabled={busy}>
                <Truck size={13} /> Add shipment
              </Button>
            )}
          </div>

          {showAddShipment && (
            <div className="mb-3 flex flex-col gap-2 rounded-md bg-surface-sunken p-3">
              <div className="flex flex-wrap gap-2">
                <select
                  value={shipmentForm.courier}
                  onChange={(e) => setShipmentForm((f) => ({ ...f, courier: e.target.value }))}
                  className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                >
                  {LFG_COURIERS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="Other">Other</option>
                </select>
                {shipmentForm.courier === "Other" && (
                  <input
                    value={shipmentForm.courierOther}
                    onChange={(e) => setShipmentForm((f) => ({ ...f, courierOther: e.target.value }))}
                    placeholder="Courier name"
                    className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                )}
                <input
                  value={shipmentForm.awb_number}
                  onChange={(e) => setShipmentForm((f) => ({ ...f, awb_number: e.target.value }))}
                  placeholder="AWB / tracking number"
                  className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
                  Dispatch
                  <input
                    type="date"
                    value={shipmentForm.dispatch_date}
                    onChange={(e) => setShipmentForm((f) => ({ ...f, dispatch_date: e.target.value }))}
                    className="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
                  Expected delivery
                  <input
                    type="date"
                    value={shipmentForm.expected_delivery_date}
                    onChange={(e) => setShipmentForm((f) => ({ ...f, expected_delivery_date: e.target.value }))}
                    className="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
                <Button size="sm" onClick={handleAddShipment} loading={busy}>
                  Save shipment
                </Button>
              </div>
            </div>
          )}

          {shipments.length === 0 && !showAddShipment && (
            <p className="text-sm text-ink-muted">No shipment added yet.</p>
          )}

          <div className="flex flex-col gap-3">
            {shipments.map((s) => {
              const events = shipmentEvents.filter((e) => e.shipment_id === s.id);
              const isException = TRACKING_EXCEPTION_STATUSES.has(s.current_status);
              const stepIndex = TRACKING_STEPS.findIndex((step) => step.status === s.current_status);
              const canTrack = (isStaff || isCustomer) && isBlueDartCourier(s.courier) && s.awb_number;
              return (
                <div key={s.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {s.courier || "Courier not set"} {s.awb_number ? `· AWB ${s.awb_number}` : ""}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {s.dispatch_date ? `Dispatched ${new Date(s.dispatch_date).toLocaleDateString("en-IN")}` : "Not yet dispatched"}
                        {s.expected_delivery_date ? ` · Expected ${new Date(s.expected_delivery_date).toLocaleDateString("en-IN")}` : ""}
                      </p>
                    </div>
                    {canTrack && (
                      <Button size="sm" variant="ghost" onClick={() => handleTrack(s.id)} loading={trackingBusy === s.id}>
                        <Radar size={13} /> {trackingBusy === s.id ? "Tracking…" : "Track via Blue Dart"}
                      </Button>
                    )}
                  </div>

                  {isException ? (
                    <div className="mt-3 flex items-center gap-2 rounded-md bg-danger-tint px-3 py-2 text-sm text-danger">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
                      <span className="font-medium">{shipmentStatusLabel(s.current_status)}</span>
                      {s.current_location && <span className="text-danger/80">· {s.current_location}</span>}
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center">
                      {TRACKING_STEPS.map((step, i) => {
                        const done = stepIndex >= 0 && i < stepIndex;
                        const current = i === stepIndex;
                        return (
                          <div key={step.status} className={i === 0 ? "flex flex-1 flex-col items-start" : "flex flex-1 flex-col items-center"}>
                            <div className="flex w-full items-center">
                              {i > 0 && (
                                <div
                                  className={`h-0.5 flex-1 ${done || current ? "bg-primary" : "bg-line"}`}
                                  aria-hidden="true"
                                />
                              )}
                              <div
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold ${
                                  done
                                    ? "border-primary bg-primary text-on-brand"
                                    : current
                                      ? "border-primary bg-surface text-primary"
                                      : "border-line bg-surface text-ink-muted"
                                }`}
                              >
                                {done ? <Check size={12} /> : i + 1}
                              </div>
                              {i < TRACKING_STEPS.length - 1 && (
                                <div
                                  className={`h-0.5 flex-1 ${done ? "bg-primary" : "bg-line"}`}
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                            <p
                              className={`mt-1.5 text-center text-[10px] leading-tight ${
                                current ? "font-semibold text-ink" : done ? "text-ink-secondary" : "text-ink-muted"
                              }`}
                            >
                              {step.label}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(s.current_location || s.last_tracked_at) && (
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                      {s.current_location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} /> Currently at {s.current_location}
                        </span>
                      )}
                      {s.last_tracked_at && <span>Last tracked {new Date(s.last_tracked_at).toLocaleString("en-IN")}</span>}
                    </p>
                  )}

                  {events.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                      {events.map((e) => (
                        <li key={e.id} className="text-xs text-ink-secondary">
                          <span className="font-medium text-ink">{e.event_status}</span>
                          {e.location ? ` — ${e.location}` : ""} · {new Date(e.event_time).toLocaleString("en-IN")}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(invoices.length > 0 || isStaff) && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Invoice</p>
            {isStaff && (
              <Button size="sm" variant="secondary" onClick={() => setShowAddInvoice((v) => !v)} disabled={busy}>
                <FileText size={13} /> Add invoice
              </Button>
            )}
          </div>

          {showAddInvoice && (
            <div className="mb-3 flex flex-col gap-2 rounded-md bg-surface-sunken p-3">
              <div className="flex flex-wrap gap-2">
                <input
                  value={invoiceForm.crn_number}
                  onChange={(e) => setInvoiceForm((f) => ({ ...f, crn_number: e.target.value }))}
                  placeholder="CRN number"
                  className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                />
                <input
                  value={invoiceForm.invoice_number}
                  onChange={(e) => setInvoiceForm((f) => ({ ...f, invoice_number: e.target.value }))}
                  placeholder="Invoice number"
                  className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                />
                <input
                  type="date"
                  value={invoiceForm.invoice_date}
                  onChange={(e) => setInvoiceForm((f) => ({ ...f, invoice_date: e.target.value }))}
                  className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                />
                <input
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="Amount (₹)"
                  inputMode="decimal"
                  className="w-28 rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>
              <input
                ref={invoiceInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadInvoice(file);
                  e.target.value = "";
                }}
              />
              <Button size="sm" onClick={() => invoiceInputRef.current?.click()} loading={busy}>
                <UploadCloud size={14} /> Upload invoice PDF
              </Button>
            </div>
          )}

          {invoices.length === 0 ? (
            !showAddInvoice && <p className="text-sm text-ink-muted">No invoice uploaded yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2 text-xs">
                  <span className="text-ink-secondary">
                    {inv.invoice_number ? `Invoice ${inv.invoice_number}` : inv.file_name}
                    {inv.crn_number ? ` · CRN ${inv.crn_number}` : ""}
                    {inv.invoice_date ? ` · ${new Date(inv.invoice_date).toLocaleDateString("en-IN")}` : ""}
                    {inv.amount != null ? ` · ₹${Number(inv.amount).toLocaleString("en-IN")}` : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <button onClick={() => openInvoice(inv.id)} className="flex items-center gap-1 text-primary hover:underline">
                      <Eye size={12} /> Preview
                    </button>
                    <button onClick={() => openInvoice(inv.id, "download")} className="flex items-center gap-1 text-primary hover:underline">
                      <Download size={12} /> Download
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isStaff && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-sm font-semibold text-ink">MMDI staff actions</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={proofInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadProof(file);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="secondary" onClick={() => proofInputRef.current?.click()} loading={busy}>
              <UploadCloud size={14} /> Upload design proof
            </Button>
            {order.status === "approved" && order.payment_status === "paid" && (
              <Button size="sm" onClick={() => handleSetStatus("in_production")} loading={busy}>
                Mark in production
              </Button>
            )}
            {order.status === "in_production" && (
              <Button size="sm" onClick={() => handleSetStatus("completed")} loading={busy}>
                Mark completed
              </Button>
            )}
            {order.status !== "completed" && order.status !== "cancelled" && (
              <Button size="sm" variant="destructive" onClick={() => handleSetStatus("cancelled")} loading={busy}>
                Cancel order
              </Button>
            )}
          </div>
        </div>
      )}

      {error && <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}

      {(referenceFiles.length > 0 || proofFiles.length > 1) && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-sm font-semibold text-ink">Files</p>
          <ul className="flex flex-col gap-1.5">
            {files.map((file) => (
              <li key={file.id} className="flex items-center justify-between rounded-md bg-surface-sunken px-3 py-1.5 text-xs">
                <span className="text-ink-secondary">
                  {file.kind === "proof" ? `Proof (rev. ${file.revision_number}) — ` : file.kind === "reference" ? "Reference — " : ""}
                  {file.file_name}
                </span>
                <button onClick={() => downloadFile(file.id)} className="flex items-center gap-1 text-primary hover:underline">
                  <Download size={12} /> Download
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {approvals.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-sm font-semibold text-ink">Approval history</p>
          <ul className="flex flex-col gap-2">
            {approvals.map((a) => (
              <li key={a.id} className="text-xs text-ink-secondary">
                <span className="font-medium text-ink">
                  {a.decision === "approved" ? "Approved" : "Revision requested"} — revision {a.revision_number}
                </span>{" "}
                on {new Date(a.decided_at).toLocaleDateString("en-IN")}
                {a.comment && <p className="mt-0.5 italic">&ldquo;{a.comment}&rdquo;</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onClick={() => setPreviewFile(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-surface-overlay shadow-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold text-ink">{previewFile.name}</p>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => window.open(previewFile.url, "_blank", "noopener,noreferrer")}>
                  <ExternalLink size={14} className="mr-1.5" />
                  Open in new tab
                </Button>
                <button
                  aria-label="Close preview"
                  onClick={() => setPreviewFile(null)}
                  className="rounded p-1 text-ink-muted hover:bg-surface-sunken"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-surface-sunken">
              <iframe src={previewFile.url} title={previewFile.name} className="h-full w-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
