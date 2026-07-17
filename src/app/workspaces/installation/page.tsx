"use client";

import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type InstallationSiteRow } from "@/lib/supabase";

const COLUMNS: TableColumn<InstallationSiteRow>[] = [
  { key: "site", header: "Site", sortable: true },
  { key: "customer", header: "Customer", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

export default function InstallationPage() {
  const { toast } = useToast();
  const [sites, setSites] = useState<InstallationSiteRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("installation_sites")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load installation sites from Supabase");
          return;
        }
        setSites(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const delayed = sites?.filter((s) => s.status === "warning").length ?? 0;

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
              <Badge status="warning">{sites ? `${delayed} site${delayed === 1 ? "" : "s"} delayed` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Operations — field installation status across active sites</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Sites In Progress" value={sites === null ? "—" : String(sites.length)} />
        <StatCard label="On-Time %" value="—" />
        <StatCard label="Open Issues" value="—" />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Active sites</h3>
        {sites === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading sites…</p>
        ) : sites.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No installation sites loaded yet.</p>
        ) : (
          <Table columns={COLUMNS} rows={sites} onRowClick={(r) => toast("info", `Opened ${r.site}`)} />
        )}
      </div>
    </div>
  );
}
