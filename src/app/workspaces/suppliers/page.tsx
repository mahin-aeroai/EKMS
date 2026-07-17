"use client";

import { useEffect, useState } from "react";
import { Handshake } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type SupplierRow } from "@/lib/supabase";

const COLUMNS: TableColumn<SupplierRow>[] = [
  { key: "name", header: "Supplier", sortable: true },
  { key: "category", header: "Category", sortable: true },
  { key: "on_time", header: "On-Time Delivery", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

export default function SuppliersPage() {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("suppliers")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load suppliers from Supabase");
          return;
        }
        setSuppliers(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real, computed stats from the live table -- no illustrative/mock
  // numbers, insight, or chart (the previous "Cosmo Films / UFlex Ltd /
  // Sumitomo Demag" donut chart was hardcoded and not backed by any
  // supplier field, so it's removed rather than left showing fake spend).
  const totalCount = suppliers?.length ?? null;
  const atRisk = suppliers?.filter((s) => s.status === "danger").length ?? 0;
  const onTimeValues = suppliers
    ?.map((s) => (s.on_time ? parseFloat(s.on_time) : null))
    .filter((v): v is number => v !== null && !Number.isNaN(v));
  const onTimeAvg =
    onTimeValues && onTimeValues.length > 0
      ? `${Math.round(onTimeValues.reduce((a, b) => a + b, 0) / onTimeValues.length)}%`
      : "—";

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Manufacturing" }, { label: "Suppliers" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Handshake size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Suppliers</h1>
              {suppliers && atRisk > 0 && <Badge status="warning">{atRisk} at risk</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Manufacturing — approved supplier scorecards</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Approved Suppliers" value={totalCount === null ? "—" : totalCount.toLocaleString()} />
        <StatCard label="On-Time Delivery Avg" value={onTimeAvg} />
        <StatCard label="At-Risk Suppliers" value={String(atRisk)} />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Supplier scorecards</h3>
        {suppliers === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading suppliers…</p>
        ) : suppliers.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No suppliers loaded yet.</p>
        ) : (
          <Table columns={COLUMNS} rows={suppliers} onRowClick={(r) => toast("info", `Opened ${r.name}`)} />
        )}
      </div>
    </div>
  );
}
