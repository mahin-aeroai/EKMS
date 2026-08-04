"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { RawMaterialRow } from "@mmdi/shared/rows";

// Lightweight client-side-filtered picker for mapping a BOM line to a real
// raw_materials.code. A full async ContactPicker-style search (see
// components/ui/ContactPicker.tsx) queries Supabase per keystroke -- not
// needed here since the BOM Master tab already loads the full ~1,558-row
// raw_materials list once for the page; filtering that in memory is instant
// and avoids a request per keystroke for a list this size.
export function RawMaterialPicker({
  materials,
  value,
  onChange,
  preferredCategory,
}: {
  materials: RawMaterialRow[];
  value: string | null;
  onChange: (code: string | null) => void;
  // When set, this category's materials are listed first, ahead of every
  // other category -- e.g. picking an ALTERNATIVE for a line already mapped
  // to a Vinyl material should surface other Vinyl materials immediately,
  // not bury them below unrelated categories like "Fixed Assets" or
  // "General Items" that happen to sort earlier alphabetically.
  preferredCategory?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = value ? materials.find((m) => m.code === value) ?? null : null;

  // Only the empty-query "browse" view is capped -- a real search should
  // never silently hide the one item you typed for. 1,558 raw materials
  // filtered down by a search term is small enough to render in full; the
  // uncapped default browse list (with 1,558 rows, category-grouped and
  // sorted with preferredCategory first) stays perfectly usable too, but a
  // cap there keeps the very first paint light before you've typed anything.
  const matches = useMemo(() => {
    if (!query.trim()) return materials.slice(0, 200);
    const q = query.toLowerCase();
    return materials.filter((m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
  }, [materials, query]);

  // Grouped by category (the categories from Raw Materials.xlsx --
  // Accessories, Flags, Vinyl, etc.) so a long result list is scannable
  // instead of one flat block. preferredCategory (when given) sorts first;
  // "Uncategorized" always sorts last; everything else alphabetically.
  const grouped = useMemo(() => {
    const byCategory = new Map<string, RawMaterialRow[]>();
    for (const m of matches) {
      const cat = m.category?.trim() || "Uncategorized";
      const list = byCategory.get(cat) ?? [];
      list.push(m);
      byCategory.set(cat, list);
    }
    return [...byCategory.entries()].sort(([a], [b]) => {
      if (preferredCategory) {
        if (a === preferredCategory && b !== preferredCategory) return -1;
        if (b === preferredCategory && a !== preferredCategory) return 1;
      }
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    });
  }, [matches, preferredCategory]);

  if (selected) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="rounded-md bg-surface-sunken px-2 py-1 text-xs text-ink">
          {selected.code} — {selected.name}
        </span>
        <button
          type="button"
          aria-label="Clear mapping"
          onClick={() => onChange(null)}
          className="text-ink-muted hover:text-danger"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        placeholder="Search raw material code or name…"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className="h-8 w-64 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-80 w-96 overflow-y-auto rounded-md border border-line-strong bg-surface shadow-2">
          {matches.length === 0 && <div className="px-3 py-2 text-xs text-ink-muted">No matches</div>}
          {grouped.map(([category, items]) => (
            <div key={category}>
              <div className="sticky top-0 bg-surface-sunken px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                {category}
              </div>
              {items.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => {
                    onChange(m.code);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="block w-full truncate px-3 py-1.5 text-left text-xs text-ink hover:bg-surface-sunken"
                >
                  <span className="font-medium">{m.code}</span> — {m.name}
                  {m.unit_cost_recent !== null && (
                    <span className="text-ink-muted"> (₹{m.unit_cost_recent.toFixed(2)})</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
