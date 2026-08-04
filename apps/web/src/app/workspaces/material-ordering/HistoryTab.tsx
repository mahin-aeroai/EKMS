"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Download, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type { MaterialOrderRow } from "@mmdi/shared/rows";
import { generateMaterialOrderPdf, downloadBlob } from "@/lib/materialOrdering/pdf";

// Past saved orders (Draft/Sent), newest first. Click a row to expand its
// full line list -- everything needed to review or re-send an order is
// already frozen in the saved row (supplier_snapshot/programs/lines), same
// "sent order keeps showing exactly what was requested" philosophy as the
// schema's own header comment.
export function HistoryTab() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<MaterialOrderRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [markingSentId, setMarkingSentId] = useState<string | null>(null);

  function load() {
    fetchAllRows<MaterialOrderRow>((from, to) =>
      supabase.from("material_orders").select("*").order("created_at", { ascending: false }).range(from, to)
    ).then(setOrders);
  }

  useEffect(() => {
    load();
  }, []);

  async function downloadOrderPdf(order: MaterialOrderRow) {
    setDownloadingId(order.id);
    try {
      const blob = await generateMaterialOrderPdf({
        ref: order.ref,
        createdAt: order.created_at,
        status: order.status,
        supplier: {
          name: order.supplier_snapshot.name,
          address: order.supplier_snapshot.address,
          contact_person: order.supplier_snapshot.contact_person,
          phone: order.supplier_snapshot.phone,
          email: order.supplier_snapshot.email,
        },
        programs: order.programs,
        notes: order.notes,
        lines: order.lines,
      });
      downloadBlob(blob, `${order.ref}.pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't build this PDF";
      toast("danger", message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function markSent(order: MaterialOrderRow) {
    setMarkingSentId(order.id);
    const { error } = await supabase
      .from("material_orders")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", order.id);
    setMarkingSentId(null);
    if (error) {
      toast("danger", `Couldn't mark as sent: ${error.message}`);
      return;
    }
    toast("success", `${order.ref} marked as Sent`);
    setOrders((prev) => prev?.map((o) => (o.id === order.id ? { ...o, status: "sent", sent_at: new Date().toISOString() } : o)) ?? null);
  }

  function consumptionLabel(unit: string, value: number): string {
    if (unit === "linear_m") return `${value.toFixed(1)} m`;
    if (unit === "sqm") return `${value.toFixed(2)} sqm`;
    return "—";
  }

  if (!orders) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;

  return (
    <div>
      <p className="mb-4 text-sm text-ink-secondary">{orders.length} saved material orders.</p>

      {orders.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">No material orders saved yet — build one in the Order Builder tab.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-sunken text-left text-xs text-ink-secondary">
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Programs</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const expanded = expandedId === o.id;
                return (
                  <Fragment key={o.id}>
                    <tr
                      key={o.id}
                      className="cursor-pointer border-b border-line/60 bg-surface hover:bg-surface-sunken"
                      onClick={() => setExpandedId(expanded ? null : o.id)}
                    >
                      <td className="px-3 py-2 font-medium text-ink">{o.ref}</td>
                      <td className="px-3 py-2 text-ink-secondary">{o.supplier_snapshot.name}</td>
                      <td className="px-3 py-2 text-ink-secondary">{o.programs.join(", ") || "—"}</td>
                      <td className="px-3 py-2">
                        <Badge status={o.status === "sent" ? "success" : "warning"}>{o.status === "sent" ? "Sent" : "Draft"}</Badge>
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">{new Date(o.created_at).toLocaleDateString("en-IN")}</td>
                      <td className="px-3 py-2 text-ink-muted">
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${o.id}-detail`} className="border-b border-line/60 bg-surface-sunken/40">
                        <td colSpan={6} className="px-3 py-3">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadOrderPdf(o);
                              }}
                              loading={downloadingId === o.id}
                            >
                              <Download size={14} />
                              Download PDF
                            </Button>
                            {o.status === "draft" && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markSent(o);
                                }}
                                loading={markingSentId === o.id}
                              >
                                <Send size={14} />
                                Mark Sent
                              </Button>
                            )}
                          </div>

                          <div className="mb-3 rounded-md border border-line bg-surface p-3 text-xs text-ink-secondary">
                            <p className="font-medium text-ink">{o.supplier_snapshot.name}</p>
                            <p>{o.supplier_snapshot.address || "No address on file"}</p>
                            <p>
                              {o.supplier_snapshot.contact_person || "No contact person on file"}
                              {o.supplier_snapshot.phone ? ` — ${o.supplier_snapshot.phone}` : ""}
                            </p>
                            <p>{o.supplier_snapshot.email || "No email on file"}</p>
                          </div>

                          <div className="overflow-x-auto rounded-md border border-line">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-line bg-surface-sunken text-left text-ink-secondary">
                                  <th className="px-3 py-1.5">Material</th>
                                  <th className="px-3 py-1.5">Consumption required</th>
                                  <th className="px-3 py-1.5">Pack size</th>
                                  <th className="px-3 py-1.5">Packs ordered</th>
                                  <th className="px-3 py-1.5">Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.lines.map((l, i) => (
                                  <tr key={i} className="border-b border-line/60 bg-surface last:border-0">
                                    <td className="px-3 py-1.5 font-medium text-ink">{l.material_name}</td>
                                    <td className="px-3 py-1.5 text-ink-secondary">
                                      {consumptionLabel(l.consumption_unit, l.total_consumption)}
                                    </td>
                                    <td className="px-3 py-1.5 text-ink-secondary">{l.pack_option?.label ?? "—"}</td>
                                    <td className="px-3 py-1.5 text-ink-secondary">{l.packs_ordered}</td>
                                    <td className="px-3 py-1.5 text-warning">{l.notes ?? ""}</td>
                                  </tr>
                                ))}
                                {o.lines.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="px-3 py-3 text-center text-ink-muted">
                                      No lines on this order.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {o.notes && <p className="mt-3 text-xs text-ink-secondary">Notes: {o.notes}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
