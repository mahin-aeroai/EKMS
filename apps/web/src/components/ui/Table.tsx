"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TableColumn<T> {
  key: keyof T;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  /** Optional fixed/minimum column width, e.g. "12rem" or "180px". Applied
   * to both the header and body cells via inline style so it survives
   * regardless of content length -- most columns don't need this, only
   * ones that otherwise wrap awkwardly (e.g. a long Material name). */
  width?: string;
  /** Optional custom header cell content, replacing the plain `header`
   * string -- for things like a "select all shown" checkbox in a
   * selection column's header (task #69). Takes priority over the
   * sortable-button/plain-text rendering below when present; a column
   * using this should leave `sortable` unset. */
  headerRender?: () => React.ReactNode;
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

  // Compact trims header/cell padding and font size on top of the
  // shorter row height it already had -- task feedback on a wide,
  // many-column table ("reduce font and compact this view i need to see
  // th e last delete button in single screen"): the old compact mode only
  // shortened rows (h-9), leaving the same text-sm/px-4 sizing as
  // "comfortable", which didn't meaningfully narrow a wide table. Cells
  // also truncate with an ellipsis instead of wrapping onto a second line
  // -- letting a long value (e.g. a Material name) wrap would blow the
  // row past its declared height and undo the compaction.
  //
  // Compact also switches to a FIXED table layout sized to the sum of
  // each column's own `width` (not stretched to fill the container like
  // "comfortable"'s `w-full` does) -- without this, the browser sizes
  // every column without an explicit width to fit its content, which is
  // exactly what let a wide, many-column table push its last column (the
  // Delete button) off screen in the first place. A caller using compact
  // density should give every column a `width` for this to size
  // predictably; a column left without one falls back to the browser's
  // usual fixed-layout heuristic (roughly equal leftover space), which
  // may not match its content.
  const compact = density === "compact";

  return (
    <div className="overflow-auto rounded-lg border border-line">
      <table className={cn("text-left", compact ? "table-fixed text-xs" : "w-full text-sm")}>
        <thead
          className={cn(
            "sticky top-0 bg-surface-sunken font-semibold uppercase tracking-wide text-ink-secondary",
            compact ? "text-[10px]" : "text-xs"
          )}
        >
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={compact ? "px-2 py-1.5" : "px-4 py-2.5"}
                style={col.width ? { width: col.width, minWidth: col.width } : undefined}
              >
                {col.headerRender ? (
                  col.headerRender()
                ) : col.sortable ? (
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
                compact ? "h-8" : "h-12"
              )}
            >
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className={cn(compact ? "px-2 overflow-hidden text-ellipsis whitespace-nowrap" : "px-4")}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                >
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
