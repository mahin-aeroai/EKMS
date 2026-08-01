"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type { BomMaterialUnit, BomTemplateLineAlternativeRow, BomTemplateLineRow, BomTemplateRow, RawMaterialRow } from "@mmdi/shared/rows";
import { PRINT_DEPENDENT_WORK_CENTRES } from "./calc";
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
  const [alternativesByLine, setAlternativesByLine] = useState<Record<string, BomTemplateLineAlternativeRow[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [savingWorkCentresId, setSavingWorkCentresId] = useState<string | null>(null);
  // "Work centre 1 A-D has different modes like production, quality,
  // backlit print, multiple layers print -- how do we add the costing?"
  // print_mode used to be a read-only badge, only ever set via seed SQL.
  // Now editable per FG code: pick an existing mode (e.g. "Backlit Print")
  // or type a brand new one (e.g. "UV Printing - Quality" or "UV Printing
  // - 2 Layer"). See updatePrintMode below for what happens next.
  const [printModeOptions, setPrintModeOptions] = useState<string[]>([]);
  const [editingPrintModeId, setEditingPrintModeId] = useState<string | null>(null);
  const [printModeDraft, setPrintModeDraft] = useState("");
  const [savingPrintModeId, setSavingPrintModeId] = useState<string | null>(null);
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
        const rows = (data as BomTemplateRow[]) ?? [];
        setTemplates(rows);
        setPrintModeOptions(Array.from(new Set(rows.map((t) => t.print_mode))).sort());
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
    // Small table (one row per alternative raw material per line) --
    // cheap to load in full up front rather than per-template-expand.
    supabase
      .from("bom_template_line_alternatives")
      .select("*")
      .then(({ data, error }) => {
        if (error) return;
        const byLine: Record<string, BomTemplateLineAlternativeRow[]> = {};
        for (const row of (data as BomTemplateLineAlternativeRow[]) ?? []) {
          (byLine[row.line_id] ??= []).push(row);
        }
        setAlternativesByLine(byLine);
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

  // "Work centre 1 A-D has different modes like production, quality,
  // backlit print, multiple layers print -- how do we add the costing?"
  // Each work centre/print mode/substrate combo needs its own rate in
  // work_centre_rates (unique on that triple) before the Cost Sheet tab
  // can price it. Changing a template's print_mode here to a new value
  // (typed, not just picked from the list) would otherwise leave every
  // print-dependent work centre this FG code uses (WC1A-D, WC3) with no
  // rate row to price against at all -- Rate Card only lets you edit rates
  // for combos that already exist, it can't create a brand new one. So
  // this also seeds a 'missing' rate row (rate NULL) for each such work
  // centre + the new print mode + this template's substrate, via upsert
  // with ignoreDuplicates so re-picking an already-seeded mode is a no-op.
  // Those show up on the Rate Card tab exactly like any other missing
  // rate, ready to have the real ₹ entered.
  async function updatePrintMode(template: BomTemplateRow, rawNewMode: string) {
    const newMode = rawNewMode.trim();
    if (!newMode || newMode === template.print_mode) {
      setEditingPrintModeId(null);
      return;
    }
    setSavingPrintModeId(template.id);
    const { error } = await supabase.from("bom_templates").update({ print_mode: newMode }).eq("id", template.id);
    if (error) {
      setSavingPrintModeId(null);
      toast("danger", `Couldn't save print mode: ${error.message}`);
      return;
    }
    setTemplates((prev) => prev?.map((t) => (t.id === template.id ? { ...t, print_mode: newMode } : t)) ?? null);
    setPrintModeOptions((prev) => (prev.includes(newMode) ? prev : [...prev, newMode].sort()));
    setEditingPrintModeId(null);

    const printDependentCentres = template.work_centres.filter((wc) => PRINT_DEPENDENT_WORK_CENTRES.has(wc));
    if (printDependentCentres.length > 0) {
      const { data: newRates, error: rateError } = await supabase
        .from("work_centre_rates")
        .upsert(
          printDependentCentres.map((wc) => ({
            work_centre: wc,
            print_mode: newMode,
            substrate: template.substrate_type,
            rate_basis: "per_sqft",
            rate: null,
            confidence: "missing",
            note: `Auto-created when ${template.code}'s print mode was set to "${newMode}" in BOM Master -- enter the real rate here.`,
          })),
          { onConflict: "work_centre,print_mode,substrate", ignoreDuplicates: true }
        )
        .select();
      if (rateError) {
        toast("danger", `Print mode saved, but couldn't set up rate combos: ${rateError.message}`);
      } else if ((newRates ?? []).length > 0) {
        toast(
          "info",
          `${newRates!.length} new rate combo${newRates!.length === 1 ? "" : "s"} added to the Rate Card tab (missing rate) -- enter the real ₹ there.`
        );
      }
    }
    setSavingPrintModeId(null);
  }

  // "We have many options under one FG product in BOM materials so we
  // need to accommodate them for selection at Cost Sheet Page" -- a line's
  // raw_material_code stays its default; alternatives are extra
  // acceptable substitutes (e.g. several Frontlit Flex GSM grades all
  // fulfilling the same "RSD Flex 340GSM" line) the Cost Sheet tab can
  // offer as a per-job choice.
  async function addAlternative(lineId: string, code: string) {
    const { data, error } = await supabase
      .from("bom_template_line_alternatives")
      .insert({ line_id: lineId, raw_material_code: code })
      .select()
      .single();
    if (error) {
      // unique(line_id, raw_material_code) -- already added, not a real error
      if (error.code !== "23505") toast("danger", `Couldn't add alternative: ${error.message}`);
      return;
    }
    setAlternativesByLine((prev) => ({ ...prev, [lineId]: [...(prev[lineId] ?? []), data as BomTemplateLineAlternativeRow] }));
  }

  async function removeAlternative(lineId: string, altId: string) {
    const { error } = await supabase.from("bom_template_line_alternatives").delete().eq("id", altId);
    if (error) {
      toast("danger", `Couldn't remove alternative: ${error.message}`);
      return;
    }
    setAlternativesByLine((prev) => ({ ...prev, [lineId]: (prev[lineId] ?? []).filter((a) => a.id !== altId) }));
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
            <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
              <button type="button" onClick={() => toggle(t.id)} className="flex min-w-0 items-center gap-2 text-left">
                {expanded === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">
                    {t.code} <span className="font-normal text-ink-secondary">— {t.description}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <Badge status="info">{t.category}</Badge>
                    <Badge status="neutral">{t.substrate_type}</Badge>
                  </div>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {editingPrintModeId === t.id ? (
                  <input
                    type="text"
                    autoFocus
                    value={printModeDraft}
                    onChange={(e) => setPrintModeDraft(e.target.value)}
                    onBlur={() => updatePrintMode(t, printModeDraft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updatePrintMode(t, printModeDraft);
                      if (e.key === "Escape") setEditingPrintModeId(null);
                    }}
                    placeholder="e.g. UV Printing - Quality"
                    className="h-7 w-44 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                  />
                ) : (
                  <select
                    value={t.print_mode}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setPrintModeDraft("");
                        setEditingPrintModeId(t.id);
                      } else {
                        updatePrintMode(t, e.target.value);
                      }
                    }}
                    className="h-7 max-w-[180px] rounded-md border border-line-strong bg-surface px-1.5 text-[11px] text-ink outline-none"
                  >
                    {!printModeOptions.includes(t.print_mode) && <option value={t.print_mode}>{t.print_mode}</option>}
                    {printModeOptions.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                    <option value="__new__">+ New print mode…</option>
                  </select>
                )}
                {savingPrintModeId === t.id && <span className="text-[11px] text-ink-muted">saving…</span>}
                <span className="text-xs text-ink-muted">{t.work_centres.length} work centres</span>
              </div>
            </div>

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
                                {(alternativesByLine[line.id] ?? []).length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {(alternativesByLine[line.id] ?? []).map((alt) => {
                                      const m = materialsByCode.get(alt.raw_material_code);
                                      return (
                                        <span
                                          key={alt.id}
                                          className="inline-flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-secondary"
                                        >
                                          {alt.raw_material_code}
                                          {m ? ` — ${m.name}` : ""}
                                          <button
                                            type="button"
                                            aria-label="Remove alternative"
                                            onClick={() => removeAlternative(line.id, alt.id)}
                                            className="text-ink-muted hover:text-danger"
                                          >
                                            ×
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className="mt-1.5 max-w-xs">
                                  <p className="mb-0.5 text-[10px] text-ink-muted">+ alternative material</p>
                                  <RawMaterialPicker
                                    materials={materials}
                                    value={null}
                                    onChange={(code) => code && addAlternative(line.id, code)}
                                  />
                                </div>
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
