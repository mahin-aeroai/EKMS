"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type CustomerRow } from "@/lib/supabase";
import { formatCrore } from "@/lib/dashboard-queries";

// Real, searchable customer list — replaces what used to be a single
// hardcoded demo record (C03739, Apple India Pvt Ltd - Bangalore) with no
// way to see or open any other customer. Clicking a row opens the same
// full workspace view (Overview/Insights/Timeline/Documents/Relationships/
// Activity, real AI Copilot box, etc.) at /workspaces/customer/[code],
// which used to be the only thing this route rendered.
export default function CustomerListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setTotalCount(count ?? 0));
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      const q = supabase
        .from("customers")
        .select("*")
        .order("lifetime_value", { ascending: false })
        .limit(50);

      (query.trim() ? q.or(`name.ilike.%${query.trim()}%,code.ilike.%${query.trim()}%`) : q).then(
        ({ data, error }) => {
          if (error) {
            toast("danger", "Couldn't load customers from Supabase");
            return;
          }
          setRows((data as CustomerRow[]) ?? []);
        }
      );
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const COLUMNS: TableColumn<CustomerRow>[] = [
    { key: "code", header: "Code", sortable: true },
    { key: "name", header: "Name", sortable: true },
    { key: "region", header: "Region", sortable: true, render: (r) => r.region ?? "—" },
    { key: "tier", header: "Tier", sortable: true, render: (r) => (r.tier ? <Badge status="info">{r.tier}</Badge> : "—") },
    { key: "lifetime_value", header: "Lifetime Value", sortable: true, render: (r) => formatCrore(r.lifetime_value) },
    { key: "account_owner", header: "Account Owner", sortable: true, render: (r) => r.account_owner ?? "—" },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Building2 size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Customers</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">Search or browse every real customer account, then open its full workspace</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Customers" value={totalCount === null ? "…" : String(totalCount)} trend="flat" trendLabel="Live count" />
        <StatCard label="Showing" value={rows === null ? "…" : String(rows.length)} trend="flat" trendLabel={query.trim() ? `Matching "${query.trim()}"` : "Top 50 by lifetime value"} />
        <StatCard label="Combined Lifetime Value (shown)" value={rows === null ? "…" : formatCrore(rows.reduce((sum, r) => sum + r.lifetime_value, 0))} trend="flat" trendLabel="Of rows currently shown" />
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2">
        <Search size={16} className="text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search by name or code — e.g. "IKEA" or "C03739"'
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {rows === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading customers…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No customers match &quot;{query}&quot;.</p>
        ) : (
          <Table columns={COLUMNS} rows={rows} onRowClick={(r) => router.push(`/workspaces/customer/${r.code}`)} />
        )}
      </div>
    </div>
  );
}
