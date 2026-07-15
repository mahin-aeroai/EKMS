"use client";

import { useEffect, useState } from "react";
import { Handshake } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { DonutChart } from "@/components/ui/Charts";
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

  const atRisk = suppliers?.filter((s) => s.status === "danger").length ?? 0;

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
              <Badge status="warning">{suppliers ? `${atRisk} at risk` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Manufacturing — approved supplier scorecards</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>Regional Hardware Co. on-time delivery dropped 14 pts</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Approved Suppliers" value="18" trend="flat" trendLabel="No change" />
        <StatCard label="On-Time Delivery Avg" value="89%" trend="down" trendLabel="-2 pts" />
        <StatCard label="At-Risk Suppliers" value={String(atRisk)} trend="up" trendLabel="+1 this quarter" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="insight"
            title="Regional Hardware Co. trending toward disqualification"
            citation="Supplier scorecard, last 2 quarters"
            onAccept={() => toast("success", "Flagged for Category Manager review")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            On-time delivery dropped from 86% to 72% over two quarters — below the 80% threshold in the Approved Supplier Policy. Recommend a corrective action review before the next order cycle.
          </AICard>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Supplier scorecards</h3>
            {suppliers === null ? (
              <p className="py-6 text-center text-sm text-ink-muted">Loading suppliers…</p>
            ) : (
              <Table columns={COLUMNS} rows={suppliers} onRowClick={(r) => toast("info", `Opened ${r.name}`)} />
            )}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Spend by supplier</h3>
          <DonutChart
            data={[
              { label: "Cosmo Films", value: 38, color: "primary" },
              { label: "UFlex Ltd", value: 24, color: "info" },
              { label: "Sumitomo Demag", value: 22, color: "success" },
              { label: "Others", value: 16, color: "warning" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
