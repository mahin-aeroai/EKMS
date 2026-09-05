"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  /** Bounds the table's own scroll box, making it independently
   * vertically-scrollable instead of just growing to fit every row.
   * Tried as the fix for a wide/long table's horizontal scrollbar
   * otherwise ending up unreachably far below the fold (task, 5 Sep
   * 2026, Srinivas on LFG Site Master's List view), but reverted as the
   * DEFAULT the same day -- Srinivas: "when scrolled inside it worked
   * well but when i am scrolling outside it went off again. cant just
   * remove this circus" -- a second, independently-scrolling box nested
   * inside the page's own scroll was exactly the "two scrolls" problem
   * this was supposed to fix, just relocated. The sticky mirrored
   * scrollbar below is the real fix now; this prop is kept, defaulted to
   * "none" (unbounded, grows with the page -- the original behavior),
   * only for some future table that genuinely wants a bounded/independently-
   * scrolling box instead. */
  maxHeight?: string;
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
  maxHeight = "none",
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

  // Sticky mirrored horizontal scrollbar (task, 5 Sep 2026, Srinivas:
  // "cant just remove this circus" -- see maxHeight's own comment for the
  // bounded-box attempt this replaces). The real table below stays in
  // normal page flow, unbounded, scrolled vertically by the page exactly
  // as it always was -- one scroll, not two. This is a second, purely
  // decorative horizontal-scroll strip, `position: sticky; bottom: 0`, so
  // it stays glued to the bottom of the screen for as long as there's
  // more of the table below the current view, and scrolls away normally
  // once you actually reach the end of it -- exactly the "always visible
  // while I'm in the middle of it, gone once I'm done" behavior asked
  // for, without needing the table itself to be a bounded, independently-
  // scrolling box. Its own scrollLeft is kept in sync with the real
  // table's in both directions (tableRef.onScroll <-> shadowRef.onScroll,
  // guarded by `syncingRef` so each doesn't re-trigger the other and
  // fight over the position); the real table's own native horizontal
  // scrollbar is hidden (scrollbar-width/::-webkit-scrollbar below) so
  // there's only ever one horizontal scrollbar visibly in play, not two.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const shadowScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef<"table" | "shadow" | null>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      setScrollWidth(el.scrollWidth);
      setHasOverflow(el.scrollWidth > el.clientWidth + 1);
    }
    measure();
    // Catches every reason the table's true content width can change --
    // new/fewer columns, a column's own content growing, or the browser
    // window (and so this table's available width) resizing -- without
    // needing each of those tracked as a separate dependency.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // columns.length, not `columns` itself -- callers (e.g. the LFG Site
    // Master page) rebuild that array fresh every render, and column
    // widths don't change at runtime once a table's set up, so keying on
    // the array reference would just re-create the ResizeObserver on
    // every unrelated re-render (a keystroke in a search box, etc.) for
    // no benefit -- the ResizeObserver itself already catches a real
    // width change from any other cause.
  }, [sorted.length, columns.length]);

  function onTableScroll() {
    if (syncingRef.current === "shadow") {
      syncingRef.current = null;
      return;
    }
    if (!tableScrollRef.current || !shadowScrollRef.current) return;
    syncingRef.current = "table";
    shadowScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
  }
  function onShadowScroll() {
    if (syncingRef.current === "table") {
      syncingRef.current = null;
      return;
    }
    if (!tableScrollRef.current || !shadowScrollRef.current) return;
    syncingRef.current = "shadow";
    tableScrollRef.current.scrollLeft = shadowScrollRef.current.scrollLeft;
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
    <div>
      <div
        ref={tableScrollRef}
        onScroll={onTableScroll}
        className={cn(
          "overflow-x-auto border border-line",
          // Flat bottom corners when the shadow scrollbar is about to sit
          // flush underneath it -- otherwise the table's own rounded
          // corners show through at the seam between the two.
          hasOverflow ? "rounded-t-lg" : "rounded-lg",
          // Real scrolling still works here (trackpad/drag on the table
          // itself) -- only the native scrollbar rendering is hidden, so
          // the sticky one below reads as the single, always-reachable
          // horizontal scrollbar rather than there being two of them.
          "[&::-webkit-scrollbar]:hidden"
        )}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          ...(maxHeight !== "none" ? { maxHeight, overflowY: "auto" as const } : undefined),
        }}
      >
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
      {hasOverflow && (
        <div
          ref={shadowScrollRef}
          onScroll={onShadowScroll}
          aria-hidden="true"
          className="sticky bottom-0 z-10 overflow-x-auto overflow-y-hidden rounded-b-lg border border-t-0 border-line bg-surface-sunken"
          style={{ height: "14px" }}
        >
          {/* Pure spacer -- its width is the only thing that needs to
              match the real table's scrollWidth, so this div's scroll
              range (and so its thumb's size/position) line up exactly
              with the real content it's mirroring. */}
          <div style={{ width: scrollWidth, height: 1 }} />
        </div>
      )}
    </div>
  );
}
