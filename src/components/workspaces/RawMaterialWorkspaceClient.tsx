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
import { Comments, type Comment } from "@/components/ui/Comments";
import { ApprovalPanel } from "@/components/ui/ApprovalPanel";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useRecordCopilot } from "@/lib/useRecordCopilot";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type RawMaterialRow, type RawMaterialCommentRow, type RawMaterialApprovalRow } from "@/lib/supabase";
import { timeAgo } from "@/lib/timeAgo";

function toDisplayComment(row: RawMaterialCommentRow): Comment {
  return { id: row.id, author: row.author, content: row.content, time: timeAgo(row.created_at), resolved: row.resolved };
}

/**
 * Client half of the Raw Material Workspace — same Server/Client split as
 * the Customer workspace. Stat row, material spec panel, and the Activity
 * tab (comments + approvals) are real. Insights, Timeline, and Documents
 * aren't wired to a real data source yet and show an honest empty state
 * instead of sample content.
 */
export function RawMaterialWorkspaceClient({
  material,
  initialComments,
  initialApproval,
}: {
  material: RawMaterialRow;
  initialComments: RawMaterialCommentRow[];
  initialApproval: RawMaterialApprovalRow | null;
}) {
  const { toast } = useToast();
  const { ask, answer, loading } = useRecordCopilot();
  const role = useUserRole();
  const [comments, setComments] = useState<Comment[]>(initialComments.map(toDisplayComment));
  const [approval, setApproval] = useState(initialApproval);
  const nodes: GraphNode[] = [
    { id: "center", label: material.name, type: "Raw Material" },
    ...(material.category_owner ? [{ id: "n1", label: material.category_owner, type: "Category Owner" }] : []),
  ];
  const edges: GraphEdge[] = [
    ...(material.category_owner ? [{ from: "center", to: "n1", label: "owned by" }] : []),
  ];
  const [center, setCenter] = useState(nodes[0]);

  async function handleAddComment(text: string) {
    const optimistic: Comment = { id: crypto.randomUUID(), author: "You", content: text, time: "just now" };
    setComments((c) => [...c, optimistic]);

    const { data, error } = await supabase
      .from("raw_material_comments")
      .insert({ raw_material_id: material.id, author: "You", content: text })
      .select()
      .single();

    if (error) {
      toast("danger", "Couldn't save comment — check your Supabase connection");
      return;
    }
    setComments((c) => c.map((item) => (item.id === optimistic.id ? toDisplayComment(data as RawMaterialCommentRow) : item)));
  }

  async function handleDecision(status: "approved" | "rejected", message: string) {
    if (!approval) return;
    const { error } = await supabase.from("raw_material_approvals").update({ status }).eq("id", approval.id);
    if (error) {
      toast("danger", "Couldn't update approval — check your Supabase connection");
      return;
    }
    setApproval({ ...approval, status });
    toast(status === "approved" ? "success" : "danger", message);
  }

  const lowStock = material.current_stock < material.reorder_point;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Raw Materials", href: "/workspaces/raw-material" }, { label: material.code }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-danger-tint text-danger">
            <Package size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{material.code} — {material.name}</h1>
              {lowStock && <Badge status="danger">Low Stock</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Raw Material
              {material.category ? ` — Category: ${material.category}` : ""}
              {material.category_owner ? ` · Category owner: ${material.category_owner}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {material.storage_class && <Tag>{`Storage: ${material.storage_class}`}</Tag>}
              {material.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
              {lowStock && <Tag aiSuggested>Below reorder point</Tag>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => toast("info", `Opening edit form for ${material.code}`)}>
            <Pencil size={14} className="mr-1.5" /> Edit
          </Button>
          <ContextMenu
            items={[
              { label: "Raise reorder", icon: <ShoppingCart size={13} />, onSelect: () => toast("success", `Reorder request drafted for ${material.code}`) },
              { label: "Discontinue material", icon: <Ban size={13} />, onSelect: () => toast("warning", "Discontinuation requires Category Manager approval"), destructive: true },
            ]}
          />
        </div>
      </div>

      {/* Stat row — live from Supabase */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Current Stock" value={String(material.current_stock)} trend={lowStock ? "down" : "flat"} trendLabel={lowStock ? "Below reorder point" : "Above reorder point"} />
        <StatCard label="Reorder Point" value={String(material.reorder_point)} trend="flat" trendLabel="Live value" />
        <StatCard label="Lead Time" value={`${material.lead_time_days} days`} trend="flat" trendLabel="Live value" />
        <StatCard label="Approved Suppliers" value={String(material.approved_suppliers)} trend="flat" trendLabel="Live value" />
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
                    title={lowStock ? "Shortage risk — reorder recommended" : "Stock levels healthy"}
                    citation="Inventory Master, Reorder Policy"
                    onAccept={() => toast("success", `Reorder request created for ${material.code}`)}
                    onDismiss={() => toast("info", "Dismissed")}
                  >
                    {lowStock
                      ? `Current stock (${material.current_stock}) is below the reorder point (${material.reorder_point}), with a ${material.lead_time_days}-day lead time — reorder soon to avoid a production gap.`
                      : `Current stock (${material.current_stock}) is above the reorder point (${material.reorder_point}). No action needed right now.`}
                  </AICard>
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Ask about this material</h3>
                    <PromptInput
                      placeholder='e.g. "Which projects consume the most of this material?"'
                      onSubmit={(v) => ask(`The user is viewing Raw Material ${material.code} (${material.name}) in MMDI ONE, an internal operating platform for MMDI.`, v)}
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
                    <h3 className="mb-3 text-sm font-semibold text-ink">Material spec</h3>
                    <ul className="flex flex-col gap-2 text-sm">
                      <li className="flex justify-between"><span className="text-ink-secondary">Compatible substrates</span><span className="font-medium text-ink">{material.compatible_substrates ?? "—"}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Unit cost</span><span className="font-medium text-ink">₹{material.unit_cost}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">MOQ</span><span className="font-medium text-ink">{material.moq ?? "—"}</span></li>
                      <li className="flex justify-between"><span className="text-ink-secondary">Storage class</span><span className="font-medium text-ink">{material.storage_class ?? "—"}</span></li>
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
              <div className="pt-5">
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="py-6 text-center text-sm text-ink-muted">No stock trend or consumption data connected yet.</p>
                </div>
              </div>
            ),
          },
          {
            id: "timeline",
            label: "Timeline",
            content: (
              <div className="pt-5">
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="py-6 text-center text-sm text-ink-muted">No material history connected yet.</p>
                </div>
              </div>
            ),
          },
          {
            id: "documents",
            label: "Documents",
            content: (
              <div className="pt-5">
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="py-6 text-center text-sm text-ink-muted">No documents linked to this material yet.</p>
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
                        label: "Category Manager Approval",
                        status: approval.status === "pending" ? "current" : "complete",
                      },
                      {
                        id: "s3",
                        label: approval.status === "rejected" ? "Rejected" : "PO Issued",
                        status: approval.status === "approved" ? "complete" : approval.status === "rejected" ? "escalated" : "upcoming",
                      },
                    ]}
                    onApprove={() => handleDecision("approved", `${approval.title} approved`)}
                    onReject={() => handleDecision("rejected", `${approval.title} rejected`)}
                    onDelegate={() => toast("info", "Delegated to Category Manager")}
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
