"use client";

// "Apply Rate Card" -- 11 Sept 2026 task: "LFG connect new rate card to
// update finance data[,] if not matching with product ask me i will map
// it." Opened from a header button on the Estimates page
// (LfgEstimatesClient.tsx), operating on whatever site list is CURRENTLY
// SHOWING there -- so Program/Format/Partner/search filters already scope
// which sites this run touches, same as every other LFG Connect list
// screen; there's no separate "which sites" question to ask here.
//
// Matching: lfg_sites.material (free text, e.g. "Endutex BWX") almost
// never matches the Rate Card's own free-text Substrate column exactly
// (e.g. "Endutex BWX 500") -- so every DISTINCT material value among the
// sites on screen is looked up in lfg_material_rate_map (a reusable,
// admin/editor-maintained mapping, same shape and reasoning as the
// Distribution tool's distribution_item_type_rate_map). Unmapped
// materials get an inline "map to a Rate Card SKU" picker right here --
// mapped once, reused automatically for every future site/season sharing
// that material string, exactly per Srinivas's "if not matching with
// product ask me i will map it".
//
// Conversion: confirmed with Srinivas ("we use SQFt price convert and
// assign the rate") -- the Rate Card's "Revised Rate (INR) Each" is a
// per-SQM price (its SQM column is always 1), converted here to a
// per-SQFT rate (÷ 10.7639) since lfg_site_financials.rate/amount and
// lfg_sites.sqft are both SQFT-native. A site with no Sqft on file still
// gets a Rate (useful on its own) but no Amount.
//
// Writes ONLY lfg_site_financials.rate/amount (+ updated_at/updated_by) --
// every other financial field (packing_forwarding, gst_amount,
// installation_amount, total_project_cost, margin, ...) is left exactly
// as it was, matching the upsert-a-subset-of-columns pattern already used
// by this same page's own EditExecutionDialog (which upserts only a
// subset of lfg_installation_costs). Nothing is written until a staff
// member reviews the before -> after preview below and hits Apply --
// same "preview before anything destructive/bulk" discipline as every
// other data-changing screen in LFG Connect this cycle (Bulk Import,
// the archive migration).

import { useMemo, useState } from "react";
import { X, AlertTriangle, CheckCircle2, Tags } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { formatInr } from "@/lib/lfgStatus";
import type { DistributionRateCardRow } from "@/lib/distribution/types";
import type { LfgEstimateSiteRow } from "@/lib/lfgEstimatesExport";

// 1 SQM = 10.7639 SQFT -- standard conversion factor, applied to turn the
// Rate Card's per-SQM "Revised Rate" into the per-SQFT rate this app's
// financials are priced in.
const SQM_TO_SQFT = 10.7639;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface LfgMaterialRateMapRow {
  material: string;
  rate_card_sku_id: string | null;
  mapped_by: string | null;
  mapped_at: string;
}

interface MaterialGroup {
  key: string; // normalized (trimmed, lowercased) -- used for lookups
  label: string; // first-seen raw material text -- what gets saved to lfg_material_rate_map and shown to the user
  siteRows: LfgEstimateSiteRow[];
}

interface PreviewLine {
  site: LfgEstimateSiteRow;
  newRate: number | null;
  newAmount: number | null;
  changed: boolean;
}

export function LfgApplyRateCardDialog({
  rows,
  rateCards,
  materialMap,
  onMaterialMapChanged,
  onApplied,
  onClose,
}: {
  rows: LfgEstimateSiteRow[];
  rateCards: DistributionRateCardRow[];
  materialMap: LfgMaterialRateMapRow[];
  onMaterialMapChanged: (row: LfgMaterialRateMapRow) => void;
  onApplied: (siteIds: string[]) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [savingMapping, setSavingMapping] = useState<string | null>(null); // material key currently being saved
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);

  const rateCardBySkuId = useMemo(() => new Map(rateCards.map((r) => [r.sku_id, r])), [rateCards]);
  const rateCardOptions = useMemo(
    () =>
      [...rateCards].sort((a, b) =>
        (a.sku_description ?? a.category ?? a.program ?? a.sku_id).localeCompare(b.sku_description ?? b.category ?? b.program ?? b.sku_id)
      ),
    [rateCards]
  );
  const mapByKey = useMemo(() => new Map(materialMap.map((m) => [m.material.trim().toLowerCase(), m])), [materialMap]);

  const { materialGroups, noMaterialCount } = useMemo(() => {
    const groups = new Map<string, MaterialGroup>();
    let noMaterial = 0;
    for (const r of rows) {
      const raw = (r.material ?? "").trim();
      if (!raw) {
        noMaterial++;
        continue;
      }
      const key = raw.toLowerCase();
      let g = groups.get(key);
      if (!g) {
        g = { key, label: raw, siteRows: [] };
        groups.set(key, g);
      }
      g.siteRows.push(r);
    }
    return { materialGroups: [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)), noMaterialCount: noMaterial };
  }, [rows]);

  const unmappedGroups = materialGroups.filter((g) => !mapByKey.get(g.key)?.rate_card_sku_id);
  const mappedGroups = materialGroups.filter((g) => mapByKey.get(g.key)?.rate_card_sku_id);

  // Every site whose material IS mapped, with the rate/amount this run
  // would write -- `changed` flags a real difference from what's on file
  // today so the preview table can call those out, but every mapped row
  // still defaults to checked (including an unchanged one) since
  // confirming "still correct" is a fine outcome too.
  const previewLines: PreviewLine[] = useMemo(() => {
    const lines: PreviewLine[] = [];
    for (const g of mappedGroups) {
      const mapRow = mapByKey.get(g.key);
      const rateCard = mapRow?.rate_card_sku_id ? rateCardBySkuId.get(mapRow.rate_card_sku_id) : undefined;
      const perSqft = rateCard?.revised_rate_2026 != null ? round2(rateCard.revised_rate_2026 / SQM_TO_SQFT) : null;
      for (const site of g.siteRows) {
        const newAmount = perSqft !== null && site.sqft != null ? round2(perSqft * site.sqft) : null;
        const changed = perSqft !== site.rate || newAmount !== site.amount;
        lines.push({ site, newRate: perSqft, newAmount, changed });
      }
    }
    return lines.sort((a, b) => (a.site.sfoId ?? "").localeCompare(b.site.sfoId ?? ""));
  }, [mappedGroups, mapByKey, rateCardBySkuId]);

  const checkedCount = previewLines.filter((l) => checked[l.site.id] ?? true).length;

  async function saveMaterialMapping(materialKey: string, materialLabel: string, skuId: string) {
    setSavingMapping(materialKey);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const patch = { material: materialLabel, rate_card_sku_id: skuId || null, mapped_by: user?.id ?? null, mapped_at: new Date().toISOString() };
      const { error } = await supabase.from("lfg_material_rate_map").upsert(patch, { onConflict: "material" });
      if (error) {
        toast("danger", `Couldn't save mapping: ${error.message}`);
        return;
      }
      onMaterialMapChanged(patch);
    } finally {
      setSavingMapping(null);
    }
  }

  async function handleApply() {
    const toApply = previewLines.filter((l) => checked[l.site.id] ?? true);
    if (toApply.length === 0) return;
    setApplying(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const nowIso = new Date().toISOString();
      const patchRows = toApply.map((l) => ({
        site_id: l.site.id,
        rate: l.newRate,
        amount: l.newAmount,
        updated_at: nowIso,
        updated_by: user?.id ?? null,
      }));
      // Chunked the same way RateCardImportClient's own bulk upsert is --
      // a filtered Estimates list is realistically well under this, but
      // there's no reason to assume that stays true forever.
      const CHUNK = 500;
      for (let i = 0; i < patchRows.length; i += CHUNK) {
        const { error } = await supabase.from("lfg_site_financials").upsert(patchRows.slice(i, i + CHUNK), { onConflict: "site_id" });
        if (error) {
          toast("danger", `Apply failed partway through: ${error.message}`);
          setApplying(false);
          return;
        }
      }
      setAppliedCount(patchRows.length);
      toast("success", `Updated Rate/Amount for ${patchRows.length} site(s).`);
      onApplied(patchRows.map((r) => r.site_id));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div role="dialog" aria-modal="true" className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-surface-overlay shadow-4">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Tags size={16} className="text-ink-muted" />
            <h3 className="text-sm font-semibold text-ink">Apply Rate Card</h3>
            <Badge>{rows.length} site(s) in view</Badge>
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-sunken">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <p className="text-xs text-ink-secondary">
            Matches each site&apos;s Material against the Rate Card by Substrate, converts the per-SQM Revised Rate to a
            per-SQFT Rate (÷{SQM_TO_SQFT}), and computes Amount = Rate × Sqft. Only Rate/Amount are written — every other
            financial field stays untouched. Scoped to the {rows.length} site(s) currently shown on the Estimates page
            (your Program/Format/Partner/search filters).
          </p>

          {noMaterialCount > 0 && (
            <p className="rounded-md bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
              {noMaterialCount} site(s) in view have no Material set and are skipped — nothing to match against.
            </p>
          )}

          {unmappedGroups.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
              <div className="mb-2 flex items-start gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
                <div>
                  <p className="text-sm font-medium text-ink">
                    {unmappedGroups.length} material(s) aren&apos;t mapped to a Rate Card SKU yet (
                    {unmappedGroups.reduce((n, g) => n + g.siteRows.length, 0)} site(s))
                  </p>
                  <p className="text-xs text-ink-secondary">
                    Map each one once below — reused automatically for every site with that same Material from now on.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {unmappedGroups.map((g) => (
                  <div key={g.key} className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-xs">
                    <span className="flex-1 font-medium text-ink">
                      {g.label} <span className="text-ink-muted">({g.siteRows.length} site(s))</span>
                    </span>
                    <select
                      defaultValue=""
                      disabled={savingMapping === g.key}
                      onChange={(e) => e.target.value && saveMaterialMapping(g.key, g.label, e.target.value)}
                      className="w-96 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                    >
                      <option value="" disabled>
                        Map to a Rate Card SKU…
                      </option>
                      {rateCardOptions.map((r) => (
                        <option key={r.sku_id} value={r.sku_id}>
                          {r.sku_description ?? r.category ?? r.program ?? "—"} ({r.sku_id})
                          {r.substrate ? ` — ${r.substrate}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewLines.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-ink">Preview — {checkedCount} of {previewLines.length} selected</span>
                {appliedCount !== null && (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 size={13} /> {appliedCount} applied
                  </span>
                )}
              </div>
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full text-xs">
                  <thead className="bg-surface-sunken text-ink-secondary">
                    <tr>
                      <th className="px-2 py-1.5 text-left">
                        <input
                          type="checkbox"
                          checked={checkedCount === previewLines.length}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setChecked(Object.fromEntries(previewLines.map((l) => [l.site.id, v])));
                          }}
                        />
                      </th>
                      <th className="px-2 py-1.5 text-left">Outlet</th>
                      <th className="px-2 py-1.5 text-left">SFO ID</th>
                      <th className="px-2 py-1.5 text-left">Material</th>
                      <th className="px-2 py-1.5 text-right">Sqft</th>
                      <th className="px-2 py-1.5 text-right">Rate (was → new)</th>
                      <th className="px-2 py-1.5 text-right">Amount (was → new)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewLines.map((l) => (
                      <tr key={l.site.id} className={`border-t border-line ${l.changed ? "" : "opacity-60"}`}>
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={checked[l.site.id] ?? true}
                            onChange={(e) => setChecked((prev) => ({ ...prev, [l.site.id]: e.target.checked }))}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-ink">{l.site.outletName}</td>
                        <td className="px-2 py-1.5 text-ink-secondary">{l.site.sfoId ?? "—"}</td>
                        <td className="px-2 py-1.5 text-ink-secondary">{l.site.material}</td>
                        <td className="px-2 py-1.5 text-right text-ink-secondary">{l.site.sqft ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right text-ink-secondary">
                          {formatInr(l.site.rate)} → <span className="font-medium text-ink">{formatInr(l.newRate)}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-ink-secondary">
                          {formatInr(l.site.amount)} → <span className="font-medium text-ink">{formatInr(l.newAmount)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {materialGroups.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-muted">No sites with a Material on file in the current view.</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <span className="text-xs text-ink-muted">
            {rateCards.length === 0 ? "No Rate Card imported yet — import one from Distribution → Rate Card first." : " "}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              {appliedCount !== null ? "Close" : "Cancel"}
            </Button>
            {appliedCount === null && (
              <Button size="sm" onClick={handleApply} loading={applying} disabled={checkedCount === 0}>
                Apply to {checkedCount} site(s)
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
