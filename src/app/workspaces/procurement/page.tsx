"use client";

import { ShoppingCart } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Kanban, type KanbanColumn } from "@/components/ui/Kanban";
import { useToast } from "@/components/ui/Notifications";

const COLUMNS: KanbanColumn[] = [
  { id: "draft", title: "Draft", cards: [{ id: "k1", title: "PO-MU-2026-004530 — Packaging", meta: "₹1.2L" }] },
  { id: "approval", title: "Pending Approval", cards: [{ id: "k2", title: "PO-MU-2026-004528 — Cosmo Films", meta: "₹2,37,000", aiSuggestedColumn: "ordered" }] },
  { id: "ordered", title: "Ordered", cards: [{ id: "k3", title: "PO-MU-2026-004521 — UFlex Ltd", meta: "₹1,84,000" }] },
  { id: "received", title: "Received", cards: [{ id: "k4", title: "PO-MU-2026-004505 — Hardware Set" }] },
];

export default function ProcurementPage() {
  const { toast } = useToast();

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Manufacturing" }, { label: "Procurement" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <ShoppingCart size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Procurement</h1>
              <Badge status="info">4 open POs</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Manufacturing — purchase order pipeline across all suppliers</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>PO-MU-2026-004528 ready to move to Ordered</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open POs" value="4" trend="flat" trendLabel="No change" />
        <StatCard label="Avg Cycle Time" value="2.1 days" trend="down" trendLabel="-0.3 days" />
        <StatCard label="Spend MTD" value="₹18.4 L" trend="up" trendLabel="+8% vs plan" />
      </div>

      <div className="flex flex-col gap-6">
        <AICard
          variant="insight"
          title="PO-MU-2026-004528 cleared for approval"
          citation="Approval Matrix, spend threshold check"
          onAccept={() => toast("success", "Approval reminder sent")}
          onDismiss={() => toast("info", "Dismissed")}
        >
          This PO is within Cosmo Films&apos; contracted rate card and within the requester&apos;s delegated authority — no exceptions detected, ready for sign-off.
        </AICard>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Purchase order pipeline</h3>
          <Kanban initialColumns={COLUMNS} />
        </div>
      </div>
    </div>
  );
}
