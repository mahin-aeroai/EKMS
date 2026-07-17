"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type EmployeeRow } from "@/lib/supabase";

const ALL = "All";

const COLUMNS: TableColumn<EmployeeRow>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "employee_code", header: "Code", sortable: true },
  { key: "role", header: "Designation", sortable: true },
  { key: "department", header: "Department", sortable: true },
  { key: "location", header: "Location", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

export default function PeoplePage() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<EmployeeRow[] | null>(null);
  const [locationFilter, setLocationFilter] = useState<string>(ALL);

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

  // Real, computed stats from the live table -- no illustrative/mock numbers.
  const headcount = employees?.length ?? null;
  const locations = employees
    ? Array.from(new Set(employees.map((e) => e.location).filter((l): l is string => !!l))).sort()
    : [];
  const departmentCount = employees
    ? new Set(employees.map((e) => e.department).filter(Boolean)).size
    : null;
  // Genuine recent-joiner signal (last 30 days by date_of_joining), rather
  // than a placeholder "open positions" insight the source data can't back.
  const recentJoiners = employees
    ? employees.filter((e) => {
        if (!e.date_of_joining) return false;
        const days = (Date.now() - new Date(e.date_of_joining).getTime()) / 86_400_000;
        return days >= 0 && days <= 30;
      })
    : [];

  const locationChips = [ALL, ...locations];
  const visibleEmployees = employees?.filter((e) => locationFilter === ALL || e.location === locationFilter) ?? null;

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
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Company-wide workforce directory across all locations</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Headcount" value={headcount === null ? "—" : headcount.toLocaleString()} />
        <StatCard label="Locations" value={locations.length === 0 ? "—" : locations.length.toString()} />
        <StatCard label="Departments" value={departmentCount === null ? "—" : departmentCount.toString()} />
      </div>

      <div className="flex flex-col gap-6">
        {recentJoiners.length > 0 && (
          <AICard variant="insight" title="Recent joiners">
            {recentJoiners.length} employee{recentJoiners.length === 1 ? "" : "s"} joined in the last 30 days, across{" "}
            {new Set(recentJoiners.map((e) => e.location).filter(Boolean)).size || 1} location
            {new Set(recentJoiners.map((e) => e.location).filter(Boolean)).size === 1 ? "" : "s"}.
          </AICard>
        )}
        <div className="flex flex-wrap gap-2">
          {locationChips.map((l) => (
            <button
              key={l}
              onClick={() => setLocationFilter(l)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                locationFilter === l
                  ? "border-primary bg-primary text-on-brand"
                  : "border-line text-ink-secondary hover:bg-surface-sunken"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Key personnel</h3>
          {employees === null ? (
            <p className="py-6 text-center text-sm text-ink-muted">Loading employees…</p>
          ) : visibleEmployees && visibleEmployees.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">No employees in this location yet.</p>
          ) : (
            <Table columns={COLUMNS} rows={visibleEmployees ?? []} onRowClick={(r) => toast("info", `Opened ${r.name}`)} />
          )}
        </div>
      </div>
    </div>
  );
}
