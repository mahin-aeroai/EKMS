"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Calendar, type CalendarEvent } from "@/components/ui/Calendar";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type MaintenanceEventRow } from "@/lib/supabase";

function toCalendarEvent(row: MaintenanceEventRow): CalendarEvent {
  return { id: row.id, day: row.day, title: row.title, type: row.type };
}

export default function MaintenancePage() {
  const { toast } = useToast();
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    supabase
      .from("maintenance_events")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load the PM schedule from Supabase");
          return;
        }
        setEvents((data ?? []).map(toCalendarEvent));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conflicts = events?.filter((e) => e.type === "conflict").length ?? 0;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Operations" }, { label: "Maintenance" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-warning-tint text-warning">
            <ClipboardList size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Maintenance</h1>
              <Badge status="warning">{events ? `${conflicts} schedule conflict${conflicts === 1 ? "" : "s"}` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Operations — preventive maintenance schedule across all machines</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Scheduled PM Events" value={events === null ? "—" : String(events.length)} />
        <StatCard label="MTTR" value="—" />
        <StatCard label="PM Compliance" value="—" />
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">PM schedule</h3>
          {events === null ? (
            <p className="py-6 text-center text-sm text-ink-muted">Loading schedule…</p>
          ) : (
            <Calendar daysInMonth={30} events={events} />
          )}
        </div>
      </div>
    </div>
  );
}
