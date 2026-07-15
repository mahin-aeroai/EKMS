"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type EmployeeRow } from "@/lib/supabase";

const COLUMNS: TableColumn<EmployeeRow>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "role", header: "Role", sortable: true },
  { key: "department", header: "Department", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

export default function PeoplePage() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<EmployeeRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("employees")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load employees from Supabase");
          return;
        }
        setEmployees(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "People" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <UserRound size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">People</h1>
              <Badge status="info">248 employees</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Company-wide workforce directory and roster health</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>3 open positions unfilled past 60 days</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Headcount" value="248" trend="up" trendLabel="+4 this quarter" />
        <StatCard label="Open Positions" value="6" trend="flat" trendLabel="No change" />
        <StatCard label="Attrition Rate" value="8.2%" trend="down" trendLabel="-1.1 pts" />
      </div>

      <div className="flex flex-col gap-6">
        <AICard
          variant="insight"
          title="3 open positions unfilled past 60 days"
          citation="Recruiting pipeline, requisition age"
          onAccept={() => toast("success", "Escalated to hiring managers")}
          onDismiss={() => toast("info", "Dismissed")}
        >
          Maintenance Technician (Line 3), Procurement Analyst, and QA Inspector requisitions have all exceeded the 60-day target time-to-fill.
        </AICard>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Key personnel</h3>
          {employees === null ? (
            <p className="py-6 text-center text-sm text-ink-muted">Loading employees…</p>
          ) : (
            <Table columns={COLUMNS} rows={employees} onRowClick={(r) => toast("info", `Opened ${r.name}`)} />
          )}
        </div>
      </div>
    </div>
  );
}
