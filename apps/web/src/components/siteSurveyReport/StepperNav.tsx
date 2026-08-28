"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface StepperStep {
  id: string;
  label: string;
  /** Not yet built (a later milestone) -- shown greyed out, not clickable. */
  disabled?: boolean;
  /** True once this step's own data is present -- shows a check instead of the step number. */
  complete?: boolean;
}

// Deliberately bespoke rather than a fork of ui/Tabs.tsx -- Tabs manages
// its own active-tab state internally (no `active`/`onChange` props), which
// doesn't fit a wizard that needs external control: jumping to a specific
// step programmatically (e.g. after AI extraction finishes, landing on
// Review), disabling steps that aren't built yet (see StepperStep.disabled,
// milestones 2-5 of the Site Survey Report Creator plan), and skipping step
// 1 entirely on the manual-create path. A numbered-step header (not a plain
// tab row) also reads more clearly as "a sequence to complete" than "sibling
// views of the same data," which is what this actually is.
export function StepperNav({ steps, activeId, onSelect }: { steps: StepperStep[]; activeId: string; onSelect: (id: string) => void }) {
  return (
    <div role="tablist" aria-label="Report steps" className="flex gap-1 overflow-x-auto border-b border-line">
      {steps.map((step, i) => {
        const active = step.id === activeId;
        return (
          <button
            key={step.id}
            type="button"
            role="tab"
            disabled={step.disabled}
            aria-selected={active}
            onClick={() => onSelect(step.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:text-ink-muted disabled:opacity-60",
              active ? "border-primary text-primary" : "border-transparent text-ink-secondary hover:text-ink"
            )}
          >
            <StepBadge index={i + 1} active={active} complete={!!step.complete} />
            {step.label}
          </button>
        );
      })}
    </div>
  );
}

function StepBadge({ index, active, complete }: { index: number; active: boolean; complete: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        complete ? "bg-success text-on-brand" : active ? "bg-primary text-on-brand" : "bg-surface-sunken text-ink-muted"
      )}
    >
      {complete ? <Check size={12} /> : index}
    </span>
  );
}

export function ComingSoonPane({ title, note }: { title: string; note: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line py-16 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-md text-xs text-ink-muted">{note}</p>
    </div>
  );
}
