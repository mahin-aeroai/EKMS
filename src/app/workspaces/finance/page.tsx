"use client";

import { Landmark } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { LineChart, DonutChart } from "@/components/ui/Charts";
import { useToast } from "@/components/ui/Notifications";

export default function FinancePage() {
  const { toast } = useToast();

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
              <Badge status="success">On plan</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Company-wide revenue, margin, and receivables</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>DSO improved after Reliance&apos;s Net 45 terms held steady</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Revenue MTD" value="₹4.82 Cr" trend="up" trendLabel="+9% vs plan" />
        <StatCard label="Gross Margin" value="34%" trend="down" trendLabel="-2 pts" />
        <StatCard label="DSO" value="38 days" trend="down" trendLabel="-3 days" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Revenue vs expense — 6 months</h3>
          <LineChart data={[{ label: "Feb", value: 3.8 }, { label: "Mar", value: 4.1 }, { label: "Apr", value: 4.0 }, { label: "May", value: 4.6 }, { label: "Jun", value: 4.9 }, { label: "Jul", value: 4.82 }]} />
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Receivables by age</h3>
          <DonutChart
            data={[
              { label: "Current", value: 68, color: "success" },
              { label: "1-30 days", value: 20, color: "info" },
              { label: "31-60 days", value: 8, color: "warning" },
              { label: "60+ days", value: 4, color: "danger" },
            ]}
          />
        </div>
        <div className="sm:col-span-2">
          <AICard
            variant="insight"
            title="Margin compression concentrated in West region"
            citation="Regional P&L, last 2 quarters"
            onAccept={() => toast("success", "Added to leadership review agenda")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            West region gross margin has dropped 4 points over two quarters, driven by extended supplier lead times raising expedite freight costs — not by pricing.
          </AICard>
        </div>
      </div>
    </div>
  );
}
