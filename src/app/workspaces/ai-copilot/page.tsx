"use client";

import { useState } from "react";
import { Bot } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard } from "@/components/ui/Card";
import { AIConversation, type ChatTurn } from "@/components/ui/AIConversation";

export default function AICopilotPage() {
  const [turns, setTurns] = useState<ChatTurn[]>([
    { id: "t1", role: "user", content: "What's blocking the IKEA Wardrobe Program right now?" },
    {
      id: "t2",
      role: "assistant",
      content: "The tooling vendor has requested a 1-week extension on the mold cavity revision. That shift would push the molding start into Machine M-14's predicted maintenance window — worth resolving the tooling timeline before locking the schedule.",
      citations: ["Project Workspace — IKEA Wardrobe Program", "Machine M-14 maintenance forecast"],
      confidence: "high",
    },
  ]);

  function handleSend(message: string) {
    setTurns((t) => [
      ...t,
      { id: crypto.randomUUID(), role: "user", content: message },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "This is a demo response — in production this answer would be grounded in live data across every connected module, with full citations.",
        confidence: "low",
      },
    ]);
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Executive" }, { label: "AI Copilot" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ai-tint text-ai">
            <Bot size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">AI Copilot</h1>
              <Badge status="info">Enterprise-wide</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Executive — the same assistant available from every workspace, with full company context</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>Grounded in citations, never a silent guess</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Queries Today" value="284" trend="up" trendLabel="+12% vs avg" />
        <StatCard label="Avg Confidence" value="High" trend="flat" trendLabel="91% of answers" />
        <StatCard label="Escalated to Human" value="7" trend="down" trendLabel="-3 vs yesterday" />
      </div>

      <div className="h-[520px] rounded-lg border border-line bg-surface p-2">
        <AIConversation turns={turns} onSend={handleSend} contextLabel="Enterprise-wide" />
      </div>
    </div>
  );
}
