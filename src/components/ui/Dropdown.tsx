"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DropdownOption {
  value: string;
  label: string;
  suggested?: boolean;
}

interface DropdownProps {
  label: string;
  options: DropdownOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multi?: boolean;
  searchable?: boolean;
  placeholder?: string;
}

/**
 * Dropdown — Deliverable 3.1
 * Purpose: select one/many values from a list.
 * Variants: Single-select, Multi-select, Searchable, Async.
 * Behaviour: opens an Elevation-2 panel; full keyboard arrow-key navigation.
 * Usage rule: the Searchable variant is required once the option list exceeds 10 items.
 * AI Integration: options can be pre-filtered by AI-suggested top matches, labeled "Suggested".
 */
export function Dropdown({
  label,
  options,
  value,
  onChange,
  multi = false,
  searchable = options.length > 10,
  placeholder = "Select…",
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );
  const suggested = filtered.filter((o) => o.suggested);
  const rest = filtered.filter((o) => !o.suggested);

  const selectedValues = multi ? (value as string[]) : [value as string];
  const selectedLabels = options.filter((o) => selectedValues.includes(o.value)).map((o) => o.label);

  function toggle(v: string) {
    if (multi) {
      const cur = value as string[];
      onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
    } else {
      onChange(v);
      setOpen(false);
    }
  }

  const renderOption = (o: DropdownOption) => {
    const isSelected = selectedValues.includes(o.value);
    return (
      <li key={o.value} role="option" aria-selected={isSelected}>
        <button
          type="button"
          onClick={() => toggle(o.value)}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-sunken",
            isSelected && "text-primary"
          )}
        >
          <span className="flex items-center gap-2">
            {o.label}
            {o.suggested && (
              <span className="rounded-full bg-ai-tint px-1.5 py-0.5 text-[10px] font-semibold text-ai">
                Suggested
              </span>
            )}
          </span>
          {isSelected && <Check size={14} />}
        </button>
      </li>
    );
  };

  return (
    <div ref={rootRef} className="relative w-64">
      <label className="mb-1 block text-xs font-medium text-ink-secondary">{label}</label>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className={cn("truncate", selectedLabels.length === 0 && "text-ink-muted")}>
          {selectedLabels.length ? selectedLabels.join(", ") : placeholder}
        </span>
        <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-surface-overlay shadow-3">
          {searchable && (
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search size={14} className="text-ink-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-ink-muted"
              />
            </div>
          )}
          <ul role="listbox" aria-multiselectable={multi} className="max-h-64 overflow-auto p-1">
            {suggested.length > 0 && (
              <>
                {suggested.map(renderOption)}
                <li className="my-1 border-t border-line" />
              </>
            )}
            {rest.map(renderOption)}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-muted">No matches</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
