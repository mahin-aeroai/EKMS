"use client";

import { useEffect, useState } from "react";
import { Download, Target } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { formatCrore } from "@/lib/dashboard-queries";

// Real "sales by rep, with all their customers, for a period" report — the
// user asked for exactly this after finding the AI Copilot chat can already
// answer a single instance of it (e.g. "Jayaraj's customers in June") but
// wanted a proper reusable page instead of asking chat each time. Pick a
// sales person and an optional date range, see every customer they sold to
// with totals, sorted by value, downloadable as CSV.
//
// Every fetch here uses a paginated .range() loop, not a bare .select() —
// Supabase/PostgREST's server-side max-rows setting silently clamps a
// single request well short of this table's real size (see
// src/app/api/ai-copilot/route.ts's fetchAllRows comment for the full
// history of that bug and why it can't be trusted to just work with a
// plain .limit()).

interface CustomerBreakdownRow {
  id: string; // Table requires a stable id -- customer_name doubles as one since rows are grouped by it
  customer_name: string;
  transaction_count: number;
  total_taxable_value: number;
}

async function fetchAllRows<T>(buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export default function SalesByRepPage() {
  const { toast } = useToast();
  const [salesPeople, setSalesPeople] = useState<string[] | null>(null);
  const [selectedRep, setSelectedRep] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<CustomerBreakdownRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Populate the sales-person dropdown from real distinct values in the
  // ledger (not a hardcoded list) — paginated fetch of just the one column,
  // deduped client-side, since Supabase's client has no server-side DISTINCT.
  useEffect(() => {
    (async () => {
      const all = await fetchAllRows<{ sales_manager: string | null }>((from, to) =>
        supabase.from("sales_transactions").select("sales_manager").range(from, to)
      );
      const unique = Array.from(new Set(all.map((r) => r.sales_manager).filter((v): v is string => !!v))).sort();
      setSalesPeople(unique);
    })();
  }, []);

  async function runReport() {
    if (!selectedRep) return;
    setLoading(true);
    setRows(null);
    try {
      const all = await fetchAllRows<{ customer_name: string | null; taxable_value: number; invoice_date: string | null }>((from, to) => {
        let q = supabase
          .from("sales_transactions")
          .select("customer_name, taxable_value, invoice_date")
          .eq("sales_manager", selectedRep)
          .range(from, to);
        if (dateFrom) q = q.gte("invoice_date", dateFrom);
        if (dateTo) q = q.lte("invoice_date", dateTo);
        return q;
      });
      const groups = new Map<string, { total: number; count: number }>();
      for (const r of all) {
        const name = r.customer_name ?? "Unknown";
        const g = groups.get(name) ?? { total: 0, count: 0 };
        g.total += r.taxable_value ?? 0;
        g.count += 1;
        groups.set(name, g);
      }
      const breakdown = [...groups.entries()]
        .map(([customer_name, g]) => ({ id: customer_name, customer_name, transaction_count: g.count, total_taxable_value: g.total }))
        .sort((a, b) => b.total_taxable_value - a.total_taxable_value);
      setRows(breakdown);
    } catch {
      toast("danger", "Couldn't load the sales-by-rep report from Supabase");
    } finally {
      setLoading(false);
    }
  }

  function csvEscape(value: string | number): string {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async function handleExportCsv() {
    if (!rows || !selectedRep) return;
    setExporting(true);
    try {
      const header = ["Sales Person", "Customer", "Transactions", "Total Taxable Value"];
      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push([selectedRep, r.customer_name, r.transaction_count, r.total_taxable_value].map(csvEscape).join(","));
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const periodLabel = dateFrom || dateTo ? `-${dateFrom || "start"}-to-${dateTo || "end"}` : "";
      a.download = `sales-by-rep-${selectedRep.replace(/\s+/g, "-")}${periodLabel}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("success", `Exported ${rows.length.toLocaleString("en-IN")} customer rows to CSV`);
    } finally {
      setExporting(false);
    }
  }

  const totalSales = rows?.reduce((sum, r) => sum + r.total_taxable_value, 0) ?? 0;
  const totalTxns = rows?.reduce((sum, r) => sum + r.transaction_count, 0) ?? 0;

  const COLUMNS: TableColumn<CustomerBreakdownRow>[] = [
    { key: "customer_name", header: "Customer", sortable: true },
    { key: "transaction_count", header: "Transactions", sortable: true },
    { key: "total_taxable_value", header: "Total Taxable Value", sortable: true, render: (r) => `₹${r.total_taxable_value.toLocaleString("en-IN")}` },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers" }, { label: "Sales by Rep" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Target size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Sales by Rep</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">Customers — pick a sales person and period to see every customer they sold to</p>
          </div>
        </div>
        {rows && rows.length > 0 && (
          <Button variant="secondary" size="md" loading={exporting} onClick={handleExportCsv}>
            <Download size={16} />
            Export to CSV
          </Button>
        )}
      </div>

      <div className="my-6 flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-end sm:gap-6">
        <div className="w-full sm:w-64">
          <Dropdown
            label="Sales person"
            options={(salesPeople ?? []).map((name) => ({ value: name, label: name }))}
            value={selectedRep}
            onChange={(v) => setSelectedRep(v as string)}
            placeholder={salesPeople === null ? "Loading…" : "Select a sales person"}
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-40">
          <label className="text-xs font-medium text-ink-secondary">From (optional)</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-40">
          <label className="text-xs font-medium text-ink-secondary">To (optional)</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
          />
        </div>
        <Button variant="primary" size="md" loading={loading} disabled={!selectedRep} onClick={runReport}>
          Run report
        </Button>
      </div>

      {rows !== null && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Sales (Taxable Value)" value={formatCrore(totalSales)} trend="flat" trendLabel={selectedRep} />
            <StatCard label="Customers" value={String(rows.length)} trend="flat" trendLabel={dateFrom || dateTo ? `${dateFrom || "…"} to ${dateTo || "…"}` : "Full period"} />
            <StatCard label="Transactions" value={totalTxns.toLocaleString("en-IN")} trend="flat" trendLabel="Across all customers shown" />
          </div>

          <div className="rounded-lg border border-line bg-surface p-4">
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">No sales found for {selectedRep} in this period.</p>
            ) : (
              <Table columns={COLUMNS} rows={rows} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
