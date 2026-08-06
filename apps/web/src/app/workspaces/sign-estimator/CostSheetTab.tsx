"use client";

import { useEffect, useState } from "react";
import { Printer, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import type { SignEstimateRow } from "@mmdi/shared/rows";
import { fmtRupee, computePricing } from "@mmdi/shared/sign-estimator/calc";
import type { EstimateSnapshot } from "./types";

// Re-renders a saved estimate's cost sheet from its stored `calc` JSON
// snapshot -- deliberately NOT recomputed from current master prices, so a
// quote from 3 months ago always reprints exactly as it was quoted (see
// supabase-sign-estimator-schema.sql's header comment). This is the React
// equivalent of SignERP_v2.html's generateCostSheet() report layout.
export function CostSheetTab({ estimateRef }: { estimateRef: string | null }) {
  const { toast } = useToast();
  const [row, setRow] = useState<SignEstimateRow | null>(null);
  // hasLoaded only flips (inside the .then callback below, not synchronously
  // in the effect body) once the first fetch for the current estimateRef
  // resolves -- avoids the "setState synchronously in an effect" pattern
  // while still distinguishing "still loading" from "loaded, nothing found".
  const [hasLoaded, setHasLoaded] = useState(false);

  // Editable pricing terms (Labour / Installation / Overhead / Markup /
  // Discount / GST) -- these are business terms that legitimately change
  // after a quote is first generated (a customer negotiates, or the shop
  // revises labour/overhead assumptions), so unlike the material-cost
  // breakdown above (which is a frozen snapshot on purpose -- see the top
  // comment) these six specifically need to stay adjustable on the saved
  // cost sheet, not just once during the wizard.
  const [editing, setEditing] = useState(false);
  const [eLabour, setELabour] = useState(0);
  const [eInstallSell, setEInstallSell] = useState(0);
  const [ePrintSell, setEPrintSell] = useState(0);
  const [eShipping, setEShipping] = useState(0);
  const [eOverheadPct, setEOverheadPct] = useState(0);
  const [eMarkupPct, setEMarkupPct] = useState(0);
  const [eDiscountPct, setEDiscountPct] = useState(0);
  const [eGstPct, setEGstPct] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const query = estimateRef
      ? supabase.from("sign_estimates").select("*").eq("ref", estimateRef).maybeSingle()
      : supabase.from("sign_estimates").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    query.then(({ data, error }) => {
      if (error) { toast("danger", "Couldn't load the cost sheet"); }
      setRow((data as SignEstimateRow | null) ?? null);
      setHasLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateRef]);

  if (!hasLoaded) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;
  if (!row) return <p className="py-8 text-center text-sm text-ink-muted">No estimate yet — generate one from the Estimator tab.</p>;

  const c = row.calc as unknown as EstimateSnapshot;

  // Profile snapshot only stores the TOTAL cost across all stock bars
  // (barsRequired * per-bar cost), not the per-bar rate -- back it out here
  // so the printed Materials line can show the same per-RFT/per-RM rate the
  // Estimator wizard's Step 6 Section 1 already surfaces (see EstimatorTab).
  const profPerBarCost = c.profile && c.profile.barsRequired > 0 ? c.profile.cost / c.profile.barsRequired : 0;
  const profRatePerRFT = c.profile && c.profile.stockLenMM > 0 ? profPerBarCost / (c.profile.stockLenMM / 304.8) : 0;
  const profRatePerRM = c.profile && c.profile.stockLenMM > 0 ? profPerBarCost / (c.profile.stockLenMM / 1000) : 0;

  function startEdit() {
    setELabour(c.pricing.labour);
    setEInstallSell(c.pricing.installSell ?? 0);
    setEPrintSell(c.pricing.printSell ?? 0);
    setEShipping(c.pricing.shipping ?? 0);
    setEOverheadPct(c.pricing.ovhPct);
    setEMarkupPct(c.pricing.markupPct);
    setEDiscountPct(c.pricing.discPct);
    setEGstPct(c.pricing.gstPct);
    setEditing(true);
  }

  // Re-runs the pricing formula with the edited terms, but against the SAME
  // frozen signage raw material cost (c.pricing.raw) -- only Signage runs
  // cost-plus; Printing, Shipping and Installation are edited directly as
  // posted selling prices, same split as the live Estimator's Step 6 (see
  // calc.ts's computePricing doc comment for why). Passing `null` for the
  // signage override always re-derives Signage from cost-plus terms here --
  // if the original estimate priced Signage at a ₹/sq.ft rate instead (see
  // signagePriceBasis), editing pricing on this saved cost sheet switches it
  // back to cost-plus rather than re-applying that rate; the sqft rate is
  // only adjustable from the live Estimator wizard.
  // Plain (non-memoized) recompute -- deliberately NOT a useMemo/useState
  // hook, since it's derived after this component's two early returns above
  // (no row yet / still loading) and calling a hook there conditionally
  // would violate the Rules of Hooks. computePricing() is cheap arithmetic,
  // so recomputing it on every render while editing is fine.
  const recalced = editing
    ? computePricing(
        { profCost: c.pricing.raw, sheetCost: 0, accCost: 0, ledCost: 0, drvCost: 0 },
        null,
        c.pricing.printCostRef ?? 0,
        ePrintSell,
        eShipping,
        eInstallSell,
        { qty: c.qty, labour: eLabour, overheadPct: eOverheadPct, markupPct: eMarkupPct, discountPct: eDiscountPct, gstPct: eGstPct }
      )
    : null;

  async function saveEdit() {
    if (!row || !recalced) return;
    setSavingEdit(true);
    const newCalc: EstimateSnapshot = {
      ...c,
      pricing: {
        ...c.pricing,
        labour: eLabour,
        ovhPct: eOverheadPct,
        ovh: recalced.ovh,
        costPer: recalced.costPer,
        costAll: recalced.costAll,
        sellBD: recalced.sellBD,
        markupPct: eMarkupPct,
        discPct: eDiscountPct,
        discAmt: recalced.discAmt,
        signageSell: recalced.signageSell,
        printCostRef: recalced.printCostRef,
        printSell: recalced.printSell,
        shipping: recalced.shipping,
        installSell: recalced.installSell,
        sell: recalced.sell,
        gstPct: eGstPct,
        gstAmt: recalced.gstAmt,
        final: recalced.final,
        margin: recalced.margin,
        mgnAmt: recalced.mgnAmt,
      },
    };
    const { error } = await supabase
      .from("sign_estimates")
      .update({ sell: recalced.sell, final_amount: recalced.final, margin: recalced.margin, calc: newCalc })
      .eq("id", row.id);
    setSavingEdit(false);
    if (error) {
      toast("danger", `Couldn't save pricing changes: ${error.message}`);
      return;
    }
    setRow({ ...row, sell: recalced.sell, final_amount: recalced.final, margin: recalced.margin, calc: newCalc as unknown as Record<string, unknown> });
    setEditing(false);
    toast("success", "Pricing updated");
  }

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        {!editing && (
          <Button variant="secondary" onClick={startEdit}>
            <Pencil size={14} /> Edit Pricing
          </Button>
        )}
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={14} /> Print / PDF
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-start justify-between border-b border-line pb-3">
          <div>
            <div className="text-base font-bold text-ink">MMDI ONE — Sign Estimator</div>
            <div className="text-xs text-ink-secondary">Professional Costing System</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-ink">{row.ref}</div>
            <div className="text-xs text-ink-secondary">{new Date(row.created_at).toLocaleString("en-IN")}</div>
            <div className="text-xs text-ink">
              Client: <strong>{row.client ?? "—"}</strong>
            </div>
          </div>
        </div>

        <Card title="Sign Specification">
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-5">
            <KV k="Category" v={c.categoryLabel} />
            <KV k="Dimensions" v={`${c.dimW} × ${c.dimH} ${c.dimUnit}`} />
            <KV k="Size (mm)" v={`${c.widthMM} × ${c.heightMM}`} />
            <KV k="Area" v={`${((c.widthMM / 304.8) * (c.heightMM / 304.8)).toFixed(2)} sq.ft`} />
            <KV k="Quantity" v={`${c.qty} pcs`} />
          </div>
        </Card>

        <Section title="1. Materials — Profile, Backing Sheet, Accessories, LED">
          <table className="w-full text-xs">
            <tbody>
              {c.profile && (
                <Row
                  label="Profile"
                  detail={
                    <>
                      <div>{c.profile.name}</div>
                      <div>
                        {(c.profile.stockLenMM / 1000).toFixed(2)}m stock bar @ {fmtRupee(profPerBarCost)}/bar
                        {" "}(₹{profRatePerRFT.toFixed(2)}/RFT · ₹{profRatePerRM.toFixed(2)}/RM) — {c.profile.barsRequired} bar(s), {c.profile.utilPct}% utilisation
                        {c.qty > 1 ? ` (nested across all ${c.qty} signs — ${fmtRupee(c.profile.cost)} total)` : ""}
                      </div>
                    </>
                  }
                  // c.profile.cost is the WHOLE-ORDER nested total (see the
                  // ProfileSnapshot doc comment in types.ts) -- every other
                  // row here, and "Raw Material Cost -- Signage (per sign)"
                  // below, is per-sign, so divide by qty to keep this row on
                  // the same basis. Whole-order total still shown above.
                  value={fmtRupee(c.qty > 0 ? c.profile.cost / c.qty : 0)}
                />
              )}
              {c.sheet && (
                <Row
                  label="Backing Sheet"
                  detail={
                    <>
                      <div>{c.sheet.name}{c.sheet.color && c.sheet.color !== "—" ? ` — ${c.sheet.color}` : ""}</div>
                      <div>₹{c.sheet.costPerSqFt}/sq.ft × {c.sheet.chargeableSqFt} sq.ft chargeable ({c.sheet.wastePct}% waste)</div>
                    </>
                  }
                  value={fmtRupee(c.sheet.cost)}
                />
              )}
              {c.accessories.length > 0 && (
                <Row
                  label="Accessories"
                  detail={c.accessories.map((a) => `${a.name} (${a.qty} ${a.unit})`).join(", ")}
                  value={fmtRupee(c.accessories.reduce((s, a) => s + a.lineCost, 0))}
                />
              )}
              {c.led && (
                <Row
                  label={`LED ${c.led.mode === "bar" ? "Bars" : "Modules"}`}
                  detail={
                    <>
                      <div>{c.led.modelName}</div>
                      <div>
                        {c.led.mode === "bar"
                          ? `${c.led.numBars} bar(s), ${c.led.totalPieces} pieces`
                          : `${c.led.cols} × ${c.led.rows} grid, ${c.led.count} modules`}
                        {" — "}{c.led.watt} W total
                      </div>
                    </>
                  }
                  value={fmtRupee(c.led.cost)}
                />
              )}
              {c.driver && (
                <Row
                  label="LED Driver"
                  detail={`Requirement ${c.driver.requiredW} W — ${c.driver.count} × ${c.driver.driverWatt}W selected (${c.driver.utilPct}% utilisation)`}
                  value={fmtRupee(c.driver.cost)}
                />
              )}
              <Row label="Raw Material Cost — Signage (per sign)" value={fmtRupee(c.pricing.raw)} strong />
            </tbody>
          </table>
        </Section>

        <Section title="2. Cost Build-Up — Overheads, Labour, Markup">
          {editing && (
            <div className="grid grid-cols-2 gap-2 pb-1 sm:grid-cols-4">
              <EditField label="Overhead %" value={eOverheadPct} onChange={setEOverheadPct} />
              <EditField label="Labour (₹)" value={eLabour} onChange={setELabour} />
              <EditField label="Markup %" value={eMarkupPct} onChange={setEMarkupPct} />
              <EditField label="Discount %" value={eDiscountPct} onChange={setEDiscountPct} />
            </div>
          )}
          <table className="w-full text-xs">
            <tbody>
              {editing && recalced ? (
                <>
                  <Row label="Raw Material Cost" value={fmtRupee(c.pricing.raw)} />
                  <Row label="Signage Production Cost" value={fmtRupee(recalced.costAll)} strong />
                  {/* Markup shown here is the RECONCILED amount (actual selling price
                      + discount − cost), not the raw markup-% formula result -- when
                      Signage is priced by an override (₹/sq.ft rate, or a typed lumpsum
                      figure) rather than pure cost-plus, this keeps Cost + Markup −
                      Discount always adding up to the actual Signage Selling Price. */}
                  <Row
                    label={`Markup (${eMarkupPct}%)`}
                    value={fmtRupee(recalced.signageSell + recalced.discAmt - recalced.costAll)}
                  />
                  {recalced.discAmt > 0 && <Row label={`Discount (${eDiscountPct}%)`} value={`−${fmtRupee(recalced.discAmt)}`} />}
                  <Row label="Signage Selling Price (ex-GST)" value={fmtRupee(recalced.signageSell)} strong />
                </>
              ) : (
                <>
                  <Row label="Raw Material Cost" value={fmtRupee(c.pricing.raw)} />
                  <Row label={`Overhead (${c.pricing.ovhPct}%)`} value={fmtRupee(c.pricing.ovh)} />
                  <Row label="Labour" value={fmtRupee(c.pricing.labour)} />
                  <Row label="Signage Production Cost" value={fmtRupee(c.pricing.costAll)} strong />
                  <Row
                    label={`Markup (${c.pricing.markupPct}%)`}
                    value={fmtRupee((c.pricing.signageSell ?? c.pricing.sell) + c.pricing.discAmt - c.pricing.costAll)}
                  />
                  {c.pricing.discAmt > 0 && <Row label={`Discount (${c.pricing.discPct}%)`} value={`−${fmtRupee(c.pricing.discAmt)}`} />}
                  <Row
                    label="Signage Selling Price (ex-GST)"
                    detail={c.pricing.signagePriceBasis === "sqft" && c.pricing.signageRatePerSqft != null ? `₹${c.pricing.signageRatePerSqft}/sq.ft` : undefined}
                    value={fmtRupee(c.pricing.signageSell ?? c.pricing.sell)}
                    strong
                  />
                </>
              )}
            </tbody>
          </table>
        </Section>

        <Section title="3. Printing & Finishing">
          {c.print && (
            <table className="w-full text-xs">
              <tbody>
                <Row
                  label="Print Media"
                  detail={
                    <>
                      <div>{c.print.mediaName} — {c.print.finishingLabel}</div>
                      <div>
                        {c.print.sqFt} sq.ft chargeable
                        {c.print.productionSqFt != null && ` (production area ${c.print.productionSqFt} sq.ft, ref. only, not charged)`}
                      </div>
                    </>
                  }
                  value={fmtRupee(c.print.cost)}
                />
              </tbody>
            </table>
          )}
          {editing ? (
            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
              <EditField label="Printing Selling Price (₹)" value={ePrintSell} onChange={setEPrintSell} />
              <EditField label="Packing & Forwarding (₹)" value={eShipping} onChange={setEShipping} />
              <EditField label="Installation Selling Price (₹)" value={eInstallSell} onChange={setEInstallSell} />
            </div>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                <Row
                  label="Printing Selling Price"
                  detail={c.pricing.printPriceBasis === "sqft" && c.pricing.printRatePerSqft != null ? `₹${c.pricing.printRatePerSqft}/sq.ft` : undefined}
                  value={fmtRupee(c.pricing.printSell ?? 0)}
                  strong
                />
                <Row label="Packing & Forwarding" value={fmtRupee(c.pricing.shipping ?? 0)} strong />
                <Row label="Installation Selling Price" value={fmtRupee(c.pricing.installSell ?? 0)} strong />
                <Row
                  label="Total — Printing, Packing & Forwarding, Installation"
                  value={fmtRupee((c.pricing.printSell ?? 0) + (c.pricing.shipping ?? 0) + (c.pricing.installSell ?? 0))}
                  strong
                />
              </tbody>
            </table>
          )}
        </Section>

        <Section title="4. Total Taxable Value, GST & Total">
          {editing && (
            <div className="grid grid-cols-2 gap-2 pb-1 sm:grid-cols-4">
              <EditField label="GST %" value={eGstPct} onChange={setEGstPct} />
            </div>
          )}
          <table className="w-full text-xs">
            <tbody>
              {editing && recalced ? (
                <>
                  <Row label="Total Taxable Value (ex-GST)" value={fmtRupee(recalced.sell)} strong big />
                  <Row label={`GST ${eGstPct}%`} value={fmtRupee(recalced.gstAmt)} />
                  <Row label="Final Amount (incl. GST)" value={fmtRupee(recalced.final)} strong big />
                </>
              ) : (
                <>
                  <Row label="Total Taxable Value (ex-GST)" value={fmtRupee(c.pricing.sell)} strong big />
                  <Row label={`GST ${c.pricing.gstPct}%`} value={fmtRupee(c.pricing.gstAmt)} />
                  <Row label="Final Amount (incl. GST)" value={fmtRupee(c.pricing.final)} strong big />
                </>
              )}
            </tbody>
          </table>
          {editing && recalced && (
            <div className="mt-2 flex justify-end gap-2 print:hidden">
              <Button variant="secondary" onClick={() => setEditing(false)}>
                <X size={14} /> Cancel
              </Button>
              <Button onClick={saveEdit} loading={savingEdit}>Save Changes</Button>
            </div>
          )}
        </Section>

        <p className="mt-3 border-t border-line pt-2 text-center text-[11px] text-ink-muted">
          Generated by MMDI ONE Sign Estimator • {new Date(row.created_at).toLocaleString("en-IN")} • This is a system-generated estimate
        </p>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 break-inside-avoid rounded-lg border border-line p-3 print:break-inside-avoid">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-secondary">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between text-xs ${strong ? "font-semibold text-ink" : "text-ink-secondary"}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
// Section/Row mirror the compact card pattern already built for the live
// Estimator wizard's Step 6 (see EstimatorTab.tsx) -- duplicated here rather
// than shared, since this is a separate, frozen-snapshot print/detail view
// with its own editing affordances.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 break-inside-avoid rounded-lg border border-line bg-surface p-3 print:break-inside-avoid">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({
  label,
  detail,
  value,
  strong,
  big,
}: {
  label: string;
  detail?: React.ReactNode;
  value: string;
  strong?: boolean;
  big?: boolean;
}) {
  return (
    <tr className="border-t border-line first:border-t-0">
      <td className={`p-1 align-top ${strong ? "font-semibold text-ink" : "text-ink-secondary"} ${big ? "text-sm" : "text-xs"}`}>{label}</td>
      {/* Plain neutral grey, not the app-wide --ink-muted token -- that
          token carries a slight blue tint (used everywhere else for
          "muted" text), which read as an odd light-blue/lavender color
          for this dense block of material-spec detail text specifically. */}
      <td className="p-1 align-top text-[11px] text-[#6b7280]">{detail}</td>
      <td className={`p-1 whitespace-nowrap text-right align-top ${strong ? "font-semibold text-ink" : "text-ink-secondary"} ${big ? "text-sm" : "text-xs"}`}>{value}</td>
    </tr>
  );
}
function EditField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-0.5 block text-[11px] font-medium text-ink-secondary">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
      />
    </div>
  );
}
