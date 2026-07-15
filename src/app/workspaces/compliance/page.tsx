"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { TreeView, type TreeNode } from "@/components/ui/TreeView";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type ComplianceFindingRow } from "@/lib/supabase";

const COLUMNS: TableColumn<ComplianceFindingRow>[] = [
  { key: "item", header: "Item", sortable: true },
  { key: "area", header: "Area", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

const TREE: TreeNode[] = [
  { id: "root", label: "Compliance Framework", children: [
    { id: "quality", label: "Quality (ISO 9001)", children: [{ id: "q1", label: "Internal Audits" }, { id: "q2", label: "Surveillance Audits" }] },
    { id: "environmental", label: "Environmental (FSC, PVC-free)" },
    { id: "safety", label: "Health & Safety" },
  ]},
];

export default function CompliancePage() {
  const { toast } = useToast();
  const [findings, setFindings] = useState<ComplianceFindingRow[] | null>(null);

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
              <Badge status="danger">{findings ? `${overdue} overdue finding${overdue === 1 ? "" : "s"}` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Company-wide certifications, audits, and open findings</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>Fire safety certification lapsed 5 days ago</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open Findings" value="3" trend="up" trendLabel="+1 this month" />
        <StatCard label="Certifications Active" value="11" trend="flat" trendLabel="No change" />
        <StatCard label="Audits This Quarter" value="4" trend="flat" trendLabel="No change" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="recommendation"
            title="Fire safety certification needs immediate renewal"
            citation="Compliance Register, certificate expiry"
            onAccept={() => toast("success", "Escalated to Facilities")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            This certification lapsed 5 days ago — it&apos;s a hard requirement for the Mumbai plant to remain operational under local regulations.
          </AICard>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Open findings</h3>
            {findings === null ? (
              <p className="py-6 text-center text-sm text-ink-muted">Loading findings…</p>
            ) : (
              <Table columns={COLUMNS} rows={findings} onRowClick={(r) => toast("info", `Opened ${r.item}`)} />
            )}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Compliance framework</h3>
          <TreeView nodes={TREE} />
        </div>
      </div>
    </div>
  );
}
