"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, CheckCircle2, RotateCcw, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { orderStatusBadge, orderStatusLabel } from "./orderStatus";
import { usePortalHost, portalHref } from "@/lib/portal-links";
import type { PortalOrderRow, PortalOrderFileRow, PortalOrderStatus } from "@mmdi/shared/rows";

type OrderRow = Pick<
  PortalOrderRow,
  "id" | "order_no" | "status" | "payment_status" | "store_id" | "current_revision_number" | "updated_at"
>;

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

const DECIDABLE: PortalOrderStatus[] = ["proof_uploaded", "revision_requested"];

export function CreativeApprovalClient({
  orders,
  storeNames,
  latestProofByOrder,
}: {
  orders: OrderRow[];
  storeNames: Record<string, string>;
  latestProofByOrder: Record<string, PortalOrderFileRow>;
}) {
  // Orders move from "needs review" to "history" client-side the moment a
  // decision is made -- no full-page reload needed for that to feel
  // instant, even though a background router.refresh() (inside
  // ReviewCard) also keeps the server-rendered data eventually consistent.
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [resolvedStatus, setResolvedStatus] = useState<Record<string, PortalOrderStatus>>({});

  function handleResolved(orderId: string, newStatus: PortalOrderStatus) {
    setResolvedIds((prev) => new Set(prev).add(orderId));
    setResolvedStatus((prev) => ({ ...prev, [orderId]: newStatus }));
  }

  const needsReview = orders.filter((o) => DECIDABLE.includes(o.status) && !resolvedIds.has(o.id));
  const history = orders.filter((o) => !DECIDABLE.includes(o.status) || resolvedIds.has(o.id));

  if (orders.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface p-6 text-center text-sm text-ink-muted">
        No design proofs yet — once MMDI uploads a proof against one of your orders, it&apos;ll show up here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Needs your review {needsReview.length > 0 && `(${needsReview.length})`}
        </h2>
        {needsReview.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink-muted">
            Nothing waiting on you right now.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {needsReview.map((order) => (
              <ReviewCard
                key={order.id}
                order={order}
                storeName={storeNames[order.store_id] ?? "—"}
                proof={latestProofByOrder[order.id] ?? null}
                onResolved={handleResolved}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Previously reviewed</h2>
        {history.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink-muted">Nothing here yet.</p>
        ) : (
          <HistoryList orders={history} storeNames={storeNames} latestProofByOrder={latestProofByOrder} resolvedStatus={resolvedStatus} />
        )}
      </div>
    </div>
  );
}

function ReviewCard({
  order,
  storeName,
  proof,
  onResolved,
}: {
  order: OrderRow;
  storeName: string;
  proof: PortalOrderFileRow | null;
  onResolved: (orderId: string, newStatus: PortalOrderStatus) => void;
}) {
  const onPortalHost = usePortalHost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRevisionBox, setShowRevisionBox] = useState(false);
  const [revisionComment, setRevisionComment] = useState("");

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
    onResolved(order.id, "approved");
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
    onResolved(order.id, "revision_requested");
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-1">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={portalHref(`/orders/${order.id}`, onPortalHost)}
              className="text-sm font-semibold text-ink hover:underline"
            >
              {order.order_no}
            </Link>
            <Badge status={orderStatusBadge(order.status)}>{orderStatusLabel(order.status)}</Badge>
          </div>
          <p className="text-xs text-ink-muted">{storeName}</p>
        </div>
        {proof && (
          <button
            onClick={() => downloadFile(proof.id)}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Download size={12} /> revision {proof.revision_number} — {proof.file_name}
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

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
  );
}

function HistoryList({
  orders,
  storeNames,
  latestProofByOrder,
  resolvedStatus,
}: {
  orders: OrderRow[];
  storeNames: Record<string, string>;
  latestProofByOrder: Record<string, PortalOrderFileRow>;
  resolvedStatus: Record<string, PortalOrderStatus>;
}) {
  const onPortalHost = usePortalHost();
  return (
    <div className="flex flex-col gap-2">
      {orders.map((order) => {
        const proof = latestProofByOrder[order.id];
        const status = resolvedStatus[order.id] ?? order.status;
        return (
          <Link
            key={order.id}
            href={portalHref(`/orders/${order.id}`, onPortalHost)}
            className="flex items-center justify-between rounded-lg border border-line bg-surface p-3.5 text-sm shadow-1 transition-shadow hover:shadow-2"
          >
            <div className="flex items-center gap-3">
              <div>
                <p className="font-medium text-ink">{order.order_no}</p>
                <p className="text-xs text-ink-muted">
                  {storeNames[order.store_id] ?? "—"}
                  {proof ? ` · revision ${proof.revision_number}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge status={orderStatusBadge(status)}>{orderStatusLabel(status)}</Badge>
              <ArrowRight size={14} className="text-ink-muted" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
