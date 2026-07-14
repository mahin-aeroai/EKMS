"use client";

import { BarChart3 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { LineChart, DonutChart, Heatmap } from "@/components/ui/Charts";
import { useToast } from "@/components/ui/Notifications";

export default function AnalyticsPage() {
  const { toast } = useToast();

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
              <Badge status="info">Rolling 6 months</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Executive — company-wide trends across revenue, quality, and delivery</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>All regions</Tag>
              <Tag aiSuggested>Margin compression detected in West region</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Revenue" value="₹28.4 Cr" trend="up" trendLabel="+11% YoY" />
        <StatCard label="Gross Margin" value="34%" trend="down" trendLabel="-2 pts" />
        <StatCard label="On-Time Delivery" value="93%" trend="up" trendLabel="+1 pt" />
        <StatCard label="NPS" value="+42" trend="flat" trendLabel="No change" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Revenue trend — 6 months</h3>
          <LineChart data={[{ label: "Feb", value: 3.8 }, { label: "Mar", value: 4.1 }, { label: "Apr", value: 4.0 }, { label: "May", value: 4.6 }, { label: "Jun", value: 4.9 }, { label: "Jul", value: 4.82 }]} />
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Revenue mix by segment</h3>
          <DonutChart
            data={[
              { label: "Retail", value: 46, color: "primary" },
              { label: "Furniture", value: 32, color: "info" },
              { label: "Packaging", value: 14, color: "success" },
              { label: "Other", value: 8, color: "warning" },
            ]}
          />
        </div>
        <div className="sm:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-ink">Defect rate — line × shift</h3>
          <Heatmap rows={["Line 1", "Line 2", "Line 3"]} cols={["Shift A", "Shift B", "Shift C"]} values={[[2, 4, 1], [6, 3, 5], [1, 2, 9]]} />
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
