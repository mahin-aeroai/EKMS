"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Download, UploadCloud, CheckCircle2, RotateCcw, CreditCard } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { usePortalUser } from "@/lib/PortalUserContext";
import { orderStatusBadge, orderStatusLabel, paymentStatusBadge, paymentStatusLabel } from "./orderStatus";
import type {
  PortalOrderRow,
  PortalOrderItemRow,
  PortalOrderFileRow,
  PortalOrderApprovalRow,
  PortalCompanyStoreRow,
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

export function OrderDetailClient({
  order: initialOrder,
  items,
  files: initialFiles,
  approvals,
  store,
  isStaff,
}: {
  order: PortalOrderRow;
  items: PortalOrderItemRow[];
  files: PortalOrderFileRow[];
  approvals: PortalOrderApprovalRow[];
  store: PortalCompanyStoreRow | null;
  isStaff: boolean;
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
    </div>
  );
}
