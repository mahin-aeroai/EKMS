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
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type CustomerRow, type CustomerContactRow, type CustomerCommentRow, type CustomerApprovalRow } from "@/lib/supabase";
import { timeAgo } from "@/lib/timeAgo";

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

function toDisplayComment(row: CustomerCommentRow): Comment {
  return { id: row.id, author: row.author, content: row.content, time: timeAgo(row.created_at), resolved: row.resolved };
}

/**
 * Client half of the Customer Workspace. Receives data already fetched
 * server-side from Supabase (see page.tsx) and handles all interactivity —
 * including writing new comments and approval decisions straight back to
 * the database, so this is no longer a static demo for the Overview and
 * Activity tabs. Insights/Timeline/Documents/Relationships remain
 * illustrative sample content until those tables exist too.
 */
export function CustomerWorkspaceClient({
  customer,
  contacts,
  initialComments,
  initialApproval,
}: {
  customer: CustomerRow;
  contacts: CustomerContactRow[];
  initialComments: CustomerCommentRow[];
  initialApproval: CustomerApprovalRow | null;
}) {
  const { toast } = useToast();
  const role = useUserRole();
  const [comments, setComments] = useState<Comment[]>(initialComments.map(toDisplayComment));
  const [approval, setApproval] = useState(initialApproval);
  // The Relationships tab's sample graph is otherwise generic/illustrative,
  // but its center node has to be this customer, not the "Reliance Retail
  // Ltd" placeholder the graph was originally built around.
  const nodes = NODES.map((n) => (n.id === "center" ? { ...n, label: customer.name } : n));
  const [center, setCenter] = useState(nodes[0]);

  async function handleAddComment(text: string) {
    const optimistic: Comment = { id: crypto.randomUUID(), author: "You", content: text, time: "just now" };
    setComments((c) => [...c, optimistic]);

    const { data, error } = await supabase
      .from("customer_comments")
      .insert({ customer_id: customer.id, author: "You", content: text })
      .select()
      .single();

    if (error) {
      toast("danger", "Couldn't save comment — check your Supabase connection");
      return;
    }
    // Replace the optimistic entry with the real row (real id, real timestamp).
    setComments((c) => c.map((item) => (item.id === optimistic.id ? toDisplayComment(data as CustomerCommentRow) : item)));
  }

  async function handleDecision(status: "approved" | "rejected", message: string) {
    if (!approval) return;
    const { error } = await supabase.from("customer_approvals").update({ status }).eq("id", approval.id);
    if (error) {
      toast("danger", "Couldn't update approval — check your Supabase connection");
      return;
    }
    setApproval({ ...approval, status });
    toast(status === "approved" ? "success" : "danger", message);
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers", href: "/workspaces/customer" }, { label: customer.name }]} />

      {/* Workspace header — Universal Workspace Pattern, header region */}
      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Building2 size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{customer.name}</h1>
              <Badge status={customer.status === "active" ? "success" : "neutral"}>{customer.status === "active" ? "Active" : customer.status}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Customer — {customer.code} · Account owner: {customer.account_owner ?? "Unassigned"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {customer.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
              <Tag aiSuggested>Upsell candidate — 34% category growth</Tag>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => toast("info", `Opening edit form for ${customer.name}`)}>
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

      {/* Stat row — live from Supabase */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Lifetime Value" value={`₹${(customer.lifetime_value / 10000000).toFixed(2)} Cr`} trend="up" trendLabel="+18% YoY" />
        <StatCard label="Open Orders" value={String(customer.open_orders)} trend="flat" trendLabel="No change" />
        <StatCard label="On-Time Delivery" value={`${customer.on_time_delivery}%`} trend="up" trendLabel="+2 pts" />
        <StatCard
          label="Account Health"
          value={`${customer.health_score} / 100`}
          trend="down"
          trendLabel="-4 pts this quarter"
          aiInsight="Health dipped after the last two shipments ran late — both tied to the RM-0231 supply delay, not a Reliance-side issue."
        />
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
                    {customer.name}&apos;s PVC-free vinyl orders are up 34% quarter-over-quarter. They haven&apos;t yet been quoted on the new FSC-certified liner line — worth a proactive outreach.
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
                        { id: "2", actor: "AI Assistant", action: "flagged an upsell opportunity on", target: customer.name, time: "5h ago", aiRanked: true },
                        { id: "3", actor: "Arjun Rao", action: "updated the credit limit for", target: customer.name, time: "1 day ago" },
                      ]}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Key contacts</h3>
                    {contacts.length === 0 ? (
                      <p className="text-sm text-ink-muted">No contacts on file.</p>
                    ) : (
                      <ul className="flex flex-col gap-3 text-sm">
                        {contacts.map((c) => (
                          <li key={c.id}>
                            <p className="font-medium text-ink">{c.name}</p>
                            <p className="text-xs text-ink-secondary">
                              {c.role ?? "Contact"} {c.email ? `· ${c.email}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
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
                    <GaugeChart value={customer.health_score} label="Composite health score" />
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
                <DocumentPreview title={`Master Service Agreement — ${customer.name}`} summary="Governs all supply terms, pricing tiers, and Net 45 payment terms." tags={["Contract", "Rev 2"]} />
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
                    aiRecommendation="18 months of on-time payments and growing order volume support this increase. No risk indicators found."
                    stages={[
                      { id: "s1", label: "Submitted", status: "complete", actor: approval.requested_by.split(",")[0], timestamp: timeAgo(approval.created_at) },
                      {
                        id: "s2",
                        label: "Finance Review",
                        status: approval.status === "pending" ? "current" : "complete",
                      },
                      {
                        id: "s3",
                        label: approval.status === "rejected" ? "Rejected" : "Final Sign-off",
                        status: approval.status === "approved" ? "complete" : approval.status === "rejected" ? "escalated" : "upcoming",
                      },
                    ]}
                    onApprove={() => handleDecision("approved", `${approval.title} approved`)}
                    onReject={() => handleDecision("rejected", `${approval.title} rejected`)}
                    onDelegate={() => toast("info", "Delegated to Finance Director")}
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
