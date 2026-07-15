"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useToast } from "@/components/ui/Notifications";
import {
  supabase,
  type CustomerRow,
  type CustomerContactRow,
  type CustomerCommentRow,
  type CustomerApprovalRow,
} from "@/lib/supabase";
import { getCount } from "@/lib/dashboard-queries";

// Same demo customer the Customer workspace (src/app/workspaces/customer/page.tsx)
// fetches — reused here so the knowledge graph shows genuine, live relationships
// instead of a fictional sample graph.
const DEMO_CUSTOMER_CODE = "C03739"; // Apple India Pvt Ltd - Bangalore, real customer, highest Q1 revenue with a real contact on file

const INDEXED_TABLES = [
  "customers",
  "customer_contacts",
  "customer_comments",
  "customer_approvals",
  "crm_accounts",
  "quotes",
  "contracts",
  "work_orders",
  "maintenance_events",
  "installation_sites",
  "inventory_skus",
  "purchase_orders",
  "suppliers",
  "documents",
  "drawings",
  "sops",
  "lessons_learned",
  "employees",
  "compliance_findings",
  "access_requests",
];

interface KnowledgeStats {
  indexedRecords: number;
  recentActivity7d: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

async function loadStats(): Promise<KnowledgeStats> {
  const [counts, { data: customer }] = await Promise.all([
    Promise.all(INDEXED_TABLES.map((t) => getCount(t))),
    supabase.from("customers").select("*").eq("code", DEMO_CUSTOMER_CODE).single(),
  ]);

  const indexedRecords = counts.reduce((sum, c) => sum + c, 0);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let recentActivity7d = 0;

  if (customer) {
    const customerRow = customer as CustomerRow;
    nodes.push({ id: "center", label: customerRow.name, type: "Customer" });

    const [{ data: contacts }, { data: comments }, { data: approvals }] = await Promise.all([
      supabase.from("customer_contacts").select("*").eq("customer_id", customerRow.id).limit(3),
      supabase
        .from("customer_comments")
        .select("*")
        .eq("customer_id", customerRow.id)
        .order("created_at", { ascending: false })
        .limit(2),
      supabase
        .from("customer_approvals")
        .select("*")
        .eq("customer_id", customerRow.id)
        .order("created_at", { ascending: false })
        .limit(2),
    ]);

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    ((contacts ?? []) as CustomerContactRow[]).forEach((c, i) => {
      const id = `contact-${i}`;
      nodes.push({ id, label: c.name, type: "Contact" });
      edges.push({ from: "center", to: id, label: c.role ?? "contact" });
    });

    ((comments ?? []) as CustomerCommentRow[]).forEach((c, i) => {
      const id = `comment-${i}`;
      nodes.push({ id, label: `${c.author}: ${c.content.slice(0, 28)}${c.content.length > 28 ? "…" : ""}`, type: "Comment" });
      edges.push({ from: "center", to: id, label: "discussed in" });
      if (new Date(c.created_at).getTime() >= sevenDaysAgo) recentActivity7d += 1;
    });

    ((approvals ?? []) as CustomerApprovalRow[]).forEach((a, i) => {
      const id = `approval-${i}`;
      nodes.push({ id, label: a.title, type: "Approval" });
      edges.push({ from: "center", to: id, label: a.status });
      if (new Date(a.created_at).getTime() >= sevenDaysAgo) recentActivity7d += 1;
    });
  }

  return { indexedRecords, recentActivity7d, nodes, edges };
}

export default function AIKnowledgePage() {
  const { toast } = useToast();
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [center, setCenter] = useState<GraphNode | null>(null);

  useEffect(() => {
    loadStats()
      .then((s) => {
        setStats(s);
        setCenter(s.nodes[0] ?? null);
      })
      .catch(() => toast("danger", "Couldn't load AI Knowledge data from Supabase"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Knowledge" }, { label: "AI Knowledge" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ai-tint text-ai">
            <Share2 size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">AI Knowledge</h1>
              <Badge status="info">Live index</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Knowledge — the enterprise data every AI answer would be grounded in</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag>Live from Supabase</Tag>
              <Tag aiSuggested>Graph below is built from a real customer&apos;s contacts, comments, and approvals</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Indexed Records" value={stats ? stats.indexedRecords.toLocaleString() : "—"} trend="flat" trendLabel={`Across ${INDEXED_TABLES.length} tables`} />
        <StatCard label="Connected Tables" value={String(INDEXED_TABLES.length)} trend="flat" trendLabel="Wired to Supabase" />
        <StatCard label="Recent Activity (7d)" value={stats ? String(stats.recentActivity7d) : "—"} trend="flat" trendLabel="Comments + approvals" />
      </div>

      <div className="flex flex-col gap-6">
        <AICard variant="summary" title="What's actually indexed today" citation={`Live row counts across ${INDEXED_TABLES.length} Supabase tables`}>
          {stats
            ? `${stats.indexedRecords.toLocaleString()} records are live across ${INDEXED_TABLES.length} connected tables. The graph below traces real relationships for one customer — contacts, recent comments, and approvals — rather than a hardcoded sample.`
            : "Loading…"}
        </AICard>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Explore the graph</h3>
          {!stats ? (
            <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
          ) : center && stats.nodes.length > 0 ? (
            <RelationshipGraph
              center={center}
              nodes={stats.nodes}
              edges={stats.edges}
              onRecenter={(id) => {
                const node = stats.nodes.find((n) => n.id === id);
                if (node) {
                  setCenter(node);
                  toast("ai", `Recentered on ${node.label}`);
                }
              }}
            />
          ) : (
            <p className="py-6 text-center text-sm text-ink-muted">No relationship data available yet.</p>
          )}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Ask the knowledge graph</h3>
          <PromptInput
            placeholder='e.g. "What lessons relate to Machine M-14?"'
            onSubmit={(v) => toast("ai", `AI Assistant is looking into: "${v}"`)}
          />
        </div>
      </div>
    </div>
  );
}
