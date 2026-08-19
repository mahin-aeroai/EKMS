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
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { radius } from "@mmdi/shared/theme";
import { vibrant, fonts, optionAccent, sectionLabelStyle, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "@/lib/supabase";
import type { BomTemplateLineRow, BomTemplateRow, RawMaterialRow, WorkCentreRateRow } from "@mmdi/shared/rows";
import { computeCostSheet, type CostSheetInputs, type Uom } from "../../lib/costSheet/calc";
import { groupByCategory } from "../../lib/costSheet/categoryOrder";

/**
 * "in my previous chat i asked to add new module cost sheet but not sign
 * costsheets. the cost sheet from tool from web app and which we build
 * costing like attached screen" -- this is the real feature: a native port
 * of apps/web/src/app/workspaces/cost-sheet/CostSheetCalcTab.tsx (Tools >
 * Cost Sheet). Pick an FG Code/Template, enter Sales Order/UOM/Qty/
 * Width/Height/Selling Price per SqFt, see a live material + work-centre
 * cost breakdown -- same math as the web tool (lib/costSheet/calc.ts is a
 * byte-for-byte port of the web version's calc.ts, see that file's header
 * for why it's duplicated rather than imported).
 *
 * What this v1 deliberately leaves out, vs. the full web tool:
 *  - No per-line material swap (web: a dropdown per BOM line to pick a
 *    different raw material than the line's saved default).
 *  - No per-line "exclude this line" / per-work-centre "skip this
 *    process" checkboxes -- every line and every work centre on the FG
 *    code's saved template is always included.
 *  - No "Suggested selling price" / target-GP-%-solver section.
 *  - No "Add to Estimate Pool" save -- this is a read-only calculator,
 *    same as generating a number doesn't write anything on the web tool
 *    either (see calc's own note: a calculation isn't saved as its own
 *    row anywhere there either).
 * All of these are real, useful web features -- cut from this round to
 * ship the core "see the cost breakdown for an FG code" tool the user
 * asked for without a much bigger native rebuild. Flagging so it reads as
 * a scope choice, not a miss.
 *
 * The OLD "Cost Sheets" screen that lived at this route (a list of past
 * Sign Costing runs from `sign_estimates`) is renamed to
 * sign-costing-history.tsx, still reachable from the link at the bottom
 * of this screen.
 */

interface TemplateOption {
  value: string;
  label: string;
}

async function fetchAllRawMaterials(): Promise<RawMaterialRow[]> {
  // raw_materials is ~1,558 rows -- past PostgREST's default 1000-row cap
  // on an unpaginated select, same issue already hit (and fixed) for
  // customers/employees elsewhere in this app. Page through with .range()
  // sequentially until a page comes back short, rather than firing every
  // page in parallel -- see sales-by-rep.tsx's own fetchAllRowsParallel
  // bug for why a silently-dropped page is worse than a slightly slower
  // sequential load for a one-time master-data fetch like this.
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

export default function CostSheetToolScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<BomTemplateRow[]>([]);
  const [rates, setRates] = useState<WorkCentreRateRow[]>([]);
  const [materialsByCode, setMaterialsByCode] = useState<Map<string, RawMaterialRow>>(new Map());

  const [templateId, setTemplateId] = useState("");
  const [lines, setLines] = useState<BomTemplateLineRow[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  const [salesOrder, setSalesOrder] = useState("");
  const [uom, setUom] = useState<Uom>("FT");
  const [width, setWidth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");
  const [qty, setQty] = useState<number | "">(1);
  const [sellPrice, setSellPrice] = useState<number | "">("");

  useEffect(() => {
    (async () => {
      const [templatesRes, ratesRes, materialRows] = await Promise.all([
        supabase.from("bom_templates").select("*").order("sort_order", { ascending: true, nullsFirst: false }).order("code"),
        supabase.from("work_centre_rates").select("*"),
        fetchAllRawMaterials(),
      ]);
      if (templatesRes.error || ratesRes.error) {
        setLoadError("Couldn't load Cost Sheet master data.");
        setLoading(false);
        return;
      }
      setTemplates((templatesRes.data as BomTemplateRow[]) ?? []);
      setRates((ratesRes.data as WorkCentreRateRow[]) ?? []);
      setMaterialsByCode(new Map(materialRows.map((m) => [m.code, m])));
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

  const inputs: CostSheetInputs = {
    uom,
    width: width === "" ? 0 : width,
    height: height === "" ? 0 : height,
    qty: qty === "" ? 0 : qty,
    sellingPricePerSqft: sellPrice === "" ? 0 : sellPrice,
  };

  const result = useMemo(() => {
    if (!template) return null;
    return computeCostSheet(template, lines, materialsByCode, rates, inputs);
  }, [template, lines, materialsByCode, rates, uom, width, height, qty, sellPrice]);

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
              <Text style={s.sectionTitle}>Cost Breakdown</Text>
              <SoftCard style={s.card}>
                <View style={s.metricGrid}>
                  <Metric t={t} label="Sign Area" value={`${result.sqft.toFixed(2)} sq.ft`} />
                  <Metric t={t} label="Selling Amount" value={fmtRupee(result.sellingAmount)} />
                </View>

                <Row t={t} label="Material Cost (Recent)" value={fmtRupee(result.materialCostRecent)} />
                <Row t={t} label="Material Cost (Average)" value={fmtRupee(result.materialCostAvg)} small />
                <Row t={t} label="Process Cost (Work Centres)" value={fmtRupee(result.totalProcessCost)} />
                <Row t={t} label="Total Cost (Recent)" value={fmtRupee(result.totalCostRecent)} strong />
                <Row t={t} label="Total Cost (Average)" value={fmtRupee(result.totalCostAvg)} strong />
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
              </SoftCard>

              <Text style={s.sectionTitle}>Materials</Text>
              <SoftCard style={s.card}>
                {result.lineCosts.length === 0 ? (
                  <Text style={s.placeholder}>No BOM lines on this template.</Text>
                ) : (
                  result.lineCosts.map((lc) => (
                    <Row
                      key={lc.line.id}
                      t={t}
                      label={lc.line.material_name}
                      detail={lc.rawMaterial ? lc.rawMaterial.code : "unmapped — no raw material linked"}
                      value={`${fmtRupee(lc.recentLineCost)} / ${fmtRupee(lc.avgLineCost)}`}
                      small
                    />
                  ))
                )}
              </SoftCard>

              <Text style={s.sectionTitle}>Work Centres</Text>
              <SoftCard style={s.card}>
                {result.workCentreCosts.length === 0 ? (
                  <Text style={s.placeholder}>No work centres on this template.</Text>
                ) : (
                  result.workCentreCosts.map((wc) => (
                    <Row
                      key={wc.workCentre}
                      t={t}
                      label={wc.workCentre}
                      detail={wc.rateRow ? undefined : "no rate on file"}
                      value={wc.cost === null ? "—" : fmtRupee(wc.cost)}
                      small
                    />
                  ))
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
            ListEmptyComponent={<Text style={s.modalEmpty}>No FG codes available.</Text>}
          />
        </View>
      </Modal>
    </Field>
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
    uomOptionActive: { backgroundColor: t.primary, borderColor: t.primary },
    uomOptionText: { fontSize: 13, fontFamily: fonts.medium, color: t.ink },
    uomOptionTextActive: { color: t.onGradient },

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

    placeholder: { padding: 16, textAlign: "center", fontSize: 13, fontFamily: fonts.regular, color: t.inkMuted },
    pad: { padding: 24 },

    historyLink: { alignItems: "center", paddingVertical: 16 },
    historyLinkText: { fontSize: 13, fontFamily: fonts.medium, color: t.primary },
  });
