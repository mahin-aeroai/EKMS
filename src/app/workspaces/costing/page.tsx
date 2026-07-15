"use client";

import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { BarChart, DonutChart } from "@/components/ui/Charts";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type PurchaseOrderRow, type SupplierRow } from "@/lib/supabase";
import { getCount, groupCount, statusDonutData } from "@/lib/dashboard-queries";

const PO_COLUMN_TITLES: Record<string, string> = {
  draft: "Draft",
  approval: "Pending Approval",
  ordered: "Ordered",
  received: "Received",
};

interface CostingStats {
  supplierCount: number;
  inventorySkuCount: number;
  poInProgress: number;
  atRiskSkus: number;
  posByStage: { label: string; value: number }[];
  suppliersByStatus: ReturnType<typeof statusDonutData>;
}

async function loadStats(): Promise<CostingStats> {
  const [supplierCount, inventorySkuCount, { data: pos }, { data: suppliers }, { data: skus }] = await Promise.all([
    getCount("suppliers"),
    getCount("inventory_skus"),
    supabase.from("purchase_orders").select("*"),
    supabase.from("suppliers").select("*"),
    supabase.from("inventory_skus").select("status"),
  ]);

  const poRows = (pos ?? []) as PurchaseOrderRow[];
  const supplierRows = (suppliers ?? []) as SupplierRow[];
  const skuRows = (skus ?? []) as { status: string }[];

  const poByColumn = groupCount(poRows, (r) => r.column_id);
  const posByStage = poByColumn.map((c) => ({ label: PO_COLUMN_TITLES[c.label] ?? c.label, value: c.value }));

  return {
    supplierCount,
    inventorySkuCount,
    poInProgress: poRows.filter((r) => r.column_id !== "received").length,
    atRiskSkus: skuRows.filter((r) => r.status !== "success").length,
    posByStage,
    suppliersByStatus: statusDonutData(supplierRows),
  };
}

export default function CostingPage() {
  const { toast } = useToast();
  const [stats, setStats] = useState<CostingStats | null>(null);

  useEffect(() => {
    loadStats()
      .then(setStats)
      .catch(() => toast("danger", "Couldn't load Costing data from Supabase"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Manufacturing" }, { label: "Costing" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Calculator size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Costing</h1>
              <Badge status={stats && stats.atRiskSkus > 0 ? "warning" : "success"}>
                {stats ? `${stats.atRiskSkus} SKU${stats.atRiskSkus === 1 ? "" : "s"} at risk` : "Loading…"}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Manufacturing — procurement &amp; inventory pulse across active purchase orders and suppliers
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Live from Supabase</Tag>
              <Tag aiSuggested>Cost variance needs a costing ledger — not built yet, so this page shows supply-chain pulse instead</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Suppliers" value={stats ? String(stats.supplierCount) : "—"} trend="flat" trendLabel="Live count" />
        <StatCard label="Purchase Orders In Progress" value={stats ? String(stats.poInProgress) : "—"} trend="flat" trendLabel="Not yet received" />
        <StatCard label="Inventory SKUs At Risk" value={stats ? String(stats.atRiskSkus) : "—"} trend="flat" trendLabel={stats ? `of ${stats.inventorySkuCount} total` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Purchase orders by stage</h3>
          {stats ? <BarChart data={stats.posByStage} /> : <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Suppliers by status</h3>
          {stats ? <DonutChart data={stats.suppliersByStatus} /> : <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}
        </div>
        <div className="sm:col-span-2">
          <AICard
            variant="insight"
            title="Supply chain pulse"
            citation="Live purchase order and supplier data"
            onAccept={() => toast("success", "Flagged for procurement review")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            {stats
              ? `${stats.poInProgress} purchase orders are still moving through the pipeline, and ${stats.atRiskSkus} of ${stats.inventorySkuCount} inventory SKUs are flagged at risk. Full cost variance tracking needs a costing ledger schema, which doesn't exist yet.`
              : "Loading…"}
          </AICard>
        </div>
      </div>
    </div>
  );
}
