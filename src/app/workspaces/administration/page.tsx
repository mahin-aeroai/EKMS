"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { TreeView, type TreeNode } from "@/components/ui/TreeView";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type AccessRequestRow } from "@/lib/supabase";

const COLUMNS: TableColumn<AccessRequestRow>[] = [
  { key: "user_label", header: "User", sortable: true },
  { key: "requested", header: "Access Requested", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

const TREE: TreeNode[] = [
  { id: "root", label: "MMDI ONE Access Roles", children: [
    { id: "exec", label: "Executive", children: [{ id: "e1", label: "Full read, no edit" }] },
    { id: "ops", label: "Operations", children: [{ id: "o1", label: "Line Manager" }, { id: "o2", label: "Maintenance Lead" }] },
    { id: "finance", label: "Finance", children: [{ id: "f1", label: "Approver" }, { id: "f2", label: "Read-only" }] },
  ]},
];

export default function AdministrationPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<AccessRequestRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("access_requests")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load access requests from Supabase");
          return;
        }
        setRequests(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = requests?.filter((r) => r.status === "warning").length ?? 0;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Administration" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Settings size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Administration</h1>
              <Badge status="warning">{requests ? `${pending} pending request${pending === 1 ? "" : "s"}` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">User access, roles, and platform configuration</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>Contractor access request needs a defined expiry date</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Users" value="248" trend="up" trendLabel="+4 this quarter" />
        <StatCard label="Roles Configured" value="16" trend="flat" trendLabel="No change" />
        <StatCard label="Pending Access Requests" value={String(pending)} trend="up" trendLabel="+1 this week" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="recommendation"
            title="Set an expiry date on the contractor's access"
            citation="Access Policy, temporary user guidelines"
            onAccept={() => toast("success", "Expiry date added to request")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            Temporary contractor access should always carry an expiry date per policy — this request is missing one and shouldn&apos;t be granted as-is.
          </AICard>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Access requests</h3>
            {requests === null ? (
              <p className="py-6 text-center text-sm text-ink-muted">Loading access requests…</p>
            ) : (
              <Table columns={COLUMNS} rows={requests} onRowClick={(r) => toast("info", `Opened request from ${r.user_label}`)} />
            )}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Role hierarchy</h3>
          <TreeView nodes={TREE} />
        </div>
      </div>
    </div>
  );
}
