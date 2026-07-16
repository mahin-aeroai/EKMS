"use client";

import { useEffect, useState } from "react";
import { FileText, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type ApplelfgSiteSurveyRow } from "@/lib/supabase";

// Real viewer for the 333 LFG site survey PDFs (see
// supabase-lfg-site-surveys-schema.sql / upload-lfg-site-surveys.mjs) — the
// user explicitly wants to "see the PDF as it is", not a parsed/OCR'd
// version, so this page is deliberately a thin search-and-open UI, not a
// data table of extracted fields. The AI Copilot's find_site_survey tool can
// tell someone a survey exists and point them here, but rendering the PDF
// itself only happens through a real click here (chat is text-only).
//
// The bucket is private -- every "View PDF" click asks
// /api/lfg-surveys/signed-url for a short-lived signed URL (RLS-gated,
// same customers/finance groups as the rest of the LFG data) and opens that
// in a new tab, rather than ever exposing a permanent public link.
export default function SiteSurveysPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ApplelfgSiteSurveyRow[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("apple_lfg_site_surveys")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setTotalCount(count ?? null));
  }, []);

  // Debounced, runs on mount too (query starts as "" -- shows the most recent
  // 200 surveys before anyone types anything), same pattern as the Purchase
  // Register page's search.
  useEffect(() => {
    const handle = setTimeout(() => {
      const term = query.trim();
      let q = supabase
        .from("apple_lfg_site_surveys")
        .select("*")
        .order("store_name", { ascending: true })
        .limit(200);
      if (term) {
        q = q.or(
          `store_name.ilike.%${term}%,apple_store_id.ilike.%${term}%,chain.ilike.%${term}%,file_name.ilike.%${term}%`
        );
      }
      q.then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't search site surveys");
          return;
        }
        setRows((data as ApplelfgSiteSurveyRow[]) ?? []);
      });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function openPdf(row: ApplelfgSiteSurveyRow) {
    setOpeningId(row.id);
    try {
      const res = await fetch(`/api/lfg-surveys/signed-url?path=${encodeURIComponent(row.relative_path)}`);
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.message ?? "Couldn't get a link to this file");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      toast("danger", "Couldn't open this survey PDF");
    } finally {
      setOpeningId(null);
    }
  }

  const columns: TableColumn<ApplelfgSiteSurveyRow>[] = [
    { key: "store_name", header: "Site", sortable: true, render: (r) => r.store_name ?? r.file_name },
    { key: "chain", header: "Chain", sortable: true, render: (r) => <Badge status="neutral">{r.chain}</Badge> },
    { key: "apple_store_id", header: "Apple ID", sortable: true, render: (r) => r.apple_store_id ?? "—" },
    {
      key: "file_size_bytes",
      header: "Size",
      render: (r) => (r.file_size_bytes ? `${(r.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : "—"),
    },
    {
      key: "id",
      header: "",
      render: (r) => (
        <Button variant="secondary" size="sm" loading={openingId === r.id} onClick={() => openPdf(r)}>
          View PDF
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers" }, { label: "Site Surveys" }]} />

      <div className="mt-4 flex items-start gap-4 border-b border-line pb-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <FileText size={22} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">LFG Site Surveys</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Search Apple LFG site survey reports and open the original PDF
          </p>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Survey PDFs on file" value={totalCount !== null ? totalCount.toLocaleString("en-IN") : "…"} trend="flat" trendLabel="Across all chains" />
        <StatCard label="Showing" value={rows ? rows.length.toLocaleString("en-IN") : "…"} trend="flat" trendLabel={query ? `Matching "${query}"` : "Most recent 200"} />
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-md border border-line-strong bg-surface px-3">
        <Search size={16} className="text-ink-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by store, city, chain, or Apple ID..."
          className="h-10 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {rows === null || rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {rows === null ? "Loading…" : "No survey PDFs match that search."}
          </p>
        ) : (
          <Table columns={columns} rows={rows} />
        )}
      </div>
    </div>
  );
}
