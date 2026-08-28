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
import { UploadStep } from "./UploadStep";
import { ExtractionStep } from "./ExtractionStep";
import { ReviewStep } from "./ReviewStep";
import { DetailsStep } from "./DetailsStep";
import { MeasurementStep } from "./MeasurementStep";
import { PhotosStep } from "./PhotosStep";
import type { ReportHeaderFields } from "./ReportFormFields";
import { buildSiteSurveyReportPdf, downloadBlob, type SurveyPhotoInput } from "@/lib/siteSurveyReport/pdfBuild";
import {
  REPORT_STATUS_LABEL,
  emptyFormData,
  emptyMeasurement,
  type FieldSourceKey,
  type PhotoCategory,
  type SiteSurveyFormData,
  type SiteSurveyMeasurement,
  type SiteSurveyPhotoRow,
  type SiteSurveyReportRow,
} from "@/lib/siteSurveyReport/types";

// Milestone 4 adds the PDF-extraction path: Upload PDF -> AI Extraction ->
// Review are now real (see UploadStep/ExtractionStep/ReviewStep.tsx),
// completing the flow milestone 3 left as "coming soon". Preview still
// isn't built (milestone 5). A manually-created report still lands on
// Complete Details (nothing upstream applies to it); a PDF-sourced report
// now lands on Upload PDF if it has no source PDF yet, on AI Extraction if
// it has one but hasn't been reviewed yet, or on Review once extraction has
// run -- decided once, right after the report loads (see the
// initialStepRef effect), not re-decided on every render so a person's own
// step navigation is never fought.

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
  const [photos, setPhotos] = useState<SiteSurveyPhotoRow[]>([]);
  const [step, setStep] = useState<StepId>("details");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadingSourcePdf, setUploadingSourcePdf] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [hasRunExtraction, setHasRunExtraction] = useState(false);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [pageHints, setPageHints] = useState<{ page: number; likelyCategory: PhotoCategory; note: string }[]>([]);
  const loadedRef = useRef(false);
  const initialStepChosenRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reloadPhotos() {
    supabase
      .from("site_survey_photos")
      .select("*")
      .eq("report_id", reportId)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setPhotos((data as SiteSurveyPhotoRow[] | null) ?? []));
  }

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
          extraction_meta: data.extraction_meta ?? null,
        });
        if (data.extraction_meta) {
          setFlagged(data.extraction_meta.flagged ?? []);
          setPageHints(data.extraction_meta.pageHints ?? []);
        }
        loadedRef.current = true;
      });
    reloadPhotos();
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

  // Chooses the right landing step exactly once, right after the report
  // first loads -- never again, so a person's own navigation afterward is
  // never overridden by this effect re-running.
  useEffect(() => {
    if (!report || initialStepChosenRef.current) return;
    initialStepChosenRef.current = true;
    if (report.source !== "pdf") return; // manual reports already default to "details"
    // Any status past "draft" means extraction has run at least once in an
    // earlier session -- this flag only starts false because it's derived
    // client state, not persisted; it must still reflect reality on load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (report.status !== "draft") setHasRunExtraction(true);
    if (!report.source_pdf_relative_path) {
      setStep("upload");
    } else if (report.status === "draft" || report.status === "extracting") {
      setStep("extraction");
    } else {
      setStep("review");
    }
  }, [report]);

  async function handleSourcePdfUpload(file: File) {
    setUploadingSourcePdf(true);
    try {
      const uploadRes = await fetch(`/api/site-survey-reports/${reportId}/source-pdf/upload-url`, { method: "POST" });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        toast("danger", uploadData.message || uploadData.error || "Couldn't get an upload link");
        return;
      }
      const putRes = await fetch(uploadData.url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file });
      if (!putRes.ok) {
        toast("danger", "Upload to storage failed");
        return;
      }
      const { error } = await supabase
        .from("site_survey_reports")
        .update({ source_pdf_relative_path: uploadData.relative_path })
        .eq("id", reportId);
      if (error) {
        toast("danger", `Uploaded, but couldn't record it: ${error.message}`);
        return;
      }
      setReport((prev) => (prev ? { ...prev, source_pdf_relative_path: uploadData.relative_path } : prev));
      toast("success", "PDF uploaded");
    } catch {
      toast("danger", "Couldn't upload that PDF");
    } finally {
      setUploadingSourcePdf(false);
    }
  }

  async function handleRunExtraction() {
    if (!report?.source_pdf_relative_path) return;
    setExtracting(true);
    setExtractionError(null);
    try {
      const res = await fetch(`/api/site-survey-reports/${reportId}/extract`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setExtractionError(data.message || data.error || "Extraction failed");
        return;
      }
      setReport((prev) =>
        prev
          ? {
              ...prev,
              store_name: data.report.store_name,
              address: data.report.address,
              sfo_id: data.report.sfo_id,
              program: data.report.program,
              survey_date: data.report.survey_date,
              surveyor_name: data.report.surveyor_name,
              form_data: { ...emptyFormData(), ...data.report.form_data },
              measurement: { ...emptyMeasurement(), ...data.report.measurement },
              field_sources: data.report.field_sources,
              extraction_meta: data.report.extraction_meta,
              status: data.report.status,
            }
          : prev
      );
      setFlagged(data.flagged ?? []);
      setPageHints(data.pageHints ?? []);
      setHasRunExtraction(true);
      toast("success", "Extraction complete — review the results below");
      setStep("review");
    } catch {
      setExtractionError("Couldn't reach the extraction service");
    } finally {
      setExtracting(false);
    }
  }

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

  async function fetchPhotoInputs(): Promise<SurveyPhotoInput[]> {
    const results = await Promise.all(
      photos.map(async (photo) => {
        try {
          const signedRes = await fetch(`/api/site-survey-reports/${reportId}/photos/${photo.id}/signed-url`);
          const signedData = await signedRes.json();
          if (!signedRes.ok || !signedData.url) return null;
          const imageRes = await fetch(signedData.url);
          if (!imageRes.ok) return null;
          const bytes = new Uint8Array(await imageRes.arrayBuffer());
          const input: SurveyPhotoInput = {
            bytes,
            format: "jpg",
            category: photo.category,
            caption: photo.caption,
            annotation: photo.annotation,
          };
          return input;
        } catch {
          return null;
        }
      })
    );
    return results.filter((p): p is SurveyPhotoInput => p !== null);
  }

  async function handleGenerate() {
    if (!report) return;
    setGenerating(true);
    try {
      await persist(report, { silent: true });
      const photoInputs = await fetchPhotoInputs();
      const blob = await buildSiteSurveyReportPdf({
        storeName: report.store_name,
        address: report.address,
        sfoId: report.sfo_id,
        program: report.program,
        surveyDate: report.survey_date ?? "",
        surveyorName: report.surveyor_name,
        formData: report.form_data,
        measurement: report.measurement,
        photos: photoInputs,
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

  const isPdfSourced = report.source === "pdf";
  const STEPS: StepperStep[] = [
    { id: "upload", label: "Upload PDF", disabled: !isPdfSourced, complete: Boolean(report.source_pdf_relative_path) },
    { id: "extraction", label: "AI Extraction", disabled: !isPdfSourced || !report.source_pdf_relative_path, complete: hasRunExtraction },
    { id: "review", label: "Review", disabled: !isPdfSourced || !hasRunExtraction, complete: report.status !== "review_required" && hasRunExtraction },
    { id: "details", label: "Complete Details", complete: detailsComplete },
    { id: "photos", label: "Photos", complete: photos.length > 0 },
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
          <UploadStep
            sourcePdfName={report.source_pdf_relative_path}
            uploading={uploadingSourcePdf}
            onUpload={handleSourcePdfUpload}
            onContinue={() => setStep("extraction")}
          />
        )}
        {step === "extraction" && (
          <ExtractionStep
            canRun={Boolean(report.source_pdf_relative_path)}
            running={extracting}
            error={extractionError}
            hasRunBefore={hasRunExtraction}
            onRun={handleRunExtraction}
          />
        )}
        {step === "review" && (
          <ReviewStep
            reportId={reportId}
            header={header}
            onHeaderChange={updateHeader}
            formData={report.form_data}
            onFormDataChange={updateFormData}
            fieldSources={report.field_sources}
            onTouched={onTouched}
            flagged={flagged}
            pageHints={pageHints}
            photos={photos}
            onPhotoAdded={reloadPhotos}
          />
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
        {step === "photos" && <PhotosStep reportId={reportId} photos={photos} onReload={reloadPhotos} />}
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
              Builds a PDF from the details, photos, and measurements entered so far. Categories with no photo yet show a
              placeholder slot.
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
