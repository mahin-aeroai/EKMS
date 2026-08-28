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
// version of ONE season at a time: per FORMAT (APP, APR, Mono AAR, ... in
// LFG_FORMAT_PRIORITY's own order), how many of that season's sites are
// Active, Printed, Shipped, Delivered, and Installed, plus total sites
// and stores. A row of colored tiles (task feedback: "not like just a
// table") rather than a plain table -- each tile's color is the exact
// same per-format color the Site Cards' reference-picture placeholder
// uses (formatPlaceholderColor, shared via @/lib/lfg-format-colors), so a
// format reads as the same color in both places.
//
// Which season it shows is picked with the "Season" dropdown in the
// header -- defaults to the most recently created Program (there's no
// other "active season" flag to go by: lfg_programs.active defaults to
// true for every row and nothing ever exposes a way to change it), but
// task feedback ("current season is fixed ... let me pick a different
// one") asked for the ability to switch it, e.g. to check an OLDER
// season's final numbers without leaving Site Master. Deliberately its
// own small self-contained fetch (not the page's own filtered `rows`,
// which follows the search/format/status filters above, not the season)
// -- a site that belongs to a season other than the one selected here but
// happens to already be site_status = 'active' must NOT count, or a
// long-since-active site from a past wave would look like part of
// whichever season is currently selected.

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

export function LfgProgramSummaryCard() {
  // null = still loading, or there are no Programs at all yet.
  const [programs, setPrograms] = useState<ProgramOption[] | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [siteRows, setSiteRows] = useState<SiteFormatRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("lfg_programs")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as ProgramOption[] | null) ?? [];
        setPrograms(list);
        // Default to the most recently created Program (index 0) the
        // first time the list loads; don't stomp a season the person has
        // already picked if this effect ever re-ran.
        setSelectedProgramId((prev) => prev ?? list[0]?.id ?? null);
      });

    fetchAllRows<SiteFormatRow>((from, to) =>
      supabase.from("lfg_sites").select("program_id, format, site_status, creative_received_at, store_id").range(from, to)
    ).then(setSiteRows);
  }, []);

  if (programs === null || siteRows === null) return null;
  if (programs.length === 0 || selectedProgramId === null) return null; // no Program created yet -- nothing to summarize

  const selectedProgram = programs.find((p) => p.id === selectedProgramId) ?? programs[0];

  const byFormat = new Map<string, Record<string, number>>();
  // Total Sites/Stores per format (task: "in that card i want no of
  // stores and no of sites too" -- an all-zero tile, before this, read as
  // "this format has no sites in the season at all" when really it just
  // meant nothing had reached Active/Printed/Shipped/Delivered/Installed
  // yet, e.g. right after a bulk Move to Program before anyone's touched
  // status). Stores counted as distinct store_id, plus one per site with
  // no store_id yet (each of those is its own not-yet-backfilled "store"
  // -- same convention LfgSiteCardGrid's siteOrdinals uses).
  const siteCountByFormat = new Map<string, number>();
  const storeIdsByFormat = new Map<string, Set<string>>();
  const noStoreIdCountByFormat = new Map<string, number>();
  for (const r of siteRows) {
    if (r.program_id !== selectedProgram.id) continue; // only the selected season's sites
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
            value={selectedProgram.id}
            onChange={(e) => setSelectedProgramId(e.target.value)}
            className="rounded bg-[#D7F26D] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1E252B] outline-none"
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {formats.length === 0 ? (
        <p className="text-sm text-ink-muted">No sites have been moved into {selectedProgram.name} yet.</p>
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
                {/* Total Sites/Stores for the season, regardless of pipeline
                    stage -- see the header comment above this component for
                    why this matters: without it, a tile where nothing has
                    reached Active yet reads as "no sites in this format at
                    all", not "N sites, none started". */}
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
