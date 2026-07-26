"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard } from "@/components/ui/Card";
import { AIConversation, type ChatTurn } from "@/components/ui/AIConversation";
import { useToast } from "@/components/ui/Notifications";
import { getCount, getCountWhere } from "@/lib/dashboard-queries";

interface CopilotContext {
  customerRecords: number;
  pendingApprovals: number;
  openComplianceFindings: number;
}

export default function AICopilotPage() {
  const { toast } = useToast();
  const [context, setContext] = useState<CopilotContext | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      getCount("customers"),
      getCountWhere("customer_approvals", "status", "pending"),
      getCount("compliance_findings"),
    ])
      .then(([customerRecords, pendingApprovals, complianceRows]) =>
        setContext({ customerRecords, pendingApprovals, openComplianceFindings: complianceRows })
      )
      .catch(() => toast("danger", "Couldn't load live context from Supabase"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend(message: string) {
    const userTurn: ChatTurn = { id: crypto.randomUUID(), role: "user", content: message };
    const history = [...turns, userTurn];
    setTurns(history);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map((t) => ({ role: t.role, content: t.content })) }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "not_configured") {
          toast("warning", "AI Copilot isn't set up yet — add ANTHROPIC_API_KEY in Vercel to enable it.");
        } else {
          toast("danger", data.message ?? "The AI Copilot couldn't answer that — try again.");
        }
        return;
      }

      setTurns((t) => [
        ...t,
        { id: crypto.randomUUID(), role: "assistant", content: data.content, citations: data.citations },
      ]);
    } catch {
      toast("danger", "Couldn't reach the AI Copilot — check your connection and try again.");
    } finally {
      setLoading(false);
    }
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
              <Tag aiSuggested>Grounded in live Supabase data via Claude tool use — ask about a real customer, job order, machine, or material</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Customer Records Available" value={context ? String(context.customerRecords) : "—"} trend="flat" trendLabel="Live count" />
        <StatCard label="Pending Approvals" value={context ? String(context.pendingApprovals) : "—"} trend="flat" trendLabel="The copilot could help resolve" />
        <StatCard label="Compliance Findings on Record" value={context ? String(context.openComplianceFindings) : "—"} trend="flat" trendLabel="Live count" />
      </div>

      {/* Fills most of the viewport instead of a fixed 520px -- a 20-item
          sales breakdown answer needs a lot more room to read comfortably
          than a couple of short turns did. min-h keeps it usable on short
          viewports too. */}
      <div className="h-[calc(100vh-260px)] min-h-[420px] rounded-lg border border-line bg-surface p-2">
        <AIConversation turns={turns} onSend={handleSend} contextLabel="Enterprise-wide" loading={loading} />
      </div>
    </div>
  );
}
