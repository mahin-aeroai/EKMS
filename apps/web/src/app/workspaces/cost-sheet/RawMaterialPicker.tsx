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
}: {
  materials: RawMaterialRow[];
  value: string | null;
  onChange: (code: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = value ? materials.find((m) => m.code === value) ?? null : null;

  const matches = useMemo(() => {
    if (!query.trim()) return materials.slice(0, 25);
    const q = query.toLowerCase();
    return materials.filter((m) => m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 25);
  }, [materials, query]);

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
        <div className="absolute z-10 mt-1 max-h-64 w-80 overflow-y-auto rounded-md border border-line-strong bg-surface shadow-2">
          {matches.length === 0 && <div className="px-3 py-2 text-xs text-ink-muted">No matches</div>}
          {matches.map((m) => (
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
      )}
    </div>
  );
}
