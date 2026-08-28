"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Download } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { StepperNav, ComingSoonPane, type StepperStep } from "./StepperNav";
import { DetailsStep } from "./DetailsStep";
import { MeasurementStep } from "./MeasurementStep";
import type { ReportHeaderFields } from "./ReportFormFields";
import { buildSiteSurveyReportPdf, downloadBlob } from "@/lib/siteSurveyReport/pdfBuild";
import {
  REPORT_STATUS_LABEL,
  emptyFormData,
  emptyMeasurement,
  type FieldSourceKey,
  type SiteSurveyFormData,
  type SiteSurveyMeasurement,
  type SiteSurveyReportRow,
} from "@/lib/siteSurveyReport/types";

// Milestone 2 scope: the full stepper shell. Upload PDF / AI Extraction /
// Review / Photos aren't built yet (milestones 3-4) and Preview isn't
// built yet (milestone 5), so those five steps render a ComingSoonPane
// rather than pretending to work; Complete Details, Measurements, and
// Generate are fully real against Supabase + client-side PDF export. A
// manually-created report already lands on Complete Details (nothing
// upstream applies to it); a PDF-sourced report also lands there for now,
// since extraction doesn't exist yet -- once milestone 4 ships, the
// initial step for source==='pdf' reports will change to "upload".

const STATUS_BADGE: Record<SiteSurveyReportRow["status"], "neutral" | "info" | "warning" | "success"> = {
  draft: "neutral",
  extracting: "info",
  review_required: "warning",
  ready: "info",
  generated: "success",
};

type StepId = "upload" | "extraction" | "review" | "details" | "photos" | "measurements" | "preview" | "generate";

export function SiteSurveyReportEditorClient({ reportId }: { reportId: string }) {
  const { toast } = useToast();
  const [report, setReport] = useState<SiteSurveyReportRow | null>(null);
  const [step, setStep] = useState<StepId>("details");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        loadedRef.current = true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  // Debounced autosave: fires ~1.2s after the last edit, not on every
  // keystroke. Skipped on the initial load (loadedRef only flips true once
  // the fetch above resolves) and while an explicit save/generate is
  // already in flight.
  useEffect(() => {
    if (!loadedRef.current || !report) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(report, { silent: true });
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  async function persist(current: SiteSurveyReportRow, opts?: { silent?: boolean }) {
    setSaving(true);
    const { error } = await supabase
      .from("site_survey_reports")
      .update({
        store_name: current.store_name,
        address: current.address,
        sfo_id: current.sfo_id,
        program: current.program,
        survey_date: current.survey_date || null,
        surveyor_name: current.surveyor_name,
        form_data: current.form_data,
        measurement: current.measurement,
        field_sources: current.field_sources,
      })
      .eq("id", reportId);
    setSaving(false);
    if (error) {
      if (!opts?.silent) toast("danger", "Couldn't save this report");
      return;
    }
    if (!opts?.silent) toast("success", "Saved");
  }

  function updateHeader<K extends keyof ReportHeaderFields>(key: K, value: ReportHeaderFields[K]) {
    setReport((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  function updateFormData<K extends keyof SiteSurveyFormData>(key: K, value: SiteSurveyFormData[K]) {
    setReport((prev) => (prev ? { ...prev, form_data: { ...prev.form_data, [key]: value } } : prev));
  }
  function updateMeasurement<K extends keyof SiteSurveyMeasurement>(key: K, value: SiteSurveyMeasurement[K]) {
    setReport((prev) => (prev ? { ...prev, measurement: { ...prev.measurement, [key]: value } } : prev));
  }
  function onTouched(key: FieldSourceKey) {
    setReport((prev) => (prev ? { ...prev, field_sources: { ...prev.field_sources, [key]: "user" } } : prev));
  }

  async function handleStepChange(next: string) {
    if (report) await persist(report, { silent: true });
    setStep(next as StepId);
  }

  async function handleGenerate() {
    if (!report) return;
    setGenerating(true);
    try {
      await persist(report, { silent: true });
      const blob = await buildSiteSurveyReportPdf({
        storeName: report.store_name,
        address: report.address,
        sfoId: report.sfo_id,
        program: report.program,
        surveyDate: report.survey_date ?? "",
        surveyorName: report.surveyor_name,
        formData: report.form_data,
        measurement: report.measurement,
        photos: [], // real photos land in milestone 3
      });
      downloadBlob(blob, `${(report.store_name || "site-survey-report").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);

      const generated_at = new Date().toISOString();
      const { error } = await supabase.from("site_survey_reports").update({ status: "generated", generated_at }).eq("id", reportId);
      if (!error) {
        setReport((prev) => (prev ? { ...prev, status: "generated", generated_at } : prev));
      }
      toast("success", "PDF generated and downloaded");
    } catch {
      toast("danger", "Couldn't generate the PDF");
    } finally {
      setGenerating(false);
    }
  }

  if (!report) {
    return <p className="py-10 text-center text-sm text-ink-muted">Loading report…</p>;
  }

  const header: ReportHeaderFields = {
    store_name: report.store_name,
    address: report.address,
    sfo_id: report.sfo_id,
    program: report.program,
    survey_date: report.survey_date,
    surveyor_name: report.surveyor_name,
  };

  const detailsComplete = Boolean(report.store_name && report.sfo_id && report.surveyor_name);
  const measurementsComplete = report.measurement.visualWidthMm != null && report.measurement.visualHeightMm != null;

  const STEPS: StepperStep[] = [
    { id: "upload", label: "Upload PDF", disabled: true },
    { id: "extraction", label: "AI Extraction", disabled: true },
    { id: "review", label: "Review", disabled: true },
    { id: "details", label: "Complete Details", complete: detailsComplete },
    { id: "photos", label: "Photos", disabled: true },
    { id: "measurements", label: "Measurements", complete: measurementsComplete },
    { id: "preview", label: "Preview", disabled: true },
    { id: "generate", label: "Generate", complete: report.status === "generated" },
  ];

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
              {saving && <span className="text-xs text-ink-muted">Saving…</span>}
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

      <div className="mt-4">
        <StepperNav steps={STEPS} activeId={step} onSelect={handleStepChange} />
      </div>

      <div className="mt-6">
        {step === "upload" && (
          <ComingSoonPane
            title="Upload PDF — coming soon"
            note="Uploading an existing filled-in Site Survey PDF for AI extraction lands in a later update. For now, use Complete Details to fill the report in by hand."
          />
        )}
        {step === "extraction" && (
          <ComingSoonPane title="AI Extraction — coming soon" note="Automatic field extraction from an uploaded PDF lands in a later update." />
        )}
        {step === "review" && (
          <ComingSoonPane title="Review — coming soon" note="Reviewing AI-extracted fields lands alongside AI Extraction in a later update." />
        )}
        {step === "details" && (
          <DetailsStep
            header={header}
            onHeaderChange={updateHeader}
            formData={report.form_data}
            onFormDataChange={updateFormData}
            fieldSources={report.field_sources}
            onTouched={onTouched}
          />
        )}
        {step === "photos" && (
          <ComingSoonPane
            title="Photos — coming soon"
            note="Uploading and organizing site photos (main site, orientation, measurement) lands in a later update. The exported PDF shows placeholder slots until then."
          />
        )}
        {step === "measurements" && <MeasurementStep measurement={report.measurement} onChange={updateMeasurement} />}
        {step === "preview" && (
          <ComingSoonPane
            title="Preview — coming soon"
            note="An in-app preview lands in a later update. Use Generate to download the PDF directly for now."
          />
        )}
        {step === "generate" && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line py-16 text-center">
            <ClipboardCheck size={28} className="text-primary" />
            <p className="text-sm font-medium text-ink">Generate the Site Survey Report PDF</p>
            <p className="max-w-md text-xs text-ink-muted">
              Builds a PDF from the details and measurements entered so far. Photos will appear as placeholder slots until photo
              upload is added in a later update.
            </p>
            <Button onClick={handleGenerate} loading={generating} className="mt-2">
              <Download size={15} /> Generate &amp; Download PDF
            </Button>
            {report.generated_at && (
              <p className="text-xs text-ink-muted">Last generated {new Date(report.generated_at).toLocaleString()}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end border-t border-line pt-4">
        <Button variant="secondary" onClick={() => persist(report)} loading={saving}>
          Save
        </Button>
      </div>
    </div>
  );
}
