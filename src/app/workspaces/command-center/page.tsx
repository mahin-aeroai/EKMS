"use client";

import { LayoutDashboard } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { GaugeChart, BarChart } from "@/components/ui/Charts";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { useToast } from "@/components/ui/Notifications";

export default function CommandCenterPage() {
  const { toast } = useToast();

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Executive" }, { label: "Command Center" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <LayoutDashboard size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Command Center</h1>
              <Badge status="success">All systems normal</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Executive — company-wide operating picture, refreshed live</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Multi-site rollup</Tag>
              <Tag aiSuggested>2 flagged risks across active projects</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Revenue MTD" value="₹4.82 Cr" trend="up" trendLabel="+9% vs plan" />
        <StatCard label="Active Projects" value="14" trend="flat" trendLabel="2 at risk" />
        <StatCard label="On-Time Delivery" value="93%" trend="up" trendLabel="+1 pt" />
        <StatCard label="Open Risks" value="6" trend="down" trendLabel="-2 this week" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="summary"
            title="Week in review"
            citation="Cross-module rollup, last 7 days"
            onAccept={() => toast("success", "Added to leadership digest")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            Revenue is tracking 9% ahead of plan, led by the IKEA Wardrobe Program. Two risks need attention: a tooling delay on that same project, and a rising vibration trend on Machine M-14.
          </AICard>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Revenue by region</h3>
            <BarChart data={[{ label: "West", value: 210 }, { label: "North", value: 148 }, { label: "South", value: 96 }, { label: "East", value: 64 }]} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Health gauges</h3>
            <div className="flex flex-col items-center gap-4">
              <GaugeChart value={87} label="Delivery performance" />
              <GaugeChart value={71} label="Fleet OEE (avg)" />
            </div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Cross-org activity</h3>
            <ActivityFeed
              items={[
                { id: "1", actor: "AI Assistant", action: "flagged a shortage risk on", target: "RM-0231", time: "18m ago", aiRanked: true },
                { id: "2", actor: "Priya Nair", action: "confirmed", target: "SO-MU-2026-007812", time: "2h ago" },
                { id: "3", actor: "Arjun Rao", action: "logged an inspection note for", target: "Machine M-14", time: "1 day ago" },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
