"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { RawMaterialRow } from "@mmdi/shared/rows";

// raw_materials.category is a real mess -- confirmed via a live audit query
// (58 distinct category strings across ~1,558 rows): old Tally-style ALL
// CAPS buckets ("RM - BACKLIT SIGNAGE MATERIALS", 436 rows) sit alongside
// the newer Raw Materials.xlsx taxonomy ("Backlit Flex", only 8 rows) that
// only ever got applied to a subset of codes -- so e.g. RM-12002..12005
// ("3M/LG/JINDAL/QSTAR BACKLIT FLEX") never got migrated off the old bucket
// and don't group with RM-12001/12006 in the picker even though they're
// obviously the same product family. Per the user's own review of that
// audit: merge the known old<->new pairs below (UI-only, database
// untouched -- confirmed with real material names, not guessed) so they at
// least group together here; anything not in this list just keeps showing
// under its own literal category rather than risk a wrong guess.
const CATEGORY_ALIASES: Record<string, string> = {
  "rm - rigid materials": "Rigid Materials",
  "rigid materials": "Rigid Materials",
  "rm - backlit materials": "Backlit Flex",
  "rm - backlit signage materials": "Backlit Flex",
  "rm - soft signage backlit materials": "Backlit Flex",
  "backlit flex": "Backlit Flex",
  "rm - paper materials": "Paper",
  paper: "Paper",
  "rm - soft signage frontlit materials": "Frontlit Flex",
  "frontlit flex": "Frontlit Flex",
  "rm - dye sub textile materials": "Dye Sub Fabrics",
  "dye sub fabrics": "Dye Sub Fabrics",
};

// Categories confirmed (per the same audit, and the user's own call on each)
// to not be pickable raw materials at all: Fixed Assets/Spare Parts/General
// Services aren't production materials; "SI - Margins" and "Flag Costing
// (placeholder)" are pricing scratch rows, not materials; the "FG - ...
// Applications" categories and "BPCL Signages"/"...Soft Signs" are Finished
// Goods product-type labels, not raw materials -- these are exactly what
// showed up as junk ("FG - 41004 -- BACKLIT SIGNAGES" etc.) in the picker.
// "General Items" (739 rows, ~half the table) is hidden too per the user's
// own choice, even though some of it may be legitimate -- those materials
// need a real category before they're pickable here again.
const EXCLUDED_CATEGORIES = new Set(
  [
    "GENERAL ITEMS",
    "FIXED ASSETS",
    "GENERAL SERVICES",
    "SPARE PARTS FOR MACHINARY",
    "SI - MARGINS",
    "Flag Costing (placeholder)",
    "FG - PAPER APPLICATIONS",
    "FG - ADHESIVE APPLICATIONS",
    "FG - RIGID BOARDS APPLICATIONS",
    "FG - TEXTILE APPLICATIONS",
    "FG - NONLIT APPLICATIONS",
    "FG - BACKLIT APPLICATIONS",
    "FG - FURNITURE",
    "BPCL SIGNAGES",
    "BACKLIT SOFT SIGNS",
    "NONLIT SOFT SIGNS",
  ].map((c) => c.toLowerCase())
);

function canonicalCategory(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "Uncategorized";
  return CATEGORY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

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

  // raw_materials has picked up a batch of rows that are really Finished
  // Goods reference codes (e.g. "FG - 41004 -- BACKLIT SIGNAGES"), not raw
  // materials at all -- these were meant for inventory_skus, judging by
  // import-finished-goods.sql using the exact same "FG - 41004" code/name
  // pairs. Real raw material codes (including the legitimately mixed
  // RM-/FG-/GE- prefixes from the original Tally import, e.g. "FG-13300",
  // "GE-23096") never have a space on both sides of the dash -- only this
  // contaminated batch does ("FG - 41004" vs "FG-13300") -- a precise
  // signature to drop the junk without hiding any real material. Combined
  // with the category exclusions above (which also catch same-batch rows
  // that happen not to have the spaced dash, e.g. "FG-41123").
  const usable = useMemo(
    () => materials.filter((m) => !/\s-\s/.test(m.code) && !EXCLUDED_CATEGORIES.has((m.category?.trim() || "").toLowerCase())),
    [materials]
  );

  const preferredCanonical = preferredCategory ? canonicalCategory(preferredCategory) : null;

  // Only the empty-query "browse" view is capped -- a real search should
  // never silently hide the one item you typed for. 1,558 raw materials
  // filtered down by a search term is small enough to render in full; the
  // uncapped default browse list (with 1,558 rows, category-grouped and
  // sorted with preferredCategory first) stays perfectly usable too, but a
  // cap there keeps the very first paint light before you've typed anything.
  //
  // preferredCategory's items are pulled out and kept in full BEFORE the
  // cap is applied (not just sorted-first afterwards) -- otherwise, on a
  // line whose category has items that sort late among 1,558 codes, the
  // very items you actually want could be squeezed out of the first 200
  // entirely, matching the "some materials only show up if I search by
  // number" complaint. Matched via canonicalCategory so old-Tally and
  // new-taxonomy duplicates of the same category (see CATEGORY_ALIASES
  // above) are treated as one.
  const matches = useMemo(() => {
    if (query.trim()) {
      const q = query.toLowerCase();
      return usable.filter((m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
    }
    if (!preferredCanonical) return usable.slice(0, 200);
    const preferred = usable.filter((m) => canonicalCategory(m.category) === preferredCanonical);
    const rest = usable.filter((m) => canonicalCategory(m.category) !== preferredCanonical);
    return [...preferred, ...rest.slice(0, Math.max(0, 200 - preferred.length))];
  }, [usable, query, preferredCanonical]);

  // Grouped by category (canonicalized -- see CATEGORY_ALIASES above) so a
  // long result list is scannable instead of one flat block.
  // preferredCategory (when given) sorts first; "Uncategorized" always
  // sorts last; everything else alphabetically.
  const grouped = useMemo(() => {
    const byCategory = new Map<string, RawMaterialRow[]>();
    for (const m of matches) {
      const cat = canonicalCategory(m.category);
      const list = byCategory.get(cat) ?? [];
      list.push(m);
      byCategory.set(cat, list);
    }
    return [...byCategory.entries()].sort(([a], [b]) => {
      if (preferredCanonical) {
        if (a === preferredCanonical && b !== preferredCanonical) return -1;
        if (b === preferredCanonical && a !== preferredCanonical) return 1;
      }
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    });
  }, [matches, preferredCanonical]);

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
