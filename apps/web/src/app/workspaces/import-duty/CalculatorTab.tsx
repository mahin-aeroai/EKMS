"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, Loader2, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import type { ImportDutyLine, ImportDutyStatus } from "@mmdi/shared/rows";
import { generateImportDutyPdf, downloadBlob } from "@/lib/importDuty/pdf";

// The core calculator. No cross-table lookups needed (unlike Material
// Ordering's Order Builder, which has to query consumption data) -- every
// field a line's computed outputs depend on already lives ON that line, so
// this is a pure client-side reactive form: edit any input, every computed
// figure on that line (and the shipment totals below) recomputes
// immediately, no "Build" button. See supabase-import-duty-schema.sql's
// header comment for the exact formula this mirrors.
//
// `WorkingLine` is `ImportDutyLine` (the exact frozen-jsonb shape the DB
// stores) plus a local-only `key` for stable React list identity -- opened
// out at save/PDF time via `stripKey`.
interface WorkingLine extends ImportDutyLine {
  key: string;
}

type NumericField =
  | "qty"
  | "rate"
  | "exchange_rate"
  | "fee"
  | "freight"
  | "freight_ex_works"
  | "clearing_charges"
  | "bcd_percent"
  | "sw_cess_percent"
  | "igst_percent";

// Recomputes every derived field on a line from its raw inputs. Mirrors
// supabase-import-duty-schema.sql's header comment exactly.
function computeLine(line: WorkingLine): WorkingLine {
  const inv_value = line.rate * line.exchange_rate;
  const assessable_value = inv_value + line.freight + line.fee;
  const bcd_amount = (assessable_value * line.bcd_percent) / 100;
  const sw_cess_amount = (bcd_amount * line.sw_cess_percent) / 100;
  const igst_amount = ((assessable_value + bcd_amount + sw_cess_amount) * line.igst_percent) / 100;
  const total_duty = bcd_amount + sw_cess_amount + igst_amount;
  const total_cost = inv_value + line.freight + line.freight_ex_works + line.clearing_charges + total_duty;
  const cost_per_qty = line.qty > 0 ? total_cost / line.qty : 0;
  return { ...line, inv_value, assessable_value, bcd_amount, sw_cess_amount, igst_amount, total_duty, total_cost, cost_per_qty };
}

function newLine(): WorkingLine {
  return computeLine({
    key: crypto.randomUUID(),
    product_name: "",
    qty: 1,
    rate: 0,
    currency: "EUR",
    exchange_rate: 0,
    fee: 0,
    freight: 0,
    freight_ex_works: 0,
    clearing_charges: 0,
    bcd_percent: 15,
    sw_cess_percent: 10,
    igst_percent: 0,
    inv_value: 0,
    assessable_value: 0,
    bcd_amount: 0,
    sw_cess_amount: 0,
    igst_amount: 0,
    total_duty: 0,
    total_cost: 0,
    cost_per_qty: 0,
  });
}

function stripKey(line: WorkingLine): ImportDutyLine {
  return {
    product_name: line.product_name,
    qty: line.qty,
    rate: line.rate,
    currency: line.currency,
    exchange_rate: line.exchange_rate,
    fee: line.fee,
    freight: line.freight,
    freight_ex_works: line.freight_ex_works,
    clearing_charges: line.clearing_charges,
    bcd_percent: line.bcd_percent,
    sw_cess_percent: line.sw_cess_percent,
    igst_percent: line.igst_percent,
    inv_value: line.inv_value,
    assessable_value: line.assessable_value,
    bcd_amount: line.bcd_amount,
    sw_cess_amount: line.sw_cess_amount,
    igst_amount: line.igst_amount,
    total_duty: line.total_duty,
    total_cost: line.total_cost,
    cost_per_qty: line.cost_per_qty,
  };
}

function fmt(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const NUM_INPUT_CLASS = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-ink outline-none";
const TEXT_INPUT_CLASS = "h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-ink outline-none";
const LABEL_CLASS = "flex flex-col gap-1 text-xs font-medium text-ink-secondary";

export function CalculatorTab() {
  const { toast } = useToast();

  const [supplierName, setSupplierName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [boeNo, setBoeNo] = useState("");
  const [boeDate, setBoeDate] = useState("");
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<WorkingLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [lastSavedRef, setLastSavedRef] = useState<string | null>(null);
  const [lastSavedStatus, setLastSavedStatus] = useState<ImportDutyStatus | null>(null);

  function addLine() {
    setLines((ls) => [...ls, newLine()]);
    setLastSavedRef(null);
    setLastSavedStatus(null);
  }

  function removeLine(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
    setLastSavedRef(null);
    setLastSavedStatus(null);
  }

  function updateNumeric(key: string, field: NumericField, value: number) {
    setLines((ls) => ls.map((l) => (l.key === key ? computeLine({ ...l, [field]: value }) : l)));
    setLastSavedRef(null);
    setLastSavedStatus(null);
  }

  function updateProductName(key: string, value: string) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, product_name: value } : l)));
    setLastSavedRef(null);
    setLastSavedStatus(null);
  }

  function updateCurrency(key: string, value: string) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, currency: value } : l)));
    setLastSavedRef(null);
    setLastSavedStatus(null);
  }

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, l) => ({
        inv_value: acc.inv_value + l.inv_value,
        assessable_value: acc.assessable_value + l.assessable_value,
        bcd_amount: acc.bcd_amount + l.bcd_amount,
        sw_cess_amount: acc.sw_cess_amount + l.sw_cess_amount,
        igst_amount: acc.igst_amount + l.igst_amount,
        total_duty: acc.total_duty + l.total_duty,
        total_cost: acc.total_cost + l.total_cost,
      }),
      { inv_value: 0, assessable_value: 0, bcd_amount: 0, sw_cess_amount: 0, igst_amount: 0, total_duty: 0, total_cost: 0 }
    );
  }, [lines]);

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
          lines: lines.map(stripKey),
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
        lines: lines.map(stripKey),
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

      {/* Product lines */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Product lines</h3>
        <Button variant="secondary" size="sm" onClick={addLine}>
          <Plus size={14} />
          Add product
        </Button>
      </div>

      {lines.length === 0 && (
        <Card interactive={false}>
          <p className="py-6 text-center text-sm text-ink-muted">No product lines yet — add one to begin.</p>
        </Card>
      )}

      {lines.map((l, idx) => (
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
              Qty
              <input
                type="number"
                value={l.qty}
                onChange={(e) => updateNumeric(l.key, "qty", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              Currency
              <input
                type="text"
                value={l.currency}
                onChange={(e) => updateCurrency(l.key, e.target.value)}
                className={TEXT_INPUT_CLASS}
                placeholder="EUR"
              />
            </label>

            <label className={LABEL_CLASS}>
              Rate (invoice value)
              <input
                type="number"
                value={l.rate}
                onChange={(e) => updateNumeric(l.key, "rate", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
              <span className="text-[10px] font-normal normal-case text-ink-muted">
                Total invoice value for this line, not a per-unit price
              </span>
            </label>
            <label className={LABEL_CLASS}>
              Exchange rate (INR)
              <input
                type="number"
                value={l.exchange_rate}
                onChange={(e) => updateNumeric(l.key, "exchange_rate", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              Fee (INR)
              <input
                type="number"
                value={l.fee}
                onChange={(e) => updateNumeric(l.key, "fee", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              Freight (INR)
              <input
                type="number"
                value={l.freight}
                onChange={(e) => updateNumeric(l.key, "freight", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>

            <label className={LABEL_CLASS}>
              Freight from Ex Works (INR)
              <input
                type="number"
                value={l.freight_ex_works}
                onChange={(e) => updateNumeric(l.key, "freight_ex_works", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              Clearing Charges (INR)
              <input
                type="number"
                value={l.clearing_charges}
                onChange={(e) => updateNumeric(l.key, "clearing_charges", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              BCD %
              <input
                type="number"
                value={l.bcd_percent}
                onChange={(e) => updateNumeric(l.key, "bcd_percent", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              SW Cess %
              <input
                type="number"
                value={l.sw_cess_percent}
                onChange={(e) => updateNumeric(l.key, "sw_cess_percent", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              IGST %
              <input
                type="number"
                value={l.igst_percent}
                onChange={(e) => updateNumeric(l.key, "igst_percent", Number(e.target.value))}
                className={NUM_INPUT_CLASS}
              />
            </label>
          </div>

          {/* Computed outputs -- mini receipt, read-only */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-surface-sunken p-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-ink-muted">Inv. Value</p>
              <p className="font-medium text-ink">{fmt(l.inv_value)}</p>
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
              <p className="text-ink-muted">IGST Amount</p>
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
          </div>
        </Card>
      ))}

      {/* Shipment totals */}
      {lines.length > 0 && (
        <Card interactive={false} className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-ink">Shipment totals</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <p className="text-xs text-ink-secondary">Total Invoice Value</p>
              <p className="text-base font-semibold text-ink">{fmt(totals.inv_value)}</p>
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
              <p className="text-xs text-ink-secondary">Total IGST</p>
              <p className="text-base font-semibold text-ink">{fmt(totals.igst_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-secondary">Total Duty</p>
              <p className="text-base font-semibold text-ink">{fmt(totals.total_duty)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-sm font-medium text-ink-secondary">Grand Total Landed Cost</span>
            <span className="text-2xl font-bold text-primary">{fmt(totals.total_cost)}</span>
          </div>
        </Card>
      )}

      {/* Save / download */}
      {lines.length > 0 && (
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
