"use client";

import { Boxes } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { BarChart } from "@/components/ui/Charts";
import { useToast } from "@/components/ui/Notifications";

interface SKU {
  id: string;
  code: string;
  name: string;
  stock: string;
  status: BadgeStatus;
  statusLabel: string;
}

const SKUS: SKU[] = [
  { id: "1", code: "RM-0231", name: "PVC-Free Vinyl Sheet", stock: "1,240 kg", status: "danger", statusLabel: "Low Stock" },
  { id: "2", code: "RM-0198", name: "BOPP Film 20µ", stock: "3,600 kg", status: "success", statusLabel: "Healthy" },
  { id: "3", code: "RM-0304", name: "Hinge Assembly Set", stock: "820 units", status: "warning", statusLabel: "Watch" },
  { id: "4", code: "RM-0112", name: "Corrugated Packaging", stock: "12,400 units", status: "success", statusLabel: "Healthy" },
];

const COLUMNS: TableColumn<SKU>[] = [
  { key: "code", header: "SKU", sortable: true },
  { key: "name", header: "Description", sortable: true },
  { key: "stock", header: "On Hand", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.statusLabel}</Badge> },
];

export default function InventoryPage() {
  const { toast } = useToast();

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Manufacturing" }, { label: "Inventory" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Boxes size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Inventory</h1>
              <Badge status="warning">1 low stock item</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Manufacturing — stock levels across all tracked raw materials and components</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>RM-0231 at risk of stockout in 6 days</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="SKUs Tracked" value="312" trend="flat" trendLabel="No change" />
        <StatCard label="Stockouts This Month" value="1" trend="up" trendLabel="+1 vs last month" />
        <StatCard label="Inventory Value" value="₹1.62 Cr" trend="down" trendLabel="-4% vs plan" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="recommendation"
            title="Reorder RM-0231 before Friday"
            citation="Reorder Policy, consumption trend"
            onAccept={() => toast("success", "Reorder request drafted")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            At current consumption, stock falls below safety threshold in 6 days — lead time from the primary supplier is now 9 days.
          </AICard>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Tracked SKUs</h3>
            <Table columns={COLUMNS} rows={SKUS} onRowClick={(r) => toast("info", `Opened ${r.code}`)} />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Stock value by category</h3>
          <BarChart data={[{ label: "Vinyl", value: 48 }, { label: "Film", value: 32 }, { label: "Hardware", value: 21 }, { label: "Packaging", value: 14 }]} />
        </div>
      </div>
    </div>
  );
}
