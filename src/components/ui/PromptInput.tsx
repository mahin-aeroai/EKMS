"use client";

import { useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Prompt Input — Deliverable 3.7
 * Purpose: free-text entry point for the AI Assistant.
 * Behaviour: expands from 1 line to multi-line as typed.
 * Usage rule: always shows example prompts as placeholder text, never a blank box.
 */
export function PromptInput({
  onSubmit,
  placeholder = "Ask MMDI ONE anything — e.g. \"Show all IKEA projects\"",
  disabled,
}: {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  function submit() {
    if (!value.trim() || disabled) return;
    onSubmit(value.trim());
    setValue("");
  }

  return (
    <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-surface p-2 shadow-1 focus-within:border-primary">
      <Sparkles size={16} className="mb-2 ml-1 shrink-0 text-ai" />
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-ink-muted"
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        aria-label="Send"
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          value.trim() ? "bg-ai text-white hover:opacity-90" : "bg-surface-sunken text-ink-muted"
        )}
      >
        <ArrowUp size={16} />
      </button>
    </div>
  );
}
