"use client";

import { useEffect, useMemo, useState } from "react";
import { CornerDownLeft, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Command {
  id: string;
  label: string;
  group: "Navigate" | "Actions" | "Recent";
  icon?: React.ReactNode;
  onRun: () => void;
}

/**
 * Command Palette — Deliverable 3.4 / Navigation System Deliverable 5
 * Purpose: keyboard-first jump-to-anything and quick actions.
 * Behaviour: Ctrl/Cmd+K opens an Elevation-4 overlay with fuzzy-matched results.
 * Usage rule: must include every navigable destination and every Quick Action.
 * AI Integration: a no-results state offers to hand the query directly to the AI Assistant.
 */
export function CommandPalette({
  commands,
  onAskAI,
}: {
  commands: Command[];
  onAskAI?: (query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(
    () => commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
    [commands, query]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface-overlay shadow-4"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Search size={16} className="text-ink-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
              if (e.key === "ArrowUp") setActiveIdx((i) => Math.max(i - 1, 0));
              if (e.key === "Enter" && filtered[activeIdx]) {
                filtered[activeIdx].onRun();
                setOpen(false);
              }
            }}
            placeholder="Type a command or search…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-muted"
          />
          <kbd className="rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-ink-muted">Esc</kbd>
        </div>
        <ul role="listbox" className="max-h-80 overflow-auto p-2">
          {filtered.length === 0 ? (
            <li className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <p className="text-sm text-ink-muted">No matching commands</p>
              <button
                onClick={() => {
                  onAskAI?.(query);
                  setOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-md bg-ai-tint px-3 py-1.5 text-xs font-medium text-ai"
              >
                <Sparkles size={13} />
                Ask AI: &ldquo;{query}&rdquo;
              </button>
            </li>
          ) : (
            filtered.map((c, i) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    c.onRun();
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm",
                    i === activeIdx ? "bg-primary-tint text-primary" : "text-ink hover:bg-surface-sunken"
                  )}
                >
                  {c.icon}
                  {c.label}
                  <span className="ml-auto text-[10px] uppercase text-ink-muted">{c.group}</span>
                  {i === activeIdx && <CornerDownLeft size={12} />}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
