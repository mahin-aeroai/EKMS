"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { lfgFormatPriorityRank, lfgPipelineStageOf } from "@/lib/lfgStatus";
import { formatPlaceholderColor, isLightColor } from "@/lib/lfg-format-colors";

// A single wide "how's the program actually going" summary, shown on the
// Site Master landing page right below the sites stat line -- distinct
// from the dedicated Programs page (workspaces/lfg/programs), which is a
// season-by-season drill-down; this is the always-visible, at-a-glance
// version: which season is current, and per FORMAT (APP, APR, Mono AAR,
// ... in LFG_FORMAT_PRIORITY's own order), how many sites are Active,
// Printed, Shipped, Delivered, and Installed. A row of colored tiles
// (task feedback: "not like just a table") rather than a plain table --
// each tile's color is the exact same per-format color the Site Cards'
// reference-picture placeholder uses (formatPlaceholderColor, shared via
// @/lib/lfg-format-colors), so a format reads as the same color in both
// places. Deliberately its own small self-contained fetch (all sites,
// unfiltered by whatever the table above is currently searching/
// filtering) rather than reusing the page's own filtered `rows`, since
// this summary is meant to always reflect the whole program regardless
// of what's being searched right now.

interface SiteFormatRow {
  format: string | null;
  site_status: string;
  creative_received_at: string | null;
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
  const [currentProgramName, setCurrentProgramName] = useState<string | null>(null);
  const [siteRows, setSiteRows] = useState<SiteFormatRow[] | null>(null);

  useEffect(() => {
    // Same "most recently created Program = current season" convention as
    // the Programs page -- lfg_programs.active defaults to true for every
    // row and nothing ever exposes a way to change it, so it can't be
    // used to tell current from past.
    supabase
      .from("lfg_programs")
      .select("name")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setCurrentProgramName((data as { name: string } | null)?.name ?? null));

    fetchAllRows<SiteFormatRow>((from, to) =>
      supabase.from("lfg_sites").select("format, site_status, creative_received_at").range(from, to)
    ).then(setSiteRows);
  }, []);

  if (siteRows === null || siteRows.length === 0) return null;

  const byFormat = new Map<string, Record<string, number>>();
  for (const r of siteRows) {
    const format = r.format?.trim() || "Unassigned";
    const stage = lfgPipelineStageOf(r.site_status, r.creative_received_at);
    const counts = byFormat.get(format) ?? {};
    counts[stage] = (counts[stage] ?? 0) + 1;
    byFormat.set(format, counts);
  }

  const formats = Array.from(byFormat.keys()).sort(
    (a, b) => lfgFormatPriorityRank(a) - lfgFormatPriorityRank(b) || a.localeCompare(b)
  );

  return (
    <div className="mb-6 rounded-2xl bg-surface-sunken p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Programs</h2>
        {currentProgramName && (
          <span className="inline-flex items-center rounded bg-[#D7F26D] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1E252B]">
            Current season · {currentProgramName}
          </span>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {formats.map((format) => {
          const counts = byFormat.get(format)!;
          const bg = formatPlaceholderColor(format);
          const fg = isLightColor(bg) ? "#1E252B" : "#FFFFFF";
          return (
            <div key={format} className="w-[168px] shrink-0 rounded-2xl p-4" style={{ background: bg }}>
              <p className="truncate text-[10px] font-bold uppercase tracking-wide" style={{ color: fg, opacity: 0.85 }}>
                {format}
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
    </div>
  );
}
