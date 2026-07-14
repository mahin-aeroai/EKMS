"use client";

import { useState } from "react";
import { FolderKanban, Pencil, FlagTriangleRight, XCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Tabs } from "@/components/ui/Tabs";
import { StatCard, AICard } from "@/components/ui/Card";
import { Timeline } from "@/components/ui/Timeline";
import { Kanban, type KanbanColumn } from "@/components/ui/Kanban";
import { LineChart, BarChart, DonutChart } from "@/components/ui/Charts";
import { DocumentPreview, PDFViewer } from "@/components/ui/Viewers";
import { Comments, type Comment } from "@/components/ui/Comments";
import { ApprovalPanel } from "@/components/ui/ApprovalPanel";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useToast } from "@/components/ui/Notifications";

const NODES: GraphNode[] = [
  { id: "center", label: "IKEA Wardrobe Program — Phase 2", type: "Project" },
  { id: "n1", label: "IKEA India", type: "Customer" },
  { id: "n2", label: "RM-0231 — PVC-Free Vinyl", type: "Raw Material" },
  { id: "n3", label: "Machine M-14", type: "Machine" },
  { id: "n4", label: "SO-MU-2026-007812", type: "Sales Order" },
  { id: "n5", label: "Priya Nair", type: "Project Manager" },
];

const EDGES: GraphEdge[] = [
  { from: "center", to: "n1", label: "customer" },
  { from: "center", to: "n2", label: "uses material" },
  { from: "center", to: "n3", label: "runs on" },
  { from: "center", to: "n4", label: "billed via" },
  { from: "center", to: "n5", label: "managed by" },
];

const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "tooling", title: "Tooling", cards: [{ id: "k1", title: "Finalize mold cavity design", meta: "Due 18 Jul" }, { id: "k2", title: "Tooling vendor sign-off", meta: "Due 22 Jul" }] },
  { id: "molding", title: "Molding", cards: [{ id: "k3", title: "First-article inspection", meta: "Machine M-14", aiSuggestedColumn: "qa" }] },
  { id: "assembly", title: "Assembly", cards: [{ id: "k4", title: "Line trial run" }] },
  { id: "qa", title: "QA & Sign-off", cards: [{ id: "k5", title: "Customer sample approval", meta: "IKEA India" }] },
];

const INITIAL_COMMENTS: Comment[] = [
  { id: "c1", author: "Priya Nair", content: "Tooling vendor is asking for a 1-week extension on the mold cavity revision.", time: "1 day ago" },
  { id: "c2", author: "AI Assistant", content: "A 1-week tooling delay pushes the molding start into the window where Machine M-14's predicted maintenance window overlaps — flagging for scheduling review.", time: "20 hours ago" },
];

export default function ProjectWorkspacePage() {
  const { toast } = useToast();
  const [comments, setComments] = useState(INITIAL_COMMENTS);
  const [center, setCenter] = useState(NODES[0]);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Projects", href: "/workspaces/project" }, { label: "IKEA Wardrobe Program — Phase 2" }]} />

      {/* Workspace header */}
      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-info-tint text-info">
            <FolderKanban size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">IKEA Wardrobe Program — Phase 2</h1>
              <Badge status="warning">At Risk</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Project — PRJ-MU-0089 · Customer: IKEA India · Project manager: Priya Nair</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Cross-functional</Tag>
              <Tag>Target: 30 Sep 2026</Tag>
              <Tag>Budget ₹84,00,000</Tag>
              <Tag aiSuggested>Tooling delay may collide with Machine M-14 maintenance window</Tag>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => toast("info", "Opening edit form for this project")}>
            <Pencil size={14} className="mr-1.5" /> Edit
          </Button>
          <ContextMenu
            items={[
              { label: "Add milestone", icon: <FlagTriangleRight size={13} />, onSelect: () => toast("success", "Milestone added") },
              { label: "Close project", icon: <XCircle size={13} />, onSelect: () => toast("warning", "Closing requires Sponsor approval"), destructive: true },
            ]}
          />
        </div>
      </div>

      {/* Stat row */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Completion" value="58%" trend="up" trendLabel="+6 pts this month" />
        <StatCard label="Budget Utilization" value="61%" trend="flat" trendLabel="On plan" />
        <StatCard label="Schedule Health" value="Amber" trend="down" trendLabel="Tooling delay risk" aiInsight="A 1-week tooling slip would push molding start into Machine M-14's predicted maintenance window — recommend confirming the tooling extension before committing the molding schedule." />
        <StatCard label="Open Risks" value="2" trend="up" trendLabel="+1 this week" />
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
                    title="Tooling delay risk cascades into molding schedule"
                    citation="Project schedule, Machine M-14 maintenance forecast"
                    onAccept={() => toast("success", "Risk added to project risk register")}
                    onDismiss={() => toast("info", "Dismissed")}
                  >
                    The tooling vendor&apos;s requested 1-week extension would shift the molding start date into the window where Machine M-14 has a predicted maintenance need — recommend resolving the tooling timeline before locking the molding schedule.
                  </AICard>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Workstream status</h3>
                    <Kanban initialColumns={KANBAN_COLUMNS} />
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Ask about this project</h3>
                    <PromptInput
                      placeholder='e.g. "What is blocking the molding milestone?"'
                      onSubmit={(v) => toast("ai", `AI Assistant is looking into: "${v}"`)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Project info</h3>
                    <ul className="flex flex-col gap-2 text-sm">
                      <li className="flex justify-between"><span className="text-ink-secondary">Sponsor</span><span className="font-medium text-ink">IKEA India</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Kickoff</span><span className="font-medium text-ink">14 Jan 2026</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Target completion</span><span className="font-medium text-ink">30 Sep 2026</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Primary line</span><span className="font-medium text-ink">Line 3</span></li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Budget by category</h3>
                    <DonutChart
                      data={[
                        { label: "Tooling", value: 34, color: "primary" },
                        { label: "Material", value: 28, color: "info" },
                        { label: "Labor", value: 22, color: "success" },
                        { label: "Logistics", value: 16, color: "warning" },
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
                  <h3 className="mb-3 text-sm font-semibold text-ink">Budget burn — actual vs plan</h3>
                  <LineChart data={[{ label: "Feb", value: 8 }, { label: "Mar", value: 19 }, { label: "Apr", value: 29 }, { label: "May", value: 41 }, { label: "Jun", value: 52 }, { label: "Jul", value: 61 }]} />
                </div>
                <div className="rounded-lg border border-line bg-surface p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">BOM cost by component</h3>
                  <BarChart data={[{ label: "Panels", value: 38 }, { label: "Hinges", value: 12 }, { label: "Vinyl Liner", value: 21 }, { label: "Hardware", value: 9 }]} />
                </div>
                <div className="sm:col-span-2">
                  <AICard variant="summary" title="Budget tracking within tolerance" citation="Finance ledger, project cost center">
                    Actual spend is tracking 3% under plan through Phase 2 to date, with the Tooling category the largest share — consistent with the front-loaded nature of tooling investment in injection molding programs.
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
                    { id: "t1", date: "10 Jul 2026", title: "Tooling vendor requested 1-week extension" },
                    { id: "t2", date: "2 Jun 2026", title: "First-article samples approved by IKEA India" },
                    { id: "t3", date: "15 Apr 2026", title: "Tooling design finalized" },
                    { id: "t4", date: "14 Jan 2026", title: "Project kicked off" },
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
                <DocumentPreview title="Bill of Materials — Wardrobe Program Phase 2" summary="Full component list: panels, hinges, vinyl liner, hardware, with supplier and cost detail per line item." tags={["BOM", "Rev 2"]} />
                <DocumentPreview title="Customer Requirements Document — IKEA India" summary="Sustainability and material requirements, including the PVC-free substrate mandate." tags={["Requirements"]} />
                <div className="sm:col-span-2">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Tooling drawing package</h3>
                  <PDFViewer title="Mold Cavity Drawing Set — Rev C" pageCount={22} />
                </div>
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
                  title="Schedule Change — Tooling Extension"
                  requestedBy="Priya Nair, Project Manager"
                  value="+1 week to tooling milestone, no budget impact"
                  aiRecommendation="Approving the extension avoids rushing the mold cavity revision, but confirm the revised molding start date against Machine M-14's maintenance forecast before sign-off."
                  stages={[
                    { id: "s1", label: "Submitted", status: "complete", actor: "Priya Nair", timestamp: "Yesterday" },
                    { id: "s2", label: "Sponsor Approval", status: "current" },
                    { id: "s3", label: "Schedule Updated", status: "upcoming" },
                  ]}
                  onApprove={() => toast("success", "Schedule change approved")}
                  onReject={() => toast("danger", "Schedule change rejected")}
                  onDelegate={() => toast("info", "Delegated to Program Sponsor")}
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
