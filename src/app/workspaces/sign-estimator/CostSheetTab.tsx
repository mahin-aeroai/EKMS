"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type SignEstimateRow } from "@/lib/supabase";
import { fmtRupee } from "@/lib/sign-estimator/calc";
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

  return (
    <div>
      <div className="mb-4 flex justify-end print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={14} /> Print / PDF
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-surface p-6">
        <div className="mb-6 flex items-start justify-between border-b border-line pb-4">
          <div>
            <div className="text-lg font-bold text-ink">MMDI ONE — Sign Estimator</div>
            <div className="text-sm text-ink-secondary">Professional Costing System</div>
          </div>
          <div className="text-right">
            <div className="text-base font-semibold text-ink">{row.ref}</div>
            <div className="text-xs text-ink-secondary">{new Date(row.created_at).toLocaleString("en-IN")}</div>
            <div className="text-sm text-ink">
              Client: <strong>{row.client ?? "—"}</strong>
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card title="Sign Specification">
            <KV k="Category" v={c.categoryLabel} />
            <KV k="Dimensions (entered)" v={`${c.dimW} × ${c.dimH} ${c.dimUnit}`} />
            <KV k="Dimensions (mm)" v={`${c.widthMM} × ${c.heightMM} mm`} />
            <KV k="Area" v={`${((c.widthMM / 304.8) * (c.heightMM / 304.8)).toFixed(3)} sq.ft`} />
            <KV k="Quantity" v={`${c.qty} pcs`} />
          </Card>
          <Card title="Financial Summary">
            <KV k="Material Cost" v={fmtRupee(c.pricing.raw)} />
            <KV k="Selling Price (ex-GST)" v={fmtRupee(c.pricing.sell)} />
            <KV k="GST Amount" v={fmtRupee(c.pricing.gstAmt)} />
            <KV k="Final Amount (incl. GST)" v={fmtRupee(c.pricing.final)} strong />
            <KV k="Gross Margin" v={`${c.pricing.margin}%`} />
          </Card>
        </div>

        {c.profile && (
          <Card title="Profile Costing (FFD Bin-Pack Optimised)" full>
            <KV k="Profile Type" v={c.profile.name} />
            <KV k="Stock Bar Length" v={`${c.profile.stockLenMM} mm`} />
            <KV k="Stock Bars Required" v={String(c.profile.barsRequired)} />
            <KV k="Material Utilisation" v={`${c.profile.utilPct}%`} />
            <KV k="Profile Cost" v={fmtRupee(c.profile.cost)} />
          </Card>
        )}

        {c.sheet && (
          <Card title="Backing Sheet (Area-Based Costing)" full>
            <KV k="Sheet Type" v={c.sheet.name} />
            <KV k="Sign Area" v={`${c.sheet.signSqFt} sq.ft`} />
            <KV k="Wastage %" v={`${c.sheet.wastePct}%`} />
            <KV k="Chargeable Area" v={`${c.sheet.chargeableSqFt} sq.ft`} />
            <KV k="Sheet Cost" v={fmtRupee(c.sheet.cost)} />
          </Card>
        )}

        {c.led && (
          <Card title="LED Illumination" full>
            <KV k="Model" v={c.led.modelName} />
            {c.led.mode === "module" ? (
              <>
                <KV k="Grid (Cols × Rows)" v={`${c.led.cols} × ${c.led.rows}`} />
                <KV k="Total Modules" v={String(c.led.count)} />
              </>
            ) : (
              <>
                <KV k="Vertical Bars" v={String(c.led.numBars)} />
                <KV k="Total Pieces" v={String(c.led.totalPieces)} />
              </>
            )}
            <KV k="Total Wattage" v={`${c.led.watt} W`} />
            <KV k="LED Cost" v={fmtRupee(c.led.cost)} />
          </Card>
        )}

        {c.driver && (
          <Card title="LED Driver" full>
            <KV k="Requirement" v={`${c.driver.requiredW} W`} />
            <KV k="Selected" v={`${c.driver.count} × ${c.driver.driverWatt}W`} />
            <KV k="Utilisation" v={`${c.driver.utilPct}%`} />
            <KV k="Driver Cost" v={fmtRupee(c.driver.cost)} />
          </Card>
        )}

        {c.print && (
          <Card title="Printing & Finishing" full>
            <KV k="Print Media" v={c.print.mediaName} />
            <KV k="Print Area" v={`${c.print.sqFt} sq.ft`} />
            <KV k="Finishing" v={c.print.finishingLabel} />
            <KV k="Print Cost" v={fmtRupee(c.print.cost)} />
          </Card>
        )}

        {c.accessories.length > 0 && (
          <Card title="Accessories" full>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-ink-secondary"><tr><th className="p-1 text-left">Item</th><th className="p-1 text-right">Qty</th><th className="p-1 text-right">Unit Cost</th><th className="p-1 text-right">Total</th></tr></thead>
                <tbody>
                  {c.accessories.map((a, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="p-1">{a.name}</td><td className="p-1 text-right">{a.qty} {a.unit}</td><td className="p-1 text-right">{fmtRupee(a.unitCost)}</td><td className="p-1 text-right">{fmtRupee(a.lineCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card title="Cost Build-Up" full>
          <KV k="Raw Material Cost" v={fmtRupee(c.pricing.raw)} />
          <KV k={`Overhead (${c.pricing.ovhPct}%)`} v={fmtRupee(c.pricing.ovh)} />
          <KV k="Labour" v={fmtRupee(c.pricing.labour)} />
          <KV k="Installation" v={fmtRupee(c.pricing.install)} />
          <KV k="Total Production Cost" v={fmtRupee(c.pricing.costAll)} strong />
          <KV k={`Markup (${c.pricing.markupPct}%)`} v={fmtRupee(c.pricing.sellBD - c.pricing.costAll)} />
          {c.pricing.discAmt > 0 && <KV k={`Discount (${c.pricing.discPct}%)`} v={`−${fmtRupee(c.pricing.discAmt)}`} />}
          <KV k="Selling Price (ex-GST)" v={fmtRupee(c.pricing.sell)} strong />
          <KV k={`GST ${c.pricing.gstPct}%`} v={fmtRupee(c.pricing.gstAmt)} />
          <KV k="Final Amount (incl. GST)" v={fmtRupee(c.pricing.final)} strong />
          <KV k="Gross Margin" v={`${c.pricing.margin}% (${fmtRupee(c.pricing.mgnAmt)})`} />
        </Card>

        <p className="mt-6 border-t border-line pt-3 text-center text-xs text-ink-muted">
          Generated by MMDI ONE Sign Estimator • {new Date(row.created_at).toLocaleString("en-IN")} • This is a system-generated estimate
        </p>
      </div>
    </div>
  );
}

function Card({ title, children, full }: { title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`mb-4 rounded-lg border border-line p-4 ${full ? "" : ""}`}>
      <div className="mb-2 text-sm font-semibold text-ink">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${strong ? "font-semibold text-ink" : "text-ink-secondary"}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
