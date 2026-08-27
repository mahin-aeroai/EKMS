"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { StatCard } from "@/components/ui/Card";
import { DonutChart } from "@/components/ui/Charts";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows, DONUT_COLOR } from "@/lib/dashboard-queries";
import { LFG_PIPELINE_STAGES, LFG_PIPELINE_STAGE_BADGE, lfgPipelineStageOf, lfgFormatPriorityRank, type LfgPipelineStageKey } from "@/lib/lfgStatus";

// Format Dashboard -- "understand which sites are getting installed,
// printed, shipped, active, inactive" grouped by format/chain (APP, APR,
// Mono AAR, Multi AAR, Croma, Reliance, Vijay Sales, Pai International,
// WC, etc.). Groups are whatever distinct values actually exist in
// lfg_sites.format -- deliberately not a hardcoded list, since that
// column is free text carried straight through from the Store Master /
// apple_lfg_sites imports and new chains get added there over time, not
// here. The priority order and stage order below ARE hardcoded, exactly as
// given: formats sort by LFG_FORMAT_PRIORITY (then alphabetically for
// anything not on that list); every LFG_STATUSES value maps to exactly one
// of LFG_PIPELINE_STAGES (see lfgStatus.ts), so every format's 10 stage
// counts always add up to its own total, and every total adds up to the
// grand total -- nothing silently dropped into an "other" bucket.
//
// Named "Format Dashboard" (was "Program Dashboard") -- renamed once the
// seasonal-wave lfg_programs concept ("Program": Spring Refresh 2025, Fall
// Refresh 2025/26, ...) was introduced, so this page's own grouping
// (retail chain/format) doesn't collide with that name. See lfgStatus.ts's
// LFG_FORMAT_PRIORITY header comment and the schema's lfg_programs table.
//
// One donut per format, not one shared chart -- each format's card shows
// only ITS OWN breakdown, so a small chain's chart isn't dwarfed by a big
// one the way a single combined chart would.
//
// fetchAllRows is required, not a plain .select() -- lfg_sites already
// exceeds PostgREST's 1000-row default cap (see dashboard-queries.ts's own
// header comment on why this silently truncated other dashboards before).

interface SiteStageRow {
  format: string | null;
  site_status: string;
  creative_received_at: string | null;
}

type StageCounts = Record<LfgPipelineStageKey, number>;

interface FormatGroup {
  id: string;
  format: string;
  total: number;
  counts: StageCounts;
}

interface DashboardData {
  totalCount: number;
  overallCounts: StageCounts;
  formatGroups: FormatGroup[];
}

type FormatTableRow = FormatGroup & StageCounts;

function emptyCounts(): StageCounts {
  return {
    active: 0,
    inactive: 0,
    survey: 0,
    creative_receipt: 0,
    printing: 0,
    shipping: 0,
    delivery: 0,
    schedule: 0,
    installation: 0,
    issues: 0,
  };
}

async function loadDashboard(): Promise<DashboardData> {
  const rows = await fetchAllRows<SiteStageRow>((from, to) =>
    supabase.from("lfg_sites").select("format, site_status, creative_received_at").range(from, to)
  );

  const overallCounts = emptyCounts();
  const byFormat = new Map<string, FormatGroup>();

  for (const r of rows) {
    const format = r.format?.trim() || "Unspecified";
    const stage = lfgPipelineStageOf(r.site_status, r.creative_received_at);
    overallCounts[stage] += 1;

    let group = byFormat.get(format);
    if (!group) {
      group = { id: format, format, total: 0, counts: emptyCounts() };
      byFormat.set(format, group);
    }
    group.total += 1;
    group.counts[stage] += 1;
  }

  const formatGroups = [...byFormat.values()].sort((a, b) => {
    const rankDiff = lfgFormatPriorityRank(a.format) - lfgFormatPriorityRank(b.format);
    return rankDiff !== 0 ? rankDiff : a.format.localeCompare(b.format);
  });

  return { totalCount: rows.length, overallCounts, formatGroups };
}

/** Same destination the numeric table's row click and each donut card's
 * click use -- a `?format=` param, distinct from the Site Master list's
 * existing `?q=` free-text seeding (and from the separate `?program_id=`
 * seasonal-Program filter, task #45), so this is a strict exact-match
 * filter to only that format's sites rather than a fuzzy search. */
function formatHref(format: string): string {
  return `/workspaces/lfg?format=${encodeURIComponent(format)}`;
}

function FormatCard({ group, onOpen }: { group: FormatGroup; onOpen: (format: string) => void }) {
  const donutData = LFG_PIPELINE_STAGES.filter((s) => group.counts[s.key] > 0).map((s) => ({
    label: s.label,
    value: group.counts[s.key],
    color: DONUT_COLOR[LFG_PIPELINE_STAGE_BADGE[s.key]],
  }));

  return (
    <button
      type="button"
      onClick={() => onOpen(group.format)}
      className="rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-primary hover:bg-surface-sunken"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{group.format}</h3>
        <span className="text-xs text-ink-muted">{group.total} sites</span>
      </div>
      {donutData.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-muted">No sites.</p>
      ) : (
        <DonutChart data={donutData} />
      )}
    </button>
  );
}

export default function LfgDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);

  function openFormat(format: string) {
    router.push(formatHref(format));
  }

  // Flattens each group's `counts` onto the row itself (active, printing,
  // ... match LfgPipelineStageKey 1:1) so every stage can be its own
  // TableColumn with a distinct, real `keyof` key -- rather than 10 columns
  // all keyed "counts" with a render() override, which would give the
  // underlying <Table>'s th/td elements duplicate React keys.
  const formatTableRows: FormatTableRow[] = (data?.formatGroups ?? []).map((g) => ({ ...g, ...g.counts }));

  const FORMAT_TABLE_COLUMNS: TableColumn<FormatTableRow>[] = [
    { key: "format", header: "Format / Chain", sortable: true },
    { key: "total", header: "Total", sortable: true },
    ...LFG_PIPELINE_STAGES.map((s) => ({ key: s.key, header: s.label, sortable: true }) as TableColumn<FormatTableRow>),
  ];

  useEffect(() => {
    loadDashboard()
      .then(setData)
      .catch(() => toast("danger", "Couldn't load the LFG dashboard from Supabase"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Dashboard" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <LayoutDashboard size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Format Dashboard</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">
              One chart per format/chain, each showing where its own sites sit in the pipeline.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => router.push("/workspaces/lfg")}>
          <ArrowLeft size={15} className="mr-1.5" /> Site Master
        </Button>
      </div>

      <div className="my-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <StatCard label="Total Sites" value={data ? String(data.totalCount) : "…"} trend="flat" trendLabel="Live count" />
        {LFG_PIPELINE_STAGES.map((s) => (
          <StatCard key={s.key} label={s.label} value={data ? String(data.overallCounts[s.key]) : "…"} trend="flat" trendLabel="Sites" />
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-ink">By format / chain</h2>
      {data === null ? (
        <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
      ) : data.formatGroups.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No sites yet.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-ink-muted">Click a format&apos;s row or chart to see only that format&apos;s sites.</p>
          <div className="mb-6">
            <Table columns={FORMAT_TABLE_COLUMNS} rows={formatTableRows} onRowClick={(r) => openFormat(r.format)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.formatGroups.map((g) => (
              <FormatCard key={g.format} group={g} onOpen={openFormat} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
