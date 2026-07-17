"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Timeline } from "@/components/ui/Timeline";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type ComplianceFindingRow } from "@/lib/supabase";

const ALL = "All";
const CATEGORIES = [ALL, "Internal Audit", "Training", "License/Certificate", "Compliance Document"];

const COLUMNS: TableColumn<ComplianceFindingRow>[] = [
  { key: "item", header: "Item", sortable: true },
  { key: "area", header: "Area", sortable: true, render: (r) => r.area ?? "—" },
  { key: "category", header: "Category", sortable: true, render: (r) => r.category ?? "—" },
  { key: "frequency", header: "Cadence", sortable: true, render: (r) => r.frequency ?? "—" },
  { key: "due_date", header: "Next Due", sortable: true, render: (r) => r.due_date ?? "—" },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

export default function CompliancePage() {
  const { toast } = useToast();
  const [findings, setFindings] = useState<ComplianceFindingRow[] | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(ALL);

  useEffect(() => {
    supabase
      .from("compliance_findings")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load compliance findings from Supabase");
          return;
        }
        setFindings(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overdue = findings?.filter((f) => f.status === "danger").length ?? 0;
  const licensesActive = findings?.filter((f) => f.category === "License/Certificate" && f.status !== "danger").length ?? null;
  const dueWithin60Days = findings?.filter((f) => f.status === "warning").length ?? null;

  const visibleFindings = findings?.filter((f) => categoryFilter === ALL || f.category === categoryFilter) ?? null;

  const upcoming = (findings ?? [])
    .filter((f): f is ComplianceFindingRow & { due_date: string } => Boolean(f.due_date))
    .slice()
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
    .slice(0, 12);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Compliance" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-danger-tint text-danger">
            <ShieldCheck size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Compliance</h1>
              {findings && overdue > 0 && <Badge status="danger">{overdue} overdue item{overdue === 1 ? "" : "s"}</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              IWAY internal audit checklist — certifications, training, and license renewal schedule
            </p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Checklist Items" value={findings === null ? "—" : String(findings.length)} />
        <StatCard label="Licenses/Certificates Active" value={licensesActive === null ? "—" : String(licensesActive)} />
        <StatCard label="Due Within 60 Days" value={dueWithin60Days === null ? "—" : String(dueWithin60Days)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              categoryFilter === c
                ? "border-primary bg-primary text-on-brand"
                : "border-line text-ink-secondary hover:bg-surface-sunken"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">
              Checklist items{categoryFilter !== ALL ? ` — ${categoryFilter}` : ""}
            </h3>
            {visibleFindings === null ? (
              <p className="py-6 text-center text-sm text-ink-muted">Loading checklist…</p>
            ) : visibleFindings.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">No items in this category.</p>
            ) : (
              <Table columns={COLUMNS} rows={visibleFindings} onRowClick={(r) => toast("info", `Opened ${r.item}`)} />
            )}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Upcoming schedule</h3>
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">No dated renewals yet.</p>
          ) : (
            <Timeline
              entries={upcoming.map((f) => ({
                id: f.id,
                date: f.due_date,
                title: f.item,
                description: [f.category, f.frequency].filter(Boolean).join(" · "),
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
