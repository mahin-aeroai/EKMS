"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Download } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { StepperNav, type StepperStep } from "./StepperNav";
import { PreviewStep } from "./PreviewStep";
import { DetailsStep } from "./DetailsStep";
import { MeasurementStep } from "./MeasurementStep";
import { PhotosStep } from "./PhotosStep";
import type { ReportHeaderFields } from "./ReportFormFields";
import { buildSiteSurveyReportPdf, downloadBlob, type SurveyPhotoInput } from "@/lib/siteSurveyReport/pdfBuild";
import { fetchSfProTextFontBytes, fetchAppleSdGothicNeoFontBytes } from "@/lib/pdfFonts";
import {
  REPORT_STATUS_LABEL,
  emptyFormData,
  emptyMeasurement,
  normalizeMeasurements,
  type FieldSourceKey,
  type SiteSurveyFormData,
  type SiteSurveyMeasurement,
  type SiteSurveyPhotoRow,
  type SiteSurveyReportRow,
} from "@/lib/siteSurveyReport/types";

// Manual entry only -- the PDF-upload / AI-extraction / Review path has
// been removed (see UploadStep/ExtractionStep/ReviewStep's git history if
// it's ever needed again); every report now lands straight on Complete
// Details. Preview builds the exact PDF Generate would produce (see
// buildPdfBlob, shared by both) and renders it inline, without downloading
// or touching status/generated_at.

const STATUS_BADGE: Record<SiteSurveyReportRow["status"], "neutral" | "info" | "warning" | "success"> = {
  draft: "neutral",
  extracting: "info",
  review_required: "warning",
  ready: "info",
  generated: "success",
};

type StepId = "details" | "photos" | "measurements" | "preview" | "generate";

export function SiteSurveyReportEditorClient({ reportId }: { reportId: string }) {
  const { toast } = useToast();
  const [report, setReport] = useState<SiteSurveyReportRow | null>(null);
  const [photos, setPhotos] = useState<SiteSurveyPhotoRow[]>([]);
  const [step, setStep] = useState<StepId>("details");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [buildingPreview, setBuildingPreview] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
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
          measurements: normalizeMeasurements(data.measurements),
          field_sources: data.field_sources ?? {},
          extraction_meta: data.extraction_meta ?? null,
        });
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
        measurements: current.measurements,
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
  function updateMeasurement<K extends keyof SiteSurveyMeasurement>(index: number, key: K, value: SiteSurveyMeasurement[K]) {
    setReport((prev) =>
      prev ? { ...prev, measurements: prev.measurements.map((m, i) => (i === index ? { ...m, [key]: value } : m)) } : prev
    );
  }
  function addSite() {
    setReport((prev) => (prev ? { ...prev, measurements: [...prev.measurements, emptyMeasurement()] } : prev));
  }
  function removeSite(index: number) {
    setReport((prev) => (prev ? { ...prev, measurements: prev.measurements.filter((_, i) => i !== index) } : prev));
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
            id: photo.id,
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

  // Shared by both Preview (just renders the blob, changes nothing) and
  // Generate (downloads it and marks the report generated) -- so the two
  // are always visually identical, built from the exact same data.
  async function buildPdfBlob(current: SiteSurveyReportRow): Promise<Blob> {
    const [photoInputs, brandFonts, gothicNeoFonts] = await Promise.all([fetchPhotoInputs(), fetchSfProTextFontBytes(), fetchAppleSdGothicNeoFontBytes()]);
    return buildSiteSurveyReportPdf(
      {
        storeName: current.store_name,
        address: current.address,
        sfoId: current.sfo_id,
        program: current.program,
        surveyDate: current.survey_date ?? "",
        surveyorName: current.surveyor_name,
        formData: current.form_data,
        measurements: current.measurements,
        photos: photoInputs,
      },
      brandFonts,
      gothicNeoFonts
    );
  }

  async function handleGenerate() {
    if (!report) return;
    setGenerating(true);
    try {
      await persist(report, { silent: true });
      const blob = await buildPdfBlob(report);
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

  async function handlePreview() {
    if (!report) return;
    setBuildingPreview(true);
    try {
      const blob = await buildPdfBlob(report);
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch {
      toast("danger", "Couldn't build the preview");
    } finally {
      setBuildingPreview(false);
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

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
  const measurementsComplete = report.measurements.every((m) => m.visualWidthMm != null && m.visualHeightMm != null);

  const STEPS: StepperStep[] = [
    { id: "details", label: "Complete Details", complete: detailsComplete },
    { id: "photos", label: "Photos", complete: photos.length > 0 },
    { id: "measurements", label: "Measurements", complete: measurementsComplete },
    { id: "preview", label: "Preview", complete: Boolean(previewUrl) },
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
            <p className="mt-0.5 text-sm text-ink-secondary">Created manually</p>
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
        {step === "measurements" && (
          <MeasurementStep
            measurements={report.measurements}
            onChange={updateMeasurement}
            onAdd={addSite}
            onRemove={removeSite}
            measurementPhotos={photos.filter((p) => p.category === "measurement")}
          />
        )}
        {step === "preview" && <PreviewStep previewUrl={previewUrl} building={buildingPreview} onBuild={handlePreview} />}
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
