"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Notifications";

export interface RecordCopilotAnswer {
  content: string;
  citations?: string[];
}

/**
 * Shared "Ask about this record" logic for the 4 flagship workspaces
 * (Customer, Machine, Raw Material, Job Orders). Each of these has its own
 * small PromptInput box scoped to whatever record the person is currently
 * looking at — until now that box was a pure demo (`onSubmit={(v) =>
 * toast("ai", ...)}`, no real answer, just a toast that disappears — see
 * PROJECT_STATUS.md item 26 for why this existed and how it got reported).
 *
 * Reuses the exact same /api/ai-copilot route and tools as the AI Copilot
 * workspace and the global Ask AI drawer — no new backend. The only
 * difference is a `contextPrefix` line prepended to the question (e.g. "The
 * user is viewing Customer C03739 (Apple India Pvt Ltd - Bangalore) in MMDI
 * ONE.") so an ambiguous question like "summarize open risk on this
 * account" resolves against the right record without the person having to
 * name it themselves. Claude's existing tools (get_customer, get_job_order,
 * etc.) still do the actual lookup — this just points it at the right
 * starting record.
 *
 * Each box is a single question/answer, not a running conversation (there's
 * no room for a full thread in these panels) — a new question replaces the
 * previous answer rather than appending to history.
 */
export function useRecordCopilot() {
  const { toast } = useToast();
  const [answer, setAnswer] = useState<RecordCopilotAnswer | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(contextPrefix: string, question: string) {
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/ai-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `${contextPrefix}\n\n${question}` }],
        }),
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

      setAnswer({ content: data.content, citations: data.citations });
    } catch {
      toast("danger", "Couldn't reach the AI Copilot — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return { ask, answer, loading };
}
