"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type { BomTemplateLineAlternativeRow, BomTemplateLineRow, BomTemplateRow, RawMaterialRow, WorkCentreRateRow } from "@mmdi/shared/rows";
import { computeCostSheet, computeLineCost, computeSqft, computeWorkCentreCost, suggestSellingPrice, type GpMethod, type Uom } from "./calc";
import { groupByCategory } from "./categoryOrder";

const fmtRupee = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// "Add the price too in dropdown recent/average so that I can choose
// wisely" -- each alternative material option shows its own ₹/unit so a
// job can be priced against the cheapest (or most in-stock) option
// without having to switch and check the columns each time.
function priceLabel(m: RawMaterialRow) {
  const recent = m.unit_cost_recent !== null ? `₹${m.unit_cost_recent.toFixed(2)}` : "no price";
  const avg = m.unit_cost_avg !== null ? `₹${m.unit_cost_avg.toFixed(2)}` : "no price";
  return `recent ${recent} / avg ${avg}`;
}

// The live calculator -- select an FG template, enter dimensions/qty/selling
// price, get material cost (recent + average purchase price) and
// work-centre process cost, same breakdown as the Excel workbook's Cost
// Sheet tab but reading live from bom_templates / bom_template_lines /
// raw_materials / work_centre_rates instead of a spreadsheet snapshot.
//
// A calculation itself still isn't saved as its own row anywhere (no
// `cost_sheet_runs` history/audit-trail table -- see
// supabase-cost-sheet-schema.sql's header) -- but "Add to Estimate Pool"
// below is a real, explicit save: it hands a snapshot of this job off to
// estimate_pool_items (supabase-estimate-pool-migration.sql), from which
// Estimate Builder can pull it into an actual customer quote.
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
  // "For gross margins let's keep 2 types" -- Traditional (GP on total
  // cost) vs Value Addition (materials recovered at cost, GP only on
  // ink + process/services cost). Picked fresh per job, not saved to the
  // FG code -- the same product might get quoted either way depending on
  // the deal. Feeds the "Suggested selling price" section below; doesn't
  // touch the Selling Price / SqFt field above, which still drives the
  // actual GP shown in the results.
  const [gpMethod, setGpMethod] = useState<GpMethod>("total_cost");
  const [targetGpPct, setTargetGpPct] = useState<number | "">(30);
  const [addingToPool, setAddingToPool] = useState(false);
  // Work centres a specific job doesn't need this time -- e.g. the
  // customer is doing their own packing, or a job skips a process the FG
  // code normally goes through. Deliberately local/ephemeral state, NOT
  // saved to bom_templates.work_centres -- that array is the FG code's
  // permanent default (edited in BOM Master); this is a one-off override
  // for THIS calculation only, and resets whenever the FG code changes.
  const [excludedWorkCentres, setExcludedWorkCentres] = useState<Set<string>>(new Set());
  const [alternativesByLine, setAlternativesByLine] = useState<Record<string, BomTemplateLineAlternativeRow[]>>({});
  // Which raw material a specific job actually uses for a line, when it
  // differs from that line's saved default -- "we have many options under
  // one FG product in BOM materials, we need to accommodate them for
  // selection at Cost Sheet Page." Keyed by line id; undefined means "use
  // the line's default raw_material_code," explicit null means "this job
  // uses no material for this line." Local/ephemeral like the work centre
  // exclusions above -- resets when the FG code changes.
  const [selectedMaterialByLine, setSelectedMaterialByLine] = useState<Record<string, string | null>>({});
  // A specific material line a specific job doesn't need -- e.g. the white
  // ink layer in a multilayer print job's BOM, which some jobs use and
  // others don't. "i want to make white ink optional." Same ephemeral,
  // per-calculation pattern as excludedWorkCentres above: doesn't touch the
  // FG code's saved BOM (edit that in BOM Master), resets when the FG code
  // changes.
  const [excludedLines, setExcludedLines] = useState<Set<string>>(new Set());

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
    // Small table -- one row per alternative raw material per BOM line.
    // Loaded in full up front, same as templates/rates/materials above.
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

  useEffect(() => {
    if (!templateId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLines([]);
      return;
    }
    setLoadingLines(true);
    setExcludedWorkCentres(new Set());
    setSelectedMaterialByLine({});
    setExcludedLines(new Set());
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
  // The line's saved default (before any per-job override) -- needed to
  // build each dropdown's option list, since result.lineCosts' line
  // already has the override applied.
  const originalLinesById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  // The FG code's saved default (template.work_centres) minus whatever's
  // unticked for this one job -- this is what actually feeds the totals.
  const effectiveTemplate = useMemo(() => {
    if (!template) return null;
    return { ...template, work_centres: template.work_centres.filter((wc) => !excludedWorkCentres.has(wc)) };
  }, [template, excludedWorkCentres]);

  // Same override pattern as effectiveTemplate above -- a line keeps its
  // saved raw_material_code unless this job picked a different (or no)
  // material for it via the dropdown below.
  const overriddenLines = useMemo(() => {
    return lines.map((l) => {
      const sel = selectedMaterialByLine[l.id];
      return sel !== undefined ? { ...l, raw_material_code: sel } : l;
    });
  }, [lines, selectedMaterialByLine]);

  // overriddenLines minus whatever's unticked for this one job -- this is
  // what actually feeds the totals, same "keep the FG code's saved BOM
  // untouched, override just this calculation" pattern as effectiveTemplate.
  const effectiveLines = useMemo(() => {
    return overriddenLines.filter((l) => !excludedLines.has(l.id));
  }, [overriddenLines, excludedLines]);

  const result = useMemo(() => {
    if (!effectiveTemplate) return null;
    return computeCostSheet(effectiveTemplate, effectiveLines, materialsByCode, rates, {
      uom,
      width: width === "" ? 0 : width,
      height: height === "" ? 0 : height,
      qty: qty === "" ? 0 : qty,
      sellingPricePerSqft: sellPrice === "" ? 0 : sellPrice,
    });
  }, [effectiveTemplate, effectiveLines, materialsByCode, rates, uom, width, height, qty, sellPrice]);

  // Traditional: GP on materialCost + totalProcessCost (everything).
  // Value Addition: non-ink materials recovered at cost; GP applied only
  // to ink + totalProcessCost ("services"). Computed for both recent and
  // avg cost basis, same convention as the rest of this tab's totals.
  // Independent of the Selling Price / SqFt field -- this is "what should
  // I charge," that field is "what am I charging, and what's my GP."
  const priceSuggestion = useMemo(() => {
    if (!result || result.sqft <= 0 || targetGpPct === "") return null;
    const g = targetGpPct / 100;
    const materialAtCostRecent = result.materialCostRecent - result.inkCostRecent;
    const materialAtCostAvg = result.materialCostAvg - result.inkCostAvg;
    const servicesRecent = result.inkCostRecent + result.totalProcessCost;
    const servicesAvg = result.inkCostAvg + result.totalProcessCost;
    const totalRecent = suggestSellingPrice(materialAtCostRecent, servicesRecent, g, gpMethod);
    const totalAvg = suggestSellingPrice(materialAtCostAvg, servicesAvg, g, gpMethod);
    if (totalRecent === null || totalAvg === null) return null;
    return {
      perSqftRecent: totalRecent / result.sqft,
      perSqftAvg: totalAvg / result.sqft,
      totalRecent,
      totalAvg,
    };
  }, [result, targetGpPct, gpMethod]);

  // Every work centre the FG code is normally set up for, checked or not --
  // rendered as the checklist below so unchecking one is still visible and
  // re-checkable, instead of just disappearing once excluded.
  const allWorkCentreCosts = useMemo(() => {
    if (!template) return [];
    const sqft = computeSqft({
      uom,
      width: width === "" ? 0 : width,
      height: height === "" ? 0 : height,
      qty: qty === "" ? 0 : qty,
      sellingPricePerSqft: 0,
    });
    return template.work_centres.map((wc) => computeWorkCentreCost(wc, template, rates, sqft, qty === "" ? 0 : qty));
  }, [template, rates, uom, width, height, qty]);

  // Every material line the BOM normally has, excluded or not -- same
  // "always render the full list so an unticked one is still visible and
  // re-checkable" pattern as allWorkCentreCosts. Built from overriddenLines
  // (material-swap applied) so the checkbox and the alternatives dropdown
  // stay independent of each other.
  const allLineCosts = useMemo(() => {
    return overriddenLines.map((l) => computeLineCost(l, materialsByCode));
  }, [overriddenLines, materialsByCode]);

  function toggleWorkCentreForJob(workCentre: string, applicable: boolean) {
    setExcludedWorkCentres((prev) => {
      const next = new Set(prev);
      if (applicable) next.delete(workCentre);
      else next.add(workCentre);
      return next;
    });
  }

  function toggleLineForJob(lineId: string, applicable: boolean) {
    setExcludedLines((prev) => {
      const next = new Set(prev);
      if (applicable) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function selectMaterialForLine(lineId: string, code: string | null) {
    setSelectedMaterialByLine((prev) => ({ ...prev, [lineId]: code }));
  }

  // "Create a pool where all sign estimates and cost sheet products [go],
  // then it is moved to estimate module and there select the customers
  // and create estimates." Cost Sheet calculations were never persisted
  // anywhere (see this file's header) -- this is that first save
  // mechanism, doubling as the explicit, opt-in hand-off to Estimate
  // Builder's "From estimate pool" picker. Customer-less by design: you
  // pick who it's for later, inside Estimate Builder.
  async function addToPool() {
    if (!template || !result) return;
    setAddingToPool(true);
    const { data: userData } = await supabase.auth.getUser();
    // Prefer whatever you've actually typed as the selling price; fall
    // back to the GP-target suggester's recent-basis number if you were
    // using that instead and never filled in Selling Price / SqFt.
    const sellAmountTotal = sellPrice !== "" ? result.sellingAmount : priceSuggestion?.totalRecent ?? null;
    // Estimate Builder prices a line as (rate x sqft), not a flat total --
    // so the pool item needs the real ₹/sqft, not just the whole job's ₹.
    // Storing this up front (rather than dividing sell_amount by sqft over
    // in Estimate Builder every time) means it's exactly the number you
    // typed into Selling Price / SqFt, not a recomputed approximation.
    const unitRatePerSqft = sellAmountTotal !== null && result.sqft > 0 ? sellAmountTotal / result.sqft : null;
    // Ink is priced in as a service, not a customer-facing material line
    // (see the Gross Profit work) -- so the pool item's material list for
    // the quote's description only carries the actual physical materials
    // (substrate, lamination, trims, hardware, etc.), never the ink/print
    // layers. Category alone isn't reliable here -- a mapped raw material's
    // category can be anything the item master calls it -- so this also
    // keyword-matches the BOM line's own name, which is what actually
    // catches lines like "Top Layer Print" or "Blockout Layers Ink" that
    // don't get tagged with the "Ink" category.
    const materials = result.lineCosts
      .filter((lc) => {
        const category = (lc.line.material_category ?? "").toLowerCase();
        const name = lc.line.material_name.toLowerCase();
        return category !== "ink" && !name.includes("ink") && !name.includes("layer");
      })
      .map((lc) => ({ name: lc.line.material_name, mappedTo: lc.rawMaterial?.name ?? null }));
    // The client-facing quote shouldn't carry a material/brand name baked
    // into the master description (it goes stale the moment a different
    // alternative material is mapped for that FG code's substrate line --
    // see supabase-bom-templates-strip-material-suffix-migration.sql, which
    // strips this same " -  <material>" suffix from bom_templates.description
    // at rest). This mirrors that same split as a display-time safety net,
    // in case a template's description still has one baked in (not yet
    // migrated, or typed in again later) -- editing the BOM template's own
    // description is internal record-keeping, not done here.
    const clientFacingDescription = template.description.split(" -  ")[0].trim();
    const { error } = await supabase.from("estimate_pool_items").insert({
      source: "cost_sheet",
      source_ref_id: null,
      label: salesOrder ? `${template.code} — ${salesOrder}` : template.code,
      sell_amount: sellAmountTotal,
      cost_amount: result.totalCostRecent,
      summary: {
        fgCode: template.code,
        description: clientFacingDescription,
        salesOrder: salesOrder || null,
        uom,
        width: width === "" ? null : width,
        height: height === "" ? null : height,
        qty: qty === "" ? null : qty,
        sqft: result.sqft,
        unitRatePerSqft,
        materials,
        materialCostRecent: result.materialCostRecent,
        totalProcessCost: result.totalProcessCost,
        totalCostRecent: result.totalCostRecent,
        totalCostAvg: result.totalCostAvg,
      },
      created_by: userData?.user?.id ?? null,
    });
    setAddingToPool(false);
    if (error) {
      toast("danger", `Couldn't add to the estimate pool: ${error.message}`);
      return;
    }
    toast("success", `${template.code} added to the estimate pool — pull it into a quote from Estimate Builder`);
  }

  const unmappedLines = effectiveLines.filter((l) => !l.raw_material_code);
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
              <p className="mb-3 mt-0.5 text-[11px] text-ink-muted">
                Untick a line this job doesn&apos;t need (e.g. white ink on a job that&apos;s CMYK-only) — applies to this
                calculation only, doesn&apos;t change the FG code&apos;s saved BOM (edit that in the BOM Master tab).
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-secondary">
                      <th className="py-1.5 pr-2"></th>
                      <th className="py-1.5 pr-2">Material</th>
                      <th className="py-1.5 pr-2">Mapped to</th>
                      <th className="py-1.5 pr-2 text-right">Recent ₹/unit</th>
                      <th className="py-1.5 pr-2 text-right">Avg ₹/unit</th>
                      <th className="py-1.5 pr-2 text-right">Consumption</th>
                      <th className="py-1.5 pr-2 text-right">Line cost</th>
                      <th className="py-1.5 pr-2 text-right">Wastage</th>
                      <th className="py-1.5 pr-2 text-right">Markup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allLineCosts.map((lc) => {
                      const excluded = excludedLines.has(lc.line.id);
                      const originalLine = originalLinesById.get(lc.line.id);
                      const alts = alternativesByLine[lc.line.id] ?? [];
                      // Only show a picker when there's actually a choice --
                      // a line with no alternatives on file still just shows
                      // its mapped material as plain text, same as before.
                      const options: { code: string | null; label: string }[] = [];
                      if (alts.length > 0) {
                        const defaultMaterial = originalLine?.raw_material_code
                          ? materialsByCode.get(originalLine.raw_material_code)
                          : null;
                        options.push({
                          code: originalLine?.raw_material_code ?? null,
                          label: defaultMaterial
                            ? `${defaultMaterial.code} — ${defaultMaterial.name} — ${priceLabel(defaultMaterial)} (default)`
                            : "— unmapped (default) —",
                        });
                        for (const alt of alts) {
                          const m = materialsByCode.get(alt.raw_material_code);
                          options.push({
                            code: alt.raw_material_code,
                            label: m ? `${m.code} — ${m.name} — ${priceLabel(m)}` : alt.raw_material_code,
                          });
                        }
                      }
                      const currentValue = selectedMaterialByLine[lc.line.id] !== undefined
                        ? selectedMaterialByLine[lc.line.id]
                        : (originalLine?.raw_material_code ?? null);
                      return (
                        <tr key={lc.line.id} className={`border-b border-line/60 ${excluded ? "bg-surface-sunken" : ""}`}>
                          <td className="py-1.5 pr-2">
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={(e) => toggleLineForJob(lc.line.id, e.target.checked)}
                              className="h-3 w-3 rounded border-line-strong"
                            />
                          </td>
                          <td className={`py-1.5 pr-2 ${excluded ? "text-ink-muted line-through" : "text-ink"}`}>
                            {lc.line.material_name}
                          </td>
                          <td className="py-1.5 pr-2 text-ink-secondary">
                            {options.length > 0 ? (
                              <select
                                value={currentValue ?? ""}
                                onChange={(e) => selectMaterialForLine(lc.line.id, e.target.value === "" ? null : e.target.value)}
                                disabled={excluded}
                                className="h-7 max-w-[260px] rounded-md border border-line-strong bg-surface px-1.5 text-[11px] text-ink outline-none disabled:opacity-50"
                              >
                                {options.map((opt) => (
                                  <option key={opt.code ?? "__none__"} value={opt.code ?? ""}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            ) : lc.rawMaterial ? (
                              `${lc.rawMaterial.code} — ${lc.rawMaterial.name}`
                            ) : (
                              "— unmapped —"
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-right">{lc.recentUnitPrice !== null ? lc.recentUnitPrice.toFixed(2) : "—"}</td>
                          <td className="py-1.5 pr-2 text-right">{lc.avgUnitPrice !== null ? lc.avgUnitPrice.toFixed(2) : "—"}</td>
                          <td className="py-1.5 pr-2 text-right">
                            {lc.line.consumption_qty} /{lc.line.basis.toLowerCase()}
                          </td>
                          {/* Rate x consumption, with wastage and markup already
                              folded in -- this is the ₹ this line adds per SQFT
                              (or per Nos/RFT/etc.) before scaling by the job's
                              total sqft/qty in the totals below. Excluded lines
                              still show their would-be cost (struck through) so
                              unticking one shows what it's saving, but this
                              per-row number never scales by sqft/qty -- see the
                              Material cost totals below for the real number,
                              which already excludes it via effectiveLines. */}
                          <td className={`py-1.5 pr-2 text-right ${excluded ? "text-ink-muted line-through" : ""}`}>
                            <div className={excluded ? "" : "font-medium text-ink"}>{lc.recentLineCost.toFixed(2)}</div>
                            <div className="text-[10px] text-ink-muted">avg {lc.avgLineCost.toFixed(2)}</div>
                          </td>
                          <td className="py-1.5 pr-2 text-right">{Math.round(lc.line.wastage_pct * 100)}%</td>
                          <td className="py-1.5 pr-2 text-right">{Math.round(lc.line.markup_pct * 100)}%</td>
                        </tr>
                      );
                    })}
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
              <h3 className="text-sm font-semibold text-ink">Work centre process cost</h3>
              <p className="mb-3 mt-0.5 text-[11px] text-ink-muted">
                Untick one this job doesn&apos;t need — applies to this calculation only, doesn&apos;t change the FG code&apos;s
                saved default (edit that in the BOM Master tab).
              </p>
              <div className="flex flex-wrap gap-3">
                {allWorkCentreCosts.map((w) => {
                  const excluded = excludedWorkCentres.has(w.workCentre);
                  return (
                    <div
                      key={w.workCentre}
                      className={`rounded-md border px-3 py-2 text-xs ${excluded ? "border-line/60 bg-surface-sunken" : "border-line"}`}
                    >
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={!excluded}
                          onChange={(e) => toggleWorkCentreForJob(w.workCentre, e.target.checked)}
                          className="h-3 w-3 rounded border-line-strong"
                        />
                        <span className={excluded ? "text-ink-muted line-through" : "text-ink-secondary"}>{w.workCentre}</span>
                      </label>
                      <div className={`mt-1 font-semibold ${excluded ? "text-ink-muted" : "text-ink"}`}>
                        {excluded ? "excluded" : w.cost !== null ? fmtRupee(w.cost) : "no rate"}
                      </div>
                    </div>
                  );
                })}
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
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-[11px] text-ink-muted">
                  Save this job so it can be pulled into a customer quote from Estimate Builder — customer-less for now, you
                  pick who it&apos;s for over there.
                </p>
                <Button variant="secondary" size="sm" onClick={addToPool} loading={addingToPool} className="shrink-0">
                  Add to Estimate Pool
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="text-sm font-semibold text-ink">Suggested selling price</h3>
              <p className="mb-3 mt-0.5 text-[11px] text-ink-muted">
                What to charge for a target GP% -- doesn&apos;t use the Selling Price / SqFt field above (that one shows the
                GP you&apos;d actually get at a price you enter yourself).
              </p>
              <div className="flex flex-wrap items-end gap-4">
                <Field label="Method">
                  <select
                    value={gpMethod}
                    onChange={(e) => setGpMethod(e.target.value as GpMethod)}
                    className="h-9 w-full min-w-[220px] rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
                  >
                    <option value="total_cost">Traditional -- GP on total cost</option>
                    <option value="services_only">Value Addition -- GP on services only</option>
                  </select>
                </Field>
                <Field label="Target GP %">
                  <NumberInput value={targetGpPct} onChange={setTargetGpPct} />
                </Field>
              </div>
              <p className="mt-2 text-[11px] text-ink-muted">
                {gpMethod === "total_cost"
                  ? "Margin applied to everything: raw materials, wastage, ink, machine cost, labour, finishing, packing, overheads."
                  : "Raw materials and wastage recovered at cost. Margin applied only to ink, machine time, labour, finishing, packing, and overheads."}
              </p>
              {priceSuggestion ? (
                <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3 sm:grid-cols-4">
                  <Metric label="Price / SqFt (recent)" value={fmtRupee(priceSuggestion.perSqftRecent)} />
                  <Metric label="Price / SqFt (avg)" value={fmtRupee(priceSuggestion.perSqftAvg)} />
                  <Metric label="Total (recent)" value={fmtRupee(priceSuggestion.totalRecent)} />
                  <Metric label="Total (avg)" value={fmtRupee(priceSuggestion.totalAvg)} />
                </div>
              ) : (
                <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">
                  Enter a target GP% under 100 to see a suggested price.
                </p>
              )}
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
