"use client";

import { X, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

interface TagProps {
  children: string;
  /** AI-suggested/free-form tags render in the AI Accent outline, distinct from controlled vocabulary tags. */
  aiSuggested?: boolean;
  selected?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}

/**
 * Tag — Deliverable 3.1
 * Purpose: label a record with a controlled or free-form category; clicking filters the
 * current view by that tag.
 * Variants: Controlled-vocabulary, Free-form / AI-suggested.
 * AI Integration: AI Tags (Document Intelligence) are visually distinguished with the
 * AI Accent color and a sparkle icon, so users always know a tag was machine-applied.
 */
export function Tag({ children, aiSuggested = false, selected = false, onRemove, onClick }: TagProps) {
  const interactive = Boolean(onClick);
  const Comp = interactive ? "button" : "span";
  return (
    <Comp
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--dur-micro)]",
        aiSuggested
          ? "border-ai/40 bg-ai-tint text-ai"
          : selected
          ? "border-primary bg-primary-tint text-primary"
          : "border-line-strong bg-surface text-ink-secondary hover:bg-surface-sunken",
        interactive && "cursor-pointer"
      )}
    >
      {aiSuggested && <Sparkles size={11} aria-hidden />}
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${children} tag`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-surface-sunken"
        >
          <X size={11} />
        </button>
      )}
    </Comp>
  );
}
