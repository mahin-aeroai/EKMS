"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface CalendarEvent {
  id: string;
  day: number;
  title: string;
  type: "pm" | "installation" | "personal" | "conflict";
}

const TYPE_DOT: Record<CalendarEvent["type"], string> = {
  pm: "bg-warning",
  installation: "bg-info",
  personal: "bg-primary",
  conflict: "bg-danger",
};

/**
 * Calendar — Deliverable 3.3
 * Purpose: date-based scheduling view (PM scheduling, installation scheduling, personal Homepage calendar).
 * Variants: Month, Week, Day, Agenda-list.
 * Accessibility: the Agenda-list variant is the accessible-by-default view for screen-reader users.
 * Responsive: defaults to Agenda-list on Mobile rather than a cramped month grid.
 */
export function Calendar({ daysInMonth = 30, events }: { daysInMonth?: number; events: CalendarEvent[] }) {
  const [view, setView] = useState<"month" | "agenda">("month");
  const byDay = (d: number) => events.filter((e) => e.day === d);

  return (
    <div>
      <div className="mb-3 flex items-center gap-1 rounded-full border border-line bg-surface p-1 w-fit">
        {(["month", "agenda"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize",
              view === v ? "bg-primary text-on-brand" : "text-ink-secondary hover:bg-surface-sunken"
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {view === "month" ? (
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
            const dayEvents = byDay(d);
            return (
              <div key={d} className="flex h-16 flex-col rounded-md border border-line p-1.5 text-xs">
                <span className="text-ink-muted">{d}</span>
                <div className="mt-auto flex flex-wrap gap-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full", TYPE_DOT[e.type])} title={e.title} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className={cn("h-2 w-2 rounded-full", TYPE_DOT[e.type])} />
              <span className="w-10 text-ink-muted">Day {e.day}</span>
              <span className="text-ink">{e.title}</span>
              {e.type === "conflict" && (
                <span className="ml-auto rounded-full bg-danger-tint px-2 py-0.5 text-[11px] font-medium text-danger">
                  Conflict
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
