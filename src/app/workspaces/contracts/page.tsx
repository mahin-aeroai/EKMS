"use client";

import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { VersionHistory } from "@/components/ui/VersionHistory";
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>Godrej Interio MSA renews in 60 days</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Contracts" value={contracts ? String(contracts.length) : "—"} trend="flat" trendLabel="No change" />
        <StatCard label="Expiring Soon" value={String(expiringSoon)} trend="up" trendLabel="Within 90 days" />
        <StatCard label="Total Value" value="₹4.64 Cr" trend="up" trendLabel="+6% YoY" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="recommendation"
            title="Start renewal conversation with Godrej Interio"
            citation="Contract Master, renewal terms"
            onAccept={() => toast("success", "Renewal task assigned")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            The Master Service Agreement renews in 60 days. Order volume has grown 18% under the current terms — worth renegotiating pricing tiers ahead of renewal.
          </AICard>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Contract portfolio</h3>
            {contracts === null ? (
              <p className="py-6 text-center text-sm text-ink-muted">Loading contracts…</p>
            ) : (
              <Table columns={COLUMNS} rows={contracts} onRowClick={(r) => toast("info", `Opened ${r.customer} agreement`)} />
            )}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Version history — Reliance MSA</h3>
          <VersionHistory versions={[
            { id: "v3", label: "Version 3 — current", date: "3 Apr 2026", author: "Legal Team" },
            { id: "v2", label: "Version 2", date: "12 Jan 2025", author: "Legal Team" },
            { id: "v1", label: "Version 1 (initial)", date: "14 Jan 2024", author: "Legal Team" },
          ]} />
        </div>
      </div>
    </div>
  );
}
