"use client";

import { PenTool } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { CADViewer } from "@/components/ui/Viewers";
import { useToast } from "@/components/ui/Notifications";

interface Drawing {
  id: string;
  number: string;
  title: string;
  status: BadgeStatus;
  statusLabel: string;
}

const DRAWINGS: Drawing[] = [
  { id: "1", number: "DWG-MU-2231", title: "Mold Cavity — Wardrobe Panel Rev C", status: "warning", statusLabel: "Under Revision" },
  { id: "2", number: "DWG-MU-2198", title: "Hinge Bracket Assembly", status: "success", statusLabel: "Approved" },
  { id: "3", number: "DWG-MU-2104", title: "Line 3 Layout", status: "success", statusLabel: "Approved" },
];

const COLUMNS: TableColumn<Drawing>[] = [
  { key: "number", header: "Drawing #", sortable: true },
  { key: "title", header: "Title", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.statusLabel}</Badge> },
];

export default function DrawingsPage() {
  const { toast } = useToast();

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Knowledge" }, { label: "Drawings" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <PenTool size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Drawings</h1>
              <Badge status="warning">1 under revision</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Knowledge — engineering drawing register with live CAD preview</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>DWG-MU-2231 revision linked to the tooling delay on IKEA Wardrobe Program</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Drawings" value="486" trend="flat" trendLabel="No change" />
        <StatCard label="Under Revision" value="1" trend="flat" trendLabel="No change" />
        <StatCard label="Approved This Month" value="14" trend="up" trendLabel="+3 vs last month" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="summary"
            title="DWG-MU-2231 revision tied to project schedule risk"
            citation="Project Workspace — IKEA Wardrobe Program"
            onAccept={() => toast("success", "Linked to project risk register")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            This drawing&apos;s revision is the same tooling change the Project Workspace flagged as a schedule risk — resolving one resolves the other.
          </AICard>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Drawing register</h3>
            <Table columns={COLUMNS} rows={DRAWINGS} onRowClick={(r) => toast("info", `Opened ${r.number}`)} />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">DWG-MU-2231 — layer preview</h3>
          <CADViewer layers={["Outline", "Mold Cavity", "Cooling Channels", "Ejector Pins"]} />
        </div>
      </div>
    </div>
  );
}
