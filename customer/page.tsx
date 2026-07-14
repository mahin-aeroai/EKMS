"use client";

import { useState } from "react";
import { Building2, Pencil, Archive, UserPlus } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Tabs } from "@/components/ui/Tabs";
import { StatCard, AICard } from "@/components/ui/Card";
import { Timeline } from "@/components/ui/Timeline";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { BarChart, DonutChart, GaugeChart } from "@/components/ui/Charts";
import { DocumentPreview } from "@/components/ui/Viewers";
import { Comments, type Comment } from "@/components/ui/Comments";
import { ApprovalPanel } from "@/components/ui/ApprovalPanel";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useToast } from "@/components/ui/Notifications";

const NODES: GraphNode[] = [
  { id: "center", label: "Reliance Retail Ltd", type: "Customer" },
  { id: "n1", label: "SO-MU-2026-007812", type: "Sales Order" },
  { id: "n2", label: "IKEA Wardrobe Program", type: "Project" },
  { id: "n3", label: "RM-0231 — PVC-Free Vinyl", type: "Raw Material" },
  { id: "n4", label: "Priya Nair", type: "Account Owner" },
  { id: "n5", label: "PO-MU-2026-004521", type: "Purchase Order" },
];

const EDGES: GraphEdge[] = [
  { from: "center", to: "n1", label: "placed" },
  { from: "center", to: "n2", label: "sponsors" },
  { from: "n2", to: "n3", label: "uses material" },
  { from: "center", to: "n4", label: "managed by" },
  { from: "n2", to: "n5", label: "billed via" },
];

const INITIAL_COMMENTS: Comment[] = [
  { id: "c1", author: "Priya Nair", content: "Reliance wants to revisit payment terms for Q3 — flagging before renewal.", time: "3 days ago" },
  { id: "c2", author: "Arjun Rao", content: "Confirmed Net 45 stays as-is per Finance; no exception approved.", time: "2 days ago", resolved: true },
];

export default function CustomerWorkspacePage() {
  const { toast } = useToast();
  const [comments, setComments] = useState(INITIAL_COMMENTS);
  const [center, setCenter] = useState(NODES[0]);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers", href: "/workspaces/customer" }, { label: "Reliance Retail Ltd" }]} />

      {/* Workspace header — Universal Workspace Pattern, header region */}
      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Building2 size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Reliance Retail Ltd</h1>
              <Badge status="success">Active</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Customer — CUST-MU-002104 · Account owner: Priya Nair</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Retail</Tag>
              <Tag>Mumbai Region</Tag>
              <Tag>Tier 1</Tag>
              <Tag>Net 45</Tag>
              <Tag aiSuggested>Upsell candidate — 34% category growth</Tag>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => toast("info", "Opening edit form for Reliance Retail Ltd")}>
            <Pencil size={14} className="mr-1.5" /> Edit
          </Button>
          <ContextMenu
            items={[
              { label: "Assign account owner", icon: <UserPlus size={13} />, onSelect: () => toast("info", "Reassign owner") },
              { label: "Archive customer", icon: <Archive size={13} />, onSelect: () => toast("warning", "Archive requires Manager approval"), destructive: true },
            ]}
          />
        </div>
      </div>

      {/* Stat row */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Lifetime Value" value="₹2.14 Cr" trend="up" trendLabel="+18% YoY" />
        <StatCard label="Open Orders" value="6" trend="flat" trendLabel="No change" />
        <StatCard label="On-Time Delivery" value="94%" trend="up" trendLabel="+2 pts" />
        <StatCard label="Account Health" value="82 / 100" trend="down" trendLabel="-4 pts this quarter" aiInsight="Health dipped after the last two shipments ran late — both tied to the RM-0231 supply delay, not a Reliance-side issue." />
      </div>

      <Tabs
        defaultId="overview"
        items={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <div className="grid grid-cols-1 gap-6 pt-5 lg:grid-cols-3">
                <div className="flex flex-col gap-4 lg:col-span-2">
                  <AICard
                    variant="insight"
                    title="Upsell opportunity detected"
                    citation="Sales Order history, last 90 days"
                    onAccept={() => toast("success", "Opportunity added to pipeline")}
                    onDismiss={() => toast("info", "Dismissed")}
                  >
                    Reliance&apos;s PVC-free vinyl orders are up 34% quarter-over-quarter. They haven&apos;t yet been quoted on the new FSC-certified liner line — worth a proactive outreach.
                  </AICard>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Ask about this account</h3>
                    <PromptInput
                      placeholder='e.g. "Summarize open risk on this account"'
                      onSubmit={(v) => toast("ai", `AI Assistant is looking into: "${v}"`)}
                    />
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Recent activity</h3>
                    <ActivityFeed
                      items={[
                        { id: "1", actor: "Priya Nair", action: "confirmed", target: "SO-MU-2026-007812", time: "2h ago" },
                        { id: "2", actor: "AI Assistant", action: "flagged an upsell opportunity on", target: "Reliance Retail Ltd", time: "5h ago", aiRanked: true },
                        { id: "3", actor: "Arjun Rao", action: "updated the credit limit for", target: "Reliance Retail Ltd", time: "1 day ago" },
                      ]}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Key contacts</h3>
                    <ul className="flex flex-col gap-3 text-sm">
                      <li>
                        <p className="font-medium text-ink">Meera Kapoor</p>
                        <p className="text-xs text-ink-secondary">Procurement Lead · meera.kapoor@reliance-retail.in</p>
                      </li>
                      <li>
                        <p className="font-medium text-ink">Sanjay Iyer</p>
                        <p className="text-xs text-ink-secondary">Finance Contact · sanjay.iyer@reliance-retail.in</p>
                      </li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Order status mix</h3>
                    <DonutChart
                      data={[
                        { label: "Confirmed", value: 6, color: "success" },
                        { label: "Pending", value: 2, color: "warning" },
                        { label: "Draft", value: 1, color: "info" },
                      ]}
                    />
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: "insights",
            label: "Insights",
            content: (
              <div className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-surface p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Order volume — last 6 months</h3>
                  <BarChart data={[{ label: "Feb", value: 32 }, { label: "Mar", value: 41 }, { label: "Apr", value: 38 }, { label: "May", value: 52 }, { label: "Jun", value: 61 }, { label: "Jul", value: 58 }]} />
                </div>
                <div className="rounded-lg border border-line bg-surface p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Account health</h3>
                  <div className="flex justify-center">
                    <GaugeChart value={82} label="Composite health score" />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <AICard variant="recommendation" title="Renewal risk is low" citation="Payment history, 24 months">
                    No missed or late payments in the last 24 months; Net 45 terms have been honored consistently. No renewal risk indicators detected.
                  </AICard>
                </div>
              </div>
            ),
          },
          {
            id: "timeline",
            label: "Timeline",
            content: (
              <div className="pt-5">
                <Timeline
                  entries={[
                    { id: "t1", date: "12 Jul 2026", title: "Order SO-MU-2026-007812 confirmed" },
                    { id: "t2", date: "28 Jun 2026", title: "Credit limit increased to ₹50,00,000", description: "Approved by Finance following 18 months of clean payment history." },
                    { id: "t3", date: "3 Apr 2026", title: "Account tier upgraded to Tier 1" },
                    { id: "t4", date: "14 Jan 2026", title: "Relationship started", description: "Onboarded via West Region Sales." },
                  ]}
                />
              </div>
            ),
          },
          {
            id: "documents",
            label: "Documents",
            content: (
              <div className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2">
                <DocumentPreview title="Master Service Agreement — Reliance Retail" summary="Governs all supply terms, pricing tiers, and Net 45 payment terms." tags={["Contract", "Rev 2"]} />
                <DocumentPreview title="Credit Policy Addendum" summary="Superseded — credit limit terms updated 28 Jun 2026." tags={["Finance"]} superseded />
              </div>
            ),
          },
          {
            id: "relationships",
            label: "Relationships",
            content: (
              <div className="pt-5">
                <RelationshipGraph
                  center={center}
                  nodes={NODES}
                  edges={EDGES}
                  onRecenter={(id) => {
                    const node = NODES.find((n) => n.id === id);
                    if (node) {
                      setCenter(node);
                      toast("ai", `Recentered on ${node.label}`);
                    }
                  }}
                />
              </div>
            ),
          },
          {
            id: "activity",
            label: "Activity",
            content: (
              <div className="flex flex-col gap-6 pt-5">
                <ApprovalPanel
                  title="Credit Limit Increase — Reliance Retail Ltd"
                  requestedBy="Priya Nair, Account Owner"
                  value="₹50,00,000 (from ₹35,00,000)"
                  aiRecommendation="18 months of on-time payments and growing order volume support this increase. No risk indicators found."
                  stages={[
                    { id: "s1", label: "Submitted", status: "complete", actor: "Priya Nair", timestamp: "26 Jun" },
                    { id: "s2", label: "Finance Review", status: "current" },
                    { id: "s3", label: "Final Sign-off", status: "upcoming" },
                  ]}
                  onApprove={() => toast("success", "Credit limit increase approved")}
                  onReject={() => toast("danger", "Credit limit increase rejected")}
                  onDelegate={() => toast("info", "Delegated to Finance Director")}
                />
                <Comments
                  comments={comments}
                  onAdd={(text) => setComments((c) => [...c, { id: crypto.randomUUID(), author: "You", content: text, time: "just now" }])}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
