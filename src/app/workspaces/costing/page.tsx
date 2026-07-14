"use client";

import { Calculator } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { BarChart, LineChart } from "@/components/ui/Charts";
import { useToast } from "@/components/ui/Notifications";

export default function CostingPage() {
  const { toast } = useToast();

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
              <Badge status="warning">Variance flagged</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Manufacturing — standard vs actual cost across active work orders</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>Material cost variance driven by RM-0231 price change</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Cost Variance" value="+4.2%" trend="up" trendLabel="vs standard" />
        <StatCard label="Material Cost %" value="58%" trend="up" trendLabel="+3 pts" />
        <StatCard label="Labor Cost %" value="27%" trend="flat" trendLabel="No change" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Cost breakdown — current period</h3>
          <BarChart data={[{ label: "Material", value: 58 }, { label: "Labor", value: 27 }, { label: "Overhead", value: 11 }, { label: "Logistics", value: 4 }]} />
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Cost variance trend — 6 months</h3>
          <LineChart data={[{ label: "Feb", value: 1.1 }, { label: "Mar", value: 1.8 }, { label: "Apr", value: 2.2 }, { label: "May", value: 2.9 }, { label: "Jun", value: 3.6 }, { label: "Jul", value: 4.2 }]} />
        </div>
        <div className="sm:col-span-2">
          <AICard
            variant="insight"
            title="Material cost variance traced to RM-0231"
            citation="Costing ledger, material price history"
            onAccept={() => toast("success", "Flagged for pricing review")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            RM-0231&apos;s unit cost increase, combined with the extended supplier lead time driving expedite freight, accounts for 80% of the current material cost variance.
          </AICard>
        </div>
      </div>
    </div>
  );
}
