"use client";

import { useState } from "react";
import { ClipboardList, Pencil, FlagTriangleRight, XCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Tabs } from "@/components/ui/Tabs";
import { StatCard, AICard } from "@/components/ui/Card";
import { Timeline } from "@/components/ui/Timeline";
import { Comments, type Comment } from "@/components/ui/Comments";
import { ApprovalPanel } from "@/components/ui/ApprovalPanel";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useRecordCopilot } from "@/lib/useRecordCopilot";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type JobOrderRow, type JobOrderCommentRow, type JobOrderApprovalRow } from "@/lib/supabase";
import { timeAgo } from "@/lib/timeAgo";

const STATUS_BADGE: Record<string, BadgeStatus> = {
  Completed: "success",
  "In Progress": "warning",
};

function toDisplayComment(row: JobOrderCommentRow): Comment {
  return { id: row.id, author: row.author, content: row.content, time: timeAgo(row.created_at), resolved: row.resolved };
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Deliberately not using toLocaleDateString: Node's ICU data (server render)
// and the browser's (client hydration) can format the same date differently
// depending on the runtime's ICU build, which produces a text mismatch
// between server-rendered and client-rendered HTML and can break hydration
// for the whole page. Parsing the "YYYY-MM-DD" string directly and
// formatting by hand is deterministic across both environments.
function formatDate(d: string | null) {
  if (!d) return "—";
  const [year, month, day] = d.slice(0, 10).split("-");
  const monthIndex = Number(month) - 1;
  if (!year || !MONTH_ABBR[monthIndex] || !day) return d;
  return `${day} ${MONTH_ABBR[monthIndex]} ${year}`;
}

function buildGraph(jobOrder: JobOrderRow): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [{ id: "center", label: jobOrder.name, type: "Job Order" }];
  const edges: GraphEdge[] = [];

  nodes.push({ id: "customer", label: jobOrder.customer_name, type: "Customer" });
  edges.push({ from: "center", to: "customer", label: jobOrder.customer_id ? "customer" : "customer (unlinked)" });

  if (jobOrder.primary_machine) {
    nodes.push({ id: "machine", label: jobOrder.primary_machine, type: "Machine" });
    edges.push({ from: "center", to: "machine", label: "runs on" });
  }
  if (jobOrder.sales_person) {
    nodes.push({ id: "sales", label: jobOrder.sales_person, type: "Sales Person" });
    edges.push({ from: "center", to: "sales", label: "sold by" });
  }
  if (jobOrder.application) {
    nodes.push({ id: "application", label: jobOrder.application, type: "Application" });
    edges.push({ from: "center", to: "application", label: "for" });
  }

  return { nodes, edges };
}

/**
 * Client half of the Job Orders Workspace — same Server/Client split as the
 * other 3 flagship workspaces. Header, stat row, job order info panel,
 * Timeline, Relationships, and the Activity tab (comments + approvals) are
 * all real data from `job_orders` (imported from Production Report
 * FY2026_Q1.xlsx). Insights and Documents stay illustrative sample content —
 * no cost-ledger or document-storage table exists to back them yet.
 */
export function JobOrderWorkspaceClient({
  jobOrder,
  initialComments,
  initialApproval,
}: {
  jobOrder: JobOrderRow;
  initialComments: JobOrderCommentRow[];
  initialApproval: JobOrderApprovalRow | null;
}) {
  const { toast } = useToast();
  const { ask, answer, loading } = useRecordCopilot();
  const role = useUserRole();
  const [comments, setComments] = useState<Comment[]>(initialComments.map(toDisplayComment));
  const [approval, setApproval] = useState(initialApproval);
  const graph = buildGraph(jobOrder);
  const [center, setCenter] = useState(graph.nodes[0]);

  async function handleAddComment(text: string) {
    const optimistic: Comment = { id: crypto.randomUUID(), author: "You", content: text, time: "just now" };
    setComments((c) => [...c, optimistic]);

    const { data, error } = await supabase
      .from("job_order_comments")
      .insert({ job_order_id: jobOrder.id, author: "You", content: text })
      .select()
      .single();

    if (error) {
      toast("danger", "Couldn't save comment — check your Supabase connection");
      return;
    }
    setComments((c) => c.map((item) => (item.id === optimistic.id ? toDisplayComment(data as JobOrderCommentRow) : item)));
  }

  async function handleDecision(status: "approved" | "rejected", message: string) {
    if (!approval) return;
    const { error } = await supabase.from("job_order_approvals").update({ status }).eq("id", approval.id);
    if (error) {
      toast("danger", "Couldn't update approval — check your Supabase connection");
      return;
    }
    setApproval({ ...approval, status });
    toast(status === "approved" ? "success" : "danger", message);
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Job Orders", href: "/workspaces/job-orders" }, { label: jobOrder.name }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-info-tint text-info">
            <ClipboardList size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{jobOrder.name}</h1>
              <Badge status={STATUS_BADGE[jobOrder.status] ?? "neutral"}>{jobOrder.status}</Badge>
              {!jobOrder.customer_id && <Badge status="neutral">Customer not linked</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Job Order — {jobOrder.code}
              {jobOrder.sales_person ? ` · Sales: ${jobOrder.sales_person}` : ""}
              {jobOrder.location ? ` · ${jobOrder.location}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {jobOrder.primary_machine && <Tag>{jobOrder.primary_machine}</Tag>}
              {jobOrder.application && <Tag>{jobOrder.application}</Tag>}
              {jobOrder.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => toast("info", "Opening edit form for this job order")}>
            <Pencil size={14} className="mr-1.5" /> Edit
          </Button>
          <ContextMenu
            items={[
              { label: "Flag for review", icon: <FlagTriangleRight size={13} />, onSelect: () => toast("success", "Flagged for review") },
              { label: "Close job order", icon: <XCircle size={13} />, onSelect: () => toast("warning", "Closing requires supervisor approval"), destructive: true },
            ]}
          />
        </div>
      </div>

      {/* Stat row — live from Supabase */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total Value" value={`₹${jobOrder.total_value.toLocaleString("en-IN")}`} trend="flat" trendLabel="Live value" />
        <StatCard label="Total Sqft" value={jobOrder.total_sqft.toLocaleString("en-IN")} trend="flat" trendLabel="Live value" />
        <StatCard label="Line Items" value={String(jobOrder.line_item_count)} trend="flat" trendLabel="Live value" />
        <StatCard label="Total Qty" value={String(jobOrder.total_qty)} trend="flat" trendLabel="Live value" />
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
                    title="Job order summary"
                    citation="Job order record"
                    onAccept={() => toast("success", "Noted")}
                    onDismiss={() => toast("info", "Dismissed")}
                  >
                    {jobOrder.name} ran {jobOrder.line_item_count} line item{jobOrder.line_item_count === 1 ? "" : "s"}
                    {jobOrder.primary_machine ? ` primarily on ${jobOrder.primary_machine}` : ""}, totalling{" "}
                    {jobOrder.total_sqft.toLocaleString("en-IN")} sqft worth ₹{jobOrder.total_value.toLocaleString("en-IN")}.
                    Status: {jobOrder.status}.
                  </AICard>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Ask about this job order</h3>
                    <PromptInput
                      placeholder='e.g. "Which substrates were used on this job order?"'
                      onSubmit={(v) => ask(`The user is viewing Job Order ${jobOrder.code} (${jobOrder.name}) in MMDI ONE, an internal operating platform for MMDI.`, v)}
                      disabled={loading}
                    />
                    {loading && <p className="mt-2 text-xs text-ink-muted">AI Copilot is looking into it…</p>}
                    {answer && (
                      <div className="mt-2 rounded-lg border border-line bg-surface-sunken p-3 text-sm text-ink">
                        <p className="whitespace-pre-line">{answer.content}</p>
                        {answer.citations && answer.citations.length > 0 && (
                          <p className="mt-2 text-xs text-ink-muted">{answer.citations.join(" \u00b7 ")}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Job order info</h3>
                    <ul className="flex flex-col gap-2 text-sm">
                      <li className="flex justify-between"><span className="text-ink-secondary">Customer</span><span className="font-medium text-ink">{jobOrder.customer_name}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Sales person</span><span className="font-medium text-ink">{jobOrder.sales_person ?? "—"}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Order date</span><span className="font-medium text-ink">{formatDate(jobOrder.order_date)}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Production window</span><span className="font-medium text-ink">{formatDate(jobOrder.production_start)} – {formatDate(jobOrder.production_end)}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Primary machine</span><span className="font-medium text-ink">{jobOrder.primary_machine ?? "—"}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Application</span><span className="font-medium text-ink">{jobOrder.application ?? "—"}</span></li>
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
              <div className="grid grid-cols-1 gap-6 pt-5">
                <AICard variant="summary" title="Job order economics" citation="Job order record">
                  ₹{jobOrder.total_value.toLocaleString("en-IN")} across {jobOrder.line_item_count} line item{jobOrder.line_item_count === 1 ? "" : "s"} ({jobOrder.total_sqft.toLocaleString("en-IN")} sqft, {jobOrder.total_qty} units).
                </AICard>
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="py-6 text-center text-sm text-ink-muted">No per-line cost ledger connected yet to break value down by substrate.</p>
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
                    { id: "t1", date: formatDate(jobOrder.order_date), title: "Job order placed" },
                    { id: "t2", date: formatDate(jobOrder.production_start), title: "Production started", description: jobOrder.primary_machine ?? undefined },
                    { id: "t3", date: formatDate(jobOrder.production_end), title: "Production completed", description: `Status: ${jobOrder.status}` },
                  ]}
                />
              </div>
            ),
          },
          {
            id: "documents",
            label: "Documents",
            content: (
              <div className="pt-5">
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="py-6 text-center text-sm text-ink-muted">No documents linked to this job order yet.</p>
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
                  nodes={graph.nodes}
                  edges={graph.edges}
                  onRecenter={(id) => {
                    const node = graph.nodes.find((n) => n.id === id);
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
                    stages={[
                      { id: "s1", label: "Submitted", status: "complete", actor: approval.requested_by.split(",")[0], timestamp: timeAgo(approval.created_at) },
                      {
                        id: "s2",
                        label: "Supervisor Review",
                        status: approval.status === "pending" ? "current" : "complete",
                      },
                      {
                        id: "s3",
                        label: approval.status === "rejected" ? "Rejected" : "Closed",
                        status: approval.status === "approved" ? "complete" : approval.status === "rejected" ? "escalated" : "upcoming",
                      },
                    ]}
                    onApprove={() => handleDecision("approved", `${approval.title} approved`)}
                    onReject={() => handleDecision("rejected", `${approval.title} rejected`)}
                    onDelegate={() => toast("info", "Delegated to Production Supervisor")}
                    canDecide={canWrite(role)}
                  />
                )}
                <Comments comments={comments} onAdd={handleAddComment} canWrite={canWrite(role)} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
