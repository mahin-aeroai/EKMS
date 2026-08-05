"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, Loader2, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import type { ImportDutyLine, ImportDutySizeMode, ImportDutyStatus, ImportDutyUom } from "@mmdi/shared/rows";
import { generateImportDutyPdf, downloadBlob } from "@/lib/importDuty/pdf";

// The core calculator. No cross-table lookups needed (unlike Material
// Ordering's Order Builder, which has to query consumption data) -- every
// field a line's computed outputs depend on already lives ON this form, so
// this is a pure client-side reactive form: edit any input (a line's own
// fields, or one of the shipment-level cost fields), every computed figure
// recomputes immediately, no "Build" button. See
// supabase-import-duty-schema.sql's header comment for the exact formula
// this mirrors.
//
// Raw, user-editable fields live in `LineInput` (+ a local-only `key` for
// stable React list identity). Every computed output (inv_value, sqft_total,
// each apportioned_* share, duty amounts, totals) is derived by computeAll()
// from ALL lines together, not line-by-line -- because apportioning
// Freight/Insurance/Freight-from-Ex-Works/Clearing Charges across lines
// needs each line's share of the SHIPMENT's total invoice value, which
// isn't knowable from a single line in isolation.

interface LineInput {
  key: string;
  product_name: string;
  qty: number;
  rate: number;
  currency: string;
  exchange_rate: number;
  width: number;
  height: number;
  uom: ImportDutyUom;
  length_uom: ImportDutyUom;
  size_mode: ImportDutySizeMode;
  bcd_percent: number;
  sw_cess_percent: number;
  igst_percent: number;
}

interface ComputedLine extends LineInput {
  inv_value: number;
  sqft_total: number;
  apportioned_freight: number;
  apportioned_insurance: number;
  apportioned_freight_ex_works: number;
  apportioned_clearing_charges: number;
  assessable_value: number;
  bcd_amount: number;
  sw_cess_amount: number;
  igst_amount: number;
  total_duty: number;
  total_cost: number;
  cost_per_qty: number;
  cost_per_sqft: number;
}

interface ShipmentCosts {
  freight: number;
  freight_ex_works: number;
  clearing_charges: number;
  insurance_percent: number;
}

type LineNumericField = "qty" | "rate" | "exchange_rate" | "width" | "height" | "bcd_percent" | "sw_cess_percent" | "igst_percent";
type ShipmentNumericField = keyof ShipmentCosts;

const CURRENCY_OPTIONS = ["USD", "EUR", "INR"];
const UOM_OPTIONS: { value: ImportDutyUom; label: string }[] = [
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "inch", label: "inch" },
  { value: "ft", label: "ft" },
  { value: "m", label: "m" },
];

// Converts any of the supported UOMs to feet, so sqft_total is always
// derived in feet regardless of what the line was entered in.
const UOM_TO_FT: Record<ImportDutyUom, number> = {
  mm: 1 / 304.8,
  cm: 1 / 30.48,
  inch: 1 / 12,
  ft: 1,
  m: 3.280839895,
};

function toFt(value: number, uom: ImportDutyUom): number {
  return value * UOM_TO_FT[uom];
}

// See ImportDutySizeMode in packages/shared/src/rows.ts for what 'pieces'
// vs 'roll' means, and why 'roll' mode uses TWO separate unit fields
// (length_uom for qty, uom for width) instead of one shared unit -- a real
// roll's running length (metres) and roll width (mm) are almost never given
// in the same unit, and forcing them to share one caused a 1000x-off sqft
// figure the first time this was tried against a real invoice.
function computeSqft(line: LineInput): number {
  if (line.size_mode === "roll") {
    return toFt(line.qty, line.length_uom) * toFt(line.width, line.uom);
  }
  return line.qty * toFt(line.width, line.uom) * toFt(line.height, line.uom);
}

// Recomputes every derived field, for every line, from the raw line inputs
// PLUS the shipment-level cost fields. Mirrors supabase-import-duty-
// schema.sql's header comment exactly.
//
// inv_value = qty * rate * exchange_rate -- "Rate" is a per-unit price
// (e.g. price per metre or per piece); Qty * Rate * Exchange rate is the
// line's actual invoice value in INR (matches a real invoice's own "Value"
// column exactly -- verified against a Toray Textiles invoice).
//
// Freight / Insurance / Freight-from-Ex-Works / Clearing Charges are paid
// once for the whole shipment (one Bill of Entry), not per product line --
// each line's ratio = its share of the shipment's TOTAL invoice value, and
// that ratio is applied to each shipment total to get this line's
// apportioned share. This is the standard customs practice for splitting
// shipment-level costs across multiple line items on one Bill of Entry.
//
// Freight and Insurance ARE part of the assessable (dutiable) value;
// Freight-from-Ex-Works and Clearing Charges are NOT -- they're added
// straight into total_cost after duty is calculated (pre-shipment domestic
// freight and post-clearance charges aren't part of the CIF assessable
// value under standard customs valuation).
//
// SW Cess is a % of ASSESSABLE VALUE, same base as BCD -- NOT a % of the
// BCD amount. Originally built as cess-on-BCD-amount per the user's own
// first description, but that meant a 0% BCD line (e.g. a duty-free HS
// code) always zeroed out Cess too, even when Cess itself should still
// apply -- corrected per the user's own real usage.
function computeAll(lines: LineInput[], shipment: ShipmentCosts): ComputedLine[] {
  const withInvValue = lines.map((l) => ({
    ...l,
    inv_value: l.qty * l.rate * l.exchange_rate,
    sqft_total: computeSqft(l),
  }));

  const totalInvValue = withInvValue.reduce((s, l) => s + l.inv_value, 0);
  const insuranceAmountTotal = (totalInvValue * shipment.insurance_percent) / 100;

  return withInvValue.map((l) => {
    const ratio = totalInvValue > 0 ? l.inv_value / totalInvValue : withInvValue.length > 0 ? 1 / withInvValue.length : 0;

    const apportioned_freight = shipment.freight * ratio;
    const apportioned_insurance = insuranceAmountTotal * ratio;
    const apportioned_freight_ex_works = shipment.freight_ex_works * ratio;
    const apportioned_clearing_charges = shipment.clearing_charges * ratio;

    const assessable_value = l.inv_value + apportioned_freight + apportioned_insurance;
    const bcd_amount = (assessable_value * l.bcd_percent) / 100;
    const sw_cess_amount = (assessable_value * l.sw_cess_percent) / 100;
    const igst_amount = ((assessable_value + bcd_amount + sw_cess_amount) * l.igst_percent) / 100;
    const total_duty = bcd_amount + sw_cess_amount + igst_amount;
    const total_cost = l.inv_value + apportioned_freight + apportioned_freight_ex_works + apportioned_clearing_charges + total_duty;
    const cost_per_qty = l.qty > 0 ? total_cost / l.qty : 0;
    const cost_per_sqft = l.sqft_total > 0 ? total_cost / l.sqft_total : 0;

    return {
      ...l,
      apportioned_freight,
      apportioned_insurance,
      apportioned_freight_ex_works,
      apportioned_clearing_charges,
      assessable_value,
      bcd_amount,
      sw_cess_amount,
      igst_amount,
      total_duty,
      total_cost,
      cost_per_qty,
      cost_per_sqft,
    };
  });
}

function newLine(): LineInput {
  return {
    key: crypto.randomUUID(),
    product_name: "",
    qty: 1,
    rate: 0,
    currency: "EUR",
    exchange_rate: 0,
    width: 0,
    height: 0,
    uom: "mm",
    length_uom: "m",
    size_mode: "pieces",
    bcd_percent: 15,
    sw_cess_percent: 10,
    igst_percent: 0,
  };
}

function toImportDutyLine(line: ComputedLine): ImportDutyLine {
  return {
    product_name: line.product_name,
    qty: line.qty,
    rate: line.rate,
    currency: line.currency,
    exchange_rate: line.exchange_rate,
    width: line.width,
    height: line.height,
    uom: line.uom,
    length_uom: line.length_uom,
    size_mode: line.size_mode,
    bcd_percent: line.bcd_percent,
    sw_cess_percent: line.sw_cess_percent,
    igst_percent: line.igst_percent,
    inv_value: line.inv_value,
    sqft_total: line.sqft_total,
    apportioned_freight: line.apportioned_freight,
    apportioned_insurance: line.apportioned_insurance,
    apportioned_freight_ex_works: line.apportioned_freight_ex_works,
    apportioned_clearing_charges: line.apportioned_clearing_charges,
    assessable_value: line.assessable_value,
    bcd_amount: line.bcd_amount,
    sw_cess_amount: line.sw_cess_amount,
    igst_amount: line.igst_amount,
    total_duty: line.total_duty,
    total_cost: line.total_cost,
    cost_per_qty: line.cost_per_qty,
    cost_per_sqft: line.cost_per_sqft,
  };
}

function fmt(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtSqft(n: number): string {
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} sqft`;
}

const NUM_INPUT_CLASS = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-ink outline-none";
const TEXT_INPUT_CLASS = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-ink outline-none";
const SELECT_CLASS = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-ink outline-none";
const LABEL_CLASS = "flex flex-col gap-1 text-xs font-medium text-ink-secondary";

export function CalculatorTab() {
  const { toast } = useToast();

  const [supplierName, setSupplierName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [boeNo, setBoeNo] = useState("");
  const [boeDate, setBoeDate] = useState("");
  const [notes, setNotes] = useState("");

  // Shipment-level cost fields -- paid once for the whole shipment, then
  // apportioned pro-rata across lines by invoice value (see computeAll()).
  const [freight, setFreight] = useState(0);
  const [freightExWorks, setFreightExWorks] = useState(0);
  const [clearingCharges, setClearingCharges] = useState(0);
  const [insurancePercent, setInsurancePercent] = useState(1.125);

  const [lines, setLines] = useState<LineInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [lastSavedRef, setLastSavedRef] = useState<string | null>(null);
  const [lastSavedStatus, setLastSavedStatus] = useState<ImportDutyStatus | null>(null);

  const shipmentCosts: ShipmentCosts = useMemo(
    () => ({ freight, freight_ex_works: freightExWorks, clearing_charges: clearingCharges, insurance_percent: insurancePercent }),
    [freight, freightExWorks, clearingCharges, insurancePercent]
  );

  const computedLines = useMemo(() => computeAll(lines, shipmentCosts), [lines, shipmentCosts]);

  function clearSavedState() {
    setLastSavedRef(null);
    setLastSavedStatus(null);
  }

  function addLine() {
    setLines((ls) => [...ls, newLine()]);
    clearSavedState();
  }

  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
    clearSavedState();
  }

  function updateLineNumeric(key: string, field: LineNumericField, value: number) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
    clearSavedState();
  }

  function updateProductName(key: string, value: string) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, product_name: value } : l)));
    clearSavedState();
  }

  function updateCurrency(key: string, value: string) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, currency: value } : l)));
    clearSavedState();
  }

  function updateUom(key: string, value: ImportDutyUom) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, uom: value } : l)));
    clearSavedState();
  }

  function updateLengthUom(key: string, value: ImportDutyUom) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, length_uom: value } : l)));
    clearSavedState();
  }

  function updateSizeMode(key: string, value: ImportDutySizeMode) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, size_mode: value } : l)));
    clearSavedState();
  }

  function updateShipmentNumeric(field: ShipmentNumericField, value: number) {
    if (field === "freight") setFreight(value);
    else if (field === "freight_ex_works") setFreightExWorks(value);
    else if (field === "clearing_charges") setClearingCharges(value);
    else setInsurancePercent(value);
    clearSavedState();
  }

  const totals = useMemo(() => {
    const sums = computedLines.reduce(
      (acc, l) => ({
        inv_value: acc.inv_value + l.inv_value,
        sqft_total: acc.sqft_total + l.sqft_total,
        assessable_value: acc.assessable_value + l.assessable_value,
        bcd_amount: acc.bcd_amount + l.bcd_amount,
        sw_cess_amount: acc.sw_cess_amount + l.sw_cess_amount,
        igst_amount: acc.igst_amount + l.igst_amount,
        total_duty: acc.total_duty + l.total_duty,
        total_cost: acc.total_cost + l.total_cost,
      }),
      { inv_value: 0, sqft_total: 0, assessable_value: 0, bcd_amount: 0, sw_cess_amount: 0, igst_amount: 0, total_duty: 0, total_cost: 0 }
    );
    return { ...sums, cost_per_sqft: sums.sqft_total > 0 ? sums.total_cost / sums.sqft_total : 0 };
  }, [computedLines]);

  // Sum of each line's apportioned share should always reconcile back to
  // the shipment input it was apportioned from -- shown here so that's
  // visibly true rather than a black box (matches the shipment-level input
  // fields above almost exactly, up to rounding).
  const insuranceAmountTotal = (totals.inv_value * insurancePercent) / 100;

  const canSave = supplierName.trim() !== "" || lines.some((l) => l.product_name.trim() !== "");
  const hasDownloadableLine = lines.some((l) => l.product_name.trim() !== "");

  async function generateRef(): Promise<string> {
    const { data, error } = await supabase
      .from("import_duty_calculations")
      .select("ref")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const last = data?.[0]?.ref as string | undefined;
    const lastNum = last ? parseInt(last.replace(/\D/g, ""), 10) : 0;
    const next = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
    return `ID-${String(next).padStart(4, "0")}`;
  }

  async function saveCalculation(status: ImportDutyStatus) {
    if (!canSave) {
      toast("danger", "Enter a supplier name or at least one product before saving");
      return;
    }
    if (lines.length === 0) {
      toast("danger", "Add at least one product line first");
      return;
    }
    setSaving(true);
    try {
      const ref = await generateRef();
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("import_duty_calculations")
        .insert({
          ref,
          status,
          supplier_name: supplierName || null,
          invoice_no: invoiceNo || null,
          invoice_date: invoiceDate || null,
          bill_of_entry_no: boeNo || null,
          bill_of_entry_date: boeDate || null,
          notes: notes || null,
          freight,
          freight_ex_works: freightExWorks,
          clearing_charges: clearingCharges,
          insurance_percent: insurancePercent,
          lines: computedLines.map(toImportDutyLine),
          total_cost: totals.total_cost,
          total_duty: totals.total_duty,
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      setLastSavedRef(ref);
      setLastSavedStatus(status);
      toast("success", `Saved ${ref} as ${status === "final" ? "Final" : "Draft"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't save this calculation";
      toast("danger", message);
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!hasDownloadableLine) return;
    setDownloading(true);
    try {
      const blob = await generateImportDutyPdf({
        ref: lastSavedRef ?? "DRAFT",
        createdAt: new Date().toISOString(),
        status: lastSavedStatus ?? "draft",
        supplier_name: supplierName || null,
        invoice_no: invoiceNo || null,
        invoice_date: invoiceDate || null,
        bill_of_entry_no: boeNo || null,
        bill_of_entry_date: boeDate || null,
        notes: notes || null,
        freight,
        freight_ex_works: freightExWorks,
        clearing_charges: clearingCharges,
        insurance_percent: insurancePercent,
        lines: computedLines.map(toImportDutyLine),
      });
      downloadBlob(blob, `${lastSavedRef ?? "import-duty-draft"}.pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't build this PDF";
      toast("danger", message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Shipment details */}
      <Card interactive={false} className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">Shipment details</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={LABEL_CLASS}>
            Supplier name
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className={TEXT_INPUT_CLASS}
              placeholder="e.g. ACME GmbH"
            />
          </label>
          <label className={LABEL_CLASS}>
            Invoice No.
            <input type="text" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={TEXT_INPUT_CLASS} />
          </label>
          <label className={LABEL_CLASS}>
            Invoice Date
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className={TEXT_INPUT_CLASS}
            />
          </label>
          <label className={LABEL_CLASS}>
            Bill of Entry No.
            <input type="text" value={boeNo} onChange={(e) => setBoeNo(e.target.value)} className={TEXT_INPUT_CLASS} />
          </label>
          <label className={LABEL_CLASS}>
            Bill of Entry Date
            <input type="date" value={boeDate} onChange={(e) => setBoeDate(e.target.value)} className={TEXT_INPUT_CLASS} />
          </label>
        </div>
        <label className={LABEL_CLASS}>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything else to note about this shipment"
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none"
          />
        </label>
      </Card>

      {/* Shipment-level costs -- paid once for the whole shipment, then
          apportioned across product lines below by invoice-value share */}
      <Card interactive={false} className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Shipment-level costs</h3>
          <p className="text-xs text-ink-muted">
            Freight, Freight from Ex Works, Clearing Charges and Insurance apply once to the whole shipment — each product
            line below gets its share, apportioned by that line&apos;s % of the total invoice value.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={LABEL_CLASS}>
            Freight (INR)
            <input
              type="number"
              value={freight}
              onChange={(e) => updateShipmentNumeric("freight", Number(e.target.value))}
              className={NUM_INPUT_CLASS}
            />
          </label>
          <label className={LABEL_CLASS}>
            Freight from Ex Works (INR)
            <input
              type="number"
              value={freightExWorks}
              onChange={(e) => updateShipmentNumeric("freight_ex_works", Number(e.target.value))}
              className={NUM_INPUT_CLASS}
            />
          </label>
          <label className={LABEL_CLASS}>
            Clearing Charges (INR)
            <input
              type="number"
              value={clearingCharges}
              onChange={(e) => updateShipmentNumeric("clearing_charges", Number(e.target.value))}
              className={NUM_INPUT_CLASS}
            />
          </label>
          <label className={LABEL_CLASS}>
            Insurance %
            <input
              type="number"
              step="0.001"
              value={insurancePercent}
              onChange={(e) => updateShipmentNumeric("insurance_percent", Number(e.target.value))}
              className={NUM_INPUT_CLASS}
            />
            <span className="text-[10px] font-normal normal-case text-ink-muted">
              Defaults to 1.125% of total invoice value — the standard notional rate customs uses when actual insurance
              isn&apos;t known. Each line below gets exactly {insurancePercent}% of its OWN invoice value, not an extra
              shared charge.
            </span>
          </label>
        </div>
      </Card>

      {/* Product lines */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Product lines</h3>
        <Button variant="secondary" size="sm" onClick={addLine}>
          <Plus size={14} />
          Add product
        </Button>
      </div>

      {computedLines.length === 0 && (
        <Card interactive={false}>
          <p className="py-6 text-center text-sm text-ink-muted">No product lines yet — add one to begin.</p>
        </Card>
      )}

      {computedLines.map((l, idx) => (
        <Card key={l.key} interactive={false} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Line {idx + 1}</span>
            <button
              type="button"
              aria-label="Remove this line"
              onClick={() => removeLine(l.key)}
              className="text-ink-muted hover:text-danger"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <label className={`${LABEL_CLASS} col-span-2`}>
              Product name
              <input
                type="text"
                value={l.product_name}
                onChange={(e) => updateProductName(l.key, e.target.value)}
                className={TEXT_INPUT_CLASS}
                placeholder="e.g. LED Module XR-200"
              />
            </label>
            <label className={LABEL_CLASS}>
              {l.size_mode === "roll" ? "Qty (running length)" : "Qty"}
              <input
                type="number"
                value={l.qty}
                onChange={(e) => updateLineNumeric(l.key, "qty", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
            {l.size_mode === "roll" && (
              <label className={LABEL_CLASS}>
                Length UOM
                <select
                  value={l.length_uom}
                  onChange={(e) => updateLengthUom(l.key, e.target.value as ImportDutyUom)}
                  className={SELECT_CLASS}
                >
                  {UOM_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] font-normal normal-case text-ink-muted">
                  Unit for Qty above — usually different from the roll&apos;s width unit
                </span>
              </label>
            )}
            <label className={LABEL_CLASS}>
              Currency
              <select value={l.currency} onChange={(e) => updateCurrency(l.key, e.target.value)} className={SELECT_CLASS}>
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className={LABEL_CLASS}>
              Rate (per unit)
              <input
                type="number"
                value={l.rate}
                onChange={(e) => updateLineNumeric(l.key, "rate", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
              <span className="text-[10px] font-normal normal-case text-ink-muted">
                Price per unit in {l.currency} — Inv. Value below = Qty × Rate × Exchange rate
              </span>
            </label>
            <label className={LABEL_CLASS}>
              Exchange rate (INR)
              <input
                type="number"
                value={l.exchange_rate}
                onChange={(e) => updateLineNumeric(l.key, "exchange_rate", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>

            <label className={LABEL_CLASS}>
              Sizing
              <select
                value={l.size_mode}
                onChange={(e) => updateSizeMode(l.key, e.target.value as ImportDutySizeMode)}
                className={SELECT_CLASS}
              >
                <option value="pieces">Pieces (Qty × W × H)</option>
                <option value="roll">Roll (running length × width)</option>
              </select>
            </label>
            <label className={LABEL_CLASS}>
              {l.size_mode === "roll" ? "Width UOM" : "UOM"}
              <select value={l.uom} onChange={(e) => updateUom(l.key, e.target.value as ImportDutyUom)} className={SELECT_CLASS}>
                {UOM_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
              {l.size_mode === "pieces" && (
                <span className="text-[10px] font-normal normal-case text-ink-muted">Applies to both Width and Height</span>
              )}
            </label>
            <label className={LABEL_CLASS}>
              {l.size_mode === "roll" ? "Width (roll)" : "Width"}
              <input
                type="number"
                value={l.width}
                onChange={(e) => updateLineNumeric(l.key, "width", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
            {l.size_mode === "pieces" && (
              <label className={LABEL_CLASS}>
                Height
                <input
                  type="number"
                  value={l.height}
                  onChange={(e) => updateLineNumeric(l.key, "height", Number(e.target.value))}
                  className={NUM_INPUT_CLASS}
                />
              </label>
            )}

            <label className={LABEL_CLASS}>
              BCD %
              <input
                type="number"
                value={l.bcd_percent}
                onChange={(e) => updateLineNumeric(l.key, "bcd_percent", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
              <span className="text-[10px] font-normal normal-case text-ink-muted">% of Assessable Value</span>
            </label>
            <label className={LABEL_CLASS}>
              SW Cess %
              <input
                type="number"
                value={l.sw_cess_percent}
                onChange={(e) => updateLineNumeric(l.key, "sw_cess_percent", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
              <span className="text-[10px] font-normal normal-case text-ink-muted">
                % of Assessable Value — applies independently of BCD, not zeroed out when BCD is 0
              </span>
            </label>
            <label className={LABEL_CLASS}>
              IGST %
              <input
                type="number"
                value={l.igst_percent}
                onChange={(e) => updateLineNumeric(l.key, "igst_percent", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
          </div>

          {/* Computed outputs -- mini receipt, read-only */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-surface-sunken p-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-ink-muted">Inv. Value</p>
              <p className="font-medium text-ink">{fmt(l.inv_value)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Sq.Ft</p>
              <p className="font-medium text-ink">{fmtSqft(l.sqft_total)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Apportioned Freight</p>
              <p className="font-medium text-ink">{fmt(l.apportioned_freight)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Apportioned Insurance</p>
              <p className="font-medium text-ink">{fmt(l.apportioned_insurance)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Apportioned Freight (Ex Works)</p>
              <p className="font-medium text-ink">{fmt(l.apportioned_freight_ex_works)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Apportioned Clearing Charges</p>
              <p className="font-medium text-ink">{fmt(l.apportioned_clearing_charges)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Assessable Value</p>
              <p className="font-medium text-ink">{fmt(l.assessable_value)}</p>
            </div>
            <div>
              <p className="text-ink-muted">BCD Amount</p>
              <p className="font-medium text-ink">{fmt(l.bcd_amount)}</p>
            </div>
            <div>
              <p className="text-ink-muted">SW Cess Amount</p>
              <p className="font-medium text-ink">{fmt(l.sw_cess_amount)}</p>
            </div>
            <div>
              <p className="text-ink-muted">IGST Amount (GST)</p>
              <p className="font-medium text-ink">{fmt(l.igst_amount)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Total Duty</p>
              <p className="font-medium text-ink">{fmt(l.total_duty)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Total Cost</p>
              <p className="font-semibold text-primary">{fmt(l.total_cost)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Cost / Qty</p>
              <p className="font-semibold text-primary">{fmt(l.cost_per_qty)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Cost / Sq.Ft</p>
              <p className="font-semibold text-primary">{fmt(l.cost_per_sqft)}</p>
            </div>
          </div>
        </Card>
      ))}

      {/* Shipment totals */}
      {computedLines.length > 0 && (
        <Card interactive={false} className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-ink">Shipment totals</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-xs text-ink-secondary">Total Invoice Value</p>
              <p className="text-base font-semibold text-ink">{fmt(totals.inv_value)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Total Sq.Ft</p>
              <p className="text-base font-semibold text-ink">{fmtSqft(totals.sqft_total)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Total Assessable Value</p>
              <p className="text-base font-semibold text-ink">{fmt(totals.assessable_value)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Total BCD</p>
              <p className="text-base font-semibold text-ink">{fmt(totals.bcd_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Total SW Cess</p>
              <p className="text-base font-semibold text-ink">{fmt(totals.sw_cess_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Total IGST (GST)</p>
              <p className="text-base font-semibold text-ink">{fmt(totals.igst_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Total Duty</p>
              <p className="text-base font-semibold text-ink">{fmt(totals.total_duty)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Blended Cost / Sq.Ft</p>
              <p className="text-base font-semibold text-ink">{fmt(totals.cost_per_sqft)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-line pt-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-ink-secondary">Freight (apportioned across lines)</p>
              <p className="text-sm font-medium text-ink">{fmt(freight)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Freight Ex Works (apportioned)</p>
              <p className="text-sm font-medium text-ink">{fmt(freightExWorks)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Clearing Charges (apportioned)</p>
              <p className="text-sm font-medium text-ink">{fmt(clearingCharges)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Insurance ({insurancePercent}% of Inv. Value)</p>
              <p className="text-sm font-medium text-ink">{fmt(insuranceAmountTotal)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-sm font-medium text-ink-secondary">Grand Total Landed Cost</span>
            <span className="text-2xl font-bold text-primary">{fmt(totals.total_cost)}</span>
          </div>
        </Card>
      )}

      {/* Save / download */}
      {computedLines.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => saveCalculation("draft")} loading={saving} disabled={!canSave}>
            <Save size={14} />
            Save Draft
          </Button>
          <Button variant="secondary" size="sm" onClick={() => saveCalculation("final")} loading={saving} disabled={!canSave}>
            <CheckCircle2 size={14} />
            Save Final
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadPdf} loading={downloading} disabled={!hasDownloadableLine}>
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
      )}
    </div>
  );
}
