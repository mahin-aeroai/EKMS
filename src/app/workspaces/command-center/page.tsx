"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { GaugeChart, BarChart } from "@/components/ui/Charts";
import { ActivityFeed, type ActivityItem } from "@/components/ui/ActivityFeed";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type CustomerRow, type CustomerCommentRow, type CustomerApprovalRow } from "@/lib/supabase";
import { getCount, getCountWhere, groupCount } from "@/lib/dashboard-queries";
import { timeAgo } from "@/lib/timeAgo";

interface CommandCenterStats {
  customerCount: number;
  pendingApprovals: number;
  openComplianceFindings: number;
  pendingAccessRequests: number;
  customersByRegion: { label: string; value: number }[];
  avgOnTimeDelivery: number;
  avgHealthScore: number;
  activity: ActivityItem[];
}

async function loadStats(): Promise<CommandCenterStats> {
  const [
    customerCount,
    pendingApprovals,
    pendingAccessRequests,
    { data: customers },
    { data: compliance },
    { data: comments },
    { data: approvals },
  ] = await Promise.all([
    getCount("customers"),
    getCountWhere("customer_approvals", "status", "pending"),
    getCountWhere("access_requests", "status", "warning"),
    supabase.from("customers").select("*"),
    supabase.from("compliance_findings").select("status"),
    supabase
      .from("customer_comments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("customer_approvals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const customerRows = (customers ?? []) as CustomerRow[];
  const customerById = new Map(customerRows.map((c) => [c.id, c]));
  const openComplianceFindings = (compliance ?? []).filter((c) => c.status !== "success").length;

  const avgOnTimeDelivery = customerRows.length
    ? Math.round(customerRows.reduce((sum, c) => sum + c.on_time_delivery, 0) / customerRows.length)
    : 0;
  const avgHealthScore = customerRows.length
    ? Math.round(customerRows.reduce((sum, c) => sum + c.health_score, 0) / customerRows.length)
    : 0;

  const commentItems: (ActivityItem & { createdAt: string })[] = ((comments ?? []) as CustomerCommentRow[]).map(
    (c) => ({
      id: `comment-${c.id}`,
      actor: c.author,
      action: "commented on",
      target: customerById.get(c.customer_id)?.name ?? "a customer",
      time: timeAgo(c.created_at),
      createdAt: c.created_at,
    })
  );
  const approvalItems: (ActivityItem & { createdAt: string })[] = ((approvals ?? []) as CustomerApprovalRow[]).map(
    (a) => ({
      id: `approval-${a.id}`,
      actor: a.requested_by,
      action: `requested "${a.title}" for`,
      target: customerById.get(a.customer_id)?.name ?? "a customer",
      time: timeAgo(a.created_at),
      createdAt: a.created_at,
    })
  );

  const activity = [...commentItems, ...approvalItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  return {
    customerCount,
    pendingApprovals,
    openComplianceFindings,
    pendingAccessRequests,
    customersByRegion: groupCount(customerRows, (c) => c.region),
    avgOnTimeDelivery,
    avgHealthScore,
    activity,
  };
}

export default function CommandCenterPage() {
  const { toast } = useToast();
  const [stats, setStats] = useState<CommandCenterStats | null>(null);

  useEffect(() => {
    loadStats()
      .then(setStats)
      .catch(() => toast("danger", "Couldn't load Command Center data from Supabase"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allNormal = stats ? stats.openComplianceFindings === 0 && stats.pendingApprovals === 0 : true;

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
              <Badge status={allNormal ? "success" : "warning"}>
                {stats ? (allNormal ? "All systems normal" : "Items need attention") : "Loading…"}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Executive — company-wide operating picture, refreshed live</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Live from Supabase</Tag>
              {stats && stats.pendingApprovals > 0 && (
                <Tag aiSuggested>{`${stats.pendingApprovals} approval${stats.pendingApprovals === 1 ? "" : "s"} awaiting review`}</Tag>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total Customers" value={stats ? String(stats.customerCount) : "—"} trend="flat" trendLabel="Live count" />
        <StatCard label="Pending Approvals" value={stats ? String(stats.pendingApprovals) : "—"} trend="flat" trendLabel="Across all customers" />
        <StatCard label="Open Compliance Findings" value={stats ? String(stats.openComplianceFindings) : "—"} trend="flat" trendLabel="Not yet resolved" />
        <StatCard label="Pending Access Requests" value={stats ? String(stats.pendingAccessRequests) : "—"} trend="flat" trendLabel="Awaiting a decision" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="summary"
            title="Week in review"
            citation="Live counts across Customers, Compliance, and Access Requests"
            onAccept={() => toast("success", "Added to leadership digest")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            {stats
              ? `${stats.customerCount} customers on the books, averaging a ${stats.avgHealthScore}/100 health score and ${stats.avgOnTimeDelivery}% on-time delivery. ${stats.pendingApprovals} approval${stats.pendingApprovals === 1 ? "" : "s"} and ${stats.openComplianceFindings} compliance finding${stats.openComplianceFindings === 1 ? "" : "s"} need attention.`
              : "Loading…"}
          </AICard>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Customers by region</h3>
            {stats ? <BarChart data={stats.customersByRegion} /> : <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Health gauges</h3>
            <div className="flex flex-col items-center gap-4">
              <GaugeChart value={stats?.avgOnTimeDelivery ?? 0} label="Avg on-time delivery" />
              <GaugeChart value={stats?.avgHealthScore ?? 0} label="Avg customer health score" />
            </div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Recent customer activity</h3>
            {stats ? <ActivityFeed items={stats.activity} /> : <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
