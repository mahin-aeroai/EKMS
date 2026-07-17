"use client";

import { useEffect, useState } from "react";
import { Factory } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { StatCard } from "@/components/ui/Card";
import { Kanban, type KanbanColumn } from "@/components/ui/Kanban";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type WorkOrderRow } from "@/lib/supabase";

const COLUMN_TITLES: Record<string, string> = { queued: "Queued", running: "Running", qa: "QA Hold", complete: "Complete" };
const COLUMN_ORDER = ["queued", "running", "qa", "complete"];

function toKanbanColumns(rows: WorkOrderRow[]): KanbanColumn[] {
  return COLUMN_ORDER.map((id) => ({
    id,
    title: COLUMN_TITLES[id],
    cards: rows
      .filter((r) => r.column_id === id)
      .map((r) => ({ id: r.id, title: r.title, meta: r.meta ?? undefined, aiSuggestedColumn: r.ai_suggested_column ?? undefined })),
  }));
}

export default function ProductionPage() {
  const { toast } = useToast();
  const [columns, setColumns] = useState<KanbanColumn[] | null>(null);

  useEffect(() => {
    supabase
      .from("work_orders")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load work orders from Supabase");
          return;
        }
        setColumns(toKanbanColumns(data ?? []));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Operations" }, { label: "Production" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Factory size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Production</h1>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Operations — live work order status across all lines</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Units Produced Today" value="—" />
        <StatCard label="Line Efficiency" value="—" />
        <StatCard label="Scrap Rate" value="—" />
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Work order board</h3>
          {columns === null ? (
            <p className="py-6 text-center text-sm text-ink-muted">Loading work orders…</p>
          ) : (
            <Kanban initialColumns={columns} />
          )}
        </div>
      </div>
    </div>
  );
}
