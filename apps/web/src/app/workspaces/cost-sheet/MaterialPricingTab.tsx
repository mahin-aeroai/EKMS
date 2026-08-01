"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type { RawMaterialRow } from "@mmdi/shared/rows";

// "I saw some of them not having price, can we give provision to add
// pricing with date" -- most raw materials only get a Recent/Avg ₹/unit
// once they show up in the Jan-Jun 2026 purchase register or Raw
// Materials.xlsx; anything never purchased in that window (or new since)
// has no price at all, which shows as "no price" wherever a material is
// picked (BOM Master, the Cost Sheet alternatives dropdown). This tab is
// the manual fallback -- type in a price and the date it's from, same as
// if it had come from a purchase record, so BOM lines using that material
// stop costing ₹0.
export function MaterialPricingTab() {
  const { toast } = useToast();
  const [materials, setMaterials] = useState<RawMaterialRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAllRows<RawMaterialRow>((from, to) => supabase.from("raw_materials").select("*").order("code").range(from, to)).then(
      (rows) => setMaterials(rows)
    );
  }, []);

  async function updatePricing(
    m: RawMaterialRow,
    patch: Partial<Pick<RawMaterialRow, "unit_cost_recent" | "unit_cost_recent_date" | "unit_cost_avg">>
  ) {
    // Tagging the source as manual is what lets a later real purchase (or
    // a bulk price-list import) safely overwrite this later -- every other
    // migration this session's coalesce/backfill logic keys off
    // unit_cost_source to know whether a price is real purchase history or
    // just a placeholder worth replacing.
    const fullPatch = { ...patch, unit_cost_source: "Manually entered" };
    setSavingId(m.id);
    const { error } = await supabase.from("raw_materials").update(fullPatch).eq("id", m.id);
    setSavingId(null);
    if (error) {
      toast("danger", `Couldn't save: ${error.message}`);
      return;
    }
    setMaterials((prev) => prev?.map((x) => (x.id === m.id ? { ...x, ...fullPatch } : x)) ?? null);
  }

  const filtered = useMemo(() => {
    if (!materials) return [];
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (onlyMissing && m.unit_cost_recent !== null) return false;
      if (!q) return true;
      return m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [materials, query, onlyMissing]);

  const missingCount = useMemo(() => (materials ?? []).filter((m) => m.unit_cost_recent === null).length, [materials]);

  if (!materials) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;

  return (
    <div>
      <p className="mb-4 text-sm text-ink-secondary">
        {materials.length} raw materials.{" "}
        {missingCount > 0 && (
          <span className="text-warning">
            {missingCount} have no price yet (never purchased in the Jan-Jun 2026 register or Raw Materials.xlsx) -- set one
            below so BOM lines using them stop costing ₹0.
          </span>
        )}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code or name…"
          className="h-9 w-72 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink outline-none"
        />
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-line-strong"
          />
          Only show materials with no price
        </label>
        <span className="text-xs text-ink-muted">{filtered.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-surface-sunken text-left text-ink-secondary">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Recent ₹/unit</th>
              <th className="px-3 py-2">As of date</th>
              <th className="px-3 py-2">Avg ₹/unit</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((m) => (
              <tr key={m.id} className="border-b border-line/60 bg-surface">
                <td className="px-3 py-1.5 font-medium text-ink">{m.code}</td>
                <td className="px-3 py-1.5 text-ink-secondary">{m.name}</td>
                <td className="px-3 py-1.5 text-ink-secondary">{m.category ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={m.unit_cost_recent ?? ""}
                    placeholder="enter price"
                    onChange={(e) =>
                      updatePricing(m, { unit_cost_recent: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    className="h-8 w-24 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none placeholder:text-ink-muted"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="date"
                    value={m.unit_cost_recent_date ?? ""}
                    onChange={(e) => updatePricing(m, { unit_cost_recent_date: e.target.value === "" ? null : e.target.value })}
                    className="h-8 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={m.unit_cost_avg ?? ""}
                    placeholder="enter price"
                    onChange={(e) => updatePricing(m, { unit_cost_avg: e.target.value === "" ? null : Number(e.target.value) })}
                    className="h-8 w-24 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none placeholder:text-ink-muted"
                  />
                </td>
                <td className="px-3 py-1.5 text-ink-muted">
                  {m.unit_cost_source ?? "—"}
                  {savingId === m.id && <span className="ml-1">saving…</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 500 && (
          <p className="border-t border-line px-3 py-2 text-xs text-ink-muted">
            Showing the first 500 of {filtered.length} matches — narrow your search to see more.
          </p>
        )}
        {filtered.length === 0 && <p className="px-3 py-4 text-center text-xs text-ink-muted">No materials match.</p>}
      </div>
    </div>
  );
}
