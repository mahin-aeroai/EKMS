"use client";

import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type ContractRow } from "@/lib/supabase";

const COLUMNS: TableColumn<ContractRow>[] = [
  { key: "customer", header: "Customer", sortable: true },
  { key: "type", header: "Type", sortable: true },
  { key: "value", header: "Value", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

export default function ContractsPage() {
  const { toast } = useToast();
  const [contracts, setContracts] = useState<ContractRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("contracts")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load contracts from Supabase");
          return;
        }
        setContracts(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expiringSoon = contracts?.filter((c) => c.status === "warning").length ?? 0;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers" }, { label: "Contracts" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <FileSignature size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Contracts</h1>
              <Badge status="warning">{contracts ? `${expiringSoon} expiring soon` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Customers — governing agreements across all accounts</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Contracts" value={contracts ? String(contracts.length) : "—"} />
        <StatCard label="Expiring Soon" value={String(expiringSoon)} />
        <StatCard label="Total Value" value="—" />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Contract portfolio</h3>
        {contracts === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading contracts…</p>
        ) : contracts.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No contracts loaded yet.</p>
        ) : (
          <Table columns={COLUMNS} rows={contracts} onRowClick={(r) => toast("info", `Opened ${r.customer} agreement`)} />
        )}
      </div>
    </div>
  );
}
