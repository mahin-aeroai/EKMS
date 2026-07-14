"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { AICard } from "./Card";

export interface Version {
  id: string;
  label: string;
  date: string;
  author: string;
}

/**
 * Version History — Deliverable 3.3
 * Purpose: show prior versions of a record/document.
 * Behaviour: click a version to view a read-only snapshot; diff view between any two.
 * Usage rule: every Tier 1/2 module and every governed Document uses this identical
 * component (Phase 1/2 Version Control Requirement).
 * AI Integration: AI can summarize what changed between two selected versions.
 */
export function VersionHistory({ versions }: { versions: Version[] }) {
  const [selected, setSelected] = useState<[string, string] | null>(null);

  function pick(id: string) {
    if (!selected) return setSelected([id, id]);
    const [a] = selected;
    setSelected([a, id]);
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {versions.map((v) => (
          <li key={v.id}>
            <button
              onClick={() => pick(v.id)}
              className={cn(
                "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-surface-sunken",
                selected?.includes(v.id) && "bg-primary-tint"
              )}
            >
              <span className="font-medium text-ink">{v.label}</span>
              <span className="text-xs text-ink-muted">
                {v.date} · {v.author}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected && selected[0] !== selected[1] && (
        <AICard variant="summary" title={`Changes between ${selected[0]} and ${selected[1]}`}>
          <span className="flex items-center gap-1">
            <Sparkles size={12} /> Pricing tier updated from Standard to Preferred; two new
            approved-usage restrictions added; no changes to technical specification fields.
          </span>
        </AICard>
      )}
    </div>
  );
}
