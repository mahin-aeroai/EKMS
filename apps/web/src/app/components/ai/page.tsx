"use client";

import { useState } from "react";
import { PageHeader, DemoSection } from "@/components/DemoSection";
import { AIConversation, type ChatTurn } from "@/components/ui/AIConversation";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { useToast } from "@/components/ui/Notifications";

const NODES: GraphNode[] = [
  { id: "center", label: "IKEA Wardrobe Program", type: "Project" },
  { id: "n1", label: "Reliance Retail Ltd", type: "Customer" },
  { id: "n2", label: "RM-0231 — PVC-Free Vinyl", type: "Raw Material" },
  { id: "n3", label: "Machine M-14", type: "Machine" },
  { id: "n4", label: "SO-MU-2026-007812", type: "Sales Order" },
  { id: "n5", label: "NCR-2025-0442", type: "Lesson Learned" },
];

const EDGES: GraphEdge[] = [
  { from: "center", to: "n1", label: "customer" },
  { from: "center", to: "n2", label: "uses material" },
  { from: "center", to: "n3", label: "runs on" },
  { from: "center", to: "n4", label: "billed via" },
  { from: "n3", to: "n5", label: "related incident" },
];

export default function AIPage() {
  const { toast } = useToast();
  const [turns, setTurns] = useState<ChatTurn[]>([
    { id: "t1", role: "user", content: "Which suppliers can ship PVC-free vinyl within 10 days?" },
    {
      id: "t2",
      role: "assistant",
      content: "Cosmo Films has a 9-day average lead time for PVC-free vinyl and is an approved supplier for this material.",
      citations: ["Supplier Master — Cosmo Films", "Raw Material Master — RM-0231"],
      confidence: "high",
    },
  ]);
  const [center, setCenter] = useState(NODES[0]);

  function handleSend(message: string) {
    setTurns((t) => [
      ...t,
      { id: crypto.randomUUID(), role: "user", content: message },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "I don't have enough confirmed data to answer that precisely yet — treat this as a starting point, not a final figure.",
        confidence: "low",
      },
    ]);
  }

  return (
    <div>
      <PageHeader
        title="AI-Native"
        description="The two components unique to an AI-native platform: a first-class conversational assistant, and a visual view into the Knowledge Graph."
      />

      <DemoSection title="AI Conversation" deliverable="Deliverable 7.2" description="Citations and a confidence flag are attached to every assistant turn; low-confidence answers say so explicitly rather than sounding falsely certain.">
        <div className="h-96">
          <AIConversation turns={turns} onSend={handleSend} contextLabel="IKEA Wardrobe Program — Phase 2" />
        </div>
      </DemoSection>

      <DemoSection title="Relationship Graph" deliverable="Deliverable 3.7" description="Visualizes Knowledge Graph connections around a record; click a node to re-center, or switch to the accessible list view.">
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
      </DemoSection>
    </div>
  );
}
