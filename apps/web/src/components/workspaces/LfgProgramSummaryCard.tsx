"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { lfgFormatPriorityRank, lfgPipelineStageOf } from "@/lib/lfgStatus";

// A single wide "how's the program actually going" summary, shown on the
// Site Master landing page right below the sites stat line -- distinct
// from the dedicated Programs page (workspaces/lfg/programs), which is a
// season-by-season drill-down; this is the always-visible, at-a-glance
// version: which season is current, and per FORMAT (APP, APR, Mono AAR,
// ... in LFG_FORMAT_PRIORITY's own order), how many sites are Active,
// Printed, Shipped, Delivered, and Installed. Deliberately its own small
// self-contained fetch (all sites, unfiltered by whatever the table above
// is currently searching/filtering) rather than reusing the page's own
// filtered `rows`, since this summary is meant to always reflect the
// whole program regardless of what's being searched right now.

interface SiteFormatRow {
  format: string | null;
  site_status: string;
  creative_received_at: string | null;
}

// The five stages worth a column here -- a site's own journey stage
// (lfgPipelineStageOf, the same classification the Programs page cards
// use), narrowed to the ones that actually read as "how far along":
// Survey/Creative Receipt/Schedule/Issues are left off to keep this row
// genuinely tiny, per format, not a restatement of every pipeline stage.
const SUMMARY_STAGES = [
  { key: "active", label: "Active" },
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
    <div className="mb-6 rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Programs</h2>
        {currentProgramName && (
          <span className="text-xs font-medium text-ink-secondary">
            Current season: <span className="font-semibold text-ink">{currentProgramName}</span>
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              <th className="py-1 pr-3 font-semibold">Format</th>
              {SUMMARY_STAGES.map((s) => (
                <th key={s.key} className="py-1 pr-3 text-right font-semibold">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {formats.map((format) => {
              const counts = byFormat.get(format)!;
              return (
                <tr key={format} className="border-t border-line">
                  <td className="py-1 pr-3 text-[11px] font-semibold uppercase tracking-wide text-ink">{format}</td>
                  {SUMMARY_STAGES.map((s) => (
                    <td key={s.key} className="py-1 pr-3 text-right text-[11px] tabular-nums text-ink-secondary">
                      {counts[s.key] ?? 0}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
