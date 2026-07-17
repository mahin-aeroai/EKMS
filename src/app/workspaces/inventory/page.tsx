"use client";

import { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type InventorySkuRow } from "@/lib/supabase";

const COLUMNS: TableColumn<InventorySkuRow>[] = [
  { key: "code", header: "SKU", sortable: true },
  { key: "name", header: "Description", sortable: true },
  { key: "stock", header: "On Hand", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

export default function InventoryPage() {
  const { toast } = useToast();
  const [skus, setSkus] = useState<InventorySkuRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("inventory_skus")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load inventory SKUs from Supabase");
          return;
        }
        setSkus(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lowStock = skus?.filter((s) => s.status === "danger").length ?? 0;

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
              {skus && lowStock > 0 && <Badge status="warning">{lowStock} low stock item{lowStock === 1 ? "" : "s"}</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Manufacturing — stock levels across all tracked raw materials and components</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="SKUs Tracked" value={skus === null ? "—" : String(skus.length)} />
        <StatCard label="Stockouts This Month" value="—" />
        <StatCard label="Inventory Value" value="—" />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Tracked SKUs</h3>
        {skus === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading SKUs…</p>
        ) : skus.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No SKUs loaded yet.</p>
        ) : (
          <Table columns={COLUMNS} rows={skus} onRowClick={(r) => toast("info", `Opened ${r.code}`)} />
        )}
      </div>
    </div>
  );
}
