"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { orderStatusBadge, orderStatusLabel } from "@/components/portal/orderStatus";
import type { PortalOrderRow, PortalOrderApprovalRow } from "@mmdi/shared/rows";

interface OrderRowWithNames extends PortalOrderRow {
  portal_companies: { name: string } | null;
  portal_company_stores: { store_name: string } | null;
}

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
}

// Staff-side consolidated queue -- everything with a design decision
// pending on MMDI's side (needs a first proof, or a revised one after the
// customer asked for changes), plus a read-only "waiting on the customer"
// list for visibility. Distinct from OrdersTab, which lists every order
// regardless of state and links out to the full order page for any
// action -- this tab is purpose-built for the proof-upload step alone,
// so staff don't have to open each order one at a time to see who's
// waiting on what. Uploading here calls the exact same
// upload-url + publish-proof endpoints OrderDetailClient's own "Upload
// design proof" button uses, so there's one upload code path's worth of
// server-side behavior, just two UI entry points into it.
//
// 16 Sept 2026: task feedback -- "Lets introduce a fresh tab for creative
// approval and place the designs there and back and forth revisions."
export function CreativeApprovalTab() {
  const [orders, setOrders] = useState<OrderRowWithNames[]>([]);
  const [revisionComments, setRevisionComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [{ data: orderRows }, { data: approvals }] = await Promise.all([
      supabase
        .from("portal_orders")
        .select("*, portal_companies(name), portal_company_stores(store_name)")
        .in("status", ["submitted", "revision_requested", "proof_uploaded"])
        .order("updated_at", { ascending: true }),
      supabase
        .from("portal_order_approvals")
        .select("*")
        .eq("decision", "revision_requested")
        .order("decided_at", { ascending: false }),
    ]);
    setOrders((orderRows ?? []) as unknown as OrderRowWithNames[]);
    const latestComment: Record<string, string> = {};
    for (const a of (approvals ?? []) as PortalOrderApprovalRow[]) {
      if (!latestComment[a.order_id] && a.comment) latestComment[a.order_id] = a.comment;
    }
    setRevisionComments(latestComment);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Wrapped in an inline async IIFE (matches OrdersTab.tsx's own load
    // effect) rather than calling the memoized `refresh` directly -- the
    // lint rule for effects treats a direct call to a named
    // setState-calling callback as a synchronous setState-in-effect, even
    // though the actual state updates happen after the awaited fetch.
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>;

  const needsProof = orders.filter((o) => o.status === "submitted" || o.status === "revision_requested");
  const waitingOnCustomer = orders.filter((o) => o.status === "proof_uploaded");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Needs a proof from you {needsProof.length > 0 && `(${needsProof.length})`}
        </h3>
        {needsProof.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface-sunken p-4 text-sm text-ink-muted">Nothing waiting on a proof upload.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {needsProof.map((order) => (
              <StaffProofRow
                key={order.id}
                order={order}
                revisionComment={order.status === "revision_requested" ? revisionComments[order.id] : undefined}
                onUploaded={refresh}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Waiting on the customer {waitingOnCustomer.length > 0 && `(${waitingOnCustomer.length})`}
        </h3>
        {waitingOnCustomer.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface-sunken p-4 text-sm text-ink-muted">No proofs currently awaiting a customer decision.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Store</th>
                  <th className="px-3 py-2">Revision</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {waitingOnCustomer.map((order) => (
                  <tr key={order.id} className="border-t border-line bg-surface">
                    <td className="px-3 py-2 font-medium text-ink">{order.order_no}</td>
                    <td className="px-3 py-2 text-ink-secondary">{order.portal_companies?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{order.portal_company_stores?.store_name ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-secondary">{order.current_revision_number}</td>
                    <td className="px-3 py-2">
                      <Badge status={orderStatusBadge(order.status)}>{orderStatusLabel(order.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StaffProofRow({
  order,
  revisionComment,
  onUploaded,
}: {
  order: OrderRowWithNames;
  revisionComment: string | undefined;
  onUploaded: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    router.refresh();
    onUploaded();
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{order.order_no}</span>
            <Badge status={orderStatusBadge(order.status)}>{orderStatusLabel(order.status)}</Badge>
          </div>
          <p className="text-xs text-ink-muted">
            {order.portal_companies?.name ?? "—"} · {order.portal_company_stores?.store_name ?? "—"}
            {order.current_revision_number > 0 ? ` · currently revision ${order.current_revision_number}` : ""}
          </p>
          {revisionComment && (
            <p className="mt-1 max-w-xl rounded-md bg-warning-tint px-2 py-1 text-xs text-ink-secondary">
              <span className="font-medium text-ink">Customer asked for: </span>
              {revisionComment}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-danger">{error}</span>}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadProof(file);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} loading={busy}>
            <UploadCloud size={14} /> {order.status === "revision_requested" ? "Upload revised proof" : "Upload design proof"}
          </Button>
        </div>
      </div>
    </div>
  );
}
