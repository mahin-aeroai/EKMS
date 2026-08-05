"use client";

import { Fragment, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Download } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type { ImportDutyCalculationRow } from "@mmdi/shared/rows";
import { generateImportDutyPdf, downloadBlob } from "@/lib/importDuty/pdf";

function fmt(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// Past saved calculations (Draft/Final), newest first. Click a row to
// expand its full line list -- everything needed to review or reprint a
// calculation is already frozen in the saved row's `lines` jsonb, same
// "reopened calculation keeps showing exactly what was saved" philosophy
// as Material Ordering's own History tab.
export function HistoryTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ImportDutyCalculationRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [markingFinalId, setMarkingFinalId] = useState<string | null>(null);

  function load() {
    fetchAllRows<ImportDutyCalculationRow>((from, to) =>
      supabase.from("import_duty_calculations").select("*").order("created_at", { ascending: false }).range(from, to)
    ).then(setRows);
  }

  useEffect(() => {
    load();
  }, []);

  async function downloadRowPdf(row: ImportDutyCalculationRow) {
    setDownloadingId(row.id);
    try {
      const blob = await generateImportDutyPdf({
        ref: row.ref,
        createdAt: row.created_at,
        status: row.status,
        supplier_name: row.supplier_name,
        invoice_no: row.invoice_no,
        invoice_date: row.invoice_date,
        bill_of_entry_no: row.bill_of_entry_no,
        bill_of_entry_date: row.bill_of_entry_date,
        notes: row.notes,
        freight: row.freight,
        freight_ex_works: row.freight_ex_works,
        clearing_charges: row.clearing_charges,
        insurance_percent: row.insurance_percent,
        lines: row.lines,
      });
      downloadBlob(blob, `${row.ref}.pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't build this PDF";
      toast("danger", message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function markFinal(row: ImportDutyCalculationRow) {
    setMarkingFinalId(row.id);
    const { error } = await supabase.from("import_duty_calculations").update({ status: "final" }).eq("id", row.id);
    setMarkingFinalId(null);
    if (error) {
      toast("danger", `Couldn't mark as final: ${error.message}`);
      return;
    }
    toast("success", `${row.ref} marked as Final`);
    setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, status: "final" } : r)) ?? null);
  }

  if (!rows) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;

  return (
    <div>
      <p className="mb-4 text-sm text-ink-secondary">{rows.length} saved calculations.</p>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">No calculations saved yet — build one in the Calculator tab.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-sunken text-left text-xs text-ink-secondary">
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Invoice No.</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Total Cost</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const expanded = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      className="cursor-pointer border-b border-line/60 bg-surface hover:bg-surface-sunken"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                    >
                      <td className="px-3 py-2 font-medium text-ink">{r.ref}</td>
                      <td className="px-3 py-2 text-ink-secondary">{r.supplier_name || "—"}</td>
                      <td className="px-3 py-2 text-ink-secondary">{r.invoice_no || "—"}</td>
                      <td className="px-3 py-2">
                        <Badge status={r.status === "final" ? "success" : "warning"}>
                          {r.status === "final" ? "Final" : "Draft"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">{fmt(r.total_cost)}</td>
                      <td className="px-3 py-2 text-ink-secondary">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                      <td className="px-3 py-2 text-ink-muted">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-line/60 bg-surface-sunken/40">
                        <td colSpan={7} className="px-3 py-3">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadRowPdf(r);
                              }}
                              loading={downloadingId === r.id}
                            >
                              <Download size={14} />
                              Download PDF
                            </Button>
                            {r.status === "draft" && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markFinal(r);
                                }}
                                loading={markingFinalId === r.id}
                              >
                                <CheckCircle2 size={14} />
                                Mark Final
                              </Button>
                            )}
                          </div>

                          <div className="mb-3 rounded-md border border-line bg-surface p-3 text-xs text-ink-secondary">
                            <p className="font-medium text-ink">{r.supplier_name || "No supplier on file"}</p>
                            <p>
                              Invoice: {r.invoice_no || "—"}
                              {r.invoice_date ? ` (${new Date(r.invoice_date).toLocaleDateString("en-IN")})` : ""}
                            </p>
                            <p>
                              Bill of Entry: {r.bill_of_entry_no || "—"}
                              {r.bill_of_entry_date ? ` (${new Date(r.bill_of_entry_date).toLocaleDateString("en-IN")})` : ""}
                            </p>
                            <p className="mt-1">
                              Freight: {fmt(r.freight)} · Freight (Ex Works): {fmt(r.freight_ex_works)} · Clearing: {fmt(r.clearing_charges)} ·
                              Insurance: {r.insurance_percent}%
                            </p>
                          </div>

                          <div className="overflow-x-auto rounded-md border border-line">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-line bg-surface-sunken text-left text-ink-secondary">
                                  <th className="px-3 py-1.5">Product</th>
                                  <th className="px-3 py-1.5">Size</th>
                                  <th className="px-3 py-1.5">Qty</th>
                                  <th className="px-3 py-1.5">Sq.Ft</th>
                                  <th className="px-3 py-1.5">Inv. Value</th>
                                  <th className="px-3 py-1.5">Assessable Value</th>
                                  <th className="px-3 py-1.5">Total Duty</th>
                                  <th className="px-3 py-1.5">Total Cost</th>
                                  <th className="px-3 py-1.5">Cost / Qty</th>
                                  <th className="px-3 py-1.5">Cost / Sq.Ft</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.lines.map((l, i) => (
                                  <tr key={i} className="border-b border-line/60 bg-surface last:border-0">
                                    <td className="px-3 py-1.5 font-medium text-ink">{l.product_name}</td>
                                    <td className="px-3 py-1.5 text-ink-secondary">
                                      {l.size_mode === "roll"
                                        ? `${l.qty} ${l.length_uom} × ${l.width} ${l.uom} wide (roll)`
                                        : `${l.width}×${l.height} ${l.uom}`}
                                    </td>
                                    <td className="px-3 py-1.5 text-ink-secondary">{l.qty}</td>
                                    <td className="px-3 py-1.5 text-ink-secondary">{l.sqft_total.toFixed(2)}</td>
                                    <td className="px-3 py-1.5 text-ink-secondary">{fmt(l.inv_value)}</td>
                                    <td className="px-3 py-1.5 text-ink-secondary">{fmt(l.assessable_value)}</td>
                                    <td className="px-3 py-1.5 text-ink-secondary">{fmt(l.total_duty)}</td>
                                    <td className="px-3 py-1.5 font-medium text-ink">{fmt(l.total_cost)}</td>
                                    <td className="px-3 py-1.5 font-medium text-ink">{fmt(l.cost_per_qty)}</td>
                                    <td className="px-3 py-1.5 font-medium text-ink">{fmt(l.cost_per_sqft)}</td>
                                  </tr>
                                ))}
                                {r.lines.length === 0 && (
                                  <tr>
                                    <td colSpan={10} className="px-3 py-3 text-center text-ink-muted">
                                      No lines on this calculation.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {r.notes && <p className="mt-3 text-xs text-ink-secondary">Notes: {r.notes}</p>}
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
