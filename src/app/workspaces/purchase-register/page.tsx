"use client";

import { useEffect, useState } from "react";
import { Download, Receipt, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type PurchaseTransactionRow } from "@/lib/supabase";
import { formatCrore } from "@/lib/dashboard-queries";

// CSV export: fetches every row (paginated the same way the grand-total query
// below has to, since a single .select() is silently capped server-side well
// short of 9,528 rows) and triggers a browser download. This exists because
// the AI Copilot chat interface correctly can't dump thousands of rows as
// text -- a real export is the right tool for "give me everything" requests,
// not a chat reply. Columns match what was actually asked for: branch,
// purchase type (item_type -- Raw material/Finished goods/Service/etc,
// the closest concept this schema has to a "purchase type"), supplier,
// goods name, rate, value -- plus a few more for completeness (date, GRN No,
// category) since they're free once we're building a CSV anyway.
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function fetchAllPurchaseRows(
  onProgress: (fetched: number) => void
): Promise<PurchaseTransactionRow[]> {
  const rows: PurchaseTransactionRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("purchase_transactions")
      .select("*")
      .order("grn_date", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error || !data) break;
    rows.push(...(data as PurchaseTransactionRow[]));
    onProgress(rows.length);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

// Real, searchable purchase ledger — sourced from the MRN (goods-receipt)
// Register, Jan-Jun 2026, 9,528 line items. Unlike Customers/Job Orders,
// there's no single natural "entity" per row here (a purchase line item
// isn't a business object you manage over time the way a customer account
// is) — this stays a searchable/filterable ledger table, not a list+detail
// pair. See supabase-purchase-transactions-schema.sql for why MRN Register
// (not the PO register) was chosen as the source, why Taxable Value is the
// right spend figure, and why item_code/product_category is only ~90%
// populated (item master match rate) with no supplier_id FK at all (no real
// supplier master exists yet to link against).
export default function PurchaseRegisterPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PurchaseTransactionRow[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [grandTotal, setGrandTotal] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  async function handleExportCsv() {
    setExporting(true);
    setExportProgress(0);
    try {
      const allRows = await fetchAllPurchaseRows(setExportProgress);
      const header = ["Date", "GRN No.", "Branch", "Purchase Type", "Category", "Supplier", "Goods Name", "Item Code", "Quantity", "Rate", "Taxable Value"];
      const lines = [header.join(",")];
      for (const r of allRows) {
        lines.push(
          [
            r.grn_date ?? "",
            r.grn_no,
            r.location ?? "",
            r.item_type ?? "",
            r.product_category ?? "Uncategorized",
            r.supplier_name,
            r.item_name,
            r.item_code ?? "",
            r.quantity ?? "",
            r.rate ?? "",
            r.taxable_value,
          ]
            .map(csvEscape)
            .join(",")
        );
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `purchase-register-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("success", `Exported ${allRows.length.toLocaleString("en-IN")} purchase records to CSV`);
    } catch {
      toast("danger", "Couldn't export the purchase register — please try again");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    supabase
      .from("purchase_transactions")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setTotalCount(count ?? 0));

    // Grand total across the whole table (not just what's shown) -- paginated
    // the same way the AI Copilot route has to, since a single .select() call
    // is silently capped server-side well short of 9,528 rows.
    (async () => {
      let sum = 0;
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("purchase_transactions")
          .select("taxable_value")
          .range(from, from + pageSize - 1);
        if (error || !data) break;
        sum += data.reduce((s, r) => s + (r.taxable_value ?? 0), 0);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setGrandTotal(sum);
    })();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      const q = supabase
        .from("purchase_transactions")
        .select("*")
        .order("grn_date", { ascending: false })
        .limit(50);

      (query.trim()
        ? q.or(
            `item_name.ilike.%${query.trim()}%,supplier_name.ilike.%${query.trim()}%,product_category.ilike.%${query.trim()}%,item_code.ilike.%${query.trim()}%`
          )
        : q
      ).then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load the purchase register from Supabase");
          return;
        }
        setRows((data as PurchaseTransactionRow[]) ?? []);
      });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const COLUMNS: TableColumn<PurchaseTransactionRow>[] = [
    { key: "grn_date", header: "Date", sortable: true, render: (r) => (r.grn_date ? new Date(r.grn_date).toLocaleDateString("en-IN") : "—") },
    { key: "grn_no", header: "GRN No.", sortable: true },
    { key: "supplier_name", header: "Supplier", sortable: true },
    { key: "item_name", header: "Item", sortable: true },
    {
      key: "product_category",
      header: "Category",
      sortable: true,
      render: (r) => (r.product_category ? <Badge status="info">{r.product_category}</Badge> : <span className="text-ink-muted">Uncategorized</span>),
    },
    { key: "quantity", header: "Qty", sortable: true, render: (r) => (r.quantity ?? "—") },
    { key: "rate", header: "Rate", sortable: true, render: (r) => (r.rate != null ? `₹${r.rate.toLocaleString("en-IN")}` : "—") },
    { key: "taxable_value", header: "Taxable Value", sortable: true, render: (r) => `₹${r.taxable_value.toLocaleString("en-IN")}` },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Manufacturing" }, { label: "Purchase Register" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Receipt size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Purchase Register</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">Manufacturing — real goods-receipt ledger, Jan-Jun 2026 (Taxable Value)</p>
          </div>
        </div>
        <Button variant="secondary" size="md" loading={exporting} onClick={handleExportCsv}>
          <Download size={16} />
          {exporting ? `Exporting… ${exportProgress.toLocaleString("en-IN")}` : "Export all to CSV"}
        </Button>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Line Items" value={totalCount === null ? "…" : totalCount.toLocaleString("en-IN")} trend="flat" trendLabel="Jan-Jun 2026" />
        <StatCard label="Total Spend (Taxable Value)" value={grandTotal === null ? "…" : formatCrore(grandTotal)} trend="flat" trendLabel="Whole ledger, not just rows shown" />
        <StatCard label="Showing" value={rows === null ? "…" : String(rows.length)} trend="flat" trendLabel={query.trim() ? `Matching "${query.trim()}"` : "Most recent 50"} />
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2">
        <Search size={16} className="text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search by item, supplier, category, or item code — e.g. "Dovetail" or "RM-13006"'
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {rows === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading purchase register…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No purchase line items match &quot;{query}&quot;.</p>
        ) : (
          <Table columns={COLUMNS} rows={rows} />
        )}
      </div>
    </div>
  );
}
