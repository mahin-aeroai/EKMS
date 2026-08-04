"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type {
  MaterialSupplierRow,
  MaterialSupplierItemRow,
  MaterialConsumptionRowRow,
  MaterialOrderLine,
  MaterialOrderStatus,
  MaterialPackOption,
  MaterialUnitType,
} from "@mmdi/shared/rows";
import { generateMaterialOrderPdf, downloadBlob } from "@/lib/materialOrdering/pdf";

// The core calculator. Two-step flow, both visible on one screen at once
// (no wizard/modal -- same "app on one screen" philosophy as the rest of
// this codebase's Tools workspaces): pick a supplier, pick which
// production programs to include, hit "Build Order List" to compute
// roll/sheet/pack counts, edit anything that needs a human override, then
// save as Draft/Sent and/or download the PDF.
//
// Calculation (see supabase-material-ordering-schema.sql's header for the
// full reasoning behind unit_type):
//   roll   -- group matching consumption rows by material_width_mm, sum
//             total_required_material (already wastage-inclusive linear
//             metres) per width group, pick the narrowest pack_option that's
//             still >= that width (falls back to the widest available and
//             flags it), packs_ordered = ceil(length / pack.length_m).
//   sheet  -- sum sqm * order_qty across all matching rows (nulls treated as
//             0), divide by the chosen pack_option's area, packs_ordered =
//             ceil(total_sqm / pack_area_sqm). Defaults to the first pack
//             option; a dropdown lets the user pick a different one if the
//             supplier has more than one sheet size.
//   simple -- no calculation at all -- always shown (informational, so the
//             "just tell me a roll count" materials -- Arrow Inc's papers,
//             Visual Magnetics, Sappi Magno Satin -- are never silently
//             dropped just because they have no linear-metres/sqm data to
//             sum), packs_ordered starts at 0 and is typed in by hand.
type SizeUnit = "sqm" | "linear_m" | "count";

interface WorkingLine {
  key: string;
  supplierItemId: string;
  unitType: MaterialUnitType;
  materialName: string;
  totalConsumption: number;
  consumptionUnit: SizeUnit;
  availablePackOptions: MaterialPackOption[];
  packOptionIndex: number;
  packsOrdered: number;
  notes?: string;
}

function computePacksOrdered(unitType: MaterialUnitType, totalConsumption: number, pack: MaterialPackOption | undefined): number {
  if (!pack) return 0;
  if (unitType === "roll") {
    if (!pack.length_m) return 0;
    return Math.ceil(totalConsumption / pack.length_m);
  }
  if (unitType === "sheet") {
    if (!pack.width_mm || !pack.height_mm) return 0;
    const areaSqm = (pack.width_mm * pack.height_mm) / 1e6;
    if (areaSqm <= 0) return 0;
    return Math.ceil(totalConsumption / areaSqm);
  }
  return 0;
}

function toOrderLine(line: WorkingLine): MaterialOrderLine {
  const pack = line.availablePackOptions[line.packOptionIndex] ?? { label: "—" };
  return {
    material_name: line.materialName,
    total_consumption: line.totalConsumption,
    consumption_unit: line.consumptionUnit,
    pack_option: pack,
    packs_ordered: line.packsOrdered,
    notes: line.notes,
  };
}

function consumptionLabel(line: WorkingLine): string {
  if (line.consumptionUnit === "linear_m") return `${line.totalConsumption.toFixed(1)} m`;
  if (line.consumptionUnit === "sqm") return `${line.totalConsumption.toFixed(2)} sqm`;
  return "—";
}

export function OrderBuilderTab() {
  const { toast } = useToast();

  const [suppliers, setSuppliers] = useState<MaterialSupplierRow[] | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");

  const [programs, setPrograms] = useState<string[] | null>(null);
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);

  const [lines, setLines] = useState<WorkingLine[]>([]);
  const [computing, setComputing] = useState(false);
  const [hasComputed, setHasComputed] = useState(false);

  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSavedRef, setLastSavedRef] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchAllRows<MaterialSupplierRow>((from, to) => supabase.from("material_suppliers").select("*").order("name").range(from, to)).then(
      setSuppliers
    );
    fetchAllRows<{ program: string | null }>((from, to) =>
      supabase.from("material_consumption_rows").select("program").range(from, to)
    ).then((rows) => {
      const distinct = [...new Set(rows.map((r) => r.program).filter((p): p is string => !!p))].sort();
      setPrograms(distinct);
    });
  }, []);

  const selectedSupplier = suppliers?.find((s) => s.id === selectedSupplierId) ?? null;

  function onSupplierChange(id: string) {
    setSelectedSupplierId(id);
    setLines([]);
    setHasComputed(false);
    setLastSavedRef(null);
  }

  function toggleProgram(program: string) {
    setSelectedPrograms((prev) => (prev.includes(program) ? prev.filter((p) => p !== program) : [...prev, program]));
  }

  async function buildOrder() {
    if (!selectedSupplier) {
      toast("danger", "Select a supplier first");
      return;
    }
    if (selectedPrograms.length === 0) {
      toast("danger", "Select at least one program");
      return;
    }
    setComputing(true);
    setLastSavedRef(null);
    try {
      const [itemsRes, rows] = await Promise.all([
        supabase.from("material_supplier_items").select("*").eq("supplier_id", selectedSupplier.id),
        fetchAllRows<MaterialConsumptionRowRow>((from, to) =>
          supabase.from("material_consumption_rows").select("*").in("program", selectedPrograms).range(from, to)
        ),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      const items = (itemsRes.data as MaterialSupplierItemRow[]) ?? [];

      const newLines: WorkingLine[] = [];

      for (const item of items) {
        const matches = rows.filter(
          (r) => r.material_1 === item.material_name || r.material_2 === item.material_name || r.material_3 === item.material_name
        );

        if (item.unit_type === "simple") {
          // Always shown -- these materials have no consumption data to sum
          // (that's the point of 'simple'), so the user just types in a
          // count. Note whether anything in the selected programs actually
          // touches this material, purely informational.
          newLines.push({
            key: crypto.randomUUID(),
            supplierItemId: item.id,
            unitType: "simple",
            materialName: item.material_name,
            totalConsumption: 0,
            consumptionUnit: "count",
            availablePackOptions: item.pack_options,
            packOptionIndex: 0,
            packsOrdered: 0,
            notes:
              matches.length === 0
                ? "No matching consumption rows in the selected programs — enter quantity manually"
                : undefined,
          });
          continue;
        }

        if (matches.length === 0) continue; // skip roll/sheet items with zero matches

        if (item.unit_type === "roll") {
          const byWidth = new Map<number, number>();
          for (const r of matches) {
            if (r.total_required_material == null) continue; // rows without precomputed linear metres don't apply to roll materials
            const width = r.material_width_mm ?? 0;
            byWidth.set(width, (byWidth.get(width) ?? 0) + r.total_required_material);
          }
          const packs = item.pack_options;
          const sortedByWidth = [...packs].sort((a, b) => (a.width_mm ?? 0) - (b.width_mm ?? 0));

          for (const [width, summedLength] of byWidth) {
            if (summedLength <= 0) continue;
            if (packs.length === 0) {
              newLines.push({
                key: crypto.randomUUID(),
                supplierItemId: item.id,
                unitType: "roll",
                materialName: `${item.material_name} (width ${width}mm)`,
                totalConsumption: summedLength,
                consumptionUnit: "linear_m",
                availablePackOptions: [],
                packOptionIndex: -1,
                packsOrdered: 0,
                notes: "No pack sizes configured for this material — add one in Suppliers & Materials",
              });
              continue;
            }
            let chosen = sortedByWidth.find((p) => (p.width_mm ?? 0) >= width);
            let flagNote: string | undefined;
            if (!chosen) {
              chosen = sortedByWidth[sortedByWidth.length - 1];
              flagNote = `No pack ≥ ${width}mm wide on file — using widest available (${chosen.label})`;
            }
            const packOptionIndex = Math.max(0, packs.indexOf(chosen));
            newLines.push({
              key: crypto.randomUUID(),
              supplierItemId: item.id,
              unitType: "roll",
              materialName: `${item.material_name} (width ${width}mm)`,
              totalConsumption: summedLength,
              consumptionUnit: "linear_m",
              availablePackOptions: packs,
              packOptionIndex,
              packsOrdered: computePacksOrdered("roll", summedLength, packs[packOptionIndex]),
              notes: flagNote,
            });
          }
        } else if (item.unit_type === "sheet") {
          let totalSqm = 0;
          for (const r of matches) {
            totalSqm += (r.sqm ?? 0) * (r.order_qty ?? 0);
          }
          if (totalSqm <= 0) continue;
          const packs = item.pack_options;
          if (packs.length === 0) {
            newLines.push({
              key: crypto.randomUUID(),
              supplierItemId: item.id,
              unitType: "sheet",
              materialName: item.material_name,
              totalConsumption: totalSqm,
              consumptionUnit: "sqm",
              availablePackOptions: [],
              packOptionIndex: -1,
              packsOrdered: 0,
              notes: "No pack sizes configured for this material — add one in Suppliers & Materials",
            });
            continue;
          }
          newLines.push({
            key: crypto.randomUUID(),
            supplierItemId: item.id,
            unitType: "sheet",
            materialName: item.material_name,
            totalConsumption: totalSqm,
            consumptionUnit: "sqm",
            availablePackOptions: packs,
            packOptionIndex: 0,
            packsOrdered: computePacksOrdered("sheet", totalSqm, packs[0]),
          });
        }
      }

      setLines(newLines);
      setHasComputed(true);
      if (newLines.length === 0) {
        toast("info", "No matching materials found for the selected programs");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't build the order list";
      toast("danger", message);
    } finally {
      setComputing(false);
    }
  }

  function updatePacksOrdered(key: string, value: number) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, packsOrdered: Math.max(0, value) } : l)));
  }

  function updatePackOption(key: string, index: number) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const pack = l.availablePackOptions[index];
        return { ...l, packOptionIndex: index, packsOrdered: computePacksOrdered(l.unitType, l.totalConsumption, pack) };
      })
    );
  }

  async function generateRef(): Promise<string> {
    const { data, error } = await supabase.from("material_orders").select("ref").order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    const last = data?.[0]?.ref as string | undefined;
    const lastNum = last ? parseInt(last.replace(/\D/g, ""), 10) : 0;
    const next = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
    return `MO-${String(next).padStart(4, "0")}`;
  }

  async function saveOrder(status: MaterialOrderStatus) {
    if (!selectedSupplier) {
      toast("danger", "Select a supplier first");
      return;
    }
    if (selectedPrograms.length === 0) {
      toast("danger", "Select at least one program");
      return;
    }
    if (lines.length === 0) {
      toast("danger", "Build the order list first");
      return;
    }
    setSaving(true);
    try {
      const ref = await generateRef();
      const { data: userData } = await supabase.auth.getUser();
      const orderLines = lines.map(toOrderLine);
      const { error } = await supabase
        .from("material_orders")
        .insert({
          ref,
          supplier_id: selectedSupplier.id,
          supplier_snapshot: {
            name: selectedSupplier.name,
            address: selectedSupplier.address,
            contact_person: selectedSupplier.contact_person,
            phone: selectedSupplier.phone,
            email: selectedSupplier.email,
          },
          programs: selectedPrograms,
          status,
          notes: notes || null,
          lines: orderLines,
          created_by: userData.user?.id ?? null,
          sent_at: status === "sent" ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;
      setLastSavedRef(ref);
      toast("success", `Saved ${ref} as ${status === "sent" ? "Sent" : "Draft"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't save this order";
      toast("danger", message);
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!selectedSupplier || lines.length === 0) return;
    setDownloading(true);
    try {
      const blob = await generateMaterialOrderPdf({
        ref: lastSavedRef ?? "DRAFT",
        createdAt: new Date().toISOString(),
        status: lastSavedRef ? "sent" : "draft",
        supplier: {
          name: selectedSupplier.name,
          address: selectedSupplier.address,
          contact_person: selectedSupplier.contact_person,
          phone: selectedSupplier.phone,
          email: selectedSupplier.email,
        },
        programs: selectedPrograms,
        notes: notes || null,
        lines: lines.map(toOrderLine),
      });
      downloadBlob(blob, `${lastSavedRef ?? "material-order-draft"}.pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't build this PDF";
      toast("danger", message);
    } finally {
      setDownloading(false);
    }
  }

  const supplierMissingFields = useMemo(() => {
    if (!selectedSupplier) return [];
    const missing: string[] = [];
    if (!selectedSupplier.address) missing.push("address");
    if (!selectedSupplier.contact_person) missing.push("contact person");
    if (!selectedSupplier.phone) missing.push("phone");
    if (!selectedSupplier.email) missing.push("email");
    return missing;
  }, [selectedSupplier]);

  return (
    <div className="flex flex-col gap-6">
      {/* Step 1 -- supplier */}
      <Card interactive={false} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary sm:w-80">
          Supplier
          <select
            value={selectedSupplierId}
            onChange={(e) => onSupplierChange(e.target.value)}
            className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
          >
            <option value="">{suppliers === null ? "Loading…" : "Select a supplier"}</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {selectedSupplier && (
          <div className="rounded-md border border-line bg-surface-sunken p-3 text-xs text-ink-secondary">
            <p className="font-medium text-ink">{selectedSupplier.name}</p>
            <p>{selectedSupplier.address || "No address on file"}</p>
            <p>
              {selectedSupplier.contact_person || "No contact person on file"}
              {selectedSupplier.phone ? ` — ${selectedSupplier.phone}` : ""}
            </p>
            <p>{selectedSupplier.email || "No email on file"}</p>
            {supplierMissingFields.length > 0 && (
              <p className="mt-1.5 text-warning">
                Missing {supplierMissingFields.join(", ")} — edit in the Suppliers &amp; Materials tab.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Step 2 -- programs */}
      {selectedSupplier && (
        <Card interactive={false} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Production programs to include</h3>
            <span className="text-xs text-ink-muted">{selectedPrograms.length} selected</span>
          </div>
          {programs === null ? (
            <p className="py-4 text-center text-sm text-ink-muted">Loading programs…</p>
          ) : programs.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">No consumption data on file yet.</p>
          ) : (
            <div className="grid max-h-64 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto rounded-md border border-line p-3 sm:grid-cols-3 lg:grid-cols-4">
              {programs.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={selectedPrograms.includes(p)}
                    onChange={() => toggleProgram(p)}
                    className="h-3.5 w-3.5 rounded border-line-strong"
                  />
                  {p}
                </label>
              ))}
            </div>
          )}
          <div>
            <Button variant="primary" size="sm" onClick={buildOrder} loading={computing} disabled={selectedPrograms.length === 0}>
              Build Order List
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3 -- computed order list */}
      {hasComputed && (
        <Card interactive={false} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Order list</h3>
          {lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">
              No materials from this supplier were used by the selected programs.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-sunken text-left text-ink-secondary">
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Consumption required</th>
                    <th className="px-3 py-2">Pack size</th>
                    <th className="px-3 py-2">Packs ordered</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-1.5 font-medium text-ink">{l.materialName}</td>
                      <td className="px-3 py-1.5 text-ink-secondary">{consumptionLabel(l)}</td>
                      <td className="px-3 py-1.5">
                        {l.availablePackOptions.length > 1 ? (
                          <select
                            value={l.packOptionIndex}
                            onChange={(e) => updatePackOption(l.key, Number(e.target.value))}
                            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                          >
                            {l.availablePackOptions.map((p, i) => (
                              <option key={p.label} value={i}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-ink-secondary">{l.availablePackOptions[0]?.label ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          value={l.packsOrdered}
                          onChange={(e) => updatePacksOrdered(l.key, Number(e.target.value))}
                          className="h-8 w-20 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-warning">{l.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
            Notes for this order
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything else to include on the purchase request"
              className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => saveOrder("draft")} loading={saving} disabled={lines.length === 0}>
              <Save size={14} />
              Save Draft
            </Button>
            <Button variant="secondary" size="sm" onClick={() => saveOrder("sent")} loading={saving} disabled={lines.length === 0}>
              <Send size={14} />
              Save &amp; Mark Sent
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadPdf} loading={downloading} disabled={lines.length === 0}>
              <Download size={14} />
              Download PDF
            </Button>
            {lastSavedRef && (
              <span className="flex items-center gap-1 text-xs text-success">
                {saving && <Loader2 size={12} className="animate-spin" />}
                Saved as {lastSavedRef}
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
