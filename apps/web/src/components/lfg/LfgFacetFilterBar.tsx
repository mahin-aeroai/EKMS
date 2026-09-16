"use client";

import { SlidersHorizontal, Check, X as XIcon } from "lucide-react";
import { FACET_DEFS, type FacetKey, type FacetValue } from "@/lib/lfg-site-facets";

// Shared, deliberately decorated rendering of the seven Site Master facet
// toggles (16 Sept 2026 task feedback, screenshots of both the staff Site
// Master and this page's own filter row: "decorate that bar for statusses
// it looks plain and unable to identify that there are filters in it").
// The first version of this bar (plain-text buttons, color only on the
// one already-active pill) read as inert labels rather than a filter UI --
// a "Filters" header + icon, a tinted band setting the whole row apart
// from the page background, and Yes/No buttons that are ALWAYS tinted
// green/red (not just once selected) so the row reads as "clickable
// filter chips" at a glance, with a check/X icon added on the selected
// side so the state doesn't rely on color alone.
//
// Used identically by both Site Master surfaces (workspaces/lfg/page.tsx
// and app/lfg/(app)/page.tsx) -- same reasoning as @/lib/lfg-site-facets
// itself: one definition of what the bar looks like, not two that could
// drift apart.
export function LfgFacetFilterBar({
  facets,
  onToggle,
  onClear,
}: {
  facets: Record<FacetKey, FacetValue>;
  onToggle: (key: FacetKey, value: FacetValue) => void;
  onClear: () => void;
}) {
  const anyActive = Object.values(facets).some(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary-tint/40 px-3 py-2.5">
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
        <SlidersHorizontal size={13} /> Filters
      </span>
      <div className="hidden h-5 w-px bg-primary/20 sm:block" />
      {FACET_DEFS.map((f) => (
        <div key={f.key} className="flex items-center gap-1 rounded-full border border-line-strong bg-surface p-1 shadow-sm">
          <span className="pl-1.5 pr-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-muted">{f.label}</span>
          <button
            type="button"
            onClick={() => onToggle(f.key, "yes")}
            aria-pressed={facets[f.key] === "yes"}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              facets[f.key] === "yes" ? "bg-success text-on-brand shadow-sm" : "bg-success-tint text-success hover:opacity-80"
            }`}
          >
            {facets[f.key] === "yes" && <Check size={11} strokeWidth={3} />}
            {f.yes}
          </button>
          <button
            type="button"
            onClick={() => onToggle(f.key, "no")}
            aria-pressed={facets[f.key] === "no"}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
              facets[f.key] === "no" ? "bg-danger text-on-brand shadow-sm" : "bg-danger-tint text-danger hover:opacity-80"
            }`}
          >
            {facets[f.key] === "no" && <XIcon size={11} strokeWidth={3} />}
            {f.no}
          </button>
        </div>
      ))}
      {anyActive && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
