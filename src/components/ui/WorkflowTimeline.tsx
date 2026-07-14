import { Check, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

export interface WorkflowStage {
  id: string;
  label: string;
  status: "complete" | "current" | "upcoming" | "escalated";
  actor?: string;
  timestamp?: string;
}

/**
 * Workflow Timeline — Deliverable 3.3
 * Purpose: visualize an approval/status workflow's defined stages and current position.
 * Distinct from the generic Timeline — this always reflects a defined Approval Matrix
 * workflow (Phase 1/2), never free-form activity.
 * AI Integration: predicts likely completion time based on historical stage durations.
 */
export function WorkflowTimeline({ stages }: { stages: WorkflowStage[] }) {
  return (
    <ol className="flex items-start gap-0">
      {stages.map((s, i) => (
        <li key={s.id} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                s.status === "complete" && "bg-success text-on-brand",
                s.status === "current" && "bg-primary text-on-brand",
                s.status === "upcoming" && "bg-surface-sunken text-ink-muted",
                s.status === "escalated" && "bg-danger text-on-brand"
              )}
              aria-current={s.status === "current" ? "step" : undefined}
            >
              {s.status === "complete" ? (
                <Check size={14} />
              ) : s.status === "escalated" ? (
                <AlertTriangle size={14} />
              ) : s.status === "current" ? (
                <Clock size={14} />
              ) : (
                i + 1
              )}
            </span>
            <span className="max-w-24 text-xs font-medium text-ink">{s.label}</span>
            {s.actor && <span className="text-[11px] text-ink-muted">{s.actor}</span>}
            {s.timestamp && <span className="text-[11px] text-ink-muted">{s.timestamp}</span>}
          </div>
          {i < stages.length - 1 && (
            <span
              className={cn(
                "mx-2 h-0.5 flex-1",
                stages[i + 1].status !== "upcoming" || s.status === "complete" ? "bg-success" : "bg-line-strong"
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
