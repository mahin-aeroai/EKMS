"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type QuoteRow } from "@/lib/supabase";

const COLUMNS: TableColumn<QuoteRow>[] = [
  { key: "number", header: "Quote #", sortable: true },
  { key: "customer", header: "Customer", sortable: true },
  { key: "value", header: "Value", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

export default function QuotationsPage() {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("quotes")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load quotes from Supabase");
          return;
        }
        setQuotes(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const won = quotes?.filter((q) => q.status === "success").length ?? 0;
  const lost = quotes?.filter((q) => q.status === "danger").length ?? 0;
  const openQuotes = quotes ? quotes.length - won - lost : null;
  const winRate = won + lost > 0 ? `${Math.round((won / (won + lost)) * 100)}%` : "—";

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
              <Badge status="info">{quotes ? `${quotes.length} active` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Customers — quote pipeline across all accounts</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open Quotes" value={openQuotes === null ? "—" : String(openQuotes)} />
        <StatCard label="Win Rate" value={winRate} />
        <StatCard label="Avg Turnaround" value="—" />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Quote pipeline</h3>
        {quotes === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading quotes…</p>
        ) : quotes.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No quotes loaded yet.</p>
        ) : (
          <Table columns={COLUMNS} rows={quotes} onRowClick={(r) => toast("info", `Opened ${r.number}`)} />
        )}
      </div>
    </div>
  );
}
