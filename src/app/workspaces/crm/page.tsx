"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type CrmAccountRow } from "@/lib/supabase";

const COLUMNS: TableColumn<CrmAccountRow>[] = [
  { key: "name", header: "Account", sortable: true },
  { key: "region", header: "Region", sortable: true },
  { key: "owner", header: "Owner", sortable: true },
  { key: "value", header: "Lifetime Value", sortable: true },
  { key: "status", header: "Health", render: (r) => <Badge status={r.status}>{r.status === "success" ? "Healthy" : r.status === "warning" ? "At Risk" : "Growing"}</Badge> },
];

export default function CRMPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<CrmAccountRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("crm_accounts")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load CRM accounts from Supabase");
          return;
        }
        setAccounts(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers" }, { label: "CRM" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Users size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">CRM</h1>
              <Badge status="info">{accounts ? `${accounts.length} accounts` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Customers — account portfolio across all regions</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Accounts" value={accounts ? String(accounts.length) : "—"} />
        <StatCard label="Pipeline Value" value="—" />
        <StatCard label="Win Rate" value="—" />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Account portfolio</h3>
        {accounts === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading accounts…</p>
        ) : accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No accounts loaded yet.</p>
        ) : (
          <Table columns={COLUMNS} rows={accounts} onRowClick={(r) => toast("info", `Opened ${r.name}`)} />
        )}
      </div>
    </div>
  );
}
