"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import type { BadgeStatus, EstimateRow, EstimateLineItemRow } from "@mmdi/shared/rows";
import { generateEstimatePdf, downloadBlob, type EstimatePdfLine } from "@/lib/estimateBuilder/pdf";

// Every estimate ever saved in the Estimate Builder (Tools), all versions
// included — per the user's request to "post all estimate/quotations in
// with all version at Customer - Quotations for searching easily." This
// replaces the page's old read of the `quotes` demo table: `estimates` is
// the real, live data now, and Job No. (see supabase-estimate-builder-
// jobno-productno-migration.sql) is the primary search key the user asked
// for, alongside Quote # and customer name.

type QuotationRow = EstimateRow & { customers: { name: string } | null };

function rupee(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const STATUS_BADGE: Record<string, BadgeStatus> = {
  draft: "neutral",
  sent: "info",
  won: "success",
  lost: "danger",
};

export default function QuotationsPage() {
  const { toast } = useToast();
  const [estimates, setEstimates] = useState<QuotationRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("estimates")
      .select("*, customers(name)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load estimates from Supabase");
          return;
        }
        setEstimates((data as QuotationRow[]) ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client-side filter across the three things the user actually searches
  // by — job number, quote number, customer name — small enough dataset
  // that this doesn't need a server round trip per keystroke.
  const filtered = useMemo(() => {
    if (!estimates) return null;
    const q = query.trim().toLowerCase();
    if (!q) return estimates;
    return estimates.filter((e) => [e.quote_number, e.job_number, e.customers?.name].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [estimates, query]);

  async function downloadPdf(estimate: QuotationRow) {
    setDownloadingId(estimate.id);
    try {
      const { data: items, error } = await supabase
        .from("estimate_line_items")
        .select("*")
        .eq("estimate_id", estimate.id)
        .order("sort_order");
      if (error) throw error;
      const lines: EstimatePdfLine[] = ((items as EstimateLineItemRow[]) ?? []).map((i) => ({
        productNo: i.product_no,
        productName: i.product_name,
        designName: i.design_name,
        description: i.description,
        uom: i.uom,
        calcMode: i.calc_mode,
        widthCm: i.width_cm,
        heightCm: i.height_cm,
        quantity: i.quantity,
        sqftTotal: i.sqft_total,
        unitRate: i.unit_rate,
        transportationRate: i.transportation_rate,
        installationRate: i.installation_rate,
      }));
      const blob = await generateEstimatePdf({
        quoteNumber: estimate.quote_number ?? estimate.id,
        version: estimate.version,
        createdAt: estimate.created_at,
        customerName: estimate.customers?.name ?? "Customer",
        siteLegalEntityName: null,
        jobNumber: estimate.job_number,
        customerAddress: estimate.customer_address,
        customerGstin: estimate.customer_gstin,
        attentionPerson: estimate.attention_person,
        quoteSubject: estimate.quote_subject,
        gstPercent: estimate.gst_percent,
        jobCompletionTime: estimate.job_completion_time,
        deliveryCommitment: estimate.delivery_commitment,
        paymentTermsType: estimate.payment_terms_type ?? "net_days",
        paymentTermsDays: estimate.payment_terms_days,
        notes: estimate.notes,
        salespersonName: estimate.salesperson_name,
        salespersonDesignation: estimate.salesperson_designation,
        salespersonPhone: estimate.salesperson_phone,
        salespersonEmail: estimate.salesperson_email,
        lines,
      });
      downloadBlob(blob, `${estimate.quote_number ?? "estimate"}.pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't build this PDF";
      toast("danger", message);
    } finally {
      setDownloadingId(null);
    }
  }

  const COLUMNS: TableColumn<QuotationRow>[] = [
    { key: "quote_number", header: "Quote #", sortable: true, render: (r) => <span className="font-medium text-ink">{r.quote_number}</span> },
    { key: "job_number", header: "Job No.", sortable: true, render: (r) => r.job_number ?? "—" },
    { key: "version", header: "Version", render: (r) => <Badge status={r.version > 1 ? "info" : "neutral"}>{`V${r.version}`}</Badge> },
    { key: "customers", header: "Customer", sortable: true, render: (r) => r.customers?.name ?? "—" },
    { key: "status", header: "Status", render: (r) => <Badge status={STATUS_BADGE[r.status] ?? "neutral"}>{r.status}</Badge> },
    { key: "grand_total", header: "Grand total", sortable: true, render: (r) => rupee(r.grand_total) },
    {
      key: "id",
      header: "",
      render: (r) => (
        <Button variant="secondary" size="sm" loading={downloadingId === r.id} onClick={() => downloadPdf(r)}>
          <Download size={14} />
          PDF
        </Button>
      ),
    },
  ];

  const won = estimates?.filter((e) => e.status === "won").length ?? 0;
  const lost = estimates?.filter((e) => e.status === "lost").length ?? 0;
  const openQuotes = estimates ? estimates.length - won - lost : null;
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
              <Badge status="info">{estimates ? `${estimates.length} total` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Customers — every estimate ever generated, all versions, across all accounts</p>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open Quotes" value={openQuotes === null ? "—" : String(openQuotes)} />
        <StatCard label="Win Rate" value={winRate} />
        <StatCard label="Total Estimates" value={estimates ? String(estimates.length) : "—"} />
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3">
        <Search size={15} className="text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Job No., Quote #, or customer name…"
          className="h-10 w-full bg-transparent text-sm text-ink outline-none"
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Quote pipeline</h3>
        {filtered === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading estimates…</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {estimates?.length ? "No estimates match your search." : "No estimates saved yet — build one in the Estimate Builder (Tools)."}
          </p>
        ) : (
          <Table columns={COLUMNS} rows={filtered} />
        )}
      </div>
    </div>
  );
}
