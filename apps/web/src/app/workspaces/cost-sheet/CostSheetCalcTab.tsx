"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type { BomTemplateLineRow, BomTemplateRow, RawMaterialRow, WorkCentreRateRow } from "@mmdi/shared/rows";
import { computeCostSheet, type Uom } from "./calc";
import { groupByCategory } from "./categoryOrder";

const fmtRupee = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// The live calculator -- select an FG template, enter dimensions/qty/selling
// price, get material cost (recent + average purchase price) and
// work-centre process cost, same breakdown as the Excel workbook's Cost
// Sheet tab but reading live from bom_templates / bom_template_lines /
// raw_materials / work_centre_rates instead of a spreadsheet snapshot.
//
// Deliberately NOT persisted anywhere yet (no "save this run" button) --
// that wasn't part of what was scoped this session (see
// supabase-cost-sheet-schema.sql's header). A `cost_sheet_runs` table
// mirroring sign_estimates (one row per saved calculation) would be the
// natural next step if MMDI wants a history/audit trail here too.
export function CostSheetCalcTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<BomTemplateRow[]>([]);
  const [rates, setRates] = useState<WorkCentreRateRow[]>([]);
  const [materials, setMaterials] = useState<RawMaterialRow[]>([]);
  const [lines, setLines] = useState<BomTemplateLineRow[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  const [salesOrder, setSalesOrder] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [uom, setUom] = useState<Uom>("FT");
  const [width, setWidth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");
  const [qty, setQty] = useState<number | "">(1);
  const [sellPrice, setSellPrice] = useState<number | "">("");

  useEffect(() => {
    // raw_materials alone is ~1,558 rows -- well past PostgREST's default
    // 1000-row cap on an unpaginated select. A plain .select("*") here
    // silently truncated the list, so lines that WERE correctly mapped in
    // the BOM Master tab (materials.get(raw_material_code) missing from
    // this half-loaded set) still showed as "unmapped" on this tab.
    // fetchAllRows pages through with .range() until it gets a real
    // full set, same fix already used for customers/employees in
    // Estimate Builder.
    Promise.all([
      supabase.from("bom_templates").select("*").order("code"),
      supabase.from("work_centre_rates").select("*"),
      fetchAllRows<RawMaterialRow>((from, to) => supabase.from("raw_materials").select("*").order("code").range(from, to)),
    ]).then(([t, r, materialRows]) => {
      if (t.error || r.error) {
        toast("danger", "Couldn't load Cost Sheet master data");
        return;
      }
      setTemplates((t.data as BomTemplateRow[]) ?? []);
      setRates((r.data as WorkCentreRateRow[]) ?? []);
      setMaterials(materialRows);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!templateId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLines([]);
      return;
    }
    setLoadingLines(true);
    supabase
      .from("bom_template_lines")
      .select("*")
      .eq("template_id", templateId)
      .order("line_no")
      .then(({ data, error }) => {
        setLoadingLines(false);
        if (error) {
          toast("danger", "Couldn't load BOM lines for this template");
          return;
        }
        setLines((data as BomTemplateLineRow[]) ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const template = templates.find((t) => t.id === templateId) ?? null;
  const materialsByCode = useMemo(() => new Map(materials.map((m) => [m.code, m])), [materials]);
  const templateGroups = useMemo(() => groupByCategory(templates), [templates]);

  const result = useMemo(() => {
    if (!template) return null;
    return computeCostSheet(template, lines, materialsByCode, rates, {
      uom,
      width: width === "" ? 0 : width,
      height: height === "" ? 0 : height,
      qty: qty === "" ? 0 : qty,
      sellingPricePerSqft: sellPrice === "" ? 0 : sellPrice,
    });
  }, [template, lines, materialsByCode, rates, uom, width, height, qty, sellPrice]);

  const unmappedLines = lines.filter((l) => !l.raw_material_code);
  const missingRateCentres = result?.workCentreCosts.filter((w) => w.cost === null) ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      {/* ---- inputs ---- */}
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">Job details</h3>
        <Field label="Sales Order">
          <input
            type="text"
            value={salesOrder}
            onChange={(e) => setSalesOrder(e.target.value)}
            placeholder="e.g. SO-1"
            className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
          />
        </Field>
        <Field label="FG Code / Template">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
          >
            <option value="">— select —</option>
            {templateGroups.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.description}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        {template && (
          <div className="flex flex-wrap gap-1.5">
            <Badge status="info">{template.category}</Badge>
            <Badge status="neutral">{template.print_mode}</Badge>
            <Badge status="neutral">{template.substrate_type}</Badge>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="UOM">
            <select
              value={uom}
              onChange={(e) => setUom(e.target.value as Uom)}
              className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
            >
              <option value="FT">Feet</option>
              <option value="INC">Inches</option>
            </select>
          </Field>
          <Field label="Qty">
            <NumberInput value={qty} onChange={setQty} />
          </Field>
          <Field label="Width">
            <NumberInput value={width} onChange={setWidth} />
          </Field>
          <Field label="Height">
            <NumberInput value={height} onChange={setHeight} />
          </Field>
        </div>
        <Field label="Selling Price / SqFt (₹)">
          <NumberInput value={sellPrice} onChange={setSellPrice} />
        </Field>

        {result && (
          <div className="mt-1 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs text-ink-secondary">
            <div>
              Qty in SqFt: <span className="font-medium text-ink">{result.sqft.toFixed(2)}</span>
            </div>
            <div>
              Selling Amount: <span className="font-medium text-ink">{fmtRupee(result.sellingAmount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ---- results ---- */}
      <div className="flex flex-col gap-4">
        {!template && (
          <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-ink-muted">
            Select an FG code to see its cost breakdown.
          </p>
        )}

        {template && loadingLines && <p className="py-8 text-center text-sm text-ink-muted">Loading BOM…</p>}

        {template && !loadingLines && result && (
          <>
            {unmappedLines.length > 0 && (
              <div className="rounded-lg border border-warning-tint bg-warning-tint/40 p-3 text-xs text-ink">
                {unmappedLines.length} of {lines.length} material line{lines.length === 1 ? "" : "s"} for this FG
                {unmappedLines.length === 1 ? " isn't" : " aren't"} mapped to a real raw material yet, so{" "}
                {unmappedLines.length === 1 ? "it" : "they"} cost ₹0 below. Map {unmappedLines.length === 1 ? "it" : "them"} in
                the BOM Master tab: {unmappedLines.map((l) => l.material_name).join(", ")}.
              </div>
            )}
            {missingRateCentres.length > 0 && (
              <div className="rounded-lg border border-danger-tint bg-danger-tint/40 p-3 text-xs text-ink">
                No rate set for: {missingRateCentres.map((w) => w.workCentre).join(", ")} — enter these in the Rate Card tab
                for an accurate total.
              </div>
            )}

            <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">Material cost</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-secondary">
                      <th className="py-1.5 pr-2">Material</th>
                      <th className="py-1.5 pr-2">Mapped to</th>
                      <th className="py-1.5 pr-2 text-right">Recent ₹/unit</th>
                      <th className="py-1.5 pr-2 text-right">Avg ₹/unit</th>
                      <th className="py-1.5 pr-2 text-right">Consumption</th>
                      <th className="py-1.5 pr-2 text-right">Wastage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lineCosts.map((lc) => (
                      <tr key={lc.line.id} className="border-b border-line/60">
                        <td className="py-1.5 pr-2 text-ink">{lc.line.material_name}</td>
                        <td className="py-1.5 pr-2 text-ink-secondary">
                          {lc.rawMaterial ? `${lc.rawMaterial.code} — ${lc.rawMaterial.name}` : "— unmapped —"}
                        </td>
                        <td className="py-1.5 pr-2 text-right">{lc.recentUnitPrice !== null ? lc.recentUnitPrice.toFixed(2) : "—"}</td>
                        <td className="py-1.5 pr-2 text-right">{lc.avgUnitPrice !== null ? lc.avgUnitPrice.toFixed(2) : "—"}</td>
                        <td className="py-1.5 pr-2 text-right">
                          {lc.line.consumption_qty} /{lc.line.basis.toLowerCase()}
                        </td>
                        <td className="py-1.5 pr-2 text-right">{Math.round(lc.line.wastage_pct * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex gap-6 border-t border-line pt-3 text-sm">
                <div>
                  Material cost (recent): <span className="font-semibold text-ink">{fmtRupee(result.materialCostRecent)}</span>
                </div>
                <div>
                  Material cost (avg): <span className="font-semibold text-ink">{fmtRupee(result.materialCostAvg)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">Work centre process cost</h3>
              <div className="flex flex-wrap gap-3">
                {result.workCentreCosts.map((w) => (
                  <div key={w.workCentre} className="rounded-md border border-line px-3 py-2 text-xs">
                    <div className="text-ink-secondary">{w.workCentre}</div>
                    <div className="font-semibold text-ink">{w.cost !== null ? fmtRupee(w.cost) : "no rate"}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-line pt-3 text-sm">
                Total process cost: <span className="font-semibold text-ink">{fmtRupee(result.totalProcessCost)}</span>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-primary-tint p-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Total Cost (recent)" value={fmtRupee(result.totalCostRecent)} />
                <Metric label="Total Cost (avg)" value={fmtRupee(result.totalCostAvg)} />
                <Metric label="GP (recent)" value={fmtRupee(result.gpRecent)} sub={pct(result.gpRecentPct)} />
                <Metric label="GP (avg)" value={fmtRupee(result.gpAvg)} sub={pct(result.gpAvgPct)} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function pct(v: number | null) {
  return v === null ? undefined : `${(v * 100).toFixed(1)}%`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange }: { value: number | ""; onChange: (v: number | "") => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
    />
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-ink-secondary">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-ink">{value}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}
