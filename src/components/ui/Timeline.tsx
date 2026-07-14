import { cn } from "@/lib/cn";
import { Shield } from "lucide-react";

export interface TimelineEntry {
  id: string;
  date: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

/**
 * Timeline — Deliverable 3.3
 * Purpose: chronological event history for a record.
 * Variants: Vertical (default), Compact, Milestone.
 * Usage rule: used for business-facing Timelines; the audit-grade History tab uses the
 * same component with `audit` set, visually tagged so the two are never confused.
 */
export function Timeline({ entries, audit = false }: { entries: TimelineEntry[]; audit?: boolean }) {
  return (
    <ol className="relative ml-3 border-l border-line pl-6">
      {entries.map((e) => (
        <li key={e.id} className="mb-6 last:mb-0">
          <span className="absolute -left-[7px] mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-surface bg-primary" />
          <div className="flex items-center gap-2">
            <time className="text-xs font-medium text-ink-muted">{e.date}</time>
            {audit && (
              <span className="flex items-center gap-1 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold text-ink-secondary">
                <Shield size={10} /> Audit
              </span>
            )}
          </div>
          <h4 className={cn("text-sm font-semibold text-ink", audit && "font-mono text-xs font-normal")}>
            {e.title}
          </h4>
          {e.description && <p className="text-xs text-ink-secondary">{e.description}</p>}
        </li>
      ))}
    </ol>
  );
}
