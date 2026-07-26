"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TableColumn<T> {
  key: keyof T;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface TableProps<T extends { id: string }> {
  columns: TableColumn<T>[];
  rows: T[];
  density?: "compact" | "comfortable";
  onRowClick?: (row: T) => void;
}

/**
 * Table — Deliverable 3.3
 * Purpose: dense tabular data with sort/filter/export.
 * Behaviour: column sort, sticky header on scroll.
 * Usage rule: the default data-display component for any list exceeding ~10 rows in
 * Compact density (Deliverable 1, Information Density principle).
 * Responsive: converts to a stacked-card list on Mobile — see the Design System doc,
 * Deliverable 3.3 — not reproduced in this web demo, which stays tabular at all widths
 * for inspection purposes.
 */
export function Table<T extends { id: string }>({
  columns,
  rows,
  density = "comfortable",
  onRowClick,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = String(a[sortKey]);
      const bv = String(b[sortKey]);
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: keyof T) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="overflow-auto rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-surface-sunken text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} className="px-4 py-2.5">
                {col.sortable ? (
                  <button
                    onClick={() => toggleSort(col.key)}
                    className="flex items-center gap-1 hover:text-ink"
                  >
                    {col.header}
                    {sortKey === col.key ? (
                      sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : (
                      <ArrowUpDown size={12} className="opacity-40" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "text-ink",
                onRowClick && "cursor-pointer hover:bg-surface-sunken",
                density === "compact" ? "h-9" : "h-12"
              )}
            >
              {columns.map((col) => (
                <td key={String(col.key)} className="px-4">
                  {col.render ? col.render(row) : String(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-ink-muted">
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
