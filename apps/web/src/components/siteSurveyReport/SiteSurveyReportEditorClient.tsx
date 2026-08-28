"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import {
  REPORT_STATUS_LABEL,
  emptyFormData,
  emptyMeasurement,
  type SiteSurveyReportRow,
} from "@/lib/siteSurveyReport/types";

// Milestone 1 ("empty shell") scope: prove the create -> load -> edit ->
// save loop works end to end against real Supabase rows, with just the
// header identity fields every later step will build on top of. The full
// stepper (Upload PDF -> AI Extraction -> Review -> Details -> Photos ->
// Measurements -> Preview -> Generate) replaces this in the next
// milestone -- see the plan file for the full sequence.

const STATUS_BADGE: Record<SiteSurveyReportRow["status"], "neutral" | "info" | "warning" | "success"> = {
  draft: "neutral",
  extracting: "info",
  review_required: "warning",
  ready: "info",
  generated: "success",
};

export function SiteSurveyReportEditorClient({ reportId }: { reportId: string }) {
  const { toast } = useToast();
  const [report, setReport] = useState<SiteSurveyReportRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("site_survey_reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          toast("danger", "Couldn't load this report");
          return;
        }
        setReport({
          ...(data as SiteSurveyReportRow),
          form_data: { ...emptyFormData(), ...(data.form_data ?? {}) },
          measurement: { ...emptyMeasurement(), ...(data.measurement ?? {}) },
          field_sources: data.field_sources ?? {},
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  function updateField<K extends keyof SiteSurveyReportRow>(key: K, value: SiteSurveyReportRow[K]) {
    setReport((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!report) return;
    setSaving(true);
    const { error } = await supabase
      .from("site_survey_reports")
      .update({
        store_name: report.store_name,
        address: report.address,
        sfo_id: report.sfo_id,
        program: report.program,
        survey_date: report.survey_date || null,
        surveyor_name: report.surveyor_name,
      })
      .eq("id", reportId);
    setSaving(false);
    if (error) {
      toast("danger", "Couldn't save this report");
      return;
    }
    toast("success", "Saved");
  }

  if (!report) {
    return <p className="py-10 text-center text-sm text-ink-muted">Loading report…</p>;
  }

  return (
    <div>
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "Site Survey Reports", href: "/workspaces/site-survey-report" }, { label: report.store_name || "Untitled report" }]}
      />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <ClipboardCheck size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{report.store_name || "Untitled report"}</h1>
              <Badge status={STATUS_BADGE[report.status]}>{REPORT_STATUS_LABEL[report.status]}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              {report.source === "pdf" ? "Created from an uploaded Site Survey PDF" : "Created manually"}
            </p>
          </div>
        </div>
        <Link
          href="/workspaces/site-survey-report"
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-sunken sm:w-auto"
        >
          <ArrowLeft size={14} /> Back to Site Survey Reports
        </Link>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        <p className="mb-4 text-sm text-ink-secondary">
          The full step-by-step report builder (AI extraction review, photos, measurements, preview, PDF export)
          lands in the next update. For now, this saves the report&apos;s basic identity so the flow is already
          real, not a mockup.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Site / Store Name">
            <input
              value={report.store_name}
              onChange={(e) => updateField("store_name", e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="SFO ID">
            <input
              value={report.sfo_id}
              onChange={(e) => updateField("sfo_id", e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input
              value={report.address}
              onChange={(e) => updateField("address", e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="Program">
            <input
              value={report.program}
              onChange={(e) => updateField("program", e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="Surveyor">
            <input
              value={report.surveyor_name}
              onChange={(e) => updateField("surveyor_name", e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </Field>
          <Field label="Survey Date">
            <input
              type="date"
              value={report.survey_date ?? ""}
              onChange={(e) => updateField("survey_date", e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </Field>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-brand hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}
