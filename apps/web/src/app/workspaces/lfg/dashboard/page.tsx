"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { StatCard } from "@/components/ui/Card";
import { DonutChart } from "@/components/ui/Charts";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows, DONUT_COLOR } from "@/lib/dashboard-queries";
import { LFG_PIPELINE_STAGES, LFG_PIPELINE_STAGE_BADGE, lfgPipelineStageOf, lfgProgramPriorityRank, type LfgPipelineStageKey } from "@/lib/lfgStatus";

// Program Dashboard -- "understand which sites are getting installed,
// printed, shipped, active, inactive" grouped by program/chain (APP, APR,
// Mono AAR, Multi AAR, Croma, Reliance, Vijay Sales, Pai International,
// WC, etc.). Groups are whatever distinct values actually exist in
// lfg_sites.program -- deliberately not a hardcoded list, since that
// column is free text carried straight through from the Store Master /
// apple_lfg_sites imports and new chains get added there over time, not
// here. The priority order and stage order below ARE hardcoded, exactly as
// given: programs sort by LFG_PROGRAM_PRIORITY (then alphabetically for
// anything not on that list); every LFG_STATUSES value maps to exactly one
// of LFG_PIPELINE_STAGES (see lfgStatus.ts), so every program's 10 stage
// counts always add up to its own total, and every total adds up to the
// grand total -- nothing silently dropped into an "other" bucket.
//
// One donut per program, not one shared chart -- each program's card shows
// only ITS OWN breakdown, so a small chain's chart isn't dwarfed by a big
// one the way a single combined chart would.
//
// fetchAllRows is required, not a plain .select() -- lfg_sites already
// exceeds PostgREST's 1000-row default cap (see dashboard-queries.ts's own
// header comment on why this silently truncated other dashboards before).

interface SiteStageRow {
  program: string | null;
  site_status: string;
  creative_received_at: string | null;
}

type StageCounts = Record<LfgPipelineStageKey, number>;

interface ProgramGroup {
  program: string;
  total: number;
  counts: StageCounts;
}

interface DashboardData {
  totalCount: number;
  overallCounts: StageCounts;
  programGroups: ProgramGroup[];
}

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
    supabase.from("lfg_sites").select("program, site_status, creative_received_at").range(from, to)
  );

  const overallCounts = emptyCounts();
  const byProgram = new Map<string, ProgramGroup>();

  for (const r of rows) {
    const program = r.program?.trim() || "Unspecified";
    const stage = lfgPipelineStageOf(r.site_status, r.creative_received_at);
    overallCounts[stage] += 1;

    let group = byProgram.get(program);
    if (!group) {
      group = { program, total: 0, counts: emptyCounts() };
      byProgram.set(program, group);
    }
    group.total += 1;
    group.counts[stage] += 1;
  }

  const programGroups = [...byProgram.values()].sort((a, b) => {
    const rankDiff = lfgProgramPriorityRank(a.program) - lfgProgramPriorityRank(b.program);
    return rankDiff !== 0 ? rankDiff : a.program.localeCompare(b.program);
  });

  return { totalCount: rows.length, overallCounts, programGroups };
}

function ProgramCard({ group }: { group: ProgramGroup }) {
  const donutData = LFG_PIPELINE_STAGES.filter((s) => group.counts[s.key] > 0).map((s) => ({
    label: s.label,
    value: group.counts[s.key],
    color: DONUT_COLOR[LFG_PIPELINE_STAGE_BADGE[s.key]],
  }));

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{group.program}</h3>
        <span className="text-xs text-ink-muted">{group.total} sites</span>
      </div>
      {donutData.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-muted">No sites.</p>
      ) : (
        <DonutChart data={donutData} />
      )}
    </div>
  );
}

export default function LfgDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);

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
            <h1 className="text-xl font-semibold text-ink">Program Dashboard</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">
              One chart per program/chain, each showing where its own sites sit in the pipeline.
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

      <h2 className="mb-3 text-sm font-semibold text-ink">By program / chain</h2>
      {data === null ? (
        <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
      ) : data.programGroups.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No sites yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.programGroups.map((g) => (
            <ProgramCard key={g.program} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
