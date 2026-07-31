"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type { BomMaterialUnit, BomTemplateLineRow, BomTemplateRow, RawMaterialRow } from "@mmdi/shared/rows";
import { groupByCategory } from "./categoryOrder";
import { RawMaterialPicker } from "./RawMaterialPicker";

// Real-world consumption units, matching how materials are actually
// bought/tracked in Raw Materials.xlsx (Nos, SQF, Mtr, Kgs, Set) plus
// RFT (running feet) for keder/piping-type trims that weren't in that
// file's own UOM list but are a real unit MMDI uses. See calc.ts's
// SQFT_SCALED_UNITS for how each of these affects cost scaling -- only
// SQFT scales with the job's area, everything else scales with Qty.
const BASIS_OPTIONS: { value: BomMaterialUnit; label: string }[] = [
  { value: "SQFT", label: "SQFT — sq. feet (scales with job area)" },
  { value: "NOS", label: "NOS — pieces/count" },
  { value: "RFT", label: "RFT — running feet" },
  { value: "MTR", label: "MTR — metres" },
  { value: "KGS", label: "KGS — kilograms" },
  { value: "SET", label: "SET — set" },
  { value: "KLR", label: "KLR — litres" },
];

// Combined view of bom_templates + bom_template_lines -- the web equivalent
// of the Excel workbook's "BOM Master" + "BOM Item Mapping" + "BOM Cost
// Detail" sheets rolled into one screen: pick a template, see its material
// lines, map each to a real raw_materials.code, edit consumption/wastage.
export function BomMasterTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<BomTemplateRow[] | null>(null);
  const [linesByTemplate, setLinesByTemplate] = useState<Record<string, BomTemplateLineRow[]>>({});
  const [materials, setMaterials] = useState<RawMaterialRow[]>([]);
  const [workCentreOptions, setWorkCentreOptions] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [savingWorkCentresId, setSavingWorkCentresId] = useState<string | null>(null);
  const materialsByCode = useMemo(() => new Map(materials.map((m) => [m.code, m])), [materials]);

  useEffect(() => {
    supabase
      .from("bom_templates")
      .select("*")
      .order("code")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load BOM templates");
          return;
        }
        setTemplates((data as BomTemplateRow[]) ?? []);
      });
    // raw_materials is ~1,558 rows -- past PostgREST's default 1000-row
    // cap on an unpaginated select, which was silently cutting the picker's
    // candidate list short (some suggested codes, e.g. higher-numbered
    // RM-4xxxx ones, simply weren't in the loaded set to search against).
    // fetchAllRows pages through with .range() to get the real full list.
    fetchAllRows<RawMaterialRow>((from, to) => supabase.from("raw_materials").select("*").order("code").range(from, to)).then(
      setMaterials
    );
    // The full canonical set of work centre keys -- every combination
    // already seeded into work_centre_rates from the 33 original BOM
    // templates -- used as the "applicable or not" checklist below, so a
    // template can pick up a work centre it doesn't currently have as well
    // as drop one it does.
    supabase
      .from("work_centre_rates")
      .select("work_centre")
      .then(({ data, error }) => {
        if (error) return;
        const names = Array.from(new Set((data ?? []).map((r) => r.work_centre as string))).sort();
        setWorkCentreOptions(names);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(templateId: string) {
    if (expanded === templateId) {
      setExpanded(null);
      return;
    }
    setExpanded(templateId);
    if (!linesByTemplate[templateId]) {
      supabase
        .from("bom_template_lines")
        .select("*")
        .eq("template_id", templateId)
        .order("line_no")
        .then(({ data, error }) => {
          if (error) {
            toast("danger", "Couldn't load BOM lines");
            return;
          }
          setLinesByTemplate((prev) => ({ ...prev, [templateId]: (data as BomTemplateLineRow[]) ?? [] }));
        });
    }
  }

  async function updateLine(templateId: string, line: BomTemplateLineRow, patch: Partial<BomTemplateLineRow>) {
    setSavingLineId(line.id);
    const { error } = await supabase.from("bom_template_lines").update(patch).eq("id", line.id);
    setSavingLineId(null);
    if (error) {
      toast("danger", `Couldn't save: ${error.message}`);
      return;
    }
    setLinesByTemplate((prev) => ({
      ...prev,
      [templateId]: prev[templateId].map((l) => (l.id === line.id ? { ...l, ...patch } : l)),
    }));
  }

  // Picking a raw material also refreshes material_category from that
  // material's own category -- "Category should be automated" -- instead
  // of being a manually-typed field left to go stale.
  function mapLineToMaterial(templateId: string, line: BomTemplateLineRow, code: string | null) {
    const material = code ? materialsByCode.get(code) ?? null : null;
    void updateLine(templateId, line, { raw_material_code: code, material_category: material?.category ?? null });
  }

  // "Add material" builds the BOM by hand, line by line, instead of
  // requiring a fixed set of lines pre-seeded via migration -- lets the
  // user cost each finished good exactly the way they want to, adding as
  // many or as few materials as that product actually needs.
  async function addLine(templateId: string) {
    const existing = linesByTemplate[templateId] ?? [];
    const nextLineNo = existing.length ? Math.max(...existing.map((l) => l.line_no)) + 1 : 1;
    const { data, error } = await supabase
      .from("bom_template_lines")
      .insert({
        template_id: templateId,
        line_no: nextLineNo,
        material_name: "New material",
        material_category: null,
        raw_material_code: null,
        basis: "SQFT",
        consumption_qty: 0,
        wastage_pct: 0,
        markup_pct: 0,
      })
      .select()
      .single();
    if (error) {
      toast("danger", `Couldn't add line: ${error.message}`);
      return;
    }
    setLinesByTemplate((prev) => ({ ...prev, [templateId]: [...existing, data as BomTemplateLineRow] }));
  }

  async function deleteLine(templateId: string, lineId: string) {
    const { error } = await supabase.from("bom_template_lines").delete().eq("id", lineId);
    if (error) {
      toast("danger", `Couldn't remove line: ${error.message}`);
      return;
    }
    setLinesByTemplate((prev) => ({ ...prev, [templateId]: (prev[templateId] ?? []).filter((l) => l.id !== lineId) }));
  }

  // "Workcentres are fixed now let us make it applicable or not so that we
  // can keep or remove" -- checking a work centre adds it to this
  // template's work_centres, unchecking removes it. Saved directly on
  // bom_templates.work_centres (persists per FG code, same array the Cost
  // Sheet tab's process-cost section already reads).
  async function toggleWorkCentre(template: BomTemplateRow, workCentre: string, applicable: boolean) {
    const nextWorkCentres = applicable
      ? [...template.work_centres, workCentre]
      : template.work_centres.filter((wc) => wc !== workCentre);
    setSavingWorkCentresId(template.id);
    const { error } = await supabase.from("bom_templates").update({ work_centres: nextWorkCentres }).eq("id", template.id);
    setSavingWorkCentresId(null);
    if (error) {
      toast("danger", `Couldn't save work centres: ${error.message}`);
      return;
    }
    setTemplates((prev) => prev?.map((t) => (t.id === template.id ? { ...t, work_centres: nextWorkCentres } : t)) ?? null);
  }

  if (!templates) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;

  const unmappedCount = Object.values(linesByTemplate)
    .flat()
    .filter((l) => !l.raw_material_code).length;
  const templateGroups = groupByCategory(templates);

  return (
    <div>
      <p className="mb-4 text-sm text-ink-secondary">
        {templates.length} BOM templates from FG Codes BOM Specs. Expand a template to see its material lines and map each to
        a real raw material. Lines with no confident text match are unmapped by design — pick one from the suggested
        candidates or search.
        {unmappedCount > 0 && (
          <span className="ml-1 text-warning">({unmappedCount} line{unmappedCount === 1 ? "" : "s"} opened so far still unmapped)</span>
        )}
      </p>

      <div className="flex flex-col gap-6">
        {templateGroups.map((group) => (
          <div key={group.category}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{group.category}</h3>
            <div className="flex flex-col gap-2">
              {group.items.map((t) => (
                <div key={t.id} className="rounded-lg border border-line bg-surface">
            <button
              type="button"
              onClick={() => toggle(t.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                {expanded === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <div>
                  <div className="text-sm font-medium text-ink">
                    {t.code} <span className="font-normal text-ink-secondary">— {t.description}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Badge status="info">{t.category}</Badge>
                    <Badge status="neutral">{t.print_mode}</Badge>
                    <Badge status="neutral">{t.substrate_type}</Badge>
                  </div>
                </div>
              </div>
              <span className="shrink-0 text-xs text-ink-muted">{t.work_centres.length} work centres</span>
            </button>

            {expanded === t.id && (
              <div className="border-t border-line px-4 py-3">
                {!linesByTemplate[t.id] ? (
                  <p className="py-4 text-center text-xs text-ink-muted">Loading lines…</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-line text-left text-ink-secondary">
                          <th className="py-1.5 pr-2">#</th>
                          <th className="py-1.5 pr-2">Material (BOM name)</th>
                          <th className="py-1.5 pr-2">Category</th>
                          <th className="py-1.5 pr-2">Mapped raw material</th>
                          <th className="py-1.5 pr-2">Basis</th>
                          <th className="py-1.5 pr-2">Consumption</th>
                          <th className="py-1.5 pr-2">Wastage %</th>
                          <th className="py-1.5 pr-2">Markup %</th>
                          <th className="py-1.5 pr-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {linesByTemplate[t.id].map((line) => {
                          // Category is derived from whichever raw material is
                          // currently mapped -- never hand-typed -- so it can
                          // never drift out of sync with the actual mapping.
                          const mappedMaterial = line.raw_material_code ? materialsByCode.get(line.raw_material_code) ?? null : null;
                          return (
                            <tr key={line.id} className="border-b border-line/60 align-top">
                              <td className="py-2 pr-2 text-ink-muted">{line.line_no}</td>
                              <td className="py-2 pr-2">
                                <input
                                  type="text"
                                  value={line.material_name}
                                  onChange={(e) => updateLine(t.id, line, { material_name: e.target.value })}
                                  className="h-8 w-40 rounded-md border border-line-strong bg-surface px-1.5 text-xs font-medium text-ink outline-none"
                                />
                              </td>
                              <td className="py-2 pr-2 text-ink-secondary">{mappedMaterial?.category ?? "—"}</td>
                              <td className="py-2 pr-2">
                                <RawMaterialPicker
                                  materials={materials}
                                  value={line.raw_material_code}
                                  onChange={(code) => mapLineToMaterial(t.id, line, code)}
                                />
                                {!line.raw_material_code && line.suggested_codes && (
                                  <div className="mt-1 max-w-xs text-[11px] italic text-ink-muted">{line.suggested_codes}</div>
                                )}
                              </td>
                              <td className="py-2 pr-2">
                                <select
                                  value={line.basis}
                                  onChange={(e) => updateLine(t.id, line, { basis: e.target.value as BomTemplateLineRow["basis"] })}
                                  className="h-8 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                                >
                                  {BASIS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 pr-2">
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={line.consumption_qty}
                                  onChange={(e) => updateLine(t.id, line, { consumption_qty: Number(e.target.value) })}
                                  className="h-8 w-24 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                                />
                              </td>
                              <td className="py-2 pr-2">
                                <input
                                  type="number"
                                  step="1"
                                  value={Math.round(line.wastage_pct * 100)}
                                  onChange={(e) => updateLine(t.id, line, { wastage_pct: Number(e.target.value) / 100 })}
                                  className="h-8 w-16 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                                />
                              </td>
                              <td className="py-2 pr-2">
                                <input
                                  type="number"
                                  step="1"
                                  value={Math.round(line.markup_pct * 100)}
                                  onChange={(e) => updateLine(t.id, line, { markup_pct: Number(e.target.value) / 100 })}
                                  className="h-8 w-16 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                                />
                                {savingLineId === line.id && <span className="ml-1 text-ink-muted">saving…</span>}
                              </td>
                              <td className="py-2 pr-2">
                                <button
                                  type="button"
                                  aria-label="Remove line"
                                  onClick={() => deleteLine(t.id, line.id)}
                                  className="text-ink-muted hover:text-danger"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <button
                      type="button"
                      onClick={() => addLine(t.id)}
                      className="mt-2 flex items-center gap-1 rounded-md border border-dashed border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:border-primary hover:text-primary"
                    >
                      <Plus size={14} />
                      Add material
                    </button>

                    <div className="mt-4 border-t border-line pt-3">
                      <h4 className="mb-2 text-xs font-semibold text-ink">
                        Work centres for this FG code
                        {savingWorkCentresId === t.id && <span className="ml-1 font-normal text-ink-muted">saving…</span>}
                      </h4>
                      <p className="mb-2 text-[11px] text-ink-muted">
                        Check the ones this product actually goes through — the Cost Sheet tab only totals process cost for
                        checked work centres.
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {workCentreOptions.map((wc) => (
                          <label key={wc} className="flex items-center gap-1.5 text-xs text-ink-secondary">
                            <input
                              type="checkbox"
                              checked={t.work_centres.includes(wc)}
                              onChange={(e) => toggleWorkCentre(t, wc, e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-line-strong"
                            />
                            {wc}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
