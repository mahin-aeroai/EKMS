"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileUp, PenLine } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Table, type TableColumn } from "@/components/ui/Table";
import { supabase } from "@/lib/supabase";
import { REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/siteSurveyReport/types";

// Milestone 1 ("empty shell") scope: list what's there, and get a new
// report created and routed into the editor. Search/filters/stat cards/
// Preview/Download/Duplicate/Delete actions land in a later milestone (see
// the plan) -- this is deliberately minimal but fully real, not a mockup:
// every report shown here is a real site_survey_reports row, and "New
// Report" creates one for real.

interface ListRow {
  id: string;
  store_name: string;
  sfo_id: string;
  program: string;
  status: ReportStatus;
  created_at: string;
}

const STATUS_BADGE: Record<ReportStatus, "neutral" | "info" | "warning" | "success"> = {
  draft: "neutral",
  extracting: "info",
  review_required: "warning",
  ready: "info",
  generated: "success",
};

export function SiteSurveyReportsListClient() {
  const router = useRouter();
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase
      .from("site_survey_reports")
      .select("id, store_name, sfo_id, program, status, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as ListRow[] | null) ?? []));
  }, []);

  async function startNewReport(source: "pdf" | "manual") {
    setCreating(true);
    const { data, error } = await supabase
      .from("site_survey_reports")
      .insert({ source, status: "draft" })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) return;
    router.push(`/workspaces/site-survey-report/${data.id}`);
  }

  const COLUMNS: TableColumn<ListRow>[] = [
    { key: "store_name", header: "Site Name", render: (r) => r.store_name || "Untitled report" },
    { key: "sfo_id", header: "SFO ID", render: (r) => r.sfo_id || "—" },
    { key: "program", header: "Program", render: (r) => r.program || "—" },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge status={STATUS_BADGE[r.status]}>{REPORT_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: "created_at",
      header: "Created",
      render: (r) => new Date(r.created_at).toLocaleDateString(),
    },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Site Survey Reports" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <ClipboardCheck size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Site Survey Reports</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Upload an existing Apple Site Survey Report PDF for AI-assisted extraction, or start one manually, then
              export a matching PDF.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowNewDialog(true)} className="w-full sm:w-auto">
          New Report
        </Button>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface p-4">
        {rows === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading reports…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            No Site Survey Reports yet — click &ldquo;New Report&rdquo; to create the first one.
          </p>
        ) : (
          <Table columns={COLUMNS} rows={rows} onRowClick={(r) => router.push(`/workspaces/site-survey-report/${r.id}`)} />
        )}
      </div>

      <Dialog open={showNewDialog} onClose={() => setShowNewDialog(false)} title="New Site Survey Report">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={creating}
            onClick={() => startNewReport("pdf")}
            className="flex items-center gap-3 rounded-lg border border-line-strong p-3 text-left hover:bg-surface-sunken disabled:opacity-50"
          >
            <FileUp size={18} className="text-primary" />
            <span>
              <span className="block text-sm font-medium text-ink">Upload existing PDF</span>
              <span className="block text-xs text-ink-muted">AI reads it and fills in as many fields as it can.</span>
            </span>
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={() => startNewReport("manual")}
            className="flex items-center gap-3 rounded-lg border border-line-strong p-3 text-left hover:bg-surface-sunken disabled:opacity-50"
          >
            <PenLine size={18} className="text-primary" />
            <span>
              <span className="block text-sm font-medium text-ink">Start manually</span>
              <span className="block text-xs text-ink-muted">Fill in a blank form yourself.</span>
            </span>
          </button>
        </div>
      </Dialog>
    </div>
  );
}
