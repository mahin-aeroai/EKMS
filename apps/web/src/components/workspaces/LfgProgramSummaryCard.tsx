"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { lfgFormatPriorityRank, lfgPipelineStageOf } from "@/lib/lfgStatus";
import { formatPlaceholderColor, isLightColor } from "@/lib/lfg-format-colors";

// A single wide "how's a program actually going" summary, shown on the
// Site Master landing page right below the sites stat line -- distinct
// from the dedicated Programs page (workspaces/lfg/programs), which shows
// every season as a table; this is the always-visible, at-a-glance
// version of ONE season (or the whole inventory) at a time: per FORMAT
// (APP, APR, Mono AAR, ... in LFG_FORMAT_PRIORITY's own order), how many
// sites are Active, Printed, Shipped, Delivered, and Installed, plus
// total sites and stores. A row of colored tiles (task feedback: "not
// like just a table") rather than a plain table -- each tile's color is
// the exact same per-format color the Site Cards' reference-picture
// placeholder uses (formatPlaceholderColor, shared via
// @/lib/lfg-format-colors), so a format reads as the same color in both
// places.
//
// The "Season" dropdown in the header is a CONTROLLED input -- its value
// is the Site Master page's own programIdFilter, and picking a season
// here calls back up to set that filter, exactly like clicking a Program
// card on the dedicated Programs page does. Task feedback: "that
// selection has no meaning ... it should be all sites or filtered fall
// 2026 or any other program and it should be filtered" -- an earlier
// version kept its own separate "which season" state that only changed
// this card's own tiles, so switching it did nothing to the Total
// Sites/Showing counts or the site list right below. Now the dropdown
// and this card's tiles, the top stat strip, and the table/cards below
// all agree on the same filter, and the usual "Program: <name>" chip +
// clear button (rendered by the page itself once programIdFilter is set)
// works the same way here as it does for a Programs-page click-through.
// "" means All Sites -- no program filter, matching the page's own
// unfiltered default.
//
// Deliberately its own small self-contained fetch for the per-format
// breakdown (not the page's own filtered `rows`, which additionally
// follows the search/status/format filters up top) -- this card only
// ever cares about the Season selection, not the rest of the page's
// filters, so a Format Dashboard click-through landing on this page with
// ?format= set doesn't also narrow these tiles to one format.

interface ProgramOption {
  id: string;
  name: string;
}

interface SiteFormatRow {
  program_id: string | null;
  format: string | null;
  site_status: string;
  creative_received_at: string | null;
  store_id: string | null;
}

// The four secondary stages shown per tile, below the headline Active
// count -- narrowed from the full pipeline (Survey/Creative Receipt/
// Schedule/Issues left off) to keep each tile readable at a glance.
const SECONDARY_STAGES = [
  { key: "printing", label: "Printed" },
  { key: "shipping", label: "Shipped" },
  { key: "delivery", label: "Delivered" },
  { key: "installation", label: "Installed" },
] as const;

interface LfgProgramSummaryCardProps {
  // "" = All Sites (no program filter).
  selectedProgramId: string;
  onSelectProgram: (id: string, name: string) => void;
}

export function LfgProgramSummaryCard({ selectedProgramId, onSelectProgram }: LfgProgramSummaryCardProps) {
  const [programs, setPrograms] = useState<ProgramOption[] | null>(null);
  const [siteRows, setSiteRows] = useState<SiteFormatRow[] | null>(null);

  useEffect(() => {
    // Newest first, purely to order the dropdown with the most recent
    // season at the top -- no other meaning attaches to the ordering
    // (lfg_programs.active defaults to true for every row and nothing
    // ever exposes a way to change it, so it can't be used to tell
    // current from past).
    supabase
      .from("lfg_programs")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => setPrograms((data as ProgramOption[] | null) ?? []));

    fetchAllRows<SiteFormatRow>((from, to) =>
      supabase.from("lfg_sites").select("program_id, format, site_status, creative_received_at, store_id").range(from, to)
    ).then(setSiteRows);
  }, []);

  if (programs === null || siteRows === null) return null;

  const scopedRows = selectedProgramId ? siteRows.filter((r) => r.program_id === selectedProgramId) : siteRows;
  const selectedProgramName = selectedProgramId ? (programs.find((p) => p.id === selectedProgramId)?.name ?? "") : "All Sites";

  const byFormat = new Map<string, Record<string, number>>();
  // Total Sites/Stores per format (task: "in that card i want no of
  // stores and no of sites too" -- an all-zero tile, before this, read as
  // "this format has no sites at all" when really it just meant nothing
  // had reached Active/Printed/Shipped/Delivered/Installed yet, e.g.
  // right after a bulk Move to Program before anyone's touched status).
  // Stores counted as distinct store_id, plus one per site with no
  // store_id yet (each of those is its own not-yet-backfilled "store" --
  // same convention LfgSiteCardGrid's siteOrdinals uses).
  const siteCountByFormat = new Map<string, number>();
  const storeIdsByFormat = new Map<string, Set<string>>();
  const noStoreIdCountByFormat = new Map<string, number>();
  for (const r of scopedRows) {
    const format = r.format?.trim() || "Unassigned";
    const stage = lfgPipelineStageOf(r.site_status, r.creative_received_at);
    const counts = byFormat.get(format) ?? {};
    counts[stage] = (counts[stage] ?? 0) + 1;
    byFormat.set(format, counts);

    siteCountByFormat.set(format, (siteCountByFormat.get(format) ?? 0) + 1);
    if (r.store_id) {
      const ids = storeIdsByFormat.get(format) ?? new Set<string>();
      ids.add(r.store_id);
      storeIdsByFormat.set(format, ids);
    } else {
      noStoreIdCountByFormat.set(format, (noStoreIdCountByFormat.get(format) ?? 0) + 1);
    }
  }
  const storeCountByFormat = new Map<string, number>();
  for (const format of siteCountByFormat.keys()) {
    storeCountByFormat.set(format, (storeIdsByFormat.get(format)?.size ?? 0) + (noStoreIdCountByFormat.get(format) ?? 0));
  }

  const formats = Array.from(byFormat.keys()).sort(
    (a, b) => lfgFormatPriorityRank(a) - lfgFormatPriorityRank(b) || a.localeCompare(b)
  );

  return (
    <div className="mb-6 rounded-2xl bg-surface-sunken p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Programs</h2>
        <label className="inline-flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Season</span>
          <select
            value={selectedProgramId}
            onChange={(e) => {
              const id = e.target.value;
              const name = id ? (programs.find((p) => p.id === id)?.name ?? "") : "";
              onSelectProgram(id, name);
            }}
            className="rounded bg-[#D7F26D] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1E252B] outline-none"
          >
            <option value="">All Sites</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {formats.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {selectedProgramId ? `No sites have been moved into ${selectedProgramName} yet.` : "No sites yet."}
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {formats.map((format) => {
            const counts = byFormat.get(format)!;
            const siteCount = siteCountByFormat.get(format) ?? 0;
            const storeCount = storeCountByFormat.get(format) ?? 0;
            const bg = formatPlaceholderColor(format);
            const fg = isLightColor(bg) ? "#1E252B" : "#FFFFFF";
            return (
              <div key={format} className="w-[168px] shrink-0 rounded-2xl p-4" style={{ background: bg }}>
                <p className="truncate text-[10px] font-bold uppercase tracking-wide" style={{ color: fg, opacity: 0.85 }}>
                  {format}
                </p>
                {/* Total Sites/Stores for the current selection, regardless
                    of pipeline stage -- see the header comment above this
                    component for why this matters: without it, a tile
                    where nothing has reached Active yet reads as "no sites
                    in this format at all", not "N sites, none started". */}
                <p className="mt-1 truncate text-[11px] font-semibold" style={{ color: fg, opacity: 0.9 }}>
                  {siteCount} site{siteCount === 1 ? "" : "s"} · {storeCount} store{storeCount === 1 ? "" : "s"}
                </p>
                <p className="mt-1.5 text-3xl font-extrabold leading-none" style={{ color: fg }}>
                  {counts.active ?? 0}
                </p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: fg, opacity: 0.7 }}>
                  Active
                </p>
                <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5 border-t pt-2.5" style={{ borderTopColor: `${fg}33` }}>
                  {SECONDARY_STAGES.map((s) => (
                    <div key={s.key}>
                      <p className="text-sm font-bold leading-none" style={{ color: fg }}>
                        {counts[s.key] ?? 0}
                      </p>
                      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide" style={{ color: fg, opacity: 0.65 }}>
                        {s.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
