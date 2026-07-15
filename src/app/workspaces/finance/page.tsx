"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { BarChart, DonutChart } from "@/components/ui/Charts";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type CustomerRow, type ContractRow } from "@/lib/supabase";
import { groupSum, statusDonutData, formatCrore } from "@/lib/dashboard-queries";

interface FinanceStats {
  totalLifetimeValue: number;
  totalOpenOrders: number;
  activeContracts: number;
  contractsExpiringSoon: number;
  ltvByRegion: { label: string; value: number }[];
  contractsByStatus: ReturnType<typeof statusDonutData>;
  topRegion: string | null;
}

async function loadStats(): Promise<FinanceStats> {
  const [{ data: customers }, { data: contracts }] = await Promise.all([
    supabase.from("customers").select("*"),
    supabase.from("contracts").select("*"),
  ]);

  const customerRows = (customers ?? []) as CustomerRow[];
  const contractRows = (contracts ?? []) as ContractRow[];

  const ltvByRegion = groupSum(
    customerRows,
    (c) => c.region,
    (c) => c.lifetime_value
  );

  return {
    totalLifetimeValue: customerRows.reduce((sum, c) => sum + c.lifetime_value, 0),
    totalOpenOrders: customerRows.reduce((sum, c) => sum + c.open_orders, 0),
    activeContracts: contractRows.filter((c) => c.status === "success").length,
    contractsExpiringSoon: contractRows.filter((c) => c.status === "warning").length,
    ltvByRegion,
    contractsByStatus: statusDonutData(contractRows),
    topRegion: ltvByRegion[0]?.label ?? null,
  };
}

export default function FinancePage() {
  const { toast } = useToast();
  const [stats, setStats] = useState<FinanceStats | null>(null);

  useEffect(() => {
    loadStats()
      .then(setStats)
      .catch(() => toast("danger", "Couldn't load Finance data from Supabase"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Finance" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Landmark size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Finance</h1>
              <Badge status={stats && stats.contractsExpiringSoon > 0 ? "warning" : "success"}>
                {stats ? `${stats.contractsExpiringSoon} contract${stats.contractsExpiringSoon === 1 ? "" : "s"} expiring soon` : "Loading…"}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Company-wide customer lifetime value and contract standing</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Live from Supabase</Tag>
              <Tag aiSuggested>Revenue/margin/DSO need a finance ledger — not built yet, so this page shows portfolio value instead</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Portfolio Lifetime Value" value={stats ? formatCrore(stats.totalLifetimeValue) : "—"} trend="flat" trendLabel="Sum across all customers" />
        <StatCard label="Total Open Orders" value={stats ? String(stats.totalOpenOrders) : "—"} trend="flat" trendLabel="Sum across all customers" />
        <StatCard label="Active Contracts" value={stats ? String(stats.activeContracts) : "—"} trend="flat" trendLabel="Live count" />
        <StatCard label="Contracts Expiring Soon" value={stats ? String(stats.contractsExpiringSoon) : "—"} trend="flat" trendLabel="Live count" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Lifetime value by region</h3>
          {stats ? (
            <BarChart data={stats.ltvByRegion.map((r) => ({ label: r.label, value: Math.round(r.value / 10000000) }))} />
          ) : (
            <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
          )}
          <p className="mt-2 text-xs text-ink-muted">Values in ₹ Cr.</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Contracts by status</h3>
          {stats ? <DonutChart data={stats.contractsByStatus} /> : <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}
        </div>
        <div className="sm:col-span-2">
          <AICard
            variant="insight"
            title="Portfolio value concentration"
            citation="Live customer lifetime value and contract data"
            onAccept={() => toast("success", "Added to leadership review agenda")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            {stats
              ? `${stats.topRegion ?? "No region data"} holds the largest share of portfolio lifetime value (${formatCrore(stats.totalLifetimeValue)} total across all customers). ${stats.contractsExpiringSoon} contract${stats.contractsExpiringSoon === 1 ? "" : "s"} will need renewal attention soon.`
              : "Loading…"}
          </AICard>
        </div>
      </div>
    </div>
  );
}
