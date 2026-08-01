"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type { BomMaterialUnit, BomTemplateLineAlternativeRow, BomTemplateLineRow, BomTemplateRow, RawMaterialRow } from "@mmdi/shared/rows";
import { PRINT_DEPENDENT_WORK_CENTRES } from "./calc";
import { COST_SHEET_CATEGORY_ORDER, groupByCategory } from "./categoryOrder";
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
  // Same editable-badge treatment as print_mode above -- substrate_type is
  // the other half of a work centre rate's pricing key, and "clone it and
  // change it" needs both editable (e.g. cloning a Vinyl FG code as a
  // Fabric variant).
  const [substrateOptions, setSubstrateOptions] = useState<string[]>([]);
  const [editingSubstrateId, setEditingSubstrateId] = useState<string | null>(null);
  const [substrateDraft, setSubstrateDraft] = useState("");
  const [savingSubstrateId, setSavingSubstrateId] = useState<string | null>(null);
  // "I can't create new BOM or clone it and change it?" -- BOM templates
  // were only ever created via seed SQL; there was no in-app way to add a
  // brand new FG code, or to spin off a variant of an existing one (e.g.
  // to try a new print mode/substrate without touching the original).
  const [showNewTemplateForm, setShowNewTemplateForm] = useState(false);
  const [newTemplateDraft, setNewTemplateDraft] = useState({
    code: "",
    description: "",
    category: COST_SHEET_CATEGORY_ORDER[0] as string,
    print_mode: "",
    substrate_type: "",
  });
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneCodeDraft, setCloneCodeDraft] = useState("");
  const [savingCloneId, setSavingCloneId] = useState<string | null>(null);
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
        setSubstrateOptions(Array.from(new Set(rows.map((t) => t.substrate_type))).sort());
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

  // Every work centre/print mode/substrate combo needs its own rate row in
  // work_centre_rates (unique on that triple) before the Cost Sheet tab can
  // price it -- Rate Card can only edit rates for combos that already
  // exist, it can't create a brand new one. Shared by updatePrintMode,
  // updateSubstrateType, toggleWorkCentre (adding a new work centre), and
  // createTemplate/cloneTemplate below -- upserts a 'missing' rate row
  // (rate NULL) for each work centre in `workCentres`, keyed on printMode
  // for the print-dependent ones (WC1A-D, WC3) and '-' for everything
  // else, same split as calc.ts's computeWorkCentreCost. ignoreDuplicates
  // means calling this for combos that already exist is a safe no-op.
  async function ensureRateCombos(workCentres: string[], printMode: string, substrateType: string, templateCode: string) {
    if (workCentres.length === 0) return;
    const note = `Auto-created for ${templateCode} in BOM Master -- enter the real rate here.`;
    const rows = workCentres.map((wc) => ({
      work_centre: wc,
      print_mode: PRINT_DEPENDENT_WORK_CENTRES.has(wc) ? printMode : "-",
      substrate: substrateType,
      rate_basis: "per_sqft",
      rate: null,
      confidence: "missing",
      note,
    }));
    const { data: newRates, error } = await supabase
      .from("work_centre_rates")
      .upsert(rows, { onConflict: "work_centre,print_mode,substrate", ignoreDuplicates: true })
      .select();
    if (error) {
      toast("danger", `Couldn't set up rate combos: ${error.message}`);
    } else if ((newRates ?? []).length > 0) {
      toast(
        "info",
        `${newRates!.length} new rate combo${newRates!.length === 1 ? "" : "s"} added to the Rate Card tab (missing rate) -- enter the real ₹ there.`
      );
    }
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
    // Newly-checked work centre might be a combo (this print mode +
    // substrate) that's never existed before -- seed it as 'missing' so
    // it's priceable on the Rate Card tab instead of silently costing ₹0.
    if (applicable) {
      void ensureRateCombos([workCentre], template.print_mode, template.substrate_type, template.code);
    }
  }

  // "Work centre 1 A-D has different modes like production, quality,
  // backlit print, multiple layers print -- how do we add the costing?"
  // print_mode is editable per FG code: pick an existing mode (e.g.
  // "Backlit Print") or type a brand new one (e.g. "UV Printing - Quality"
  // or "UV Printing - 2 Layer"). See ensureRateCombos above for what
  // happens to pricing when it changes.
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
    await ensureRateCombos(template.work_centres, newMode, template.substrate_type, template.code);
    setSavingPrintModeId(null);
  }

  // Same editable-badge treatment, for the other half of a work centre
  // rate's pricing key. Unlike print_mode, a substrate change affects
  // EVERY work centre this FG code uses (not just the print-dependent
  // ones) since substrate is part of every rate's lookup key.
  async function updateSubstrateType(template: BomTemplateRow, rawNewSubstrate: string) {
    const newSubstrate = rawNewSubstrate.trim();
    if (!newSubstrate || newSubstrate === template.substrate_type) {
      setEditingSubstrateId(null);
      return;
    }
    setSavingSubstrateId(template.id);
    const { error } = await supabase.from("bom_templates").update({ substrate_type: newSubstrate }).eq("id", template.id);
    if (error) {
      setSavingSubstrateId(null);
      toast("danger", `Couldn't save substrate: ${error.message}`);
      return;
    }
    setTemplates((prev) => prev?.map((t) => (t.id === template.id ? { ...t, substrate_type: newSubstrate } : t)) ?? null);
    setSubstrateOptions((prev) => (prev.includes(newSubstrate) ? prev : [...prev, newSubstrate].sort()));
    setEditingSubstrateId(null);
    await ensureRateCombos(template.work_centres, template.print_mode, newSubstrate, template.code);
    setSavingSubstrateId(null);
  }

  // "I can't create new BOM or clone it and change it?" -- adds a brand
  // new FG code from scratch (no lines, no work centres yet -- add those
  // below same as any template). See cloneTemplate below for the other
  // half: copying an existing FG code's lines/work centres/alternatives
  // wholesale, then changing just what's different about the variant.
  async function createTemplate() {
    const code = newTemplateDraft.code.trim();
    const description = newTemplateDraft.description.trim();
    const printMode = newTemplateDraft.print_mode.trim();
    const substrateType = newTemplateDraft.substrate_type.trim();
    if (!code || !description || !printMode || !substrateType) {
      toast("danger", "Code, description, print mode, and substrate are all required.");
      return;
    }
    setCreatingTemplate(true);
    const { data, error } = await supabase
      .from("bom_templates")
      .insert({
        code,
        description,
        category: newTemplateDraft.category,
        print_mode: printMode,
        substrate_type: substrateType,
        work_centres: [],
      })
      .select()
      .single();
    setCreatingTemplate(false);
    if (error) {
      toast("danger", error.code === "23505" ? `"${code}" already exists` : `Couldn't create FG code: ${error.message}`);
      return;
    }
    const newTemplate = data as BomTemplateRow;
    setTemplates((prev) => (prev ? [...prev, newTemplate] : [newTemplate]));
    setLinesByTemplate((prev) => ({ ...prev, [newTemplate.id]: [] }));
    setPrintModeOptions((prev) => (prev.includes(printMode) ? prev : [...prev, printMode].sort()));
    setSubstrateOptions((prev) => (prev.includes(substrateType) ? prev : [...prev, substrateType].sort()));
    setShowNewTemplateForm(false);
    setNewTemplateDraft({ code: "", description: "", category: COST_SHEET_CATEGORY_ORDER[0], print_mode: "", substrate_type: "" });
    setExpanded(newTemplate.id);
    toast("success", `${code} created -- add its material lines and work centres below.`);
  }

  // Copies a template's own fields plus every material line (and each
  // line's alternatives) under a new code -- the fast path for "start from
  // a working FG code, then change its print mode/substrate/lines for a
  // variant" instead of rebuilding one from scratch.
  async function cloneTemplate(source: BomTemplateRow, rawNewCode: string) {
    const code = rawNewCode.trim();
    if (!code) return;
    setSavingCloneId(source.id);

    const { data: newTemplateData, error: templateError } = await supabase
      .from("bom_templates")
      .insert({
        code,
        description: `${source.description} (copy)`,
        category: source.category,
        print_mode: source.print_mode,
        substrate_type: source.substrate_type,
        work_centres: source.work_centres,
      })
      .select()
      .single();
    if (templateError || !newTemplateData) {
      setSavingCloneId(null);
      toast("danger", templateError?.code === "23505" ? `"${code}" already exists` : `Couldn't clone: ${templateError?.message}`);
      return;
    }
    const newTemplate = newTemplateData as BomTemplateRow;

    let sourceLines = linesByTemplate[source.id];
    if (!sourceLines) {
      const { data, error } = await supabase.from("bom_template_lines").select("*").eq("template_id", source.id).order("line_no");
      if (error) toast("danger", `Cloned ${code}, but couldn't read its material lines to copy: ${error.message}`);
      sourceLines = (data as BomTemplateLineRow[]) ?? [];
    }

    let newLines: BomTemplateLineRow[] = [];
    if (sourceLines.length > 0) {
      const { data: insertedLines, error: linesError } = await supabase
        .from("bom_template_lines")
        .insert(
          sourceLines.map((l) => ({
            template_id: newTemplate.id,
            line_no: l.line_no,
            material_name: l.material_name,
            material_category: l.material_category,
            raw_material_code: l.raw_material_code,
            suggested_codes: null,
            basis: l.basis,
            consumption_qty: l.consumption_qty,
            wastage_pct: l.wastage_pct,
            markup_pct: l.markup_pct,
          }))
        )
        .select();
      if (linesError) {
        toast("danger", `Cloned ${code}, but couldn't copy its material lines: ${linesError.message}`);
      } else {
        newLines = (insertedLines as BomTemplateLineRow[]) ?? [];
      }
    }

    const newLineIdByLineNo = new Map(newLines.map((l) => [l.line_no, l.id]));
    const altRowsToInsert: { line_id: string; raw_material_code: string }[] = [];
    for (const oldLine of sourceLines) {
      const newLineId = newLineIdByLineNo.get(oldLine.line_no);
      if (!newLineId) continue;
      for (const alt of alternativesByLine[oldLine.id] ?? []) {
        altRowsToInsert.push({ line_id: newLineId, raw_material_code: alt.raw_material_code });
      }
    }
    let newAlternatives: BomTemplateLineAlternativeRow[] = [];
    if (altRowsToInsert.length > 0) {
      const { data: insertedAlts, error: altError } = await supabase
        .from("bom_template_line_alternatives")
        .insert(altRowsToInsert)
        .select();
      if (!altError) newAlternatives = (insertedAlts as BomTemplateLineAlternativeRow[]) ?? [];
    }

    await ensureRateCombos(newTemplate.work_centres, newTemplate.print_mode, newTemplate.substrate_type, newTemplate.code);

    setTemplates((prev) => (prev ? [...prev, newTemplate] : [newTemplate]));
    setLinesByTemplate((prev) => ({ ...prev, [newTemplate.id]: newLines }));
    if (newAlternatives.length > 0) {
      setAlternativesByLine((prev) => {
        const next = { ...prev };
        for (const alt of newAlternatives) {
          next[alt.line_id] = [...(next[alt.line_id] ?? []), alt];
        }
        return next;
      });
    }
    setPrintModeOptions((prev) => (prev.includes(newTemplate.print_mode) ? prev : [...prev, newTemplate.print_mode].sort()));
    setSubstrateOptions((prev) => (prev.includes(newTemplate.substrate_type) ? prev : [...prev, newTemplate.substrate_type].sort()));
    setCloningId(null);
    setSavingCloneId(null);
    setExpanded(newTemplate.id);
    toast("success", `Cloned as ${code} -- change its print mode, substrate, or lines below.`);
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

      {!showNewTemplateForm ? (
        <button
          type="button"
          onClick={() => setShowNewTemplateForm(true)}
          className="mb-4 flex items-center gap-1 rounded-md border border-dashed border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:border-primary hover:text-primary"
        >
          <Plus size={14} />
          New FG Code
        </button>
      ) : (
        <div className="mb-4 rounded-lg border border-line bg-surface p-4">
          <h4 className="mb-3 text-sm font-semibold text-ink">New FG Code</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Code">
              <input
                type="text"
                value={newTemplateDraft.code}
                onChange={(e) => setNewTemplateDraft((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="e.g. UVSD-Vinyl-Quality"
                className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
              />
            </Field>
            <Field label="Description">
              <input
                type="text"
                value={newTemplateDraft.description}
                onChange={(e) => setNewTemplateDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="e.g. Digital UV Frontlit Vinyl - Quality tier"
                className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
              />
            </Field>
            <Field label="Category">
              <select
                value={newTemplateDraft.category}
                onChange={(e) => setNewTemplateDraft((prev) => ({ ...prev, category: e.target.value }))}
                className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
              >
                {COST_SHEET_CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Print Mode">
              <input
                type="text"
                list="new-template-print-modes"
                value={newTemplateDraft.print_mode}
                onChange={(e) => setNewTemplateDraft((prev) => ({ ...prev, print_mode: e.target.value }))}
                placeholder="e.g. Frontlit Print"
                className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
              />
              <datalist id="new-template-print-modes">
                {printModeOptions.map((pm) => (
                  <option key={pm} value={pm} />
                ))}
              </datalist>
            </Field>
            <Field label="Substrate">
              <input
                type="text"
                list="new-template-substrates"
                value={newTemplateDraft.substrate_type}
                onChange={(e) => setNewTemplateDraft((prev) => ({ ...prev, substrate_type: e.target.value }))}
                placeholder="e.g. Vinyl"
                className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
              />
              <datalist id="new-template-substrates">
                {substrateOptions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={createTemplate}
              disabled={creatingTemplate}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {creatingTemplate ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowNewTemplateForm(false)}
              className="rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
                  </div>
                </div>
              </button>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
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
                    className="h-7 max-w-[160px] rounded-md border border-line-strong bg-surface px-1.5 text-[11px] text-ink outline-none"
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
                {editingSubstrateId === t.id ? (
                  <input
                    type="text"
                    autoFocus
                    value={substrateDraft}
                    onChange={(e) => setSubstrateDraft(e.target.value)}
                    onBlur={() => updateSubstrateType(t, substrateDraft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateSubstrateType(t, substrateDraft);
                      if (e.key === "Escape") setEditingSubstrateId(null);
                    }}
                    placeholder="e.g. Vinyl"
                    className="h-7 w-32 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                  />
                ) : (
                  <select
                    value={t.substrate_type}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setSubstrateDraft("");
                        setEditingSubstrateId(t.id);
                      } else {
                        updateSubstrateType(t, e.target.value);
                      }
                    }}
                    className="h-7 max-w-[130px] rounded-md border border-line-strong bg-surface px-1.5 text-[11px] text-ink outline-none"
                  >
                    {!substrateOptions.includes(t.substrate_type) && <option value={t.substrate_type}>{t.substrate_type}</option>}
                    {substrateOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                    <option value="__new__">+ New substrate…</option>
                  </select>
                )}
                {(savingPrintModeId === t.id || savingSubstrateId === t.id) && (
                  <span className="text-[11px] text-ink-muted">saving…</span>
                )}
                <span className="text-xs text-ink-muted">{t.work_centres.length} work centres</span>
                {cloningId === t.id ? (
                  <>
                    <input
                      type="text"
                      autoFocus
                      value={cloneCodeDraft}
                      onChange={(e) => setCloneCodeDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") cloneTemplate(t, cloneCodeDraft);
                        if (e.key === "Escape") setCloningId(null);
                      }}
                      placeholder="new code"
                      className="h-7 w-32 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => cloneTemplate(t, cloneCodeDraft)}
                      disabled={savingCloneId === t.id}
                      className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                    >
                      {savingCloneId === t.id ? "Cloning…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCloningId(null)}
                      className="rounded-md border border-line-strong px-2 py-1 text-[11px] text-ink-secondary"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label="Clone this FG code"
                    title="Clone this FG code"
                    onClick={() => {
                      setCloneCodeDraft(`${t.code}-COPY`);
                      setCloningId(t.id);
                    }}
                    className="text-ink-muted hover:text-primary"
                  >
                    <Copy size={14} />
                  </button>
                )}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
      {children}
    </div>
  );
}
