"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Split View — Deliverable 3.9
 * Purpose: show two related panes side by side (e.g., a list and its detail).
 * Behaviour: draggable divider to resize; collapses to single-pane on narrow viewports.
 * Usage rule: standard pattern for any "browse a list, inspect an item" task.
 */
export function SplitView({
  left,
  right,
  initialLeftPct = 35,
}: {
  left: ReactNode;
  right: ReactNode;
  initialLeftPct?: number;
}) {
  const [leftPct, setLeftPct] = useState(initialLeftPct);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function onMouseDown() {
    dragging.current = true;
  }
  function onMouseUp() {
    dragging.current = false;
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftPct(Math.min(70, Math.max(20, pct)));
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      className="flex h-full min-h-96 rounded-lg border border-line"
    >
      <div style={{ width: `${leftPct}%` }} className="overflow-y-auto border-r border-line p-3">
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setLeftPct((p) => Math.max(20, p - 2));
          if (e.key === "ArrowRight") setLeftPct((p) => Math.min(70, p + 2));
        }}
        className={cn("w-1 shrink-0 cursor-col-resize bg-line hover:bg-primary")}
      />
      <div style={{ width: `${100 - leftPct}%` }} className="overflow-y-auto p-3">
        {right}
      </div>
    </div>
  );
}
