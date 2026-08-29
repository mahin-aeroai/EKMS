"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck, Copy, Download, Eye, FileUp, PenLine, Search, Sparkles, Trash2 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { useUserRole } from "@/lib/UserRoleContext";
import { buildSiteSurveyReportPdf, downloadBlob, type SurveyPhotoInput } from "@/lib/siteSurveyReport/pdfBuild";
import { fetchSfProTextFontBytes } from "@/lib/pdfFonts";
import {
  REPORT_STATUS_LABEL,
  emptyFormData,
  normalizeMeasurements,
  type ReportStatus,
  type SiteSurveyFormData,
  type SiteSurveyPhotoRow,
  type SiteSurveyReportRow,
} from "@/lib/siteSurveyReport/types";

// Milestone 5 scope: same dashboard shape as the Quotations listing page
// (stat row, search, filters, a Table with row actions) instead of
// milestone 1's minimal "list + New Report" placeholder. Preview/Download/
// Duplicate work straight from the list without opening the editor --
// each fetches that one report's full row + photos on demand (the list
// query itself only pulls the light columns the table/stat cards/filters
// actually need) and reuses the exact same buildSiteSurveyReportPdf path
// the editor's own Preview/Generate steps use.

interface ListRow {
  id: string;
  store_name: string;
  address: string;
  sfo_id: string;
  program: string;
  surveyor_name: string;
  survey_date: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const STATUS_BADGE: Record<ReportStatus, "neutral" | "info" | "warning" | "success"> = {
  draft: "neutral",
  extracting: "info",
  review_required: "warning",
  ready: "info",
  generated: "success",
};

const STATUS_OPTIONS: ReportStatus[] = ["draft", "extracting", "review_required", "ready", "generated"];

export function SiteSurveyReportsListClient() {
  const router = useRouter();
  const { toast } = useToast();
  const role = useUserRole();
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [surveyorFilter, setSurveyorFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  function loadRows() {
    supabase
      .from("site_survey_reports")
      .select("id, store_name, address, sfo_id, program, surveyor_name, survey_date, status, created_at, updated_at, created_by")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as ListRow[] | null) ?? []));
  }

  useEffect(() => {
    loadRows();
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const programs = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.program).filter(Boolean))).sort(), [rows]);
  const surveyors = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.surveyor_name).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.store_name, r.address, r.sfo_id, r.surveyor_name].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
      if (programFilter && r.program !== programFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (surveyorFilter && r.surveyor_name !== surveyorFilter) return false;
      if (fromDate && (!r.survey_date || r.survey_date < fromDate)) return false;
      if (toDate && (!r.survey_date || r.survey_date > toDate)) return false;
      return true;
    });
  }, [rows, query, programFilter, statusFilter, surveyorFilter, fromDate, toDate]);

  async function startNewReport(source: "pdf" | "manual") {
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    // Manually-started reports pre-fill from the saved defaults template
    // (site_survey_report_field_defaults) so a person isn't re-typing the
    // same standard answers on every report -- deliberately NOT done for
    // PDF-sourced reports, which land here with empty form_data and get
    // their first, unobstructed pass from AI extraction instead (see
    // that migration's own header comment for why).
    let form_data: SiteSurveyFormData | undefined;
    if (source === "manual") {
      const { data: defaults } = await supabase.from("site_survey_report_field_defaults").select("form_data").eq("id", true).maybeSingle();
      if (defaults?.form_data) form_data = { ...emptyFormData(), ...(defaults.form_data as Partial<SiteSurveyFormData>) };
    }
    const { data, error } = await supabase
      .from("site_survey_reports")
      .insert({ source, status: "draft", created_by: userData?.user?.id ?? null, ...(form_data ? { form_data } : {}) })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast("danger", "Couldn't create a new report");
      return;
    }
    router.push(`/workspaces/site-survey-report/${data.id}`);
  }

  async function fetchFullReportAndPhotos(rowId: string): Promise<{ report: SiteSurveyReportRow; photos: SiteSurveyPhotoRow[] } | null> {
    const [{ data: reportData, error: reportErr }, { data: photoData }] = await Promise.all([
      supabase.from("site_survey_reports").select("*").eq("id", rowId).maybeSingle(),
      supabase.from("site_survey_photos").select("*").eq("report_id", rowId).order("sort_order", { ascending: true }),
    ]);
    if (reportErr || !reportData) return null;
    return {
      report: {
        ...(reportData as SiteSurveyReportRow),
        form_data: { ...emptyFormData(), ...(reportData.form_data ?? {}) },
        measurements: normalizeMeasurements(reportData.measurements),
      },
      photos: (photoData as SiteSurveyPhotoRow[] | null) ?? [],
    };
  }

  async function fetchPhotoInputsForRow(reportId: string, photos: SiteSurveyPhotoRow[]): Promise<SurveyPhotoInput[]> {
    const results = await Promise.all(
      photos.map(async (photo) => {
        try {
          const signedRes = await fetch(`/api/site-survey-reports/${reportId}/photos/${photo.id}/signed-url`);
          const signedData = await signedRes.json();
          if (!signedRes.ok || !signedData.url) return null;
          const imageRes = await fetch(signedData.url);
          if (!imageRes.ok) return null;
          const bytes = new Uint8Array(await imageRes.arrayBuffer());
          const input: SurveyPhotoInput = { id: photo.id, bytes, format: "jpg", category: photo.category, caption: photo.caption, annotation: photo.annotation };
          return input;
        } catch {
          return null;
        }
      })
    );
    return results.filter((p): p is SurveyPhotoInput => p !== null);
  }

  async function buildPdfForRow(rowId: string): Promise<Blob | null> {
    const data = await fetchFullReportAndPhotos(rowId);
    if (!data) return null;
    const [photoInputs, brandFonts] = await Promise.all([fetchPhotoInputsForRow(rowId, data.photos), fetchSfProTextFontBytes()]);
    return buildSiteSurveyReportPdf(
      {
        storeName: data.report.store_name,
        address: data.report.address,
        sfoId: data.report.sfo_id,
        program: data.report.program,
        surveyDate: data.report.survey_date ?? "",
        surveyorName: data.report.surveyor_name,
        formData: data.report.form_data,
        measurements: data.report.measurements,
        photos: photoInputs,
      },
      brandFonts
    );
  }

  async function handlePreview(row: ListRow) {
    setBusyRowId(row.id);
    try {
      const blob = await buildPdfForRow(row.id);
      if (!blob) {
        toast("danger", "Couldn't load this report");
        return;
      }
      // Not revoked here -- the new tab needs the URL to stay valid while
      // it's open; left to the browser to reclaim when that tab closes.
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast("danger", "Couldn't build a preview");
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleDownload(row: ListRow) {
    setBusyRowId(row.id);
    try {
      const blob = await buildPdfForRow(row.id);
      if (!blob) {
        toast("danger", "Couldn't load this report");
        return;
      }
      downloadBlob(blob, `${(row.store_name || "site-survey-report").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
    } catch {
      toast("danger", "Couldn't build the PDF");
    } finally {
      setBusyRowId(null);
    }
  }

  async function handleDuplicate(row: ListRow) {
    setBusyRowId(row.id);
    try {
      const data = await fetchFullReportAndPhotos(row.id);
      if (!data) {
        toast("danger", "Couldn't load this report");
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase
        .from("site_survey_reports")
        .insert({
          source: "manual",
          status: "draft",
          store_name: data.report.store_name ? `${data.report.store_name} (Copy)` : "",
          address: data.report.address,
          sfo_id: data.report.sfo_id,
          program: data.report.program,
          survey_date: data.report.survey_date,
          surveyor_name: data.report.surveyor_name,
          form_data: data.report.form_data,
          measurements: data.report.measurements,
          field_sources: {},
          created_by: userData?.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        toast("danger", "Couldn't duplicate this report");
        return;
      }
      if (data.photos.length > 0) {
        // Safe to point the new report's photo rows at the SAME R2 object
        // as the original -- this app never deletes the underlying R2
        // object when a photo row is deleted (see PhotosStep.tsx), so two
        // report rows referencing one object is not a shared-mutable-state
        // risk; deleting either report leaves the other's photos intact.
        await supabase.from("site_survey_photos").insert(
          data.photos.map((p) => ({
            report_id: inserted.id,
            category: p.category,
            relative_path: p.relative_path,
            caption: p.caption,
            sort_order: p.sort_order,
            source: p.source,
            original_page_number: p.original_page_number,
            annotation: p.annotation,
          }))
        );
      }
      toast("success", "Report duplicated");
      loadRows();
      router.push(`/workspaces/site-survey-report/${inserted.id}`);
    } catch {
      toast("danger", "Couldn't duplicate this report");
    } finally {
      setBusyRowId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("site_survey_reports").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      toast("danger", `Couldn't delete: ${error.message}`);
      return;
    }
    toast("success", "Report deleted");
    loadRows();
  }

  // Mirrors the RLS policies exactly: admin can delete any report; anyone
  // else can only delete their OWN report, and only while it's still a
  // draft (see supabase-site-survey-reports-own-draft-delete-migration.sql).
  function canDeleteRow(row: ListRow): boolean {
    if (role === "admin") return true;
    return row.status === "draft" && row.created_by !== null && row.created_by === currentUserId;
  }

  const COLUMNS: TableColumn<ListRow>[] = [
    { key: "store_name", header: "Site Name", sortable: true, render: (r) => r.store_name || "Untitled report" },
    { key: "sfo_id", header: "SFO ID", render: (r) => r.sfo_id || "—" },
    { key: "program", header: "Program", render: (r) => r.program || "—" },
    { key: "survey_date", header: "Survey Date", render: (r) => (r.survey_date ? new Date(r.survey_date).toLocaleDateString() : "—") },
    { key: "surveyor_name", header: "Surveyor", render: (r) => r.surveyor_name || "—" },
    { key: "status", header: "Status", render: (r) => <Badge status={STATUS_BADGE[r.status]}>{REPORT_STATUS_LABEL[r.status]}</Badge> },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: "updated_at", header: "Last Updated", render: (r) => new Date(r.updated_at).toLocaleDateString() },
    {
      key: "id",
      header: "Actions",
      render: (r) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="icon" size="sm" aria-label="Preview" loading={busyRowId === r.id} onClick={() => handlePreview(r)}>
            <Eye size={14} />
          </Button>
          <Button variant="icon" size="sm" aria-label="Download PDF" loading={busyRowId === r.id} onClick={() => handleDownload(r)}>
            <Download size={14} />
          </Button>
          <Button variant="icon" size="sm" aria-label="Duplicate" loading={busyRowId === r.id} onClick={() => handleDuplicate(r)}>
            <Copy size={14} />
          </Button>
          {canDeleteRow(r) && (
            <Button variant="icon" size="sm" aria-label="Delete" onClick={() => setDeleteTarget(r)}>
              <Trash2 size={14} className="text-danger" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  function statusCount(status: ReportStatus) {
    return (rows ?? []).filter((r) => r.status === status).length;
  }

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
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/workspaces/site-survey-report/defaults"
            className="flex items-center justify-center gap-1.5 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-sunken"
          >
            <Sparkles size={14} /> Default Answers
          </Link>
          <Button onClick={() => setShowNewDialog(true)} className="w-full sm:w-auto">
            New Report
          </Button>
        </div>
      </div>

      <div className="my-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Draft" value={rows ? String(statusCount("draft")) : "—"} />
        <StatCard label="Review Required" value={rows ? String(statusCount("review_required")) : "—"} />
        <StatCard label="Ready" value={rows ? String(statusCount("ready")) : "—"} />
        <StatCard label="Generated" value={rows ? String(statusCount("generated")) : "—"} />
      </div>

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3">
          <Search size={15} className="text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by site, address, SFO ID, or surveyor…"
            className="h-10 w-full bg-transparent text-sm text-ink outline-none"
          />
        </div>
        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">All Programs</option>
          {programs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {REPORT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={surveyorFilter}
          onChange={(e) => setSurveyorFilter(e.target.value)}
          className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">All Surveyors</option>
          {surveyors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
        <label className="flex items-center gap-1.5">
          Survey date from
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded border border-line-strong bg-surface px-2 py-1 text-ink focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5">
          to
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded border border-line-strong bg-surface px-2 py-1 text-ink focus:border-primary focus:outline-none"
          />
        </label>
        {(programFilter || statusFilter || surveyorFilter || fromDate || toDate || query) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setProgramFilter("");
              setStatusFilter("");
              setSurveyorFilter("");
              setFromDate("");
              setToDate("");
            }}
            className="text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {filtered === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading reports…</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {rows?.length ? "No reports match your search/filters." : "No Site Survey Reports yet — click “New Report” to create the first one."}
          </p>
        ) : (
          <Table columns={COLUMNS} rows={filtered} onRowClick={(r) => router.push(`/workspaces/site-survey-report/${r.id}`)} />
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

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this report?"
        destructive
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onConfirm={confirmDelete}
      >
        <p>
          This permanently deletes &ldquo;{deleteTarget?.store_name || "Untitled report"}&rdquo; and its photos. This can&apos;t be
          undone.
        </p>
      </Dialog>
    </div>
  );
}
