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
  useColorScheme,
} from "react-native";
import { useHeaderHeight } from "expo-router/react-navigation";
import { themes, radius, type Theme } from "@mmdi/shared/theme";
import type {
  SignProfileRow, SignLedModuleRow, SignLedBarRow, SignLedDriverRow,
  SignSheetRow, SignPrintingMediaRow, SignAccessoryRow,
} from "@mmdi/shared/rows";
import {
  CutOpt, SheetCalc, LEDCalc, DriverOpt, computeAccessoryDefaults, computePrint, computePricing,
  toMM, fmtRupee, type AccessoryLine, type CutBin,
} from "@mmdi/shared/sign-estimator/calc";
import { supabase } from "../../lib/supabase";

/**
 * Mirrors apps/web/src/app/workspaces/sign-estimator/EstimatorTab.tsx: same
 * 6-step flow, same master-data queries, same calc.ts calls -- only the
 * rendering is native. Every number below is produced by
 * packages/shared/src/sign-estimator/calc.ts, unmodified.
 *
 * Phone-specific choices the web version didn't need:
 *  - A sticky footer (outside the ScrollView, inside KeyboardAvoidingView)
 *    keeps the running Final Amount and Back/Next visible above the
 *    keyboard at all times -- the whole point of a cost estimator is to
 *    watch the total move as you type.
 *  - All numeric fields use a decimal-pad keyboard.
 *  - No fixed `height` on anything that contains text (buttons, inputs,
 *    cards, rows) -- `minHeight` only, so Dynamic Type can grow them.
 *  - HTML <select> has no native equivalent, so profile/sheet/LED/media
 *    pickers open as a bottom-sheet-style Modal with a scrollable list
 *    instead of a dropdown.
 */

const STEP_LABELS = ["Sign Type", "Dimensions", "Materials", "LED Config", "Printing", "Pricing"];

const CATEGORY_OPTIONS = [
  { value: "nonlit", label: "Non-Lit Sign", desc: "Non-Lit SEG frame — Profile, backing sheet, printing. No LED." },
  { value: "seg-indoor", label: "SEG / Backlit Indoor", desc: "Backlit SEG Indoor — LED modules or bars + driver + SEG fabric." },
  { value: "backlit-outdoor", label: "Backlit Outdoor", desc: "Backlit Outdoor — Heavy outdoor SEG profile. IP65+ LEDs mandatory." },
  { value: "outdoor-illum", label: "Outdoor Illuminated", desc: "Outdoor Illuminated — Heavy-duty outdoor frame, IP65/67 LED bars, waterproof drivers." },
] as const;

// UI-only constants (not calc logic) -- duplicated from
// apps/web/src/app/workspaces/sign-estimator/types.ts since that file lives
// inside apps/web and isn't shared. calc.ts itself is untouched.
const CATEGORY_LABELS: Record<string, string> = {
  nonlit: "Non-Lit Sign",
  "seg-indoor": "Backlit SEG Indoor",
  "backlit-outdoor": "Backlit Outdoor",
  "outdoor-illum": "Outdoor Illuminated",
};
const CATEGORY_TO_PROFILE_CATEGORY: Record<string, "nonlit" | "seg-indoor" | "seg-outdoor"> = {
  nonlit: "nonlit",
  "seg-indoor": "seg-indoor",
  "backlit-outdoor": "seg-outdoor",
  "outdoor-illum": "seg-outdoor",
};

interface Masters {
  profiles: SignProfileRow[];
  ledMods: SignLedModuleRow[];
  ledBars: SignLedBarRow[];
  drivers: SignLedDriverRow[];
  sheets: SignSheetRow[];
  printing: SignPrintingMediaRow[];
  accMaster: SignAccessoryRow[];
}

export default function EstimatorScreen() {
  const scheme = useColorScheme();
  const t = themes[scheme === "dark" ? "dark" : "light"];
  const s = styles(t);
  // The real, measured height of this tab's native header -- KeyboardAvoidingView's
  // own frame starts below it, so "padding" behavior needs this as
  // keyboardVerticalOffset to compute the correct overlap with the keyboard.
  // A guessed constant here would be wrong on any device with a different
  // status bar / Dynamic Type header height than whatever it was eyeballed on.
  const headerHeight = useHeaderHeight();

  const [step, setStep] = useState(1);
  const [masters, setMasters] = useState<Masters | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedRef, setSavedRef] = useState<string | null>(null);

  // ── Step 1 ──
  const [jobName, setJobName] = useState("");
  const [qty, setQty] = useState(1);
  const [category, setCategory] = useState("");
  const [profileId, setProfileId] = useState("");

  // ── Step 2 ──
  const [unit, setUnit] = useState<"mm" | "feet" | "inches">("mm");
  const [w, setW] = useState<number | "">("");
  const [h, setH] = useState<number | "">("");

  // ── Step 3 ──
  const [sheetId, setSheetId] = useState("");
  const [sheetWaste, setSheetWaste] = useState<number | "">("");
  const [sheetCost, setSheetCost] = useState<number | "">("");
  const [accOverrides, setAccOverrides] = useState<Record<string, { qty: number; unitCost: number }>>({});
  const [customAccs] = useState<AccessoryLine[]>([]);

  // ── Step 4 ──
  const [ledMode, setLedMode] = useState<"module" | "bar">("module");
  const [ledModId, setLedModId] = useState("");
  const [modMargin, setModMargin] = useState<number | "">(30);
  const [modHGap, setModHGap] = useState<number | "">("");
  const [modVGap, setModVGap] = useState<number | "">("");
  const [modCost, setModCost] = useState<number | "">("");
  const [ledBarId, setLedBarId] = useState("");
  const [barGap, setBarGap] = useState<number | "">(100);
  const [barMargin, setBarMargin] = useState<number | "">(50);
  const [barCost, setBarCost] = useState<number | "">("");
  const [safetyPct, setSafetyPct] = useState<number | "">(25);
  const [maxLoadPct, setMaxLoadPct] = useState<number | "">(80);
  const [drvWattOverride, setDrvWattOverride] = useState<number | "">("");
  const [drvQtyOverride, setDrvQtyOverride] = useState<number | "">("");
  const [drvCostOverride, setDrvCostOverride] = useState<number | "">("");

  // ── Step 5 ──
  const [mediaId, setMediaId] = useState("");
  const [bleed, setBleed] = useState<number | "">(30);
  const [printWaste, setPrintWaste] = useState<number | "">("");
  const [printCost, setPrintCost] = useState<number | "">("");
  const [finSeg, setFinSeg] = useState(false);
  const [finHem, setFinHem] = useState(false);
  const [finEye, setFinEye] = useState(false);
  const [finWeld, setFinWeld] = useState(false);
  const [finStitch, setFinStitch] = useState(false);
  const [segRate, setSegRate] = useState<number | "">(35);
  const [hemRate, setHemRate] = useState<number | "">(120);
  const [finRate, setFinRate] = useState<number | "">(80);

  // ── Step 6 ──
  const [labour, setLabour] = useState<number | "">(0);
  const [install, setInstall] = useState<number | "">(0);
  const [overheadPct, setOverheadPct] = useState<number | "">(10);
  const [markupPct, setMarkupPct] = useState<number | "">(30);
  const [discountPct, setDiscountPct] = useState<number | "">(0);
  const [gstPct, setGstPct] = useState<number | "">(18);
  const [printSellOverride, setPrintSellOverride] = useState<number | "">("");

  useEffect(() => {
    let cancelled = false;
    async function loadMasters() {
      const [profiles, ledMods, ledBars, drivers, sheets, printing, accMaster] = await Promise.all([
        supabase.from("sign_profiles").select("*").eq("active", true),
        supabase.from("sign_led_modules").select("*").eq("active", true),
        supabase.from("sign_led_bars").select("*").eq("active", true),
        supabase.from("sign_led_drivers").select("*").eq("active", true),
        supabase.from("sign_sheets").select("*").eq("active", true),
        supabase.from("sign_printing_media").select("*").eq("active", true),
        supabase.from("sign_accessories").select("*").eq("active", true),
      ]);
      if (cancelled) return;
      setMasters({
        profiles: (profiles.data as SignProfileRow[]) ?? [],
        ledMods: (ledMods.data as SignLedModuleRow[]) ?? [],
        ledBars: (ledBars.data as SignLedBarRow[]) ?? [],
        drivers: (drivers.data as SignLedDriverRow[]) ?? [],
        sheets: (sheets.data as SignSheetRow[]) ?? [],
        printing: (printing.data as SignPrintingMediaRow[]) ?? [],
        accMaster: (accMaster.data as SignAccessoryRow[]) ?? [],
      });
    }
    loadMasters().catch(() => !cancelled && setLoadError("Couldn't load estimator master data."));
    return () => {
      cancelled = true;
    };
  }, []);

  const numOr0 = (v: number | "") => (v === "" ? 0 : v);

  const wMM = w === "" ? 0 : toMM(w, unit);
  const hMM = h === "" ? 0 : toMM(h, unit);
  const isLit = category !== "" && category !== "nonlit";
  const profile = masters?.profiles.find((p) => p.id === profileId) ?? null;
  const profilesForCategory = useMemo(() => {
    if (!masters || !category) return [];
    const catKey = CATEGORY_TO_PROFILE_CATEGORY[category];
    return masters.profiles.filter((p) => p.category === catKey);
  }, [masters, category]);

  const accessories: AccessoryLine[] = useMemo(() => {
    if (!masters || !wMM || !hMM) return [];
    const stockLen = profile?.stock_len ?? 4000;
    const autoDefaults = computeAccessoryDefaults(wMM, hMM, stockLen, masters.accMaster);
    const merged = autoDefaults.map((fresh) => {
      const ov = accOverrides[fresh.id];
      return ov ? { ...fresh, qty: ov.qty, unitCost: ov.unitCost, locked: true } : fresh;
    });
    return [...merged, ...customAccs];
  }, [masters, wMM, hMM, profile?.stock_len, accOverrides, customAccs]);

  function setAccessoryQty(row: AccessoryLine, qty: number) {
    setAccOverrides((prev) => ({ ...prev, [row.id]: { qty, unitCost: prev[row.id]?.unitCost ?? row.unitCost } }));
  }
  function setAccessoryCost(row: AccessoryLine, unitCost: number) {
    setAccOverrides((prev) => ({ ...prev, [row.id]: { qty: prev[row.id]?.qty ?? row.qty, unitCost } }));
  }

  const profResult = useMemo(() => {
    if (!profile || !wMM || !hMM) return null;
    const members = [
      { length: wMM, label: "Width 1" },
      { length: wMM, label: "Width 2" },
      { length: hMM, label: "Height 1" },
      { length: hMM, label: "Height 2" },
    ];
    const bins = CutOpt.packMembers(members, profile.stock_len);
    const analysis = CutOpt.analyse(bins, profile.stock_len, profile.cost);
    return { bins, analysis };
  }, [profile, wMM, hMM]);

  const sheet = masters?.sheets.find((sh) => sh.id === sheetId) ?? null;
  const sheetResult = useMemo(() => {
    if (!sheet || !wMM || !hMM) return null;
    return SheetCalc.calc(wMM, hMM, sheet, sheetWaste === "" ? null : sheetWaste, sheetCost === "" ? null : sheetCost);
  }, [sheet, wMM, hMM, sheetWaste, sheetCost]);

  const accCost = accessories.reduce((sum, a) => sum + a.qty * a.unitCost, 0);

  const ledMod = masters?.ledMods.find((m) => m.id === ledModId) ?? null;
  const ledBar = masters?.ledBars.find((b) => b.id === ledBarId) ?? null;

  const moduleResult = useMemo(() => {
    if (!isLit || ledMode !== "module" || !ledMod || !wMM || !hMM) return null;
    return LEDCalc.calcModules(wMM, hMM, ledMod, numOr0(modMargin), modHGap === "" ? 0 : modHGap, modVGap === "" ? 0 : modVGap);
  }, [isLit, ledMode, ledMod, wMM, hMM, modMargin, modHGap, modVGap]);

  const barResult = useMemo(() => {
    if (!isLit || ledMode !== "bar" || !ledBar || !wMM || !hMM) return null;
    return LEDCalc.calcBars(wMM, hMM, ledBar, numOr0(barGap), numOr0(barMargin));
  }, [isLit, ledMode, ledBar, wMM, hMM, barGap, barMargin]);

  const ledCost = useMemo(() => {
    if (ledMode === "module" && moduleResult && ledMod) {
      const unitCost = modCost === "" ? ledMod.cost : modCost;
      return Math.round(moduleResult.total * unitCost);
    }
    if (ledMode === "bar" && barResult && ledBar) {
      const unitCost = barCost === "" ? ledBar.cost : barCost;
      return Math.round(barResult.totalPieces * unitCost);
    }
    return 0;
  }, [ledMode, moduleResult, ledMod, modCost, barResult, ledBar, barCost]);

  const totalWatt = ledMode === "module" ? moduleResult?.watt ?? 0 : barResult?.watt ?? 0;

  const driverResult = useMemo(() => {
    if (!isLit || !masters || !totalWatt) return null;
    return DriverOpt.optimise(totalWatt, numOr0(safetyPct), numOr0(maxLoadPct), masters.drivers);
  }, [isLit, masters, totalWatt, safetyPct, maxLoadPct]);

  const driverFinal = useMemo(() => {
    if (!driverResult) return null;
    const watt = drvWattOverride === "" ? driverResult.selected[0]?.drv.watt ?? 0 : drvWattOverride;
    const qtyD = drvQtyOverride === "" ? driverResult.selected.reduce((sum, x) => sum + x.qty, 0) : drvQtyOverride;
    const unitCost = drvCostOverride === "" ? driverResult.selected[0]?.drv.cost ?? 0 : drvCostOverride;
    const totalCap = watt * qtyD;
    return {
      watt,
      qty: qtyD,
      unitCost,
      totalCost: Math.round(qtyD * unitCost),
      util: totalCap > 0 ? +((totalWatt / totalCap) * 100).toFixed(1) : 0,
      isOverridden: drvWattOverride !== "" || drvQtyOverride !== "" || drvCostOverride !== "",
    };
  }, [driverResult, drvWattOverride, drvQtyOverride, drvCostOverride, totalWatt]);

  const media = masters?.printing.find((p) => p.id === mediaId) ?? null;
  const printResult = useMemo(() => {
    if (!media || !wMM || !hMM) return null;
    return computePrint(
      wMM, hMM, media, numOr0(bleed),
      printWaste === "" ? null : printWaste,
      printCost === "" ? null : printCost,
      isLit,
      { segBorder: finSeg, hemming: finHem, eyelets: finEye, welding: finWeld, stitching: finStitch },
      { segRatePerM: numOr0(segRate), hemFlat: numOr0(hemRate), otherFlat: numOr0(finRate) }
    );
  }, [media, wMM, hMM, bleed, printWaste, printCost, isLit, finSeg, finHem, finEye, finWeld, finStitch, segRate, hemRate, finRate]);

  const printSellDefault = Math.round((printResult?.printCost ?? 0) * qty);
  const printSell = printSellOverride === "" ? printSellDefault : printSellOverride;

  const pricing = useMemo(() => {
    return computePricing(
      {
        profCost: profResult?.analysis.totalCost ?? 0,
        sheetCost: sheetResult?.chargedCost ?? 0,
        accCost,
        ledCost,
        drvCost: driverFinal?.totalCost ?? 0,
      },
      printResult?.printCost ?? 0,
      printSell,
      numOr0(install),
      { qty, labour: numOr0(labour), overheadPct: numOr0(overheadPct), markupPct: numOr0(markupPct), discountPct: numOr0(discountPct), gstPct: numOr0(gstPct) }
    );
  }, [profResult, sheetResult, accCost, ledCost, driverFinal, printResult, printSell, install, qty, labour, overheadPct, markupPct, discountPct, gstPct]);

  const [stepError, setStepError] = useState<string | null>(null);
  function goStep(n: number) {
    if (n >= 2 && !category) { setStepError("Select a sign category first."); return; }
    if (n >= 3 && (!wMM || !hMM)) { setStepError("Enter width and height first."); return; }
    setStepError(null);
    setStep(n);
  }

  async function generateCostSheet() {
    if (!wMM || !hMM) { setStepError("Enter width and height first."); return; }
    setSaving(true);
    setStepError(null);
    const now = new Date();
    const ref = `QUOTE-${now.getFullYear()}-${String(now.getTime()).slice(-5)}`;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("sign_estimates").insert({
      ref,
      client: jobName || null,
      category,
      dim_w: w === "" ? 0 : w,
      dim_h: h === "" ? 0 : h,
      dim_unit: unit,
      width_mm: wMM,
      height_mm: hMM,
      qty,
      sell: pricing.sell,
      final_amount: pricing.final,
      margin: pricing.margin,
      calc: {
        category, categoryLabel: CATEGORY_LABELS[category] ?? category, jobName: jobName || "—",
        dimW: w === "" ? 0 : w, dimH: h === "" ? 0 : h, dimUnit: unit, widthMM: wMM, heightMM: hMM, qty,
      },
      created_by: userData?.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      setStepError(`Couldn't save estimate: ${error.message}`);
      return;
    }
    setSavedRef(ref);
  }

  if (loadError) {
    return (
      <View style={s.screen}>
        <View style={s.centerFill}>
          <Text style={s.alertText}>{loadError}</Text>
        </View>
      </View>
    );
  }

  if (!masters) {
    return (
      <View style={s.screen}>
        <View style={s.centerFill}>
          <ActivityIndicator color={t.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.stepBar} contentContainerStyle={s.stepBarContent}>
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          return (
            <Pressable key={label} onPress={() => goStep(n)} style={[s.stepChip, active && s.stepChipActive]}>
              <Text style={[s.stepChipText, active && s.stepChipTextActive]}>{n}. {label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={s.content} contentContainerStyle={s.contentInner} keyboardShouldPersistTaps="handled">
        {stepError && (
          <View style={s.alertBox}><Text style={s.alertText}>{stepError}</Text></View>
        )}

        {step >= 2 && (
          <SignSizeHeader
            t={t} w={w} h={h} unit={unit} onW={setW} onH={setH} onUnit={setUnit}
            sqft={wMM > 0 && hMM > 0 ? (wMM / 304.8) * (hMM / 304.8) : 0}
            rft={(wMM * 2 + hMM * 2) / 304.8}
          />
        )}

        {step === 1 && (
          <View style={s.stepGap}>
            <Field t={t} label="Job / Customer Name">
              <TextInput style={s.input} value={jobName} onChangeText={setJobName} placeholder="Optional" placeholderTextColor={t.inkMuted} />
            </Field>
            <NumberField t={t} label="Quantity" value={qty} onChange={(v) => setQty(v === "" ? 1 : v)} keyboardType="number-pad" />

            <Text style={s.sectionLabel}>Sign Category</Text>
            {CATEGORY_OPTIONS.map((c) => (
              <Pressable
                key={c.value}
                onPress={() => { setCategory(c.value); setProfileId(""); }}
                style={[s.optionCard, category === c.value && s.optionCardActive]}
              >
                <Text style={s.optionTitle}>{c.label}</Text>
                <Text style={s.optionDesc}>{c.desc}</Text>
              </Pressable>
            ))}

            {category !== "" && (
              <PickerField
                t={t}
                label="Aluminium Profile"
                value={profileId}
                onChange={setProfileId}
                placeholder="Select a profile"
                options={profilesForCategory.map((p) => ({ value: p.id, label: `${p.name} (${p.stock_len}mm stock · ₹${p.cost})` }))}
              />
            )}

            {isLit && (
              <>
                <Text style={s.sectionLabel}>LED Build Type</Text>
                {(["module", "bar"] as const).map((m) => (
                  <Pressable key={m} onPress={() => setLedMode(m)} style={[s.optionCard, ledMode === m && s.optionCardActive]}>
                    <Text style={s.optionTitle}>{m === "module" ? "LED Modules" : "LED Bars (Vertical)"}</Text>
                    <Text style={s.optionDesc}>
                      {m === "module" ? "Grid of LED modules across the sign face." : "Vertical strips — industry-standard for outdoor drainage."}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        )}

        {step === 2 && wMM > 0 && hMM > 0 && (
          <View style={s.metricGrid}>
            <Metric t={t} label="Width (mm)" value={Math.round(wMM).toString()} />
            <Metric t={t} label="Height (mm)" value={Math.round(hMM).toString()} />
            <Metric t={t} label="Area" value={`${((wMM / 304.8) * (hMM / 304.8)).toFixed(2)} sq.ft`} />
            <Metric t={t} label="Perimeter" value={`${((wMM * 2 + hMM * 2) / 1000).toFixed(2)} m`} />
          </View>
        )}

        {step === 3 && (
          <View style={s.stepGap}>
            <Text style={s.sectionTitle}>Profile Costing (Fabrication-Planned)</Text>
            {!profile ? (
              <View style={s.alertBox}><Text style={s.alertText}>No profile selected — go back to Sign Type.</Text></View>
            ) : profResult ? (
              <>
                <View style={s.metricGrid}>
                  <Metric t={t} label="Stock Bars Used" value={String(profResult.analysis.totalBars)} sub={`${(profile.stock_len / 1000).toFixed(1)}m × ₹${profile.cost}`} />
                  <Metric t={t} label="Utilisation" value={`${profResult.analysis.util.toFixed(1)}%`} />
                  <Metric t={t} label="Reusable Offcut" value={`${(profResult.analysis.reusable / 1000).toFixed(2)}m`} />
                  <Metric t={t} label="Scrap Cost" value={fmtRupee(profResult.analysis.scrapCost)} />
                </View>
                <CuttingBins t={t} bins={profResult.bins} stockLen={profile.stock_len} />
                <Text style={s.totalLine}>Profile total: {fmtRupee(profResult.analysis.totalCost)}</Text>
              </>
            ) : (
              <View style={s.alertBox}><Text style={s.alertText}>Enter dimensions first.</Text></View>
            )}

            <Text style={s.sectionTitle}>Backing Sheet</Text>
            <PickerField
              t={t} label="Sheet Material" value={sheetId} onChange={setSheetId} placeholder="Select a sheet"
              options={masters.sheets.map((sh) => ({ value: sh.id, label: `${sh.name} (${sh.width}×${sh.height}mm · ₹${sh.cost_per_sheet}/sheet)` }))}
            />
            {sheetId !== "" && (
              <View style={s.fieldRow}>
                <View style={s.fieldHalf}><NumberField t={t} label="Wastage % Override" value={sheetWaste} onChange={setSheetWaste} /></View>
                <View style={s.fieldHalf}><NumberField t={t} label="Cost/Sheet Override (₹)" value={sheetCost} onChange={setSheetCost} /></View>
              </View>
            )}
            {sheetResult && (
              <View style={s.metricGrid}>
                <Metric t={t} label="Sign Area" value={`${sheetResult.sigSqFt} sq.ft`} />
                <Metric t={t} label={`Wastage (${sheetResult.wPct}%)`} value={`${sheetResult.wasteArea.toFixed(2)} sq.ft`} />
                <Metric t={t} label="Chargeable Area" value={`${sheetResult.chargeable.toFixed(2)} sq.ft`} />
                <Metric t={t} label="Sheet Cost" value={fmtRupee(sheetResult.chargedCost)} />
              </View>
            )}

            <Text style={s.sectionTitle}>Accessories</Text>
            {accessories.length === 0 ? (
              <View style={s.alertBox}><Text style={s.alertText}>Accessories master is empty, or dimensions haven't been entered yet.</Text></View>
            ) : (
              <>
                {accessories.map((a) => (
                  <View key={a.id} style={s.accRow}>
                    <View style={s.accRowHead}>
                      <Text style={s.accName}>{a.name}{a.mandatory ? " •" : ""}</Text>
                      <Text style={s.accUnit}>{a.unit}</Text>
                    </View>
                    <View style={s.fieldRow}>
                      <View style={s.fieldHalf}><NumberField t={t} label="Qty" value={a.qty} onChange={(v) => setAccessoryQty(a, v === "" ? 0 : v)} /></View>
                      <View style={s.fieldHalf}><NumberField t={t} label="Unit Cost (₹)" value={a.unitCost} onChange={(v) => setAccessoryCost(a, v === "" ? 0 : v)} /></View>
                    </View>
                    <Text style={s.accLineTotal}>{fmtRupee(a.qty * a.unitCost)}</Text>
                  </View>
                ))}
                <Text style={s.totalLine}>Accessories total: {fmtRupee(accCost)}</Text>
              </>
            )}
          </View>
        )}

        {step === 4 && (
          <View style={s.stepGap}>
            {!isLit ? (
              <View style={s.alertBox}><Text style={s.alertText}>This sign category is non-lit — no LED configuration needed.</Text></View>
            ) : (
              <>
                <Text style={s.sectionTitle}>{ledMode === "module" ? "LED Modules" : "LED Bars (Vertical)"}</Text>
                {ledMode === "module" ? (
                  <>
                    <PickerField
                      t={t} label="LED Module" value={ledModId} onChange={setLedModId} placeholder="Select a module"
                      options={masters.ledMods.map((m) => ({ value: m.id, label: `${m.name} (${m.mod_w}×${m.mod_h}mm · ${m.watt}W · ₹${m.cost})` }))}
                    />
                    <View style={s.fieldRow}>
                      <View style={s.fieldHalf}><NumberField t={t} label="Edge Margin (mm)" value={modMargin} onChange={setModMargin} /></View>
                      <View style={s.fieldHalf}><NumberField t={t} label="Cost/Module Override (₹)" value={modCost} onChange={setModCost} /></View>
                    </View>
                    <View style={s.fieldRow}>
                      <View style={s.fieldHalf}><NumberField t={t} label="H-Gap Override (mm)" value={modHGap} onChange={setModHGap} /></View>
                      <View style={s.fieldHalf}><NumberField t={t} label="V-Gap Override (mm)" value={modVGap} onChange={setModVGap} /></View>
                    </View>
                    {moduleResult ? (
                      <View style={s.metricGrid}>
                        <Metric t={t} label="Columns" value={String(moduleResult.cols)} />
                        <Metric t={t} label="Rows" value={String(moduleResult.rows)} />
                        <Metric t={t} label="Total Modules" value={String(moduleResult.total)} />
                        <Metric t={t} label="Total Wattage" value={`${moduleResult.watt}W`} />
                        <Metric t={t} label="LED Cost" value={fmtRupee(ledCost)} />
                      </View>
                    ) : ledModId ? <View style={s.alertBox}><Text style={s.alertText}>Sign too small for this margin — reduce edge margin.</Text></View> : null}
                  </>
                ) : (
                  <>
                    <PickerField
                      t={t} label="LED Bar" value={ledBarId} onChange={setLedBarId} placeholder="Select a bar"
                      options={masters.ledBars.map((b) => ({ value: b.id, label: `${b.name} (${b.bar_len}mm · ${b.watt}W · ₹${b.cost})` }))}
                    />
                    <View style={s.fieldRow}>
                      <View style={s.fieldHalf}><NumberField t={t} label="Gap Between Bars (mm)" value={barGap} onChange={setBarGap} /></View>
                      <View style={s.fieldHalf}><NumberField t={t} label="Edge Margin (mm)" value={barMargin} onChange={setBarMargin} /></View>
                    </View>
                    <NumberField t={t} label="Cost/Piece Override (₹)" value={barCost} onChange={setBarCost} />
                    {barResult ? (
                      <View style={s.metricGrid}>
                        <Metric t={t} label="Vertical Bars" value={String(barResult.numBars)} />
                        <Metric t={t} label="Pieces/Column" value={String(barResult.piecesPerCol)} sub={`${ledBar?.bar_len}mm stock`} />
                        <Metric t={t} label="Total Pieces" value={String(barResult.totalPieces)} />
                        <Metric t={t} label="Total Wattage" value={`${barResult.watt}W`} />
                        <Metric t={t} label="Bar Cost" value={fmtRupee(ledCost)} />
                      </View>
                    ) : ledBarId ? <View style={s.alertBox}><Text style={s.alertText}>Sign too narrow for this margin.</Text></View> : null}
                  </>
                )}

                {totalWatt > 0 && (
                  <>
                    <Text style={s.sectionTitle}>LED Driver</Text>
                    <View style={s.fieldRow}>
                      <View style={s.fieldHalf}><NumberField t={t} label="Safety Buffer %" value={safetyPct} onChange={setSafetyPct} /></View>
                      <View style={s.fieldHalf}><NumberField t={t} label="Max Driver Load %" value={maxLoadPct} onChange={setMaxLoadPct} /></View>
                    </View>
                    {driverResult ? (
                      <>
                        <Text style={s.helperText}>
                          LED load {totalWatt}W → +{numOr0(safetyPct)}% buffer: {driverResult.required}W → auto-selected: {driverResult.totalCap}W
                          {driverFinal?.isOverridden ? " (overridden below)" : ""}
                        </Text>
                        <View style={s.fieldRow}>
                          <View style={s.fieldHalf}><NumberField t={t} label="Driver Watt Override" value={drvWattOverride} onChange={setDrvWattOverride} /></View>
                          <View style={s.fieldHalf}><NumberField t={t} label="Qty Override" value={drvQtyOverride} onChange={setDrvQtyOverride} /></View>
                        </View>
                        <NumberField t={t} label="Cost/Driver Override (₹)" value={drvCostOverride} onChange={setDrvCostOverride} />
                        <View style={s.metricGrid}>
                          <Metric t={t} label="Driver" value={`${driverFinal?.watt ?? 0}W`} sub={drvWattOverride !== "" ? "manual override" : driverResult.selected[0]?.drv.brand ?? ""} />
                          <Metric t={t} label="Quantity" value={String(driverFinal?.qty ?? 0)} />
                          <Metric t={t} label="Load %" value={`${driverFinal?.util ?? 0}%`} />
                          <Metric t={t} label="Driver Cost" value={fmtRupee(driverFinal?.totalCost ?? 0)} />
                        </View>
                        {(driverFinal?.util ?? 0) > 85 && <View style={s.alertBox}><Text style={s.alertText}>Driver loading above 85% — consider the next size up.</Text></View>}
                      </>
                    ) : <View style={s.alertBox}><Text style={s.alertText}>No active drivers in master, or no LED wattage yet.</Text></View>}
                  </>
                )}
              </>
            )}
          </View>
        )}

        {step === 5 && (
          <View style={s.stepGap}>
            <PickerField
              t={t} label="Print Media" value={mediaId} onChange={setMediaId} placeholder="Select a media"
              options={masters.printing.map((p) => ({ value: p.id, label: `${p.name} (₹${p.cost_per_sqft}/sq.ft)` }))}
            />
            <View style={s.fieldRow}>
              <View style={s.fieldHalf}><NumberField t={t} label="Bleed (mm)" value={bleed} onChange={setBleed} /></View>
              <View style={s.fieldHalf}><NumberField t={t} label="Waste % Override" value={printWaste} onChange={setPrintWaste} /></View>
            </View>
            <NumberField t={t} label="Printing Rate (₹/sq.ft) — editable" value={printCost} onChange={setPrintCost} />

            <Text style={s.sectionLabel}>Finishing</Text>
            {isLit && <CheckField t={t} label="SEG Silicone Border" checked={finSeg} onChange={setFinSeg} />}
            <CheckField t={t} label="Hemming / Heat-seal" checked={finHem} onChange={setFinHem} />
            <CheckField t={t} label="Eyelets" checked={finEye} onChange={setFinEye} />
            <CheckField t={t} label="Welding" checked={finWeld} onChange={setFinWeld} />
            <CheckField t={t} label="Stitching" checked={finStitch} onChange={setFinStitch} />

            {(finSeg || finHem || finEye || finWeld || finStitch) && (
              <>
                {isLit && finSeg && <NumberField t={t} label="SEG Border Rate (₹/m)" value={segRate} onChange={setSegRate} />}
                {finHem && <NumberField t={t} label="Hemming Flat Rate (₹)" value={hemRate} onChange={setHemRate} />}
                {(finEye || finWeld || finStitch) && <NumberField t={t} label="Eyelets/Welding/Stitching Flat Rate (₹)" value={finRate} onChange={setFinRate} />}
              </>
            )}

            {printResult && (
              <>
                <Row t={t} label={`Print area (incl. ${numOr0(bleed)}mm bleed)`} detail={`${printResult.printSqFt} sq.ft chargeable`} value={fmtRupee(printResult.printCost - printResult.finishingCost)} />
                {printResult.finLines.map((f, i) => (
                  <Row key={i} t={t} label={f.label} detail={f.detail} value={fmtRupee(f.cost)} />
                ))}
                <Row t={t} label="Total Print & Finishing" value={fmtRupee(printResult.printCost)} strong />
              </>
            )}
          </View>
        )}

        {step === 6 && (
          <View style={s.stepGap}>
            <Text style={s.sectionLabel}>Signage cost-plus terms</Text>
            <View style={s.fieldRow}>
              <View style={s.fieldHalf}><NumberField t={t} label="Labour (₹)" value={labour} onChange={setLabour} /></View>
              <View style={s.fieldHalf}><NumberField t={t} label="Overhead %" value={overheadPct} onChange={setOverheadPct} /></View>
            </View>
            <View style={s.fieldRow}>
              <View style={s.fieldHalf}><NumberField t={t} label="Markup %" value={markupPct} onChange={setMarkupPct} /></View>
              <View style={s.fieldHalf}><NumberField t={t} label="Discount %" value={discountPct} onChange={setDiscountPct} /></View>
            </View>

            <Text style={s.sectionLabel}>Printing & Installation are sold separately — post the final price directly.</Text>
            <NumberField
              t={t}
              label={printSellOverride === "" ? "Printing Selling Price (₹) — suggested" : "Printing Selling Price (₹)"}
              value={printSellOverride === "" ? printSellDefault : printSellOverride}
              onChange={setPrintSellOverride}
            />
            <NumberField t={t} label="Installation Selling Price (₹)" value={install} onChange={setInstall} />

            <NumberField t={t} label="GST %" value={gstPct} onChange={setGstPct} />

            <Text style={s.sectionTitle}>Cost Sheet</Text>
            <Row t={t} label="Profile" detail={profResult ? `${(profResult.analysis.totalUsed / 304.8).toFixed(1)} RFT · ${profResult.analysis.totalBars} bar(s)` : ""} value={fmtRupee(profResult?.analysis.totalCost ?? 0)} />
            <Row t={t} label="Backing Sheet" detail={sheetResult ? `${sheetResult.chargeable.toFixed(2)} sq.ft` : ""} value={fmtRupee(sheetResult?.chargedCost ?? 0)} />
            <Row t={t} label="Accessories" detail={`${accessories.filter((a) => a.qty > 0).length} item(s)`} value={fmtRupee(accCost)} />
            <Row
              t={t}
              label={`LED ${ledMode === "bar" ? "Bars" : "Modules"}`}
              detail={ledMode === "bar" && barResult ? `${barResult.totalPieces} pieces · ${barResult.numBars} bar(s)` : ledMode === "module" && moduleResult ? `${moduleResult.total} modules` : ""}
              value={fmtRupee(ledCost)}
            />
            <Row t={t} label="LED Drivers" detail={driverFinal ? `${driverFinal.qty} × ${driverFinal.watt}W` : ""} value={fmtRupee(driverFinal?.totalCost ?? 0)} />
            <Row t={t} label="Raw Material Cost — Signage (per sign)" value={fmtRupee(pricing.raw)} strong />
            <Row t={t} label={`Overhead (${numOr0(overheadPct)}%)`} value={fmtRupee(pricing.ovh)} />
            <Row t={t} label="Labour" value={fmtRupee(numOr0(labour))} />
            {qty > 1 && <Row t={t} label={`Quantity (× ${qty})`} value={`× ${qty}`} />}
            <Row t={t} label="Signage Production Cost" value={fmtRupee(pricing.costAll)} strong />
            <Row t={t} label={`Markup (${numOr0(markupPct)}%)`} value={fmtRupee(pricing.sellBD - pricing.costAll)} />
            {pricing.discAmt > 0 && <Row t={t} label={`Discount (${numOr0(discountPct)}%)`} value={`−${fmtRupee(pricing.discAmt)}`} />}
            <Row t={t} label="Signage Selling Price (ex-GST)" value={fmtRupee(pricing.signageSell)} strong />
            <Row t={t} label="Printing & Finishing (cost reference)" detail={printResult ? `${printResult.printSqFt} sq.ft — not used in pricing` : ""} value={fmtRupee(pricing.printCostRef)} />
            <Row t={t} label="Printing Selling Price (ex-GST)" value={fmtRupee(pricing.printSell)} strong />
            <Row t={t} label="Installation Selling Price (ex-GST)" value={fmtRupee(pricing.installSell)} strong />
            <Row t={t} label="Total Selling Price (ex-GST)" value={fmtRupee(pricing.sell)} strong big />
            <Row t={t} label={`GST ${numOr0(gstPct)}%`} value={fmtRupee(pricing.gstAmt)} />
            <Row t={t} label="Final Amount (incl. GST)" value={fmtRupee(pricing.final)} strong big />
            <Row t={t} label="Gross Margin" value={`${pricing.margin}% (${fmtRupee(pricing.mgnAmt)})`} />

            {savedRef && (
              <View style={s.successBox}><Text style={s.successText}>Cost sheet {savedRef} saved.</Text></View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={s.footer}>
        <View style={s.footerTotal}>
          <Text style={s.footerTotalLabel}>Est. Final Amount</Text>
          <Text style={s.footerTotalValue}>{fmtRupee(pricing.final)}</Text>
        </View>
        <View style={s.footerButtons}>
          {step > 1 && (
            <Pressable style={s.navBtnSecondary} onPress={() => goStep(step - 1)}>
              <Text style={s.navBtnSecondaryText}>Back</Text>
            </Pressable>
          )}
          {step < 6 ? (
            <Pressable style={s.navBtnPrimary} onPress={() => goStep(step + 1)}>
              <Text style={s.navBtnPrimaryText}>Next</Text>
            </Pressable>
          ) : (
            <Pressable style={s.navBtnPrimary} onPress={generateCostSheet} disabled={saving}>
              {saving ? <ActivityIndicator color={t.onBrand} /> : <Text style={s.navBtnPrimaryText}>Generate Cost Sheet</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Shared small field components ───────────────────────────────────────

function Field({ t, label, children }: { t: Theme; label: string; children: React.ReactNode }) {
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
  t: Theme; label: string; value: number | ""; onChange: (v: number | "") => void; keyboardType?: "decimal-pad" | "number-pad";
}) {
  const s = styles(t);
  // Local text buffer, not re-derived from `value` on every keystroke -- a
  // controlled input that reformats "12." back to "12" mid-typing would
  // make it impossible to ever type a decimal. Remounting (e.g. a fresh
  // accessory row's `key`) re-initialises this from the prop correctly.
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
  t: Theme; label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
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
            renderItem={({ item }) => (
              <Pressable
                style={[s.modalOption, item.value === value && s.modalOptionActive]}
                onPress={() => { onChange(item.value); setOpen(false); }}
              >
                <Text style={s.modalOptionText}>{item.label}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={s.modalEmpty}>No options available.</Text>}
          />
        </View>
      </Modal>
    </Field>
  );
}

function CheckField({ t, label, checked, onChange }: { t: Theme; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const s = styles(t);
  return (
    <View style={s.switchRow}>
      <Text style={s.switchLabel}>{label}</Text>
      <Switch value={checked} onValueChange={onChange} trackColor={{ false: t.line, true: t.primaryTint }} thumbColor={checked ? t.primary : undefined} />
    </View>
  );
}

function Metric({ t, label, value, sub }: { t: Theme; label: string; value: string; sub?: string }) {
  const s = styles(t);
  return (
    <View style={s.metricCard}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue}>{value}</Text>
      {sub ? <Text style={s.metricSub}>{sub}</Text> : null}
    </View>
  );
}

function Row({ t, label, detail, value, strong, big }: { t: Theme; label: string; detail?: string; value: string; strong?: boolean; big?: boolean }) {
  const s = styles(t);
  return (
    <View style={[s.row, strong && s.rowStrong]}>
      <View style={s.rowLeft}>
        <Text style={[s.rowLabel, strong && s.rowLabelStrong, big && s.rowBig]}>{label}</Text>
        {detail ? <Text style={s.rowDetail}>{detail}</Text> : null}
      </View>
      <Text style={[s.rowValue, strong && s.rowLabelStrong, big && s.rowBig]}>{value}</Text>
    </View>
  );
}

/** Sticky Width/Height/Unit editor shown on every step from Dimensions onward. */
function SignSizeHeader({
  t, w, h, unit, onW, onH, onUnit, sqft, rft,
}: {
  t: Theme; w: number | ""; h: number | ""; unit: "mm" | "feet" | "inches";
  onW: (v: number | "") => void; onH: (v: number | "") => void; onUnit: (v: "mm" | "feet" | "inches") => void;
  sqft: number; rft: number;
}) {
  const s = styles(t);
  const [unitOpen, setUnitOpen] = useState(false);
  const units: ("mm" | "feet" | "inches")[] = ["mm", "feet", "inches"];
  return (
    <View style={s.sizeHeader}>
      <View style={s.sizeHeaderRow}>
        <View style={s.sizeField}>
          <Text style={s.sizeLabel}>Width</Text>
          <SmallNumberInput t={t} value={w} onChange={onW} />
        </View>
        <Text style={s.sizeTimes}>×</Text>
        <View style={s.sizeField}>
          <Text style={s.sizeLabel}>Height</Text>
          <SmallNumberInput t={t} value={h} onChange={onH} />
        </View>
        <View style={s.sizeField}>
          <Text style={s.sizeLabel}>Unit</Text>
          <Pressable style={s.unitPicker} onPress={() => setUnitOpen(true)}>
            <Text style={s.unitPickerText}>{unit}</Text>
          </Pressable>
        </View>
      </View>
      {sqft > 0 && (
        <View style={s.sizeHeaderRow}>
          <View style={s.sizeStat}><Text style={s.sizeStatLabel}>Sign Area</Text><Text style={s.sizeStatValue}>{sqft.toFixed(2)} sq.ft</Text></View>
          <View style={s.sizeStat}><Text style={s.sizeStatLabel}>Frame RFT</Text><Text style={s.sizeStatValue}>{rft.toFixed(1)} ft</Text></View>
        </View>
      )}
      <Modal visible={unitOpen} transparent animationType="fade" onRequestClose={() => setUnitOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setUnitOpen(false)} />
        <View style={s.modalSheetSmall}>
          {units.map((u) => (
            <Pressable key={u} style={[s.modalOption, u === unit && s.modalOptionActive]} onPress={() => { onUnit(u); setUnitOpen(false); }}>
              <Text style={s.modalOptionText}>{u}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

function SmallNumberInput({ t, value, onChange }: { t: Theme; value: number | ""; onChange: (v: number | "") => void }) {
  const s = styles(t);
  const [text, setText] = useState(value === "" ? "" : String(value));
  return (
    <TextInput
      style={s.sizeInput}
      value={text}
      onChangeText={(raw) => {
        setText(raw);
        if (raw === "" || raw === "-") { onChange(""); return; }
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(n);
      }}
      keyboardType="decimal-pad"
      placeholder="0"
      placeholderTextColor={t.inkMuted}
    />
  );
}

/** Simplified cutting-plan bar: one proportional-width row per stock bar. */
function CuttingBins({ t, bins, stockLen }: { t: Theme; bins: CutBin[]; stockLen: number }) {
  const s = styles(t);
  if (bins.length === 0) return null;
  const colorFor = (label: string) => (/^width/i.test(label) ? t.info : /^height/i.test(label) ? t.success : t.inkMuted);
  return (
    <View style={s.cuttingWrap}>
      {bins.map((bin, i) => (
        <View key={i} style={s.cuttingBin}>
          <View style={s.cuttingBinHead}>
            <Text style={s.cuttingBinLabel}>Stock {i + 1}</Text>
            <Text style={s.cuttingBinSub}>{(bin.used / stockLen * 100).toFixed(0)}% used · {(bin.remaining / 1000).toFixed(2)}m left</Text>
          </View>
          <View style={s.cuttingBar}>
            {bin.cutDetails.map((cut, j) => (
              <View
                key={j}
                style={[
                  s.cuttingSegment,
                  { flexGrow: cut.length, backgroundColor: colorFor(cut.label), opacity: cut.fromOffcut ? 0.6 : 1 },
                ]}
              >
                <Text style={s.cuttingSegmentText} numberOfLines={1}>{(cut.length / 1000).toFixed(2)}m{cut.fromOffcut ? "*" : ""}</Text>
              </View>
            ))}
            {bin.remaining > 1 && <View style={[s.cuttingSegment, s.cuttingLeftover, { flexGrow: bin.remaining }]} />}
          </View>
        </View>
      ))}
      <Text style={s.cuttingLegend}>* reused offcut, not fresh stock</Text>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },

    stepBar: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    stepBarContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    stepChip: { minHeight: 32, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, justifyContent: "center" },
    stepChipActive: { backgroundColor: t.primaryTint, borderColor: t.primary },
    stepChipText: { fontSize: 13, fontWeight: "500", color: t.inkSecondary },
    stepChipTextActive: { color: t.primary },

    content: { flex: 1 },
    contentInner: { padding: 16, paddingBottom: 32, gap: 16 },
    stepGap: { gap: 16 },

    sectionTitle: { fontSize: 17, fontWeight: "600", color: t.ink, marginTop: 4 },
    sectionLabel: { fontSize: 13, fontWeight: "500", color: t.inkSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
    helperText: { fontSize: 13, color: t.inkSecondary },
    totalLine: { fontSize: 15, fontWeight: "600", color: t.ink },

    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: "500", color: t.inkSecondary },
    input: {
      minHeight: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line,
      backgroundColor: t.surfaceSunken, paddingHorizontal: 14, paddingVertical: 10, fontSize: 17, color: t.ink,
    },
    fieldRow: { flexDirection: "row", gap: 12 },
    fieldHalf: { flex: 1 },

    optionCard: { minHeight: 44, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, padding: 12, gap: 4 },
    optionCardActive: { borderColor: t.primary, backgroundColor: t.primaryTint },
    optionTitle: { fontSize: 15, fontWeight: "600", color: t.ink },
    optionDesc: { fontSize: 13, color: t.inkSecondary },

    pickerField: {
      minHeight: 44, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line,
      backgroundColor: t.surfaceSunken, paddingHorizontal: 14, paddingVertical: 10,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8,
    },
    pickerText: { flex: 1, fontSize: 16, color: t.ink },
    pickerPlaceholder: { flex: 1, fontSize: 16, color: t.inkMuted },
    pickerChevron: { fontSize: 16, color: t.inkMuted },

    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    modalSheet: { backgroundColor: t.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "70%", paddingBottom: 24 },
    modalSheetSmall: { position: "absolute", top: "40%", left: 24, right: 24, backgroundColor: t.surfaceRaised, borderRadius: radius.lg, overflow: "hidden" },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    modalTitle: { fontSize: 15, fontWeight: "600", color: t.ink },
    modalClose: { fontSize: 15, fontWeight: "600", color: t.primary },
    modalList: { paddingHorizontal: 8 },
    modalOption: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md },
    modalOptionActive: { backgroundColor: t.primaryTint },
    modalOptionText: { fontSize: 15, color: t.ink },
    modalEmpty: { padding: 24, textAlign: "center", color: t.inkMuted, fontSize: 14 },

    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, gap: 12 },
    switchLabel: { fontSize: 15, color: t.ink, flex: 1 },

    metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    metricCard: { flexBasis: "47%", flexGrow: 1, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, padding: 10, gap: 2 },
    metricLabel: { fontSize: 12, color: t.inkSecondary },
    metricValue: { fontSize: 16, fontWeight: "600", color: t.ink },
    metricSub: { fontSize: 11, color: t.inkMuted },

    alertBox: { borderRadius: radius.md, backgroundColor: t.warningTint, padding: 12 },
    alertText: { fontSize: 14, color: t.warning },
    successBox: { borderRadius: radius.md, backgroundColor: t.successTint, padding: 12 },
    successText: { fontSize: 14, color: t.success, fontWeight: "600" },

    accRow: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, padding: 12, gap: 10 },
    accRowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    accName: { fontSize: 15, fontWeight: "500", color: t.ink, flex: 1 },
    accUnit: { fontSize: 13, color: t.inkSecondary },
    accLineTotal: { fontSize: 14, fontWeight: "600", color: t.ink, textAlign: "right" },

    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    rowStrong: { backgroundColor: t.surfaceSunken, marginHorizontal: -16, paddingHorizontal: 16, borderRadius: radius.sm },
    rowLeft: { flex: 1, gap: 2 },
    rowLabel: { fontSize: 14, color: t.inkSecondary },
    rowLabelStrong: { fontSize: 14, fontWeight: "600", color: t.ink },
    rowDetail: { fontSize: 12, color: t.inkMuted },
    rowValue: { fontSize: 14, color: t.inkSecondary, textAlign: "right" },
    rowBig: { fontSize: 17 },

    sizeHeader: { borderRadius: radius.lg, backgroundColor: t.surfaceSunken, padding: 12, gap: 10 },
    sizeHeaderRow: { flexDirection: "row", alignItems: "flex-end", gap: 16, flexWrap: "wrap" },
    sizeField: { gap: 4 },
    sizeLabel: { fontSize: 11, fontWeight: "500", color: t.inkMuted, textTransform: "uppercase", letterSpacing: 0.3 },
    sizeInput: { minHeight: 36, minWidth: 64, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: t.lineStrong, backgroundColor: t.surface, paddingHorizontal: 10, fontSize: 15, color: t.ink },
    sizeTimes: { fontSize: 15, color: t.inkMuted, paddingBottom: 8 },
    unitPicker: { minHeight: 36, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: t.lineStrong, backgroundColor: t.surface, paddingHorizontal: 10, justifyContent: "center" },
    unitPickerText: { fontSize: 15, color: t.ink },
    sizeStat: { gap: 2 },
    sizeStatLabel: { fontSize: 11, fontWeight: "500", color: t.inkMuted, textTransform: "uppercase", letterSpacing: 0.3 },
    sizeStatValue: { fontSize: 14, fontWeight: "600", color: t.ink },

    cuttingWrap: { gap: 10 },
    cuttingBin: { gap: 4 },
    cuttingBinHead: { flexDirection: "row", justifyContent: "space-between" },
    cuttingBinLabel: { fontSize: 13, fontWeight: "600", color: t.ink },
    cuttingBinSub: { fontSize: 12, color: t.inkSecondary },
    cuttingBar: { flexDirection: "row", minHeight: 32, borderRadius: radius.sm, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: t.line },
    cuttingSegment: { minHeight: 32, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.5)" },
    cuttingSegmentText: { fontSize: 10, fontWeight: "600", color: t.onBrand, paddingHorizontal: 2 },
    cuttingLeftover: { backgroundColor: t.surface, borderStyle: "dashed", borderWidth: 1, borderColor: t.lineStrong },
    cuttingLegend: { fontSize: 11, color: t.inkMuted },

    footer: {
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, backgroundColor: t.surfaceRaised,
      paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 10 : 14, gap: 10,
    },
    footerTotal: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    footerTotalLabel: { fontSize: 13, color: t.inkSecondary },
    footerTotalValue: { fontSize: 20, fontWeight: "700", color: t.ink },
    footerButtons: { flexDirection: "row", gap: 10 },
    navBtnPrimary: { flex: 1, minHeight: 46, borderRadius: radius.md, backgroundColor: t.primary, alignItems: "center", justifyContent: "center" },
    navBtnPrimaryText: { fontSize: 16, fontWeight: "600", color: t.onBrand },
    navBtnSecondary: { minHeight: 46, paddingHorizontal: 18, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, alignItems: "center", justifyContent: "center" },
    navBtnSecondaryText: { fontSize: 16, fontWeight: "600", color: t.ink },
  });
