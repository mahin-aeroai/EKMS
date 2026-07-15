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
import { LineChart, BarChart } from "@/components/ui/Charts";
import { DocumentPreview, PDFViewer } from "@/components/ui/Viewers";
import { Comments, type Comment } from "@/components/ui/Comments";
import { ApprovalPanel } from "@/components/ui/ApprovalPanel";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type ProjectRow, type ProjectCommentRow, type ProjectApprovalRow } from "@/lib/supabase";
import { timeAgo } from "@/lib/timeAgo";

const NODES: GraphNode[] = [
  { id: "center", label: "Project", type: "Project" },
  { id: "n1", label: "Customer", type: "Customer" },
  { id: "n2", label: "RM-0231 — PVC-Free Vinyl", type: "Raw Material" },
  { id: "n3", label: "Machine M-14", type: "Machine" },
  { id: "n4", label: "SO-MU-2026-007812", type: "Sales Order" },
  { id: "n5", label: "Project Manager", type: "Project Manager" },
];

const EDGES: GraphEdge[] = [
  { from: "center", to: "n1", label: "customer" },
  { from: "center", to: "n2", label: "uses material" },
  { from: "center", to: "n3", label: "runs on" },
  { from: "center", to: "n4", label: "billed via" },
  { from: "center", to: "n5", label: "managed by" },
];

// The project schema has no workstream/kanban-card table, so this stays
// local sample state, same as before — only the header, stat row, project
// info panel, and Activity tab are backed by real data.
const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "tooling", title: "Tooling", cards: [{ id: "k1", title: "Finalize mold cavity design", meta: "Due 18 Jul" }, { id: "k2", title: "Tooling vendor sign-off", meta: "Due 22 Jul" }] },
  { id: "molding", title: "Molding", cards: [{ id: "k3", title: "First-article inspection", meta: "Machine M-14", aiSuggestedColumn: "qa" }] },
  { id: "assembly", title: "Assembly", cards: [{ id: "k4", title: "Line trial run" }] },
  { id: "qa", title: "QA & Sign-off", cards: [{ id: "k5", title: "Customer sample approval" }] },
];

function toDisplayComment(row: ProjectCommentRow): Comment {
  return { id: row.id, author: row.author, content: row.content, time: timeAgo(row.created_at), resolved: row.resolved };
}

/**
 * Client half of the Project Workspace — same Server/Client split as the
 * Customer workspace. Stat row, project info panel, and the Activity tab
 * (comments + approvals) are real. Insights/Timeline/Documents/
 * Relationships/the Kanban board remain illustrative sample content — no
 * workstream, budget-ledger, or document storage tables exist yet.
 */
export function ProjectWorkspaceClient({
  project,
  initialComments,
  initialApproval,
}: {
  project: ProjectRow;
  initialComments: ProjectCommentRow[];
  initialApproval: ProjectApprovalRow | null;
}) {
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>(initialComments.map(toDisplayComment));
  const [approval, setApproval] = useState(initialApproval);
  const nodes = NODES.map((n) => (n.id === "center" ? { ...n, label: project.name } : n));
  const [center, setCenter] = useState(nodes[0]);

  async function handleAddComment(text: string) {
    const optimistic: Comment = { id: crypto.randomUUID(), author: "You", content: text, time: "just now" };
    setComments((c) => [...c, optimistic]);

    const { data, error } = await supabase
      .from("project_comments")
      .insert({ project_id: project.id, author: "You", content: text })
      .select()
      .single();

    if (error) {
      toast("danger", "Couldn't save comment — check your Supabase connection");
      return;
    }
    setComments((c) => c.map((item) => (item.id === optimistic.id ? toDisplayComment(data as ProjectCommentRow) : item)));
  }

  async function handleDecision(status: "approved" | "rejected", message: string) {
    if (!approval) return;
    const { error } = await supabase.from("project_approvals").update({ status }).eq("id", approval.id);
    if (error) {
      toast("danger", "Couldn't update approval — check your Supabase connection");
      return;
    }
    setApproval({ ...approval, status });
    toast(status === "approved" ? "success" : "danger", message);
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Projects", href: "/workspaces/project" }, { label: project.name }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-info-tint text-info">
            <FolderKanban size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{project.name}</h1>
              <Badge status={project.status === "active" ? "success" : project.schedule_health === "Red" ? "danger" : "warning"}>{project.status}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Project — {project.code}
              {project.customer ? ` · Customer: ${project.customer}` : ""}
              {project.project_manager ? ` · Project manager: ${project.project_manager}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {project.primary_line && <Tag>{project.primary_line}</Tag>}
              {project.target_completion && <Tag>{`Target: ${project.target_completion}`}</Tag>}
              {typeof project.budget === "number" && <Tag>{`Budget ₹${project.budget.toLocaleString("en-IN")}`}</Tag>}
              {project.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
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

      {/* Stat row — live from Supabase */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Completion" value={`${project.completion_pct}%`} trend="flat" trendLabel="Live value" />
        <StatCard label="Budget Utilization" value={`${project.budget_utilization}%`} trend="flat" trendLabel="Live value" />
        <StatCard label="Schedule Health" value={project.schedule_health} trend="flat" trendLabel="Live value" />
        <StatCard label="Open Risks" value={String(project.open_risks)} trend="flat" trendLabel="Live value" />
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
                    title="Schedule health"
                    citation="Project record"
                    onAccept={() => toast("success", "Risk added to project risk register")}
                    onDismiss={() => toast("info", "Dismissed")}
                  >
                    {project.name} is {project.completion_pct}% complete with {project.open_risks} open risk{project.open_risks === 1 ? "" : "s"} and schedule health marked {project.schedule_health}.
                  </AICard>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Workstream status</h3>
                    <Kanban initialColumns={KANBAN_COLUMNS} />
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Ask about this project</h3>
                    <PromptInput
                      placeholder='e.g. "What is blocking the next milestone?"'
                      onSubmit={(v) => toast("ai", `AI Assistant is looking into: "${v}"`)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Project info</h3>
                    <ul className="flex flex-col gap-2 text-sm">
                      <li className="flex justify-between"><span className="text-ink-secondary">Sponsor</span><span className="font-medium text-ink">{project.sponsor ?? "—"}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Kickoff</span><span className="font-medium text-ink">{project.kickoff ?? "—"}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Target completion</span><span className="font-medium text-ink">{project.target_completion ?? "—"}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Primary line</span><span className="font-medium text-ink">{project.primary_line ?? "—"}</span></li>
                    </ul>
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
                  <LineChart data={[{ label: "Feb", value: 8 }, { label: "Mar", value: 19 }, { label: "Apr", value: 29 }, { label: "May", value: 41 }, { label: "Jun", value: 52 }, { label: "Jul", value: project.budget_utilization }]} />
                </div>
                <div className="rounded-lg border border-line bg-surface p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">BOM cost by component</h3>
                  <BarChart data={[{ label: "Panels", value: 38 }, { label: "Hinges", value: 12 }, { label: "Vinyl Liner", value: 21 }, { label: "Hardware", value: 9 }]} />
                </div>
                <div className="sm:col-span-2">
                  <AICard variant="summary" title="Budget tracking" citation="Project record">
                    Budget utilization is at {project.budget_utilization}% against {project.completion_pct}% completion.
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
                    { id: "t1", date: "10 Jul 2026", title: "Status review", description: `${project.open_risks} open risk${project.open_risks === 1 ? "" : "s"} on record.` },
                    { id: "t2", date: project.target_completion ?? "—", title: "Target completion" },
                    { id: "t3", date: project.kickoff ?? "—", title: "Project kicked off" },
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
                <DocumentPreview title={`Bill of Materials — ${project.name}`} summary="Full component list with supplier and cost detail per line item." tags={["BOM"]} />
                <DocumentPreview title={`Customer Requirements Document — ${project.customer ?? project.name}`} summary="Requirements and specifications for this project." tags={["Requirements"]} />
                <div className="sm:col-span-2">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Drawing package</h3>
                  <PDFViewer title={`${project.name} — Drawing Set`} pageCount={22} />
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
                  nodes={nodes}
                  edges={EDGES}
                  onRecenter={(id) => {
                    const node = nodes.find((n) => n.id === id);
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
                {approval && (
                  <ApprovalPanel
                    title={approval.title}
                    requestedBy={approval.requested_by}
                    value={approval.value}
                    aiRecommendation="Review the schedule impact before sign-off."
                    stages={[
                      { id: "s1", label: "Submitted", status: "complete", actor: approval.requested_by.split(",")[0], timestamp: timeAgo(approval.created_at) },
                      {
                        id: "s2",
                        label: "Sponsor Approval",
                        status: approval.status === "pending" ? "current" : "complete",
                      },
                      {
                        id: "s3",
                        label: approval.status === "rejected" ? "Rejected" : "Schedule Updated",
                        status: approval.status === "approved" ? "complete" : approval.status === "rejected" ? "escalated" : "upcoming",
                      },
                    ]}
                    onApprove={() => handleDecision("approved", `${approval.title} approved`)}
                    onReject={() => handleDecision("rejected", `${approval.title} rejected`)}
                    onDelegate={() => toast("info", "Delegated to Program Sponsor")}
                  />
                )}
                <Comments comments={comments} onAdd={handleAddComment} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
