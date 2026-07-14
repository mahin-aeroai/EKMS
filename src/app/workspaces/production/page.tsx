"use client";

import { Factory } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Kanban, type KanbanColumn } from "@/components/ui/Kanban";
import { useToast } from "@/components/ui/Notifications";

const COLUMNS: KanbanColumn[] = [
  { id: "queued", title: "Queued", cards: [{ id: "k1", title: "WO-2026-3311 — Urban Ladder panels", meta: "Line 1" }, { id: "k2", title: "WO-2026-3312 — Godrej hinges", meta: "Line 2" }] },
  { id: "running", title: "Running", cards: [{ id: "k3", title: "WO-2026-3308 — IKEA wardrobe panels", meta: "Line 3, Machine M-14" }] },
  { id: "qa", title: "QA Hold", cards: [{ id: "k4", title: "WO-2026-3305 — sample inspection", meta: "Line 3", aiSuggestedColumn: "complete" }] },
  { id: "complete", title: "Complete", cards: [{ id: "k5", title: "WO-2026-3298 — Reliance retail order" }] },
];

export default function ProductionPage() {
  const { toast } = useToast();

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
              <Badge status="success">On schedule</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Operations — live work order status across all lines</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>WO-2026-3305 ready to release from QA hold</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Units Produced Today" value="4,120" trend="up" trendLabel="+6% vs target" />
        <StatCard label="Line Efficiency" value="88%" trend="flat" trendLabel="No change" />
        <StatCard label="Scrap Rate" value="1.8%" trend="down" trendLabel="-0.3 pts" />
      </div>

      <div className="flex flex-col gap-6">
        <AICard
          variant="insight"
          title="QA hold on WO-2026-3305 ready to clear"
          citation="Inspection log, sample results"
          onAccept={() => toast("success", "Work order released to Complete")}
          onDismiss={() => toast("info", "Dismissed")}
        >
          Sample inspection results came back within tolerance 20 minutes ago — this work order is ready to move to Complete.
        </AICard>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Work order board</h3>
          <Kanban initialColumns={COLUMNS} />
        </div>
      </div>
    </div>
  );
}
