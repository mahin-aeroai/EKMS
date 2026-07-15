"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { BarChart, DonutChart } from "@/components/ui/Charts";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type CustomerRow, type QuoteRow, type ContractRow } from "@/lib/supabase";
import { getCount, groupCount, statusDonutData } from "@/lib/dashboard-queries";

interface AnalyticsStats {
  customerCount: number;
  crmAccountCount: number;
  quoteCount: number;
  contractCount: number;
  customersByTier: { label: string; value: number }[];
  quotesByStatus: ReturnType<typeof statusDonutData>;
  contractsByStatus: ReturnType<typeof statusDonutData>;
  approvalsByStatus: { label: string; value: number }[];
  topRegion: string | null;
}

async function loadStats(): Promise<AnalyticsStats> {
  const [
    customerCount,
    crmAccountCount,
    { data: customers },
    { data: quotes },
    { data: contracts },
    { data: approvals },
  ] = await Promise.all([
    getCount("customers"),
    getCount("crm_accounts"),
    supabase.from("customers").select("*"),
    supabase.from("quotes").select("*"),
    supabase.from("contracts").select("*"),
    supabase.from("customer_approvals").select("status"),
  ]);

  const customerRows = (customers ?? []) as CustomerRow[];
  const quoteRows = (quotes ?? []) as QuoteRow[];
  const contractRows = (contracts ?? []) as ContractRow[];
  const byRegion = groupCount(customerRows, (c) => c.region);

  return {
    customerCount,
    crmAccountCount,
    quoteCount: quoteRows.length,
    contractCount: contractRows.length,
    customersByTier: groupCount(customerRows, (c) => c.tier),
    quotesByStatus: statusDonutData(quoteRows),
    contractsByStatus: statusDonutData(contractRows),
    approvalsByStatus: groupCount((approvals ?? []) as { status: string }[], (a) => a.status),
    topRegion: byRegion[0]?.label ?? null,
  };
}

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [stats, setStats] = useState<AnalyticsStats | null>(null);

  useEffect(() => {
    loadStats()
      .then(setStats)
      .catch(() => toast("danger", "Couldn't load Analytics data from Supabase"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Executive" }, { label: "Analytics" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <BarChart3 size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Analytics</h1>
              <Badge status="info">Live snapshot</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Executive — company-wide portfolio breakdown, current snapshot</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Live from Supabase</Tag>
              <Tag>No historical trend data yet — snapshot only</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Customers" value={stats ? String(stats.customerCount) : "—"} trend="flat" trendLabel="Live count" />
        <StatCard label="CRM Accounts" value={stats ? String(stats.crmAccountCount) : "—"} trend="flat" trendLabel="Live count" />
        <StatCard label="Quotes" value={stats ? String(stats.quoteCount) : "—"} trend="flat" trendLabel="Live count" />
        <StatCard label="Contracts" value={stats ? String(stats.contractCount) : "—"} trend="flat" trendLabel="Live count" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Customers by tier</h3>
          {stats ? <BarChart data={stats.customersByTier} /> : <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Quotes by status</h3>
          {stats ? <DonutChart data={stats.quotesByStatus} /> : <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Contracts by status</h3>
          {stats ? <DonutChart data={stats.contractsByStatus} /> : <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Customer approvals by status</h3>
          {stats ? <BarChart data={stats.approvalsByStatus} /> : <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}
        </div>
        <div className="sm:col-span-2">
          <AICard
            variant="insight"
            title="Portfolio concentration"
            citation="Live customer, quote, contract, and approval counts"
            onAccept={() => toast("success", "Added to leadership review agenda")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            {stats
              ? `${stats.topRegion ?? "No region data"} has the largest customer concentration. Across the portfolio: ${stats.quoteCount} quotes and ${stats.contractCount} contracts are on record, spanning the statuses charted above.`
              : "Loading…"}
          </AICard>
        </div>
      </div>
    </div>
  );
}
