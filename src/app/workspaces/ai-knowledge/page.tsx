"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useToast } from "@/components/ui/Notifications";

const NODES: GraphNode[] = [
  { id: "center", label: "MMDI Knowledge Graph", type: "Graph Root" },
  { id: "n1", label: "Reliance Retail Ltd", type: "Customer" },
  { id: "n2", label: "Machine M-14", type: "Machine" },
  { id: "n3", label: "RM-0231 — PVC-Free Vinyl", type: "Raw Material" },
  { id: "n4", label: "IKEA Wardrobe Program", type: "Project" },
  { id: "n5", label: "NCR-2025-0442", type: "Lesson Learned" },
];

const EDGES: GraphEdge[] = [
  { from: "center", to: "n1", label: "indexes" },
  { from: "center", to: "n2", label: "indexes" },
  { from: "center", to: "n3", label: "indexes" },
  { from: "center", to: "n4", label: "indexes" },
  { from: "n2", to: "n5", label: "linked incident" },
];

export default function AIKnowledgePage() {
  const { toast } = useToast();
  const [center, setCenter] = useState(NODES[0]);

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
            <p className="mt-0.5 text-sm text-ink-secondary">Knowledge — the enterprise knowledge graph every AI answer is grounded in</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>4,200 new relationships indexed this week</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Indexed Records" value="184,200" trend="up" trendLabel="+2,100 this week" />
        <StatCard label="Graph Nodes" value="41,600" trend="up" trendLabel="+900 this week" />
        <StatCard label="AI Queries Today" value="284" trend="up" trendLabel="+12% vs avg" />
      </div>

      <div className="flex flex-col gap-6">
        <AICard variant="summary" title="Graph coverage is growing fastest in Manufacturing" citation="Indexing log, last 7 days">
          New relationships this week are concentrated in Machine and Raw Material records, largely from predictive maintenance telemetry being linked to historical NCRs.
        </AICard>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Explore the graph</h3>
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
