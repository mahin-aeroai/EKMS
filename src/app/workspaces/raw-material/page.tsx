"use client";

import { useState } from "react";
import { Package, Pencil, ShoppingCart, Ban } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Tabs } from "@/components/ui/Tabs";
import { StatCard, AICard } from "@/components/ui/Card";
import { Timeline } from "@/components/ui/Timeline";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { LineChart, BarChart, DonutChart } from "@/components/ui/Charts";
import { DocumentPreview } from "@/components/ui/Viewers";
import { Comments, type Comment } from "@/components/ui/Comments";
import { ApprovalPanel } from "@/components/ui/ApprovalPanel";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useToast } from "@/components/ui/Notifications";

const NODES: GraphNode[] = [
  { id: "center", label: "RM-0231 — PVC-Free Vinyl", type: "Raw Material" },
  { id: "n1", label: "Cosmo Films Ltd", type: "Supplier" },
  { id: "n2", label: "UFlex Ltd", type: "Supplier" },
  { id: "n3", label: "IKEA Wardrobe Program", type: "Project" },
  { id: "n4", label: "Machine M-14", type: "Machine" },
  { id: "n5", label: "PO-MU-2026-004521", type: "Purchase Order" },
];

const EDGES: GraphEdge[] = [
  { from: "center", to: "n1", label: "supplied by (primary)" },
  { from: "center", to: "n2", label: "supplied by (secondary)" },
  { from: "center", to: "n3", label: "used in" },
  { from: "center", to: "n4", label: "processed on" },
  { from: "center", to: "n5", label: "last ordered via" },
];

const INITIAL_COMMENTS: Comment[] = [
  { id: "c1", author: "Meera Kapoor", content: "Cosmo Films confirmed a 2-week lead time increase due to a resin shortage on their end.", time: "1 day ago" },
  { id: "c2", author: "AI Assistant", content: "Recommend increasing safety stock by 15% for the next 2 reorder cycles to absorb the extended lead time.", time: "22 hours ago" },
];

export default function RawMaterialWorkspacePage() {
  const { toast } = useToast();
  const [comments, setComments] = useState(INITIAL_COMMENTS);
  const [center, setCenter] = useState(NODES[0]);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Raw Materials", href: "/workspaces/raw-material" }, { label: "RM-0231" }]} />

      {/* Workspace header */}
      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-danger-tint text-danger">
            <Package size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">RM-0231 — PVC-Free Vinyl Sheet</h1>
              <Badge status="danger">Low Stock</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Raw Material — Category: Vinyl Substrate · Category owner: Meera Kapoor</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>ICC: ISO Coated v2</Tag>
              <Tag>Substrate: BOPP 20µ</Tag>
              <Tag>PVC-free</Tag>
              <Tag>FSC-certified</Tag>
              <Tag aiSuggested>Shortage risk — 6 days to stockout</Tag>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => toast("info", "Opening edit form for RM-0231")}>
            <Pencil size={14} className="mr-1.5" /> Edit
          </Button>
          <ContextMenu
            items={[
              { label: "Raise reorder", icon: <ShoppingCart size={13} />, onSelect: () => toast("success", "Reorder request drafted for RM-0231") },
              { label: "Discontinue material", icon: <Ban size={13} />, onSelect: () => toast("warning", "Discontinuation requires Category Manager approval"), destructive: true },
            ]}
          />
        </div>
      </div>

      {/* Stat row */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Current Stock" value="1,240 kg" trend="down" trendLabel="-18% vs safety stock" aiInsight="At current consumption rate, stock falls below safety threshold in 6 days." />
        <StatCard label="Reorder Point" value="1,500 kg" trend="flat" trendLabel="Unchanged" />
        <StatCard label="Lead Time" value="9 days" trend="up" trendLabel="+2 days vs baseline" />
        <StatCard label="Approved Suppliers" value="2" trend="flat" trendLabel="Cosmo Films, UFlex Ltd" />
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
                    variant="recommendation"
                    title="Shortage risk — reorder recommended now"
                    citation="Inventory Master, Reorder Policy, Consumption trend last 30 days"
                    onAccept={() => toast("success", "Reorder request created for RM-0231")}
                    onDismiss={() => toast("info", "Dismissed")}
                  >
                    Stock will fall below the safety threshold in 6 days at current consumption. Cosmo Films&apos; lead time has extended to 9 days — reorder today to avoid a production gap on the IKEA Wardrobe Program.
                  </AICard>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Ask about this material</h3>
                    <PromptInput
                      placeholder='e.g. "Which projects consume the most RM-0231?"'
                      onSubmit={(v) => toast("ai", `AI Assistant is looking into: "${v}"`)}
                    />
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Recent activity</h3>
                    <ActivityFeed
                      items={[
                        { id: "1", actor: "AI Assistant", action: "flagged a shortage risk on", target: "RM-0231", time: "18m ago", aiRanked: true },
                        { id: "2", actor: "Meera Kapoor", action: "logged a lead-time update for", target: "Cosmo Films Ltd", time: "1 day ago" },
                        { id: "3", actor: "System", action: "recorded a stock movement for", target: "RM-0231", time: "2 days ago" },
                      ]}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Material spec</h3>
                    <ul className="flex flex-col gap-2 text-sm">
                      <li className="flex justify-between"><span className="text-ink-secondary">Compatible substrates</span><span className="font-medium text-ink">BOPP 20µ, PET 12µ</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Unit cost</span><span className="font-medium text-ink">₹118.50 / kg</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">MOQ</span><span className="font-medium text-ink">500 kg</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Storage class</span><span className="font-medium text-ink">Ambient, dry</span></li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Supplier split — last 90 days</h3>
                    <DonutChart
                      data={[
                        { label: "Cosmo Films", value: 68, color: "primary" },
                        { label: "UFlex Ltd", value: 32, color: "info" },
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
                  <h3 className="mb-3 text-sm font-semibold text-ink">Stock level — last 7 days</h3>
                  <LineChart data={[{ label: "Mon", value: 2100 }, { label: "Tue", value: 1950 }, { label: "Wed", value: 1800 }, { label: "Thu", value: 1620 }, { label: "Fri", value: 1480 }, { label: "Sat", value: 1350 }, { label: "Sun", value: 1240 }]} />
                </div>
                <div className="rounded-lg border border-line bg-surface p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Consumption by project</h3>
                  <BarChart data={[{ label: "IKEA Wardrobe", value: 640 }, { label: "Godrej Interio", value: 210 }, { label: "Urban Ladder", value: 140 }, { label: "Other", value: 90 }]} />
                </div>
                <div className="sm:col-span-2">
                  <AICard variant="insight" title="Demand concentrated in one project" citation="Sales Order history, last 90 days">
                    68% of current consumption is driven by the IKEA Wardrobe Program alone — a delay or cancellation there would materially change the reorder cadence for this material.
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
                    { id: "t1", date: "12 Jul 2026", title: "Lead time extended to 9 days", description: "Cosmo Films cited a resin shortage on their end." },
                    { id: "t2", date: "3 Jun 2026", title: "Added UFlex Ltd as secondary supplier", description: "Qualified as backup source after single-supplier risk was flagged." },
                    { id: "t3", date: "14 Feb 2026", title: "Unit cost revised to ₹118.50/kg" },
                    { id: "t4", date: "20 Nov 2025", title: "Material qualified and added to master" },
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
                <DocumentPreview title="Material Specification Sheet — RM-0231" summary="Full technical spec: substrate compatibility, ICC profile, tolerance and storage requirements." tags={["Spec", "Rev 3"]} />
                <DocumentPreview title="FSC Certificate of Compliance" summary="Chain-of-custody certificate from Cosmo Films, valid through Dec 2026." tags={["Compliance", "Certificate"]} />
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
                  title="Reorder — RM-0231 PVC-Free Vinyl Sheet"
                  requestedBy="Meera Kapoor, Procurement"
                  value="2,000 kg — Cosmo Films Ltd, est. ₹2,37,000"
                  aiRecommendation="Recommended quantity covers the extended 9-day lead time plus a 15% safety buffer given the single-project demand concentration."
                  stages={[
                    { id: "s1", label: "Submitted", status: "complete", actor: "Meera Kapoor", timestamp: "Today" },
                    { id: "s2", label: "Category Manager Approval", status: "current" },
                    { id: "s3", label: "PO Issued", status: "upcoming" },
                  ]}
                  onApprove={() => toast("success", "Reorder approved and PO drafted")}
                  onReject={() => toast("danger", "Reorder rejected")}
                  onDelegate={() => toast("info", "Delegated to Category Manager")}
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
