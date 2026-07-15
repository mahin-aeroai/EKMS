"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { CitationCard, AIFeedback } from "./Card";
import { PromptInput } from "./PromptInput";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  confidence?: "high" | "low";
}

const STARTERS = [
  "Show all IKEA projects",
  "Who supplies PVC-free vinyl?",
  "Explain this SOP",
  "Predict stock shortages",
];

/**
 * AI Conversation — Deliverable 3.7
 * Purpose: full multi-turn chat interface with the AI Assistant.
 * Behaviour: maintains conversation and page context across turns; streams responses.
 * Accessibility: each turn is a labeled, navigable region for screen readers.
 * This is the primary surface for the AI Interaction Model (Product Design System,
 * Deliverable 7) — every pattern in that table (AI Chat, AI Explain, AI Compare, etc.)
 * renders through this one component.
 */
export function AIConversation({
  turns,
  onSend,
  contextLabel,
  loading = false,
}: {
  turns: ChatTurn[];
  onSend: (message: string) => void;
  contextLabel?: string;
  /** Disables the input and shows a thinking indicator while a response is in flight. */
  loading?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      {contextLabel && (
        <div className="mb-3 flex items-center gap-1.5 rounded-md bg-ai-tint px-3 py-1.5 text-xs font-medium text-ai">
          <Sparkles size={12} /> Scoped to {contextLabel}
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {turns.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-muted">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  className="rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-secondary hover:bg-surface-sunken"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} role="region" aria-label={`${t.role} message`} className={cn("flex", t.role === "user" && "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-4 py-2.5 text-sm",
                t.role === "user" ? "bg-primary text-on-brand" : "bg-surface-sunken text-ink"
              )}
            >
              {t.role === "assistant" && t.confidence === "low" && (
                <p className="mb-1 text-xs italic text-warning">I&apos;m not fully sure — here&apos;s my best read:</p>
              )}
              <p className="whitespace-pre-line">{t.content}</p>
              {t.citations && t.citations.length > 0 && <CitationCard sources={t.citations} className="mt-2" />}
              {t.role === "assistant" && (
                <div className="mt-2 flex justify-end">
                  <AIFeedback />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl bg-surface-sunken px-4 py-2.5 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={14} className="animate-pulse text-ai" /> Thinking…
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3">
        <PromptInput onSubmit={onSend} disabled={loading} />
      </div>
    </div>
  );
}
