"use client";

import { useState } from "react";
import { Wrench, Pencil, CalendarClock, PackageSearch } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Tabs } from "@/components/ui/Tabs";
import { StatCard } from "@/components/ui/Card";
import { Timeline } from "@/components/ui/Timeline";
import { GaugeChart } from "@/components/ui/Charts";
import { Comments, type Comment } from "@/components/ui/Comments";
import { ApprovalPanel } from "@/components/ui/ApprovalPanel";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useRecordCopilot } from "@/lib/useRecordCopilot";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type MachineRow, type MachineCommentRow, type MachineApprovalRow } from "@/lib/supabase";
import { timeAgo } from "@/lib/timeAgo";

function toDisplayComment(row: MachineCommentRow): Comment {
  return { id: row.id, author: row.author, content: row.content, time: timeAgo(row.created_at), resolved: row.resolved };
}

/**
 * Client half of the Machine Workspace — follows the same Server/Client
 * split as the Customer workspace (see
 * src/components/workspaces/CustomerWorkspaceClient.tsx). Stat row, machine
 * spec panel, OEE gauge, relationships, and the Activity tab (comments +
 * approvals) are real, read from and written to Supabase. Insights,
 * Timeline (beyond last PM / install year), and Documents are not yet wired
 * to a real data source and show an honest empty state instead of sample
 * content.
 */
export function MachineWorkspaceClient({
  machine,
  initialComments,
  initialApproval,
}: {
  machine: MachineRow;
  initialComments: MachineCommentRow[];
  initialApproval: MachineApprovalRow | null;
}) {
  const { toast } = useToast();
  const { ask, answer, loading } = useRecordCopilot();
  const role = useUserRole();
  const [comments, setComments] = useState<Comment[]>(initialComments.map(toDisplayComment));
  const [approval, setApproval] = useState(initialApproval);
  const nodes: GraphNode[] = [
    { id: "center", label: machine.name, type: "Machine" },
    ...(machine.line ? [{ id: "n1", label: machine.line, type: "Production Line" }] : []),
    ...(machine.maintenance_lead ? [{ id: "n4", label: machine.maintenance_lead, type: "Maintenance Lead" }] : []),
  ];
  const edges: GraphEdge[] = [
    ...(machine.line ? [{ from: "center", to: "n1", label: "runs on" }] : []),
    ...(machine.maintenance_lead ? [{ from: "center", to: "n4", label: "maintained by" }] : []),
  ];
  const [center, setCenter] = useState(nodes[0]);

  async function handleAddComment(text: string) {
    const optimistic: Comment = { id: crypto.randomUUID(), author: "You", content: text, time: "just now" };
    setComments((c) => [...c, optimistic]);

    const { data, error } = await supabase
      .from("machine_comments")
      .insert({ machine_id: machine.id, author: "You", content: text })
      .select()
      .single();

    if (error) {
      toast("danger", "Couldn't save comment — check your Supabase connection");
      return;
    }
    setComments((c) => c.map((item) => (item.id === optimistic.id ? toDisplayComment(data as MachineCommentRow) : item)));
  }

  async function handleDecision(status: "approved" | "rejected", message: string) {
    if (!approval) return;
    const { error } = await supabase.from("machine_approvals").update({ status }).eq("id", approval.id);
    if (error) {
      toast("danger", "Couldn't update approval — check your Supabase connection");
      return;
    }
    setApproval({ ...approval, status });
    toast(status === "approved" ? "success" : "danger", message);
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Machines", href: "/workspaces/machine" }, { label: machine.name }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-warning-tint text-warning">
            <Wrench size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{machine.name}</h1>
              <Badge status={machine.status === "active" ? "success" : "warning"}>{machine.status}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Machine — {machine.code}
              {machine.line ? ` · ${machine.line}` : ""}
              {machine.maintenance_lead ? ` · Maintenance lead: ${machine.maintenance_lead}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {machine.line && <Tag>{machine.line}</Tag>}
              {machine.installed_year && <Tag>{`Installed ${machine.installed_year}`}</Tag>}
              {machine.vendor && <Tag>{`Vendor: ${machine.vendor}`}</Tag>}
              {machine.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => toast("info", `Opening edit form for ${machine.name}`)}>
            <Pencil size={14} className="mr-1.5" /> Edit
          </Button>
          <ContextMenu
            items={[
              { label: "Schedule PM", icon: <CalendarClock size={13} />, onSelect: () => toast("success", `PM scheduled for ${machine.name}`) },
              { label: "Request spare part", icon: <PackageSearch size={13} />, onSelect: () => toast("info", "Spare part request drafted") },
            ]}
          />
        </div>
      </div>

      {/* Stat row — live from Supabase */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="OEE" value={`${machine.oee}%`} trend="flat" trendLabel="Live value" />
        <StatCard label="MTBF" value={`${machine.mtbf_hours} h`} trend="flat" trendLabel="Live value" />
        <StatCard label="MTTR" value={`${machine.mttr_hours} h`} trend="flat" trendLabel="Live value" />
        <StatCard label="Uptime" value={`${machine.uptime}%`} trend="flat" trendLabel="Live value" />
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
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Ask about this machine</h3>
                    <PromptInput
                      placeholder='e.g. "What caused the last unplanned downtime?"'
                      onSubmit={(v) => ask(`The user is viewing Machine ${machine.code} (${machine.name}) in MMDI ONE, an internal operating platform for MMDI.`, v)}
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
                    <h3 className="mb-3 text-sm font-semibold text-ink">Machine spec</h3>
                    <ul className="flex flex-col gap-2 text-sm">
                      <li className="flex justify-between"><span className="text-ink-secondary">Model</span><span className="font-medium text-ink">{machine.model ?? "—"}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Clamping force</span><span className="font-medium text-ink">{machine.clamping_force ?? "—"}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Shot weight max</span><span className="font-medium text-ink">{machine.shot_weight_max ?? "—"}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Last PM</span><span className="font-medium text-ink">{machine.last_pm ?? "—"}</span></li>
                    </ul>
                  </div>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Current OEE</h3>
                    <div className="flex justify-center">
                      <GaugeChart value={machine.oee} label={`${machine.line ?? ""} ${machine.name}`.trim()} />
                    </div>
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: "insights",
            label: "Insights",
            content: (
              <div className="pt-5">
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="py-6 text-center text-sm text-ink-muted">No trend or downtime data connected yet.</p>
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
                    ...(machine.last_pm ? [{ id: "t1", date: machine.last_pm, title: "Last preventive maintenance" }] : []),
                    ...(machine.installed_year ? [{ id: "t4", date: `${machine.installed_year}`, title: `Machine commissioned${machine.line ? ` on ${machine.line}` : ""}` }] : []),
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
                  <p className="py-6 text-center text-sm text-ink-muted">No documents linked to this machine yet.</p>
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
                  edges={edges}
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
                    stages={[
                      { id: "s1", label: "Submitted", status: "complete", actor: approval.requested_by.split(",")[0], timestamp: timeAgo(approval.created_at) },
                      {
                        id: "s2",
                        label: "Plant Head Approval",
                        status: approval.status === "pending" ? "current" : "complete",
                      },
                      {
                        id: "s3",
                        label: approval.status === "rejected" ? "Rejected" : "Scheduled",
                        status: approval.status === "approved" ? "complete" : approval.status === "rejected" ? "escalated" : "upcoming",
                      },
                    ]}
                    onApprove={() => handleDecision("approved", `${approval.title} approved`)}
                    onReject={() => handleDecision("rejected", `${approval.title} rejected`)}
                    onDelegate={() => toast("info", "Delegated to Plant Engineering")}
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
