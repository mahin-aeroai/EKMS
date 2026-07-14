"use client";

import { FileText } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";

interface Quote {
  id: string;
  number: string;
  customer: string;
  value: string;
  status: BadgeStatus;
  statusLabel: string;
}

const QUOTES: Quote[] = [
  { id: "1", number: "QT-MU-2026-1142", customer: "Reliance Retail Ltd", value: "₹18,40,000", status: "info", statusLabel: "Sent" },
  { id: "2", number: "QT-MU-2026-1141", customer: "IKEA India", value: "₹9,20,000", status: "warning", statusLabel: "Revising" },
  { id: "3", number: "QT-MU-2026-1139", customer: "Godrej Interio", value: "₹4,10,000", status: "success", statusLabel: "Won" },
  { id: "4", number: "QT-MU-2026-1135", customer: "Urban Ladder", value: "₹2,60,000", status: "danger", statusLabel: "Lost" },
];

const COLUMNS: TableColumn<Quote>[] = [
  { key: "number", header: "Quote #", sortable: true },
  { key: "customer", header: "Customer", sortable: true },
  { key: "value", header: "Value", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.statusLabel}</Badge> },
];

export default function QuotationsPage() {
  const { toast } = useToast();

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers" }, { label: "Quotations" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-info-tint text-info">
            <FileText size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Quotations</h1>
              <Badge status="info">4 active</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Customers — quote pipeline across all accounts</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>QT-MU-2026-1141 is 3 days past typical revision turnaround</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open Quotes" value="2" trend="flat" trendLabel="No change" />
        <StatCard label="Win Rate" value="58%" trend="up" trendLabel="+4 pts this quarter" />
        <StatCard label="Avg Turnaround" value="3.4 days" trend="down" trendLabel="-0.6 days" />
      </div>

      <div className="flex flex-col gap-6">
        <AICard
          variant="recommendation"
          title="QT-MU-2026-1141 needs follow-up"
          citation="Quote history, revision cycle time"
          onAccept={() => toast("success", "Reminder sent to quote owner")}
          onDismiss={() => toast("info", "Dismissed")}
        >
          This quote has been in revision for 3 days past the typical cycle time — IKEA India&apos;s procurement window closes in 5 days.
        </AICard>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Quote pipeline</h3>
          <Table columns={COLUMNS} rows={QUOTES} onRowClick={(r) => toast("info", `Opened ${r.number}`)} />
        </div>
      </div>
    </div>
  );
}
