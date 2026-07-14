"use client";

import { Truck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { WorkflowTimeline } from "@/components/ui/WorkflowTimeline";
import { useToast } from "@/components/ui/Notifications";

interface Site {
  id: string;
  site: string;
  customer: string;
  status: BadgeStatus;
  statusLabel: string;
}

const SITES: Site[] = [
  { id: "1", site: "Mumbai DC-4", customer: "Reliance Retail Ltd", status: "success", statusLabel: "On Track" },
  { id: "2", site: "Pune Store #12", customer: "IKEA India", status: "warning", statusLabel: "Delayed 2 days" },
  { id: "3", site: "Bengaluru Hub", customer: "Godrej Interio", status: "success", statusLabel: "On Track" },
];

const COLUMNS: TableColumn<Site>[] = [
  { key: "site", header: "Site", sortable: true },
  { key: "customer", header: "Customer", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.statusLabel}</Badge> },
];

export default function InstallationPage() {
  const { toast } = useToast();

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Operations" }, { label: "Installation" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-info-tint text-info">
            <Truck size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Installation</h1>
              <Badge status="warning">1 site delayed</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Operations — field installation status across active sites</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>Pune Store #12 delay tied to a logistics hold</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Sites In Progress" value="3" trend="flat" trendLabel="No change" />
        <StatCard label="On-Time %" value="89%" trend="down" trendLabel="-3 pts" />
        <StatCard label="Open Issues" value="2" trend="up" trendLabel="+1 this week" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="insight"
            title="Pune Store #12 delay traced to logistics"
            citation="Shipment tracking, site log"
            onAccept={() => toast("success", "Escalated to logistics team")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            The 2-day delay is due to a customs hold on imported hardware, not an on-site issue — the install crew is on schedule and waiting on parts.
          </AICard>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Active sites</h3>
            <Table columns={COLUMNS} rows={SITES} onRowClick={(r) => toast("info", `Opened ${r.site}`)} />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Pune Store #12 — install stages</h3>
          <WorkflowTimeline stages={[
            { id: "s1", label: "Site Survey", status: "complete", actor: "Field Team", timestamp: "2 Jul" },
            { id: "s2", label: "Materials Dispatched", status: "complete", timestamp: "8 Jul" },
            { id: "s3", label: "Customs Clearance", status: "current" },
            { id: "s4", label: "Install & Handover", status: "upcoming" },
          ]} />
        </div>
      </div>
    </div>
  );
}
