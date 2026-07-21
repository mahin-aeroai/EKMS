"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import type {
  SignProfileRow, SignLedModuleRow, SignLedBarRow, SignLedDriverRow,
  SignSheetRow, SignPrintingMediaRow, SignAccessoryRow,
} from "@/lib/supabase";
import {
  CutOpt, SheetCalc, LEDCalc, DriverOpt, computeAccessoryDefaults, computePrint, computePricing,
  toMM, fmtRupee, type AccessoryLine, type CutBin,
} from "@/lib/sign-estimator/calc";
import { CATEGORY_LABELS, CATEGORY_TO_PROFILE_CATEGORY, type EstimateSnapshot } from "./types";

const STEP_LABELS = ["Sign Type", "Dimensions", "Materials", "LED Config", "Printing", "Pricing"];

const CATEGORY_OPTIONS = [
  { value: "nonlit", label: "Non-Lit Sign", desc: "Non-Lit SEG frame — Profile, backing sheet, printing. No LED." },
  { value: "seg-indoor", label: "SEG / Backlit Indoor", desc: "Backlit SEG Indoor — LED modules or bars + driver + SEG fabric." },
  { value: "backlit-outdoor", label: "Backlit Outdoor", desc: "Backlit Outdoor — Heavy outdoor SEG profile. IP65+ LEDs mandatory." },
  { value: "outdoor-illum", label: "Outdoor Illuminated", desc: "Outdoor Illuminated — Heavy-duty outdoor frame, IP65/67 LED bars, waterproof drivers." },
];

interface Masters {
  profiles: SignProfileRow[];
  ledMods: SignLedModuleRow[];
  ledBars: SignLedBarRow[];
  drivers: SignLedDriverRow[];
  sheets: SignSheetRow[];
  printing: SignPrintingMediaRow[];
  accMaster: SignAccessoryRow[];
}

export function EstimatorTab({ onSaved }: { onSaved?: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [masters, setMasters] = useState<Masters | null>(null);
  const [saving, setSaving] = useState(false);

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
  // Accessory quantities/costs are DERIVED (via useMemo below) from the
  // master list + dimensions, not stored directly in state -- only the
  // user's manual overrides and any custom rows they add are state. This
  // avoids syncing computed data into state via a useEffect (which the
  // React hooks lint rule flags as cascading-render-prone); see the
  // `accessories` useMemo for where these are merged back in.
  const [accOverrides, setAccOverrides] = useState<Record<string, { qty: number; unitCost: number }>>({});
  const [customAccs, setCustomAccs] = useState<AccessoryLine[]>([]);

  // ── Step 4 ──
  const [ledMode, setLedMode] = useState<"module" | "bar">("module");
  const [ledModId, setLedModId] = useState("");
  const [modMargin, setModMargin] = useState(30);
  const [modHGap, setModHGap] = useState<number | "">("");
  const [modVGap, setModVGap] = useState<number | "">("");
  const [modCost, setModCost] = useState<number | "">("");
  const [ledBarId, setLedBarId] = useState("");
  const [barGap, setBarGap] = useState(100);
  const [barMargin, setBarMargin] = useState(50);
  const [barCost, setBarCost] = useState<number | "">("");
  const [safetyPct, setSafetyPct] = useState(25);
  const [maxLoadPct, setMaxLoadPct] = useState(80);
  // Manual overrides on top of the auto-selected driver (DriverOpt.optimise)
  // -- "" means "use the auto-calculated value". Lets the shop correct the
  // auto-pick when real-world constraints (stock on hand, derating, etc.)
  // differ from the theoretical smallest-driver-above-threshold answer.
  const [drvWattOverride, setDrvWattOverride] = useState<number | "">("");
  const [drvQtyOverride, setDrvQtyOverride] = useState<number | "">("");
  const [drvCostOverride, setDrvCostOverride] = useState<number | "">("");

  // ── Step 5 ──
  const [mediaId, setMediaId] = useState("");
  const [bleed, setBleed] = useState(30);
  const [printWaste, setPrintWaste] = useState<number | "">("");
  const [printCost, setPrintCost] = useState<number | "">("");
  const [finSeg, setFinSeg] = useState(false);
  const [finHem, setFinHem] = useState(false);
  const [finEye, setFinEye] = useState(false);
  const [finWeld, setFinWeld] = useState(false);
  const [finStitch, setFinStitch] = useState(false);
  const [segRate, setSegRate] = useState(35);
  const [hemRate, setHemRate] = useState(120);
  const [finRate, setFinRate] = useState(80);

  // ── Step 6 ──
  const [labour, setLabour] = useState(0);
  const [install, setInstall] = useState(0);
  const [overheadPct, setOverheadPct] = useState(10);
  const [markupPct, setMarkupPct] = useState(30);
  const [discountPct, setDiscountPct] = useState(0);
  const [gstPct, setGstPct] = useState(18);

  useEffect(() => {
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
    loadMasters().catch(() => toast("danger", "Couldn't load estimator master data"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wMM = w === "" ? 0 : toMM(w, unit);
  const hMM = h === "" ? 0 : toMM(h, unit);
  const isLit = category !== "" && category !== "nonlit";
  const profile = masters?.profiles.find((p) => p.id === profileId) ?? null;
  const profilesForCategory = useMemo(() => {
    if (!masters || !category) return [];
    const catKey = CATEGORY_TO_PROFILE_CATEGORY[category];
    return masters.profiles.filter((p) => p.category === catKey);
  }, [masters, category]);

  // Accessory list: auto-computed qty/cost per master row, with any manual
  // override the user typed in layered on top, plus custom rows appended.
  // Pure derivation (no effect) -- recomputes whenever dims/profile/masters
  // change, and a manual override always wins over the freshly computed
  // auto-quantity for that row.
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
    if (row.custom) {
      setCustomAccs((prev) => prev.map((a) => (a.id === row.id ? { ...a, qty } : a)));
    } else {
      setAccOverrides((prev) => ({ ...prev, [row.id]: { qty, unitCost: prev[row.id]?.unitCost ?? row.unitCost } }));
    }
  }
  function setAccessoryCost(row: AccessoryLine, unitCost: number) {
    if (row.custom) {
      setCustomAccs((prev) => prev.map((a) => (a.id === row.id ? { ...a, unitCost } : a)));
    } else {
      setAccOverrides((prev) => ({ ...prev, [row.id]: { qty: prev[row.id]?.qty ?? row.qty, unitCost } }));
    }
  }

  const profResult = useMemo(() => {
    if (!profile || !wMM || !hMM) return null;
    const cuts = [wMM, wMM, hMM, hMM];
    // Labelled per-member (not just a flat [w,w,h,h] array) so the cutting
    // diagram below can colour Width cuts differently from Height cuts.
    const members = [
      { length: wMM, label: "Width 1" },
      { length: wMM, label: "Width 2" },
      { length: hMM, label: "Height 1" },
      { length: hMM, label: "Height 2" },
    ];
    const bins = CutOpt.packMembers(members, profile.stock_len);
    const analysis = CutOpt.analyse(bins, profile.stock_len, profile.cost);
    return { bins, analysis, cuts };
  }, [profile, wMM, hMM]);

  const sheet = masters?.sheets.find((s) => s.id === sheetId) ?? null;
  const sheetResult = useMemo(() => {
    if (!sheet || !wMM || !hMM) return null;
    return SheetCalc.calc(wMM, hMM, sheet, sheetWaste === "" ? null : sheetWaste, sheetCost === "" ? null : sheetCost);
  }, [sheet, wMM, hMM, sheetWaste, sheetCost]);

  const accCost = accessories.reduce((s, a) => s + a.qty * a.unitCost, 0);

  const ledMod = masters?.ledMods.find((m) => m.id === ledModId) ?? null;
  const ledBar = masters?.ledBars.find((b) => b.id === ledBarId) ?? null;

  const moduleResult = useMemo(() => {
    if (!isLit || ledMode !== "module" || !ledMod || !wMM || !hMM) return null;
    return LEDCalc.calcModules(wMM, hMM, ledMod, modMargin, modHGap === "" ? 0 : modHGap, modVGap === "" ? 0 : modVGap);
  }, [isLit, ledMode, ledMod, wMM, hMM, modMargin, modHGap, modVGap]);

  const barResult = useMemo(() => {
    if (!isLit || ledMode !== "bar" || !ledBar || !wMM || !hMM) return null;
    return LEDCalc.calcBars(wMM, hMM, ledBar, barGap, barMargin);
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
    return DriverOpt.optimise(totalWatt, safetyPct, maxLoadPct, masters.drivers);
  }, [isLit, masters, totalWatt, safetyPct, maxLoadPct]);

  // Auto-picked driver, with any manual override layered on top -- this is
  // what pricing/snapshot/UI should read from everywhere, so an override
  // takes effect consistently instead of only in the Step 4 metrics.
  const driverFinal = useMemo(() => {
    if (!driverResult) return null;
    const watt = drvWattOverride === "" ? driverResult.selected[0]?.drv.watt ?? 0 : drvWattOverride;
    const qty = drvQtyOverride === "" ? driverResult.selected.reduce((s, x) => s + x.qty, 0) : drvQtyOverride;
    const unitCost = drvCostOverride === "" ? driverResult.selected[0]?.drv.cost ?? 0 : drvCostOverride;
    const totalCap = watt * qty;
    return {
      watt,
      qty,
      unitCost,
      totalCost: Math.round(qty * unitCost),
      util: totalCap > 0 ? +((totalWatt / totalCap) * 100).toFixed(1) : 0,
      isOverridden: drvWattOverride !== "" || drvQtyOverride !== "" || drvCostOverride !== "",
    };
  }, [driverResult, drvWattOverride, drvQtyOverride, drvCostOverride, totalWatt]);

  const media = masters?.printing.find((p) => p.id === mediaId) ?? null;
  const printResult = useMemo(() => {
    if (!media || !wMM || !hMM) return null;
    return computePrint(
      wMM, hMM, media, bleed,
      printWaste === "" ? null : printWaste,
      printCost === "" ? null : printCost,
      isLit,
      { segBorder: finSeg, hemming: finHem, eyelets: finEye, welding: finWeld, stitching: finStitch },
      { segRatePerM: segRate, hemFlat: hemRate, otherFlat: finRate }
    );
  }, [media, wMM, hMM, bleed, printWaste, printCost, isLit, finSeg, finHem, finEye, finWeld, finStitch, segRate, hemRate, finRate]);

  const pricing = useMemo(() => {
    return computePricing(
      {
        profCost: profResult?.analysis.totalCost ?? 0,
        sheetCost: sheetResult?.chargedCost ?? 0,
        accCost,
        ledCost,
        drvCost: driverFinal?.totalCost ?? 0,
        printCost: printResult?.printCost ?? 0,
      },
      { qty, labour, install, overheadPct, markupPct, discountPct, gstPct }
    );
  }, [profResult, sheetResult, accCost, ledCost, driverFinal, printResult, qty, labour, install, overheadPct, markupPct, discountPct, gstPct]);

  function goStep(n: number) {
    if (n >= 2 && !category) { toast("danger", "Select a sign category first."); return; }
    if (n >= 3 && (!wMM || !hMM)) { toast("danger", "Enter width and height first."); return; }
    setStep(n);
  }

  function buildSnapshot(): EstimateSnapshot {
    return {
      category,
      categoryLabel: CATEGORY_LABELS[category] ?? category,
      jobName: jobName || "—",
      dimW: w === "" ? 0 : w,
      dimH: h === "" ? 0 : h,
      dimUnit: unit,
      widthMM: wMM,
      heightMM: hMM,
      qty,
      profile: profile && profResult ? {
        name: profile.name, widthMM: wMM, heightMM: hMM, stockLenMM: profile.stock_len,
        barsRequired: profResult.analysis.totalBars, utilPct: +profResult.analysis.util.toFixed(1),
        scrapCost: Math.round(profResult.analysis.scrapCost), cost: Math.round(profResult.analysis.totalCost),
      } : null,
      sheet: sheet && sheetResult ? {
        name: sheet.name, signSqFt: sheetResult.sigSqFt, wastePct: sheetResult.wPct,
        chargeableSqFt: sheetResult.chargeable, costPerSqFt: sheetResult.cpSqFt, cost: sheetResult.chargedCost,
      } : null,
      accessories: accessories.filter((a) => a.qty > 0).map((a) => ({
        name: a.name, qty: a.qty, unit: a.unit, unitCost: a.unitCost, lineCost: Math.round(a.qty * a.unitCost),
      })),
      led: isLit && ledMode === "module" && moduleResult && ledMod
        ? { mode: "module", modelName: ledMod.name, cols: moduleResult.cols, rows: moduleResult.rows, count: moduleResult.total, watt: moduleResult.watt, cost: ledCost }
        : isLit && ledMode === "bar" && barResult && ledBar
        ? { mode: "bar", modelName: ledBar.name, numBars: barResult.numBars, piecesPerCol: barResult.piecesPerCol, totalPieces: barResult.totalPieces, watt: barResult.watt, cost: ledCost }
        : null,
      driver: driverFinal ? {
        requiredW: driverResult?.required ?? 0, count: driverFinal.qty,
        driverWatt: driverFinal.watt, utilPct: driverFinal.util, cost: driverFinal.totalCost,
      } : null,
      print: media && printResult ? {
        mediaName: media.name, sqFt: printResult.printSqFt, costPerSqFt: printResult.printCostPerSqFt,
        finishingLabel: printResult.finishingLabel, cost: printResult.printCost,
      } : null,
      pricing: {
        raw: pricing.raw, ovh: pricing.ovh, ovhPct: overheadPct, labour, install,
        costPer: pricing.costPer, costAll: pricing.costAll, sellBD: pricing.sellBD,
        markupPct, discPct: discountPct, discAmt: pricing.discAmt, sell: pricing.sell,
        gstPct, gstAmt: pricing.gstAmt, final: pricing.final, margin: pricing.margin, mgnAmt: pricing.mgnAmt,
      },
    };
  }

  async function generateCostSheet() {
    if (!wMM || !hMM) { toast("danger", "Enter width and height first."); return; }
    setSaving(true);
    const now = new Date();
    const ref = `QUOTE-${now.getFullYear()}-${String(now.getTime()).slice(-5)}`;
    const snapshot = buildSnapshot();
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
      calc: snapshot,
      created_by: userData?.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast("danger", `Couldn't save estimate: ${error.message}`);
      return;
    }
    toast("success", `Cost sheet ${ref} saved`);
    onSaved?.();
  }

  if (!masters) return <p className="py-8 text-center text-sm text-ink-muted">Loading estimator…</p>;

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => goStep(i + 1)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              step === i + 1 ? "border-primary bg-primary-tint text-primary" : "border-line text-ink-secondary hover:bg-surface-sunken"
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step >= 2 && (
        <SignSizeHeader
          w={w} h={h} unit={unit}
          onW={setW} onH={setH} onUnit={(v) => setUnit(v)}
          sqft={wMM > 0 && hMM > 0 ? (wMM / 304.8) * (hMM / 304.8) : 0}
          rft={(wMM * 2 + hMM * 2) / 304.8}
          sheetLine={sheetResult ? `${sheetResult.chargeable.toFixed(2)} sq.ft · ${fmtRupee(sheetResult.chargedCost)}` : null}
        />
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Job / Customer Name" value={jobName} onChange={setJobName} />
            <NumberField label="Quantity" value={qty} onChange={(v) => setQty(v || 1)} />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-ink-secondary">Sign Category</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CATEGORY_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => { setCategory(c.value); setProfileId(""); }}
                  className={`rounded-lg border p-3 text-left ${category === c.value ? "border-primary bg-primary-tint" : "border-line hover:bg-surface-sunken"}`}
                >
                  <div className="text-sm font-medium text-ink">{c.label}</div>
                  <div className="mt-0.5 text-xs text-ink-secondary">{c.desc}</div>
                </button>
              ))}
            </div>
          </div>
          {category && (
            <SelectField
              label="Aluminium Profile"
              value={profileId}
              onChange={setProfileId}
              options={profilesForCategory.map((p) => ({ value: p.id, label: `${p.name} (${p.stock_len}mm stock · ₹${p.cost})` }))}
            />
          )}
          {isLit && (
            <div>
              <label className="mb-2 block text-xs font-medium text-ink-secondary">LED Build Type</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(["module", "bar"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setLedMode(m)}
                    className={`rounded-lg border p-3 text-left ${ledMode === m ? "border-primary bg-primary-tint" : "border-line hover:bg-surface-sunken"}`}
                  >
                    <div className="text-sm font-medium text-ink">{m === "module" ? "LED Modules" : "LED Bars (Vertical)"}</div>
                    <div className="mt-0.5 text-xs text-ink-secondary">
                      {m === "module" ? "Grid of LED modules across the sign face." : "Vertical strips — industry-standard for outdoor drainage."}
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Only the selected build type&apos;s fields will appear in Step 4 — Materials for the other type are hidden.
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => goStep(2)}>Next: Dimensions</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NumberField label="Width" value={w} onChange={setW} />
            <NumberField label="Height" value={h} onChange={setH} />
            <SelectField label="Unit" value={unit} onChange={(v) => setUnit(v as "mm" | "feet" | "inches")} options={[{ value: "mm", label: "mm" }, { value: "feet", label: "feet" }, { value: "inches", label: "inches" }]} />
          </div>
          {wMM > 0 && hMM > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Width (mm)" value={Math.round(wMM).toString()} />
              <Metric label="Height (mm)" value={Math.round(hMM).toString()} />
              <Metric label="Area" value={`${((wMM / 304.8) * (hMM / 304.8)).toFixed(2)} sq.ft`} />
              <Metric label="Perimeter" value={`${((wMM * 2 + hMM * 2) / 1000).toFixed(2)} m`} />
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => goStep(1)}>Back</Button>
            <Button onClick={() => goStep(3)}>Next: Materials</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Profile Costing (Fabrication-Planned)</h3>
            {!profile ? (
              <Alert>No profile selected — go back to Step 1.</Alert>
            ) : profResult ? (
              <div>
                <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Stock Bars Used" value={String(profResult.analysis.totalBars)} sub={`${(profile.stock_len / 1000).toFixed(1)}m × ₹${profile.cost}`} />
                  <Metric label="Utilisation" value={`${profResult.analysis.util.toFixed(1)}%`} />
                  <Metric label="Reusable Offcut" value={`${(profResult.analysis.reusable / 1000).toFixed(2)}m`} />
                  <Metric label="Scrap Cost" value={fmtRupee(profResult.analysis.scrapCost)} />
                </div>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-sunken text-xs text-ink-secondary">
                      <tr><th className="p-2 text-left">Stock Bar</th><th className="p-2 text-left">Cuts Placed</th><th className="p-2 text-right">Used</th><th className="p-2 text-right">Leftover</th></tr>
                    </thead>
                    <tbody>
                      {profResult.bins.map((bin, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="p-2">Stock {i + 1}</td>
                          <td className="p-2">{bin.cuts.map((c) => `${(c / 1000).toFixed(2)}m`).join(" + ")}</td>
                          <td className="p-2 text-right">{((bin.used / profile.stock_len) * 100).toFixed(0)}%</td>
                          <td className="p-2 text-right">{(bin.remaining / 1000).toFixed(2)}m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-sm font-medium text-ink">Profile total: {fmtRupee(profResult.analysis.totalCost)}</p>
                <CuttingDiagram bins={profResult.bins} stockLen={profile.stock_len} />
              </div>
            ) : (
              <Alert>Enter dimensions in Step 2 first.</Alert>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Backing Sheet</h3>
            <SelectField label="Sheet Material" value={sheetId} onChange={setSheetId} options={(masters.sheets ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.width}×${s.height}mm · ₹${s.cost_per_sheet}/sheet)` }))} />
            {sheetId && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField label="Wastage % Override" value={sheetWaste} onChange={setSheetWaste} />
                <NumberField label="Cost/Sheet Override (₹)" value={sheetCost} onChange={setSheetCost} />
              </div>
            )}
            {sheetResult && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Metric label="Sign Area" value={`${sheetResult.sigSqFt} sq.ft`} />
                <Metric label={`Wastage (${sheetResult.wPct}%)`} value={`${sheetResult.wasteArea.toFixed(2)} sq.ft`} />
                <Metric label="Chargeable Area" value={`${sheetResult.chargeable.toFixed(2)} sq.ft`} />
                <Metric label="Sheet Balance" value={`${sheetResult.balance.toFixed(2)} sq.ft`} />
                <Metric label="Sheet Cost" value={fmtRupee(sheetResult.chargedCost)} />
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Accessories</h3>
            {accessories.length === 0 ? (
              <Alert>Accessories master is empty, or dimensions haven&apos;t been entered yet.</Alert>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-sunken text-xs text-ink-secondary">
                    <tr><th className="p-2 text-left">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Unit</th><th className="p-2 text-right">Unit Cost</th><th className="p-2 text-right">Total</th></tr>
                  </thead>
                  <tbody>
                    {accessories.map((a) => (
                      <tr key={a.id} className="border-t border-line">
                        <td className="p-2">{a.name}{a.mandatory && <Badge status="info" dot>{""}</Badge>}</td>
                        <td className="p-2 text-right">
                          <input type="number" value={a.qty} min={0}
                            onChange={(e) => setAccessoryQty(a, Number(e.target.value) || 0)}
                            className="w-16 rounded border border-line-strong bg-surface px-2 py-1 text-right text-sm" />
                        </td>
                        <td className="p-2 text-ink-secondary">{a.unit}</td>
                        <td className="p-2 text-right">
                          <input type="number" value={a.unitCost} min={0}
                            onChange={(e) => setAccessoryCost(a, Number(e.target.value) || 0)}
                            className="w-20 rounded border border-line-strong bg-surface px-2 py-1 text-right text-sm" />
                        </td>
                        <td className="p-2 text-right font-medium">{fmtRupee(a.qty * a.unitCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line bg-surface-sunken font-medium">
                      <td className="p-2" colSpan={4}>Accessories Total</td>
                      <td className="p-2 text-right">{fmtRupee(accCost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => goStep(2)}>Back</Button>
            <Button onClick={() => goStep(4)}>Next: LED Config</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          {!isLit ? (
            <Alert>This sign category is non-lit — no LED configuration needed.</Alert>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h3 className="text-sm font-semibold text-ink">{ledMode === "module" ? "LED Modules" : "LED Bars (Vertical)"}</h3>
                <span className="text-xs text-ink-muted">
                  Build type set in Step 1 ·{" "}
                  <button onClick={() => goStep(1)} className="text-primary underline">change</button>
                </span>
              </div>

              {ledMode === "module" ? (
                <div className="space-y-3">
                  <SelectField label="LED Module" value={ledModId} onChange={setLedModId} options={masters.ledMods.map((m) => ({ value: m.id, label: `${m.name} (${m.mod_w}×${m.mod_h}mm · ${m.watt}W · ₹${m.cost})` }))} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <NumberField label="Edge Margin (mm)" value={modMargin} onChange={(v) => setModMargin(v || 0)} />
                    <NumberField label="H-Gap Override (mm)" value={modHGap} onChange={setModHGap} />
                    <NumberField label="V-Gap Override (mm)" value={modVGap} onChange={setModVGap} />
                    <NumberField label="Cost/Module Override (₹)" value={modCost} onChange={setModCost} />
                  </div>
                  {moduleResult ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <Metric label="Columns" value={String(moduleResult.cols)} />
                      <Metric label="Rows" value={String(moduleResult.rows)} />
                      <Metric label="Total Modules" value={String(moduleResult.total)} />
                      <Metric label="Total Wattage" value={`${moduleResult.watt}W`} />
                      <Metric label="LED Cost" value={fmtRupee(ledCost)} />
                    </div>
                  ) : ledModId ? <Alert>Sign too small for this margin — reduce edge margin.</Alert> : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <SelectField label="LED Bar" value={ledBarId} onChange={setLedBarId} options={masters.ledBars.map((b) => ({ value: b.id, label: `${b.name} (${b.bar_len}mm · ${b.watt}W · ₹${b.cost})` }))} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <NumberField label="Gap Between Bars (mm)" value={barGap} onChange={(v) => setBarGap(v || 0)} />
                    <NumberField label="Edge Margin (mm)" value={barMargin} onChange={(v) => setBarMargin(v || 0)} />
                    <NumberField label="Cost/Piece Override (₹)" value={barCost} onChange={setBarCost} />
                  </div>
                  {barResult ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      <Metric label="Vertical Bars" value={String(barResult.numBars)} />
                      <Metric label="Pieces/Column" value={String(barResult.piecesPerCol)} sub={`${ledBar?.bar_len}mm stock`} />
                      <Metric label="Total Pieces" value={String(barResult.totalPieces)} />
                      <Metric label="Total Wattage" value={`${barResult.watt}W`} />
                      <Metric label="Bar Cost" value={fmtRupee(ledCost)} />
                    </div>
                  ) : ledBarId ? <Alert>Sign too narrow for this margin.</Alert> : null}
                </div>
              )}

              {totalWatt > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-ink">LED Driver</h3>
                  <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <NumberField label="Safety Buffer %" value={safetyPct} onChange={(v) => setSafetyPct(v || 0)} />
                    <NumberField label="Max Driver Load %" value={maxLoadPct} onChange={(v) => setMaxLoadPct(v || 0)} />
                  </div>
                  {driverResult ? (
                    <div>
                      <p className="mb-2 text-xs text-ink-secondary">
                        LED load {totalWatt}W → +{safetyPct}% buffer: {driverResult.required}W → auto-selected: {driverResult.totalCap}W
                        {driverFinal?.isOverridden && " (overridden below)"}
                      </p>
                      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <NumberField label="Driver Watt Override" value={drvWattOverride} onChange={setDrvWattOverride} />
                        <NumberField label="Quantity Override" value={drvQtyOverride} onChange={setDrvQtyOverride} />
                        <NumberField label="Cost/Driver Override (₹)" value={drvCostOverride} onChange={setDrvCostOverride} />
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Metric label="Driver" value={`${driverFinal?.watt ?? 0}W`} sub={drvWattOverride !== "" ? "manual override" : driverResult.selected[0]?.drv.brand ?? ""} />
                        <Metric label="Quantity" value={String(driverFinal?.qty ?? 0)} />
                        <Metric label="Load %" value={`${driverFinal?.util ?? 0}%`} />
                        <Metric label="Driver Cost" value={fmtRupee(driverFinal?.totalCost ?? 0)} />
                      </div>
                      {(driverFinal?.util ?? 0) > 85 && <Alert>Driver loading above 85% — consider the next size up.</Alert>}
                    </div>
                  ) : <Alert>No active drivers in master, or no LED wattage yet.</Alert>}
                </section>
              )}
            </>
          )}
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => goStep(3)}>Back</Button>
            <Button onClick={() => goStep(5)}>Next: Printing</Button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <SelectField label="Print Media" value={mediaId} onChange={setMediaId} options={masters.printing.map((p) => ({ value: p.id, label: `${p.name} (₹${p.cost_per_sqft}/sq.ft)` }))} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberField label="Bleed (mm)" value={bleed} onChange={(v) => setBleed(v || 0)} />
            <NumberField label="Waste % Override" value={printWaste} onChange={setPrintWaste} />
            <NumberField label="Printing Rate (₹/sq.ft) — editable" value={printCost} onChange={setPrintCost} />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-ink-secondary">Finishing</label>
            <div className="flex flex-wrap gap-4">
              {isLit && <CheckField label="SEG Silicone Border" checked={finSeg} onChange={setFinSeg} />}
              <CheckField label="Hemming / Heat-seal" checked={finHem} onChange={setFinHem} />
              <CheckField label="Eyelets" checked={finEye} onChange={setFinEye} />
              <CheckField label="Welding" checked={finWeld} onChange={setFinWeld} />
              <CheckField label="Stitching" checked={finStitch} onChange={setFinStitch} />
            </div>
          </div>
          {(finSeg || finHem || finEye || finWeld || finStitch) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {isLit && finSeg && <NumberField label="SEG Border Rate (₹/m)" value={segRate} onChange={(v) => setSegRate(v || 0)} />}
              {finHem && <NumberField label="Hemming Flat Rate (₹)" value={hemRate} onChange={(v) => setHemRate(v || 0)} />}
              {(finEye || finWeld || finStitch) && <NumberField label="Eyelets/Welding/Stitching Flat Rate (₹)" value={finRate} onChange={(v) => setFinRate(v || 0)} />}
            </div>
          )}
          {printResult && (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-surface-sunken text-xs text-ink-secondary">
                  <tr><th className="p-2 text-left">Item</th><th className="p-2 text-left">Detail</th><th className="p-2 text-right">Cost</th></tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line">
                    <td className="p-2">Print area (incl. {bleed}mm bleed)</td>
                    <td className="p-2 text-ink-secondary">{printResult.printSqFt} sq.ft chargeable</td>
                    <td className="p-2 text-right">{fmtRupee(printResult.printCost - printResult.finishingCost)}</td>
                  </tr>
                  {printResult.finLines.map((f, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="p-2">{f.label}</td><td className="p-2 text-ink-secondary">{f.detail}</td><td className="p-2 text-right">{fmtRupee(f.cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-surface-sunken font-medium">
                    <td className="p-2" colSpan={2}>Total Print &amp; Finishing</td><td className="p-2 text-right">{fmtRupee(printResult.printCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => goStep(4)}>Back</Button>
            <Button onClick={() => goStep(6)}>Next: Pricing</Button>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberField label="Labour (₹)" value={labour} onChange={(v) => setLabour(v || 0)} />
            <NumberField label="Installation (₹)" value={install} onChange={(v) => setInstall(v || 0)} />
            <NumberField label="Overhead %" value={overheadPct} onChange={(v) => setOverheadPct(v || 0)} />
            <NumberField label="Markup %" value={markupPct} onChange={(v) => setMarkupPct(v || 0)} />
            <NumberField label="Discount %" value={discountPct} onChange={(v) => setDiscountPct(v || 0)} />
            <NumberField label="GST %" value={gstPct} onChange={(v) => setGstPct(v || 0)} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-xs text-ink-secondary">
                <tr><th className="p-2 text-left">Item</th><th className="p-2 text-left">Measure</th><th className="p-2 text-right">Amount</th></tr>
              </thead>
              <tbody>
                <Row
                  label="Profile"
                  detail={profResult ? `${(profResult.analysis.totalUsed / 304.8).toFixed(1)} RFT · ${profResult.analysis.totalBars} bar(s)` : ""}
                  value={fmtRupee(profResult?.analysis.totalCost ?? 0)}
                />
                <Row
                  label="Backing Sheet"
                  detail={sheetResult ? `${sheetResult.chargeable.toFixed(2)} sq.ft` : ""}
                  value={fmtRupee(sheetResult?.chargedCost ?? 0)}
                />
                <Row
                  label="Accessories"
                  detail={`${accessories.filter((a) => a.qty > 0).length} item(s)`}
                  value={fmtRupee(accCost)}
                />
                <Row
                  label={`LED ${ledMode === "bar" ? "Bars" : "Modules"}`}
                  detail={
                    ledMode === "bar" && barResult
                      ? `${barResult.totalPieces} pieces · ${barResult.numBars} bar(s)`
                      : ledMode === "module" && moduleResult
                      ? `${moduleResult.total} modules`
                      : ""
                  }
                  value={fmtRupee(ledCost)}
                />
                <Row
                  label="LED Drivers"
                  detail={driverFinal ? `${driverFinal.qty} × ${driverFinal.watt}W` : ""}
                  value={fmtRupee(driverFinal?.totalCost ?? 0)}
                />
                <Row
                  label="Printing & Finishing"
                  detail={printResult ? `${printResult.printSqFt} sq.ft` : ""}
                  value={fmtRupee(printResult?.printCost ?? 0)}
                />
                <Row label="Raw Material Cost (per sign)" value={fmtRupee(pricing.raw)} strong />
                <Row label={`Overhead (${overheadPct}%)`} value={fmtRupee(pricing.ovh)} />
                <Row label="Labour" value={fmtRupee(labour)} />
                <Row label="Installation" value={fmtRupee(install)} />
                {qty > 1 && <Row label={`Quantity (× ${qty})`} value={`× ${qty}`} />}
                <Row label="Total Production Cost" value={fmtRupee(pricing.costAll)} strong />
                <Row label={`Markup (${markupPct}%)`} value={fmtRupee(pricing.sellBD - pricing.costAll)} />
                {pricing.discAmt > 0 && <Row label={`Discount (${discountPct}%)`} value={`−${fmtRupee(pricing.discAmt)}`} />}
                <Row label="Selling Price (ex-GST)" value={fmtRupee(pricing.sell)} strong />
                <Row label={`GST ${gstPct}%`} value={fmtRupee(pricing.gstAmt)} />
                <Row label="Final Amount (incl. GST)" value={fmtRupee(pricing.final)} strong big />
                <Row label="Gross Margin" value={`${pricing.margin}% (${fmtRupee(pricing.mgnAmt)})`} />
              </tbody>
            </table>
          </div>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => goStep(5)}>Back</Button>
            <Button onClick={generateCostSheet} loading={saving}>Generate Cost Sheet</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none" />
    </div>
  );
}
function NumberField({ label, value, onChange }: { label: string; value: number | ""; onChange: (v: number | "") => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none" />
    </div>
  );
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none">
        <option value="">— select —</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-line-strong" />
      {label}
    </label>
  );
}
function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="text-xs text-ink-secondary">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}
function Alert({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning">{children}</div>;
}

// Diagonal-stripe overlay marking a segment that was cut from a REUSED
// offcut rather than fresh stock -- same base colour (Width/Height), just
// visually flagged so it's obvious at a glance which pieces are "free"
// leftovers vs newly-purchased material.
const OFFCUT_STRIPE =
  "repeating-linear-gradient(135deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 4px, rgba(255,255,255,0) 4px, rgba(255,255,255,0) 9px)";

function segmentColorClass(label: string): string {
  if (/^width/i.test(label)) return "bg-blue-600";
  if (/^height/i.test(label)) return "bg-emerald-600";
  return "bg-slate-500";
}

/**
 * A simple visual cutting plan: one horizontal bar per stock bar, drawn to
 * scale, with each cut segment coloured by which dimension it belongs to
 * (Width vs Height) so it's easy to see at a glance how a bar was cut up --
 * including when a segment was spliced in from an earlier bar's leftover
 * offcut (diagonal stripe) rather than cut fresh. This is purely a reading
 * aid on top of the table above; it doesn't change any numbers.
 */
function CuttingDiagram({ bins, stockLen }: { bins: CutBin[]; stockLen: number }) {
  if (bins.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Cutting plan</p>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-blue-600" /> Width cut
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-emerald-600" /> Height cut
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-slate-400" style={{ backgroundImage: OFFCUT_STRIPE }} /> Reused offcut
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-dashed border-line-strong bg-surface" /> Unused leftover
        </span>
      </div>
      <div className="space-y-3">
        {bins.map((bin, i) => (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between text-xs text-ink-secondary">
              <span className="font-medium text-ink">Stock {i + 1}</span>
              <span>{(stockLen / 1000).toFixed(2)}m bar</span>
            </div>
            <div className="flex h-9 w-full overflow-hidden rounded-md border border-line-strong bg-surface">
              {bin.cutDetails.map((cut, j) => (
                <div
                  key={j}
                  style={{ width: `${(cut.length / stockLen) * 100}%`, backgroundImage: cut.fromOffcut ? OFFCUT_STRIPE : undefined }}
                  className={`flex shrink-0 items-center justify-center overflow-hidden whitespace-nowrap border-r border-white/50 text-[10px] font-medium text-white last:border-r-0 ${segmentColorClass(cut.label)}`}
                  title={`${cut.label} — ${(cut.length / 1000).toFixed(2)}m${cut.fromOffcut ? " (reused offcut)" : " (fresh cut)"}`}
                >
                  {(cut.length / 1000).toFixed(2)}m
                </div>
              ))}
              {bin.remaining > 1 && (
                <div
                  style={{ width: `${(bin.remaining / stockLen) * 100}%` }}
                  className="flex shrink-0 items-center justify-center overflow-hidden whitespace-nowrap border-l border-dashed border-line-strong text-[10px] text-ink-muted"
                  title={`${(bin.remaining / 1000).toFixed(2)}m unused leftover`}
                >
                  {(bin.remaining / 1000).toFixed(2)}m
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function Row({ label, detail, value, strong, big }: { label: string; detail?: string; value: string; strong?: boolean; big?: boolean }) {
  return (
    <tr className={`border-t border-line ${strong ? "bg-surface-sunken" : ""}`}>
      <td className={`p-2 ${strong ? "font-semibold text-ink" : "text-ink-secondary"} ${big ? "text-base" : ""}`}>{label}</td>
      <td className="p-2 text-xs text-ink-muted">{detail}</td>
      <td className={`p-2 text-right ${strong ? "font-semibold text-ink" : "text-ink-secondary"} ${big ? "text-base" : ""}`}>{value}</td>
    </tr>
  );
}

/**
 * Sticky, editable Width/Height/Unit summary shown on every step from
 * Dimensions onward, so the user can adjust the sign size without paging
 * back to Step 2 -- plus a running readout of Sign Area (SQFT), Frame RFT
 * (perimeter-based running feet, the standard fabrication-quoting measure),
 * and the current backing-sheet chargeable area/cost once one is selected.
 */
function SignSizeHeader({
  w, h, unit, onW, onH, onUnit, sqft, rft, sheetLine,
}: {
  w: number | ""; h: number | ""; unit: "mm" | "feet" | "inches";
  onW: (v: number | "") => void; onH: (v: number | "") => void; onUnit: (v: "mm" | "feet" | "inches") => void;
  sqft: number; rft: number; sheetLine: string | null;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border border-line bg-surface-sunken p-3">
      <div className="flex items-end gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-ink-muted">Width</label>
          <input
            type="number"
            value={w}
            onChange={(e) => onW(e.target.value === "" ? "" : Number(e.target.value))}
            className="h-8 w-20 rounded border border-line-strong bg-surface px-2 text-sm text-ink outline-none"
          />
        </div>
        <span className="pb-2 text-ink-muted">×</span>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-ink-muted">Height</label>
          <input
            type="number"
            value={h}
            onChange={(e) => onH(e.target.value === "" ? "" : Number(e.target.value))}
            className="h-8 w-20 rounded border border-line-strong bg-surface px-2 text-sm text-ink outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-ink-muted">Unit</label>
          <select
            value={unit}
            onChange={(e) => onUnit(e.target.value as "mm" | "feet" | "inches")}
            className="h-8 rounded border border-line-strong bg-surface px-2 text-sm text-ink outline-none"
          >
            <option value="mm">mm</option>
            <option value="feet">feet</option>
            <option value="inches">inches</option>
          </select>
        </div>
      </div>
      {sqft > 0 && (
        <>
          <div className="hidden h-8 w-px bg-line sm:block" />
          <HeaderStat label="Sign Area" value={`${sqft.toFixed(2)} sq.ft`} />
          <HeaderStat label="Frame RFT" value={`${rft.toFixed(1)} ft`} />
          {sheetLine && <HeaderStat label="Backing Sheet" value={sheetLine} />}
        </>
      )}
    </div>
  );
}
function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
