"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { DonutChart } from "@/components/ui/Charts";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows, statusDonutData } from "@/lib/dashboard-queries";
import { LFG_STAGE_BUCKETS, LFG_STAGE_BUCKET_BADGE, lfgStageBucketOf, type LfgStageBucketKey } from "@/lib/lfgStatus";

// Program Dashboard -- "by seeing that, understand which sites are getting
// installed, printed, shipped, active, inactive" grouped by program/chain
// (APP, APR, Mono AAR, Multi AAR, Croma, Reliance Digital, Vijay Sales, WC,
// etc.). Groups are whatever distinct values actually exist in
// lfg_sites.program -- deliberately not a hardcoded list, since that
// column is free text carried straight through from the Store Master /
// apple_lfg_sites imports and new chains get added there over time, not
// here. Every LFG_STATUSES value maps to exactly one of LFG_STAGE_BUCKETS
// (see lfgStatus.ts), so every bucket total plus every program's row always
// adds up to the same grand total as the Site Master list -- nothing is
// silently dropped into an "other" bucket.
//
// fetchAllRows is required, not a plain .select() -- lfg_sites already
// exceeds PostgREST's 1000-row default cap (see dashboard-queries.ts's own
// header comment on why this silently truncated other dashboards before).

interface SiteStageRow {
  program: string | null;
  site_status: string;
}

interface ProgramRow {
  id: string;
  program: string;
  total: number;
  survey: number;
  production: number;
  shipped: number;
  installation: number;
  active: number;
  inactive: number;
  issues: number;
}

interface DashboardData {
  rows: SiteStageRow[];
  programRows: ProgramRow[];
  bucketTotals: Record<LfgStageBucketKey, number>;
}

async function loadDashboard(): Promise<DashboardData> {
  const rows = await fetchAllRows<SiteStageRow>((from, to) =>
    supabase.from("lfg_sites").select("program, site_status").range(from, to)
  );

  const byProgram = new Map<string, ProgramRow>();
  const bucketTotals: Record<LfgStageBucketKey, number> = {
    survey: 0,
    production: 0,
    shipped: 0,
    installation: 0,
    active: 0,
    inactive: 0,
    issues: 0,
  };

  for (const r of rows) {
    const program = r.program?.trim() || "Unspecified";
    const bucket = lfgStageBucketOf(r.site_status);
    bucketTotals[bucket] += 1;

    let row = byProgram.get(program);
    if (!row) {
      row = { id: program, program, total: 0, survey: 0, production: 0, shipped: 0, installation: 0, active: 0, inactive: 0, issues: 0 };
      byProgram.set(program, row);
    }
    row.total += 1;
    row[bucket] += 1;
  }

  const programRows = [...byProgram.values()].sort((a, b) => b.total - a.total);

  return { rows, programRows, bucketTotals };
}

function BucketCell({ value }: { value: number }) {
  return <span className={value > 0 ? "font-medium text-ink" : "text-ink-muted"}>{value}</span>;
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

  const donutData = data
    ? statusDonutData(
        data.rows.map((r) => {
          const bucket = lfgStageBucketOf(r.site_status);
          return {
            status: LFG_STAGE_BUCKET_BADGE[bucket],
            status_label: LFG_STAGE_BUCKETS.find((b) => b.key === bucket)?.label ?? bucket,
          };
        })
      )
    : [];

  const COLUMNS: TableColumn<ProgramRow>[] = [
    { key: "program", header: "Program", sortable: true },
    { key: "survey", header: "New / Survey", sortable: true, render: (r) => <BucketCell value={r.survey} /> },
    { key: "production", header: "Printing", sortable: true, render: (r) => <BucketCell value={r.production} /> },
    { key: "shipped", header: "Shipped", sortable: true, render: (r) => <BucketCell value={r.shipped} /> },
    { key: "installation", header: "Installation", sortable: true, render: (r) => <BucketCell value={r.installation} /> },
    { key: "active", header: "Active", sortable: true, render: (r) => <BucketCell value={r.active} /> },
    { key: "inactive", header: "Inactive", sortable: true, render: (r) => <BucketCell value={r.inactive} /> },
    { key: "issues", header: "Issues", sortable: true, render: (r) => <BucketCell value={r.issues} /> },
    { key: "total", header: "Total", sortable: true, render: (r) => <span className="font-semibold text-ink">{r.total}</span> },
  ];

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
              Every LFG Connect site, grouped by program/chain (APP, Mono AAR, Croma, Reliance, Vijay Sales, WC, and
              whatever else appears in your data) and by where it sits in the pipeline.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => router.push("/workspaces/lfg")}>
          <ArrowLeft size={15} className="mr-1.5" /> Site Master
        </Button>
      </div>

      <div className="my-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total Sites" value={data ? String(data.rows.length) : "…"} trend="flat" trendLabel="Live count" />
        {LFG_STAGE_BUCKETS.map((b) => (
          <StatCard key={b.key} label={b.label} value={data ? String(data.bucketTotals[b.key]) : "…"} trend="flat" trendLabel="Sites" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-4 lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-ink">Pipeline distribution</h3>
          {data ? (
            donutData.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">No sites yet.</p>
            ) : (
              <DonutChart data={donutData} />
            )
          ) : (
            <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">By program / chain</h3>
            {data && <Badge status="neutral">{data.programRows.length} programs</Badge>}
          </div>
          {data === null ? (
            <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
          ) : data.programRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">No sites yet.</p>
          ) : (
            <Table
              columns={COLUMNS}
              rows={data.programRows}
              onRowClick={(r) => router.push(`/workspaces/lfg?q=${encodeURIComponent(r.program === "Unspecified" ? "" : r.program)}`)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
