import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { radius } from "@mmdi/shared/theme";
import { vibrant, fonts, optionAccent, sectionLabelStyle, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "@/lib/supabase";
import type {
  BomTemplateLineAlternativeRow,
  BomTemplateLineRow,
  BomTemplateRow,
  RawMaterialRow,
  WorkCentreRateRow,
} from "@mmdi/shared/rows";
import {
  computeCostSheet,
  computeLineCost,
  computeSqft,
  computeWorkCentreCost,
  suggestSellingPrice,
  TRADITIONAL_DEFAULT_GP_PCT,
  VALUE_ADDITION_DEFAULT_GP_PCT,
  type CostSheetInputs,
  type GpMethod,
  type Uom,
} from "../../lib/costSheet/calc";
import { groupByCategory } from "../../lib/costSheet/categoryOrder";

/**
 * "in my previous chat i asked to add new module cost sheet but not sign
 * costsheets. the cost sheet from tool from web app and which we build
 * costing like attached screen" -- native port of
 * apps/web/src/app/workspaces/cost-sheet/CostSheetCalcTab.tsx (Tools >
 * Cost Sheet).
 *
 * "For Cost sheet i need to have options to select material si cant make
 * cost sheet whtout options ... i need all capabilities select, switch
 * off/on and price details, wastage, line cost, watage, markup details,
 * work centre porcess costs, on/off, suggested sellin gprice traditional
 * margin and value addition margin details are must" -- this round adds
 * everything the first pass deliberately cut, matching the web tool
 * feature-for-feature:
 *  - Per-line ON/OFF (a job-only override, doesn't touch the FG code's
 *    saved BOM -- edit that on the web app's BOM Master tab).
 *  - Per-line material alternative picker, when the line has any on file
 *    (bom_template_line_alternatives) -- same job-only override.
 *  - Full price/wastage/markup/line-cost detail per line (recent + avg).
 *  - Per-work-centre ON/OFF with each one's own process cost.
 *  - Suggested Selling Price: Traditional (GP on everything) vs Value
 *    Addition (materials recovered at cost, GP only on ink + process
 *    cost) margin methods, target GP%, both bases (recent/avg).
 *
 * Still NOT ported (unchanged from the first pass, still a deliberate
 * scope cut, not an oversight): "Add to Estimate Pool" -- saving this
 * calculation into estimate_pool_items for pickup in Estimate Builder.
 * Wasn't asked for this round; flagging in case it's wanted next.
 */

interface TemplateOption {
  value: string;
  label: string;
}

// "I need gorss margin percentage for adjustment" -- an editable Target
// GP%, per-method default (see calc.ts's TRADITIONAL_DEFAULT_GP_PCT /
// VALUE_ADDITION_DEFAULT_GP_PCT and the "cost-based methodology, not on
// the selling price" comment on suggestSellingPrice for the full
// reasoning) -- switching Method resets Target GP% to that method's own
// default (50% Traditional, 100% Value Addition), while still leaving it
// freely editable afterward.

async function fetchAllRawMaterials(): Promise<RawMaterialRow[]> {
  // raw_materials is ~1,558 rows -- past PostgREST's default 1000-row cap
  // on an unpaginated select, same issue already hit (and fixed) for
  // customers/employees elsewhere in this app.
  const PAGE = 1000;
  const rows: RawMaterialRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("raw_materials")
      .select("*")
      .order("code")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    rows.push(...(data as RawMaterialRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

const fmtRupee = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtPct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);

// Each alternative option shows its own recent/avg ₹/unit, same as web's
// priceLabel(), so a job can be priced against the cheapest (or most
// in-stock) option without switching back and forth to check.
function priceLabel(m: RawMaterialRow): string {
  const recent = m.unit_cost_recent !== null ? `₹${m.unit_cost_recent.toFixed(2)}` : "no price";
  const avg = m.unit_cost_avg !== null ? `₹${m.unit_cost_avg.toFixed(2)}` : "no price";
  return `recent ${recent} / avg ${avg}`;
}

export default function CostSheetToolScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<BomTemplateRow[]>([]);
  const [rates, setRates] = useState<WorkCentreRateRow[]>([]);
  const [materialsByCode, setMaterialsByCode] = useState<Map<string, RawMaterialRow>>(new Map());
  const [alternativesByLine, setAlternativesByLine] = useState<Record<string, BomTemplateLineAlternativeRow[]>>({});

  const [templateId, setTemplateId] = useState("");
  const [lines, setLines] = useState<BomTemplateLineRow[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  const [salesOrder, setSalesOrder] = useState("");
  const [uom, setUom] = useState<Uom>("FT");
  const [width, setWidth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");
  const [qty, setQty] = useState<number | "">(1);
  const [sellPrice, setSellPrice] = useState<number | "">("");

  // Job-only overrides -- ephemeral, reset whenever the FG code changes,
  // never written back to the template's saved BOM. Same pattern as the
  // web tool.
  const [excludedWorkCentres, setExcludedWorkCentres] = useState<Set<string>>(new Set());
  const [selectedMaterialByLine, setSelectedMaterialByLine] = useState<Record<string, string | null>>({});
  const [excludedLines, setExcludedLines] = useState<Set<string>>(new Set());

  const [addingToPool, setAddingToPool] = useState(false);
  const [poolMessage, setPoolMessage] = useState<{ kind: "success" | "danger"; text: string } | null>(null);

  const [gpMethod, setGpMethod] = useState<GpMethod>("total_cost");
  const [targetGpPct, setTargetGpPct] = useState<number | "">(TRADITIONAL_DEFAULT_GP_PCT);

  useEffect(() => {
    (async () => {
      const [templatesRes, ratesRes, materialRows, altsRes] = await Promise.all([
        supabase.from("bom_templates").select("*").order("sort_order", { ascending: true, nullsFirst: false }).order("code"),
        supabase.from("work_centre_rates").select("*"),
        fetchAllRawMaterials(),
        supabase.from("bom_template_line_alternatives").select("*"),
      ]);
      if (templatesRes.error || ratesRes.error) {
        setLoadError("Couldn't load Cost Sheet master data.");
        setLoading(false);
        return;
      }
      setTemplates((templatesRes.data as BomTemplateRow[]) ?? []);
      setRates((ratesRes.data as WorkCentreRateRow[]) ?? []);
      setMaterialsByCode(new Map(materialRows.map((m) => [m.code, m])));
      if (!altsRes.error) {
        const byLine: Record<string, BomTemplateLineAlternativeRow[]> = {};
        for (const row of (altsRes.data as BomTemplateLineAlternativeRow[]) ?? []) {
          (byLine[row.line_id] ??= []).push(row);
        }
        setAlternativesByLine(byLine);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!templateId) {
      setLines([]);
      return;
    }
    let cancelled = false;
    setLoadingLines(true);
    setExcludedWorkCentres(new Set());
    setSelectedMaterialByLine({});
    setExcludedLines(new Set());
    (async () => {
      const { data, error } = await supabase
        .from("bom_template_lines")
        .select("*")
        .eq("template_id", templateId)
        .order("line_no");
      if (cancelled) return;
      setLoadingLines(false);
      if (error) return;
      setLines((data as BomTemplateLineRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const template = templates.find((tpl) => tpl.id === templateId) ?? null;

  const templateOptions: TemplateOption[] = useMemo(() => {
    const grouped = groupByCategory(templates);
    const opts: TemplateOption[] = [];
    for (const g of grouped) {
      for (const tpl of g.items) {
        opts.push({ value: tpl.id, label: `${tpl.code} — ${tpl.description}` });
      }
    }
    return opts;
  }, [templates]);

  const originalLinesById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  const effectiveTemplate = useMemo(() => {
    if (!template) return null;
    return { ...template, work_centres: template.work_centres.filter((wc) => !excludedWorkCentres.has(wc)) };
  }, [template, excludedWorkCentres]);

  const overriddenLines = useMemo(() => {
    return lines.map((l) => {
      const sel = selectedMaterialByLine[l.id];
      return sel !== undefined ? { ...l, raw_material_code: sel } : l;
    });
  }, [lines, selectedMaterialByLine]);

  const effectiveLines = useMemo(() => {
    return overriddenLines.filter((l) => !excludedLines.has(l.id));
  }, [overriddenLines, excludedLines]);

  const inputs: CostSheetInputs = {
    uom,
    width: width === "" ? 0 : width,
    height: height === "" ? 0 : height,
    qty: qty === "" ? 0 : qty,
    sellingPricePerSqft: sellPrice === "" ? 0 : sellPrice,
  };

  const result = useMemo(() => {
    if (!effectiveTemplate) return null;
    return computeCostSheet(effectiveTemplate, effectiveLines, materialsByCode, rates, inputs);
  }, [effectiveTemplate, effectiveLines, materialsByCode, rates, uom, width, height, qty, sellPrice]);

  // Every work centre the FG code is normally set up for, checked or not
  // -- rendered as the checklist below so unticking one is still visible
  // and re-checkable, instead of just disappearing once excluded.
  const allWorkCentreCosts = useMemo(() => {
    if (!template) return [];
    const sqft = computeSqft(inputs);
    return template.work_centres.map((wc) => computeWorkCentreCost(wc, template, rates, sqft, inputs.qty));
  }, [template, rates, uom, width, height, qty]);

  // Every material line the BOM normally has, excluded or not -- same
  // pattern as allWorkCentreCosts. Built from overriddenLines (material
  // swap applied) so the checkbox and the alternatives picker stay
  // independent of each other.
  const allLineCosts = useMemo(() => {
    return overriddenLines.map((l) => computeLineCost(l, materialsByCode));
  }, [overriddenLines, materialsByCode]);

  const priceSuggestion = useMemo(() => {
    if (!result || result.sqft <= 0 || targetGpPct === "") return null;
    const g = targetGpPct / 100;
    const materialAtCostRecent = result.materialCostRecent - result.inkCostRecent;
    const materialAtCostAvg = result.materialCostAvg - result.inkCostAvg;
    const totalRecent = suggestSellingPrice(materialAtCostRecent, result.inkCostRecent, result.totalProcessCost, g, gpMethod);
    const totalAvg = suggestSellingPrice(materialAtCostAvg, result.inkCostAvg, result.totalProcessCost, g, gpMethod);
    return {
      perSqftRecent: totalRecent / result.sqft,
      perSqftAvg: totalAvg / result.sqft,
      totalRecent,
      totalAvg,
    };
  }, [result, gpMethod, targetGpPct]);

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

  // "Cost Sheet is perfect and add to pool" -- port of web's addToPool():
  // saves a snapshot of this job into estimate_pool_items, customer-less
  // by design (Estimate Builder picks who it's for when pulling this into
  // an actual quote). A calculation itself still isn't saved anywhere on
  // its own otherwise -- this is the one explicit, opt-in save action.
  async function addToPool() {
    if (!template || !result) return;
    setAddingToPool(true);
    setPoolMessage(null);
    const { data: userData } = await supabase.auth.getUser();
    const sellAmountTotal = sellPrice !== "" ? result.sellingAmount : priceSuggestion?.totalRecent ?? null;
    const unitRatePerSqft = sellAmountTotal !== null && result.sqft > 0 ? sellAmountTotal / result.sqft : null;
    // Ink is priced in as a service, not a customer-facing material line --
    // same category+name keyword filter as web's own addToPool, so the
    // pool item's material list only carries actual physical materials.
    const poolMaterials = result.lineCosts
      .filter((lc) => {
        const category = (lc.line.material_category ?? "").toLowerCase();
        const name = lc.line.material_name.toLowerCase();
        return category !== "ink" && !name.includes("ink") && !name.includes("layer");
      })
      .map((lc) => ({ name: lc.line.material_name, mappedTo: lc.rawMaterial?.name ?? null }));
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
        materials: poolMaterials,
        materialCostRecent: result.materialCostRecent,
        totalProcessCost: result.totalProcessCost,
        totalCostRecent: result.totalCostRecent,
        totalCostAvg: result.totalCostAvg,
      },
      created_by: userData?.user?.id ?? null,
    });
    setAddingToPool(false);
    if (error) {
      setPoolMessage({ kind: "danger", text: `Couldn't add to the estimate pool: ${error.message}` });
      return;
    }
    setPoolMessage({ kind: "success", text: `${template.code} added to the estimate pool — pull it into a quote from Estimates.` });
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {loading ? (
        <View style={s.centerFill}>
          <ActivityIndicator color={t.primary} />
        </View>
      ) : loadError ? (
        <View style={s.centerFill}>
          <Text style={s.errorText}>{loadError}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.sectionTitle}>Job Details</Text>
          <SoftCard style={s.card}>
            <Field t={t} label="Sales Order (optional)">
              <TextInput
                style={s.input}
                value={salesOrder}
                onChangeText={setSalesOrder}
                placeholder="SO number / reference"
                placeholderTextColor={t.inkMuted}
              />
            </Field>

            <PickerField
              t={t}
              label="FG Code / Template"
              value={templateId}
              onChange={setTemplateId}
              options={templateOptions}
              placeholder="Select an FG code…"
            />

            <View style={s.fieldRow}>
              <View style={s.fieldHalf}>
                <Field t={t} label="UOM">
                  <View style={s.uomToggle}>
                    {(["FT", "INC"] as Uom[]).map((u) => (
                      <Pressable
                        key={u}
                        style={[s.uomOption, uom === u && s.uomOptionActive]}
                        onPress={() => setUom(u)}
                      >
                        <Text style={[s.uomOptionText, uom === u && s.uomOptionTextActive]}>{u}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Field>
              </View>
              <View style={s.fieldHalf}>
                <NumberField t={t} label="Qty" value={qty} onChange={setQty} keyboardType="number-pad" />
              </View>
            </View>

            <View style={s.fieldRow}>
              <View style={s.fieldHalf}>
                <NumberField t={t} label={`Width (${uom === "FT" ? "ft" : "inch"})`} value={width} onChange={setWidth} />
              </View>
              <View style={s.fieldHalf}>
                <NumberField t={t} label={`Height (${uom === "FT" ? "ft" : "inch"})`} value={height} onChange={setHeight} />
              </View>
            </View>

            <NumberField t={t} label="Selling Price / SqFt (₹)" value={sellPrice} onChange={setSellPrice} />
          </SoftCard>

          {!templateId ? (
            <Text style={s.placeholder}>Select an FG code to see its cost breakdown.</Text>
          ) : loadingLines ? (
            <ActivityIndicator style={s.pad} color={t.primary} />
          ) : result ? (
            <>
              <View style={s.metricGrid}>
                <Metric t={t} label="Sign Area" value={`${result.sqft.toFixed(2)} sq.ft`} />
                <Metric t={t} label="Selling Amount" value={fmtRupee(result.sellingAmount)} />
              </View>

              <Text style={s.sectionTitle}>Materials</Text>
              <Text style={s.helperText}>
                Switch off a line this job doesn't need (e.g. white ink on a CMYK-only job) or pick a different material
                where one's on file -- applies to this calculation only, doesn't change the FG code's saved BOM.
              </Text>
              <SoftCard style={s.card}>
                {allLineCosts.length === 0 ? (
                  <Text style={s.placeholder}>No BOM lines on this template.</Text>
                ) : (
                  allLineCosts.map((lc) => {
                    const excluded = excludedLines.has(lc.line.id);
                    const originalLine = originalLinesById.get(lc.line.id);
                    const alts = alternativesByLine[lc.line.id] ?? [];
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
                        if (alt.raw_material_code === originalLine?.raw_material_code) continue;
                        const m = materialsByCode.get(alt.raw_material_code);
                        options.push({
                          code: alt.raw_material_code,
                          label: m ? `${m.code} — ${m.name} — ${priceLabel(m)}` : alt.raw_material_code,
                        });
                      }
                    }
                    const currentValue =
                      selectedMaterialByLine[lc.line.id] !== undefined
                        ? selectedMaterialByLine[lc.line.id]
                        : originalLine?.raw_material_code ?? null;
                    return (
                      <MaterialLineRow
                        key={lc.line.id}
                        t={t}
                        excluded={excluded}
                        name={lc.line.material_name}
                        mappedLabel={lc.rawMaterial ? `${lc.rawMaterial.code} — ${lc.rawMaterial.name}` : "unmapped"}
                        options={options}
                        currentValue={currentValue}
                        onSelectMaterial={(code) => selectMaterialForLine(lc.line.id, code)}
                        recentUnitPrice={lc.recentUnitPrice}
                        avgUnitPrice={lc.avgUnitPrice}
                        consumption={lc.line.consumption_qty}
                        basis={lc.line.basis}
                        wastagePct={lc.line.wastage_pct}
                        markupPct={lc.line.markup_pct}
                        recentLineCost={lc.recentLineCost}
                        avgLineCost={lc.avgLineCost}
                        onToggle={(v) => toggleLineForJob(lc.line.id, v)}
                      />
                    );
                  })
                )}
                <Row t={t} label="Material Cost (Recent)" value={fmtRupee(result.materialCostRecent)} strong />
                <Row t={t} label="Material Cost (Average)" value={fmtRupee(result.materialCostAvg)} strong />
              </SoftCard>

              <Text style={s.sectionTitle}>Work Centres</Text>
              <Text style={s.helperText}>
                Switch off a process this job doesn't need -- applies to this calculation only, doesn't change the FG
                code's saved default.
              </Text>
              <SoftCard style={s.card}>
                {allWorkCentreCosts.length === 0 ? (
                  <Text style={s.placeholder}>No work centres on this template.</Text>
                ) : (
                  allWorkCentreCosts.map((wc) => {
                    const excluded = excludedWorkCentres.has(wc.workCentre);
                    return (
                      <View key={wc.workCentre} style={s.wcRow}>
                        <View style={s.wcLeft}>
                          <Switch
                            value={!excluded}
                            onValueChange={(v) => toggleWorkCentreForJob(wc.workCentre, v)}
                            trackColor={{ false: t.line, true: t.primaryTint }}
                            thumbColor={!excluded ? t.primary : undefined}
                          />
                          <Text style={[s.wcName, excluded && s.strikethrough]} numberOfLines={2}>
                            {wc.workCentre}
                          </Text>
                        </View>
                        <Text style={[s.wcValue, excluded && s.mutedText]}>
                          {excluded ? "excluded" : wc.cost !== null ? fmtRupee(wc.cost) : "no rate"}
                        </Text>
                      </View>
                    );
                  })
                )}
                <Row t={t} label="Total Process Cost" value={fmtRupee(result.totalProcessCost)} strong />
              </SoftCard>

              <Text style={s.sectionTitle}>Cost Summary</Text>
              <SoftCard style={s.card}>
                <Row t={t} label="Total Cost (Recent)" value={fmtRupee(result.totalCostRecent)} strong />
                <Row t={t} label="Total Cost (Average)" value={fmtRupee(result.totalCostAvg)} strong />
                {/* "there is something wrong i couldnt get the calculation
                    with GP" -- root cause: Gross Profit here is
                    sellingAmount - totalCost, and sellingAmount is
                    sqft x Selling Price / SqFt (the Job Details field
                    above). Leaving that field blank (its default) makes
                    sellingAmount 0, so this correctly-but-confusingly
                    showed the full cost as a negative number with a "—"
                    for the percentage (division by zero) -- nothing was
                    actually broken, but there was no way to tell that
                    from the screen, and no link back to the Suggested
                    Selling Price section below that already computes a
                    real price. Now: while no price has been entered, this
                    shows a plain explanation plus a one-tap button that
                    fills Selling Price / SqFt straight from the Suggested
                    Selling Price section's own Target GP% -- Gross Profit
                    updates immediately to reflect it. */}
                {sellPrice === "" ? (
                  <View style={s.gpEmptyState}>
                    <Text style={s.placeholder}>
                      Enter a Selling Price / SqFt above to see Gross Profit here.
                    </Text>
                    {priceSuggestion && (
                      <Pressable
                        style={s.useSuggestedBtn}
                        onPress={() => setSellPrice(Math.round(priceSuggestion.perSqftRecent))}
                      >
                        <Text style={s.useSuggestedBtnText}>
                          Use Suggested Price — {fmtRupee(priceSuggestion.perSqftRecent)}/sqft ({targetGpPct}% GP)
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ) : (
                  <>
                    <Row
                      t={t}
                      label="Gross Profit (Recent)"
                      detail={fmtPct(result.gpRecentPct)}
                      value={fmtRupee(result.gpRecent)}
                      strong
                      big
                    />
                    <Row
                      t={t}
                      label="Gross Profit (Average)"
                      detail={fmtPct(result.gpAvgPct)}
                      value={fmtRupee(result.gpAvg)}
                      strong
                      big
                    />
                  </>
                )}
                <GradientButton
                  label={addingToPool ? "Adding…" : "Add to Estimate Pool"}
                  onPress={addToPool}
                  loading={addingToPool}
                  variant="secondary"
                  style={s.poolBtn}
                />
                {poolMessage && (
                  <Text style={poolMessage.kind === "success" ? s.poolSuccessText : s.poolErrorText}>
                    {poolMessage.text}
                  </Text>
                )}
              </SoftCard>

              <Text style={s.sectionTitle}>Suggested Selling Price</Text>
              <Text style={s.helperText}>
                What to charge for a target GP% -- independent of the Selling Price / SqFt field above (that one shows
                the GP you'd actually get at a price you enter yourself).
              </Text>
              <SoftCard style={s.card}>
                <Field t={t} label="Method">
                  <View style={s.uomToggle}>
                    <Pressable
                      style={[s.gpMethodOption, gpMethod === "total_cost" && s.uomOptionActive]}
                      onPress={() => {
                        setGpMethod("total_cost");
                        setTargetGpPct(TRADITIONAL_DEFAULT_GP_PCT);
                      }}
                    >
                      <Text style={[s.uomOptionText, gpMethod === "total_cost" && s.uomOptionTextActive]} numberOfLines={2}>
                        Traditional — GP on total cost
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[s.gpMethodOption, gpMethod === "services_only" && s.uomOptionActive]}
                      onPress={() => {
                        setGpMethod("services_only");
                        setTargetGpPct(VALUE_ADDITION_DEFAULT_GP_PCT);
                      }}
                    >
                      <Text style={[s.uomOptionText, gpMethod === "services_only" && s.uomOptionTextActive]} numberOfLines={2}>
                        Value Addition — GP on ink + work centre
                      </Text>
                    </Pressable>
                  </View>
                </Field>
                {/* Cost-plus markup, not gross-profit-margin -- GP% is a
                    percentage of a COST base, added on top of it, per the
                    methodology written out for this round (see
                    suggestSellingPrice's own comment in calc.ts for the
                    full derivation and the history of the earlier,
                    incorrect margin-based version this replaces). */}
                <Text style={s.gpMethodHint}>
                  {gpMethod === "total_cost"
                    ? "GP% applied to everything: raw material (incl. wastage & markup), ink, and all work centre costs. Default 50% adds half the total cost on top (₹100 cost → ₹150)."
                    : "Raw material recovered at cost -- no GP on it. GP% applied to ink + work centre cost together, added on top of that portion. Default 100% doubles ink + processing, which typically brings the overall total to somewhere around 1.5x depending on how much of the job is raw material vs. ink and processing."}
                </Text>
                <NumberField t={t} label="Target GP %" value={targetGpPct} onChange={setTargetGpPct} />
                {priceSuggestion ? (
                  <>
                    <View style={s.metricGrid}>
                      <Metric t={t} label="Price / SqFt (Recent)" value={fmtRupee(priceSuggestion.perSqftRecent)} />
                      <Metric t={t} label="Price / SqFt (Average)" value={fmtRupee(priceSuggestion.perSqftAvg)} />
                      <Metric t={t} label="Total (Recent)" value={fmtRupee(priceSuggestion.totalRecent)} />
                      <Metric t={t} label="Total (Average)" value={fmtRupee(priceSuggestion.totalAvg)} />
                    </View>

                    {/* "can we show the calculation at the bottom it is
                        very confusing" -- the formula itself was never
                        shown, just its result, so there was no way to
                        see WHY a number came out the way it did without
                        reading code. This lays out every step on the
                        Recent basis (same numbers Average follows,
                        proportionally) using the SAME field names as the
                        Materials/Work Centres sections above, so it reads
                        as an extension of the cost breakdown already on
                        screen rather than a separate black box. */}
                    <View style={s.calcBox}>
                      <Text style={s.calcTitle}>How this price was calculated (Recent)</Text>
                      {gpMethod === "total_cost" ? (
                        <>
                          <Row t={t} small label="Raw Material (incl. wastage & markup)" value={fmtRupee(result.materialCostRecent - result.inkCostRecent)} />
                          <Row t={t} small label="Ink Cost" value={fmtRupee(result.inkCostRecent)} />
                          <Row t={t} small label="Work Centre Cost" value={fmtRupee(result.totalProcessCost)} />
                          <Row t={t} small strong label="= Total Cost" value={fmtRupee(result.totalCostRecent)} />
                          <Row t={t} small label={`+ GP (${targetGpPct}% of Total Cost)`} value={fmtRupee(result.totalCostRecent * ((targetGpPct as number) / 100))} />
                          <Row t={t} small strong big label="= Suggested Selling Price" value={fmtRupee(priceSuggestion.totalRecent)} />
                        </>
                      ) : (
                        <>
                          <Row t={t} small label="Raw Material (recovered at cost, no GP)" value={fmtRupee(result.materialCostRecent - result.inkCostRecent)} />
                          <Row t={t} small label="Ink Cost" value={fmtRupee(result.inkCostRecent)} />
                          <Row t={t} small label="Work Centre Cost" value={fmtRupee(result.totalProcessCost)} />
                          <Row t={t} small strong label="= Ink + Work Centre (GP base)" value={fmtRupee(result.inkCostRecent + result.totalProcessCost)} />
                          <Row t={t} small label={`+ GP (${targetGpPct}% of Ink + Work Centre)`} value={fmtRupee((result.inkCostRecent + result.totalProcessCost) * ((targetGpPct as number) / 100))} />
                          <Row t={t} small strong big label="= Suggested Selling Price" value={fmtRupee(priceSuggestion.totalRecent)} />
                        </>
                      )}
                    </View>

                    {/* Feeds this section's price back up into Selling
                        Price / SqFt so the Cost Summary's Gross Profit
                        rows reflect it too -- see that section's own
                        comment for the full "couldn't get the GP
                        calculation" reasoning. */}
                    <Pressable
                      style={s.useSuggestedBtn}
                      onPress={() => setSellPrice(Math.round(priceSuggestion.perSqftRecent))}
                    >
                      <Text style={s.useSuggestedBtnText}>Apply to Selling Price / SqFt</Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={s.placeholder}>Enter a target GP% to see a suggested price.</Text>
                )}
              </SoftCard>
            </>
          ) : null}

          <Pressable style={s.historyLink} onPress={() => router.push("/sign-costing-history")}>
            <Text style={s.historyLinkText}>View past Sign Costing sheets ›</Text>
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Shared small field components (local copies of estimator.tsx's --
// not exported from there, and this screen's field set is small enough
// that duplicating is simpler than lifting them into a shared file) ────

function Field({ t, label, children }: { t: VibrantTheme; label: string; children: React.ReactNode }) {
  const s = styles(t);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

function NumberField({
  t, label, value, onChange, keyboardType = "decimal-pad",
}: {
  t: VibrantTheme; label: string; value: number | ""; onChange: (v: number | "") => void; keyboardType?: "decimal-pad" | "number-pad";
}) {
  const s = styles(t);
  const [text, setText] = useState(value === "" ? "" : String(value));
  // "everytime i am :wq" -- unrelated to that, but the screenshot sent
  // right after showed the real bug this fixes: Target GP % still read
  // "50" after tapping Value Addition, even though the calculation below
  // it had already switched to 100%. Root cause: `text` was only ever
  // set from `value` on the very first render (useState's initializer
  // doesn't re-run later); every OTHER field write went through
  // onChangeText, which does keep text in sync -- but a write from
  // OUTSIDE this component (Method's onPress calling setTargetGpPct, or
  // "Apply to Selling Price / SqFt" calling setSellPrice) changes
  // `value` without ever calling onChangeText, so `text` just went
  // stale. This effect re-syncs `text` whenever `value` changes from the
  // outside, but skips it while `text` already parses to the same
  // number -- that's what's true while the user is mid-typing (e.g.
  // "12." before they've typed the "5" of "12.5"), so it won't fight
  // their keystrokes.
  useEffect(() => {
    if (value === "") {
      if (text !== "") setText("");
      return;
    }
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field t={t} label={label}>
      <TextInput
        style={s.input}
        value={text}
        onChangeText={(raw) => {
          setText(raw);
          if (raw === "" || raw === "-") { onChange(""); return; }
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(n);
        }}
        keyboardType={keyboardType}
        placeholder="0"
        placeholderTextColor={t.inkMuted}
      />
    </Field>
  );
}

function PickerField({
  t, label, value, onChange, options, placeholder,
}: {
  t: VibrantTheme; label: string; value: string; onChange: (v: string) => void;
  options: TemplateOption[]; placeholder?: string;
}) {
  const s = styles(t);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Field t={t} label={label}>
      <Pressable style={s.pickerField} onPress={() => setOpen(true)}>
        <Text style={selected ? s.pickerText : s.pickerPlaceholder} numberOfLines={2}>
          {selected?.label ?? placeholder ?? "Select…"}
        </Text>
        <Text style={s.pickerChevron}>⌄</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setOpen(false)} />
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)}><Text style={s.modalClose}>Done</Text></Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            style={s.modalList}
            renderItem={({ item, index }) => (
              <Pressable
                style={[s.modalOption, { borderLeftColor: optionAccent(t, index) }, item.value === value && s.modalOptionActive]}
                onPress={() => { onChange(item.value); setOpen(false); }}
              >
                <Text style={s.modalOptionText} numberOfLines={2}>{item.label}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={s.modalEmpty}>No options available.</Text>}
          />
        </View>
      </Modal>
    </Field>
  );
}

// Compact material picker used inline within a MaterialLineRow -- same
// bottom-sheet Modal pattern as PickerField, but `code` values (not just
// strings) since "no material for this line" is a real, distinct option
// (code: null) from "use the default."
function MaterialPicker({
  t, options, value, onChange, disabled,
}: {
  t: VibrantTheme; options: { code: string | null; label: string }[]; value: string | null;
  onChange: (code: string | null) => void; disabled?: boolean;
}) {
  const s = styles(t);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.code === value);
  return (
    <>
      <Pressable style={[s.materialPicker, disabled && { opacity: 0.5 }]} onPress={() => !disabled && setOpen(true)}>
        <Text style={s.materialPickerText} numberOfLines={2}>{selected?.label ?? "— select material —"}</Text>
        <Text style={s.pickerChevron}>⌄</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setOpen(false)} />
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Material</Text>
            <Pressable onPress={() => setOpen(false)}><Text style={s.modalClose}>Done</Text></Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o, i) => o.code ?? `none-${i}`}
            style={s.modalList}
            renderItem={({ item, index }) => (
              <Pressable
                style={[s.modalOption, { borderLeftColor: optionAccent(t, index) }, item.code === value && s.modalOptionActive]}
                onPress={() => { onChange(item.code); setOpen(false); }}
              >
                <Text style={s.modalOptionText} numberOfLines={2}>{item.label}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

// One BOM line's full detail -- on/off switch, name, (when alternatives
// exist) a material picker, else the plain mapped-material text, then a
// compact price/consumption/wastage/markup/line-cost detail strip. Mirrors
// every column of the web tool's line-cost table, just stacked instead of
// side-by-side (no room for 9 columns on a phone width).
function MaterialLineRow({
  t, excluded, name, mappedLabel, options, currentValue, onSelectMaterial,
  recentUnitPrice, avgUnitPrice, consumption, basis, wastagePct, markupPct,
  recentLineCost, avgLineCost, onToggle,
}: {
  t: VibrantTheme; excluded: boolean; name: string; mappedLabel: string;
  options: { code: string | null; label: string }[]; currentValue: string | null;
  onSelectMaterial: (code: string | null) => void;
  recentUnitPrice: number | null; avgUnitPrice: number | null;
  consumption: number; basis: string; wastagePct: number; markupPct: number;
  recentLineCost: number; avgLineCost: number; onToggle: (v: boolean) => void;
}) {
  const s = styles(t);
  return (
    <View style={s.lineRow}>
      <View style={s.lineTop}>
        <Switch
          value={!excluded}
          onValueChange={onToggle}
          trackColor={{ false: t.line, true: t.primaryTint }}
          thumbColor={!excluded ? t.primary : undefined}
        />
        <Text style={[s.lineName, excluded && s.strikethrough]} numberOfLines={2}>{name}</Text>
      </View>
      {options.length > 0 ? (
        <MaterialPicker t={t} options={options} value={currentValue} onChange={onSelectMaterial} disabled={excluded} />
      ) : (
        <Text style={[s.lineMapped, excluded && s.mutedText]} numberOfLines={1}>{mappedLabel}</Text>
      )}
      <View style={s.lineDetailGrid}>
        <Text style={s.lineDetailText}>Recent ₹{recentUnitPrice !== null ? recentUnitPrice.toFixed(2) : "—"}/unit</Text>
        <Text style={s.lineDetailText}>Avg ₹{avgUnitPrice !== null ? avgUnitPrice.toFixed(2) : "—"}/unit</Text>
        <Text style={s.lineDetailText}>{consumption} /{basis.toLowerCase()}</Text>
        <Text style={s.lineDetailText}>Wastage {Math.round(wastagePct * 100)}%</Text>
        <Text style={s.lineDetailText}>Markup {Math.round(markupPct * 100)}%</Text>
      </View>
      <View style={s.lineTop}>
        <Text style={[s.lineCostText, excluded && s.strikethrough]}>Line cost: {fmtRupee(recentLineCost)}</Text>
        <Text style={s.lineCostSub}>avg {fmtRupee(avgLineCost)}</Text>
      </View>
    </View>
  );
}

function Metric({ t, label, value }: { t: VibrantTheme; label: string; value: string }) {
  const s = styles(t);
  return (
    <SoftCard style={s.metricCard}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue}>{value}</Text>
    </SoftCard>
  );
}

function Row({
  t, label, detail, value, strong, big, small,
}: { t: VibrantTheme; label: string; detail?: string; value: string; strong?: boolean; big?: boolean; small?: boolean }) {
  const s = styles(t);
  return (
    <View style={[s.row, strong && s.rowStrong, small && s.rowSmall]}>
      <View style={s.rowLeft}>
        <Text style={[s.rowLabel, small && s.rowLabelSmall, strong && s.rowLabelStrong, big && s.rowBig]} numberOfLines={2}>{label}</Text>
        {detail ? <Text style={s.rowDetail}>{detail}</Text> : null}
      </View>
      <Text style={[s.rowValue, small && s.rowLabelSmall, strong && s.rowLabelStrong, big && s.rowBig]}>{value}</Text>
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    scroll: { padding: 16, gap: 10, paddingBottom: 32 },
    errorText: { fontSize: 14, fontFamily: fonts.regular, color: t.danger, textAlign: "center" },

    sectionTitle: { ...sectionLabelStyle(t), marginTop: 10, marginBottom: 2 },
    helperText: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted, marginBottom: 2 },
    card: { gap: 10 },

    field: { gap: 6 },
    label: { fontSize: 12, fontFamily: fonts.medium, color: t.inkSecondary },
    input: {
      minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: t.inkMuted + "40",
      backgroundColor: t.primaryTint, paddingHorizontal: 14, paddingVertical: 10,
      fontSize: 13, fontFamily: fonts.regular, color: t.ink,
    },
    fieldRow: { flexDirection: "row", gap: 10 },
    fieldHalf: { flex: 1 },

    uomToggle: { flexDirection: "row", gap: 8 },
    uomOption: {
      flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: t.inkMuted + "40",
      alignItems: "center", justifyContent: "center", backgroundColor: t.primaryTint,
    },
    gpMethodOption: {
      flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: t.inkMuted + "40",
      alignItems: "center", justifyContent: "center", backgroundColor: t.primaryTint, paddingHorizontal: 8, paddingVertical: 6,
    },
    uomOptionActive: { backgroundColor: t.primary, borderColor: t.primary },
    uomOptionText: { fontSize: 12, fontFamily: fonts.medium, color: t.ink, textAlign: "center" },
    uomOptionTextActive: { color: t.onGradient },
    gpMethodHint: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted },

    pickerField: {
      minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: t.inkMuted + "40",
      backgroundColor: t.primaryTint, paddingHorizontal: 14, paddingVertical: 10,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8,
    },
    pickerText: { flex: 1, fontSize: 13, fontFamily: fonts.regular, color: t.ink },
    pickerPlaceholder: { flex: 1, fontSize: 13, fontFamily: fonts.regular, color: t.inkMuted },
    pickerChevron: { fontSize: 15, color: t.primary },

    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    modalSheet: { backgroundColor: t.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "70%", paddingBottom: 24 },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    modalTitle: { fontSize: 14, fontFamily: fonts.bold, color: t.ink },
    modalClose: { fontSize: 14, fontFamily: fonts.bold, color: t.primary },
    modalList: { paddingHorizontal: 8 },
    modalOption: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderLeftWidth: 3, marginVertical: 1 },
    modalOptionActive: { backgroundColor: t.primaryTint },
    modalOptionText: { fontSize: 12, fontFamily: fonts.regular, color: t.ink },
    modalEmpty: { padding: 24, textAlign: "center", color: t.inkMuted, fontSize: 13 },

    metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    metricCard: { flexBasis: "47%", flexGrow: 1, padding: 10, gap: 2 },
    metricLabel: { fontSize: 11, fontFamily: fonts.medium, color: t.inkSecondary },
    metricValue: { fontSize: 15, fontFamily: fonts.bold, color: t.ink },

    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    rowStrong: { backgroundColor: t.surfaceSunken, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: radius.sm },
    rowSmall: { paddingVertical: 7 },
    rowLeft: { flex: 1, gap: 2 },
    rowLabel: { fontSize: 13, fontFamily: fonts.regular, color: t.inkSecondary },
    rowLabelSmall: { fontSize: 12, color: t.inkMuted },
    rowLabelStrong: { fontSize: 13, fontFamily: fonts.bold, color: t.ink },
    rowDetail: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted },
    rowValue: { fontSize: 13, fontFamily: fonts.regular, color: t.inkSecondary, textAlign: "right" },
    rowBig: { fontSize: 15 },

    // Materials -- one card per line, switch + name on top, material
    // picker (or plain mapped text) below, a small detail strip, then the
    // line cost itself.
    lineRow: { gap: 6, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    lineTop: { flexDirection: "row", alignItems: "center", gap: 8 },
    lineName: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: t.ink },
    lineMapped: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary, marginLeft: 48 },
    materialPicker: {
      marginLeft: 48, minHeight: 36, borderRadius: 10, borderWidth: 1, borderColor: t.inkMuted + "30",
      backgroundColor: t.surfaceSunken, paddingHorizontal: 10, paddingVertical: 6,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6,
    },
    materialPickerText: { flex: 1, fontSize: 11, fontFamily: fonts.regular, color: t.ink },
    lineDetailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginLeft: 48 },
    lineDetailText: { fontSize: 10, fontFamily: fonts.regular, color: t.inkMuted },
    lineCostText: { fontSize: 12, fontFamily: fonts.bold, color: t.ink, marginLeft: 48 },
    lineCostSub: { fontSize: 10, fontFamily: fonts.regular, color: t.inkMuted },
    strikethrough: { textDecorationLine: "line-through", color: t.inkMuted },
    mutedText: { color: t.inkMuted },

    // Work Centres
    wcRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    wcLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    wcName: { flex: 1, fontSize: 12, fontFamily: fonts.regular, color: t.ink },
    wcValue: { fontSize: 12, fontFamily: fonts.bold, color: t.ink },

    placeholder: { padding: 16, textAlign: "center", fontSize: 13, fontFamily: fonts.regular, color: t.inkMuted },
    pad: { padding: 24 },

    poolBtn: { marginTop: 4 },
    poolSuccessText: { fontSize: 12, fontFamily: fonts.regular, color: t.success, textAlign: "center" },
    poolErrorText: { fontSize: 12, fontFamily: fonts.regular, color: t.danger, textAlign: "center" },

    calcBox: {
      gap: 0, marginTop: 4, borderRadius: radius.md, borderWidth: 1, borderColor: t.inkMuted + "30",
      backgroundColor: t.surfaceSunken, paddingHorizontal: 12, paddingTop: 2, paddingBottom: 4,
    },
    calcTitle: { fontSize: 11, fontFamily: fonts.bold, color: t.inkSecondary, paddingTop: 8, paddingBottom: 2 },

    gpEmptyState: { gap: 8, paddingVertical: 4 },
    useSuggestedBtn: {
      minHeight: 40, borderRadius: radius.md, borderWidth: 1.5, borderColor: t.primary,
      alignItems: "center", justifyContent: "center", paddingHorizontal: 12, backgroundColor: t.primaryTint,
    },
    useSuggestedBtnText: { fontSize: 12, fontFamily: fonts.bold, color: t.primary, textAlign: "center" },

    historyLink: { alignItems: "center", paddingVertical: 16 },
    historyLinkText: { fontSize: 13, fontFamily: fonts.medium, color: t.primary },
  });
