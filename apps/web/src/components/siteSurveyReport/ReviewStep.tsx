"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Crop, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { ReportFormFields, type ReportHeaderFields } from "./ReportFormFields";
import { rasterizeAllPagesThumbnails, rasterizeOnePageHiRes, cropToJpeg, type RasterizedPage } from "@/lib/siteSurveyReport/pdfThumbnails";
import {
  PHOTO_CATEGORY_LABEL,
  type FieldSourceKey,
  type FieldSources,
  type PhotoCategory,
  type SiteSurveyFormData,
  type SiteSurveyPhotoRow,
} from "@/lib/siteSurveyReport/types";

// Step 3 of the PDF-extraction path: the same <ReportFormFields> DetailsStep
// uses (so the field list is never built twice), plus what only applies
// after an extraction ran -- a banner naming fields the model flagged for a
// closer look, and a page-by-page picker so a person can crop the actual
// photos out of the source PDF. AI extraction can point at which pages
// likely hold which category of photo (pageHints), but can't produce a
// pixel-precise crop box, so cropping is always a person dragging a
// rectangle over a real rendered page -- see PageCropTool below.

const CATEGORY_ORDER: PhotoCategory[] = ["main_site", "orientation_right", "orientation_left", "orientation_opposite", "measurement", "other"];

interface PageHint {
  page: number;
  likelyCategory: PhotoCategory;
  note: string;
}

interface Props {
  reportId: string;
  header: ReportHeaderFields;
  onHeaderChange: <K extends keyof ReportHeaderFields>(key: K, value: ReportHeaderFields[K]) => void;
  formData: SiteSurveyFormData;
  onFormDataChange: <K extends keyof SiteSurveyFormData>(key: K, value: SiteSurveyFormData[K]) => void;
  fieldSources: FieldSources;
  onTouched: (key: FieldSourceKey) => void;
  flagged: string[];
  pageHints: PageHint[];
  photos: SiteSurveyPhotoRow[];
  onPhotoAdded: () => void;
}

function prettifyFieldPath(path: string): string {
  const last = path.split(".").pop() ?? path;
  return last
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function ReviewStep({ reportId, header, onHeaderChange, formData, onFormDataChange, fieldSources, onTouched, flagged, pageHints, photos, onPhotoAdded }: Props) {
  const { toast } = useToast();
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<RasterizedPage[] | null>(null);
  const [loadingPages, setLoadingPages] = useState(false);
  const [cropTarget, setCropTarget] = useState<{ page: number; suggestedCategory: PhotoCategory } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoadingPages(true);
      try {
        const res = await fetch(`/api/site-survey-reports/${reportId}/source-pdf/signed-url`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) toast("danger", data.message || data.error || "Couldn't load the source PDF");
          return;
        }
        const pdfRes = await fetch(data.url);
        const bytes = await pdfRes.arrayBuffer();
        const thumbs = await rasterizeAllPagesThumbnails(bytes);
        if (!cancelled) {
          setPdfBytes(bytes);
          setPages(thumbs);
        }
      } catch {
        if (!cancelled) toast("danger", "Couldn't render the source PDF");
      } finally {
        if (!cancelled) setLoadingPages(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const hintByPage = new Map(pageHints.map((h) => [h.page, h]));
  const sortedPages = pages
    ? [...pages].sort((a, b) => {
        const ah = hintByPage.has(a.page) ? 0 : 1;
        const bh = hintByPage.has(b.page) ? 0 : 1;
        return ah !== bh ? ah - bh : a.page - b.page;
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-info/30 bg-info-tint px-4 py-3 text-sm text-ink">
        AI extraction filled in what it could confidently find. Every field below is still editable — check anything marked
        with a warning icon, and fill in whatever&apos;s still blank.
      </div>

      {flagged.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-warning/30 bg-warning-tint px-4 py-3 text-sm text-ink">
          <div className="flex items-center gap-1.5 font-medium text-warning">
            <AlertTriangle size={14} /> Flagged for a closer look
          </div>
          <ul className="ml-5 list-disc text-xs text-ink-secondary">
            {flagged.map((f) => (
              <li key={f}>{prettifyFieldPath(f)}</li>
            ))}
          </ul>
        </div>
      )}

      <ReportFormFields
        header={header}
        onHeaderChange={onHeaderChange}
        formData={formData}
        onFormDataChange={onFormDataChange}
        fieldSources={fieldSources}
        onTouched={onTouched}
      />

      <div className="rounded-lg border border-line">
        <div className="rounded-t-lg border-b border-line bg-surface-sunken px-4 py-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-secondary">Photos from the PDF</h2>
        </div>
        <div className="p-4">
          <p className="mb-3 text-xs text-ink-secondary">
            Pick a page and drag a box around the photo to add it to this report. Pages AI thinks contain a photo are shown
            first, with its best guess at the category — you choose the final category when adding.
          </p>
          {loadingPages && <p className="text-xs text-ink-muted">Rendering the PDF…</p>}
          {sortedPages && (
            <div className="flex flex-wrap gap-3">
              {sortedPages.map((p) => {
                const hint = hintByPage.get(p.page);
                return (
                  <div key={p.page} className="flex w-40 flex-col gap-2 rounded-md border border-line-strong p-2">
                    <div className="flex h-28 items-center justify-center overflow-hidden rounded bg-surface-sunken">
                      {/* eslint-disable-next-line @next/next/no-img-element -- locally rendered canvas data URL, not a remote image */}
                      <img src={p.dataUrl} alt={`Page ${p.page}`} className="h-full w-full object-contain" />
                    </div>
                    <p className="text-center text-[11px] text-ink-muted">Page {p.page}</p>
                    {hint && (
                      <p className="truncate text-center text-[10px] text-primary" title={hint.note}>
                        Likely: {PHOTO_CATEGORY_LABEL[hint.likelyCategory]}
                      </p>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCropTarget({ page: p.page, suggestedCategory: hint?.likelyCategory ?? "main_site" })}
                    >
                      <Crop size={12} /> Add as Photo
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {cropTarget && pdfBytes && (
        <PageCropTool
          reportId={reportId}
          pdfBytes={pdfBytes}
          page={cropTarget.page}
          suggestedCategory={cropTarget.suggestedCategory}
          existingCountInCategory={(category) => photos.filter((ph) => ph.category === category).length}
          onClose={() => setCropTarget(null)}
          onSaved={onPhotoAdded}
        />
      )}
    </div>
  );
}

function PageCropTool({
  reportId,
  pdfBytes,
  page,
  suggestedCategory,
  existingCountInCategory,
  onClose,
  onSaved,
}: {
  reportId: string;
  pdfBytes: ArrayBuffer;
  page: number;
  suggestedCategory: PhotoCategory;
  existingCountInCategory: (category: PhotoCategory) => number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [hiRes, setHiRes] = useState<RasterizedPage | null>(null);
  const [category, setCategory] = useState<PhotoCategory>(suggestedCategory);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let cancelled = false;
    rasterizeOnePageHiRes(pdfBytes, page)
      .then((r) => {
        if (!cancelled) setHiRes(r);
      })
      .catch(() => {
        if (!cancelled) toast("danger", "Couldn't render this page");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBytes, page]);

  function toFraction(e: React.MouseEvent) {
    const el = imgRef.current;
    if (!el) return null;
    const bounds = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (e.clientY - bounds.top) / bounds.height));
    return { x, y };
  }

  function handleMouseDown(e: React.MouseEvent) {
    const point = toFraction(e);
    if (!point) return;
    setDragStart(point);
    setRect({ x: point.x, y: point.y, w: 0, h: 0 });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragStart) return;
    const point = toFraction(e);
    if (!point) return;
    setRect({
      x: Math.min(dragStart.x, point.x),
      y: Math.min(dragStart.y, point.y),
      w: Math.abs(point.x - dragStart.x),
      h: Math.abs(point.y - dragStart.y),
    });
  }

  function handleMouseUp() {
    setDragStart(null);
  }

  async function handleSave() {
    if (!rect || rect.w < 0.02 || rect.h < 0.02 || !hiRes) {
      toast("warning", "Drag a box around the photo first");
      return;
    }
    setSaving(true);
    try {
      const jpegBytes = await cropToJpeg(hiRes.dataUrl, rect);

      const uploadRes = await fetch(`/api/site-survey-reports/${reportId}/photos/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        toast("danger", uploadData.message || uploadData.error || "Couldn't get an upload link");
        return;
      }

      const putRes = await fetch(uploadData.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: jpegBytes as unknown as BodyInit });
      if (!putRes.ok) {
        toast("danger", "Upload to storage failed");
        return;
      }

      const { error } = await supabase.from("site_survey_photos").insert({
        report_id: reportId,
        category,
        relative_path: uploadData.relative_path,
        source: "extracted_from_pdf",
        original_page_number: page,
        sort_order: existingCountInCategory(category),
      });
      if (error) {
        toast("danger", `Uploaded, but couldn't record it: ${error.message}`);
        return;
      }
      toast("success", "Photo added");
      onSaved();
      onClose();
    } catch {
      toast("danger", "Couldn't add this photo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-lg bg-surface-overlay p-5 shadow-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Crop photo from page {page}</h3>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-sunken">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-ink-secondary">Click and drag to draw a box around just the photo.</p>
        <div
          className="relative select-none overflow-hidden rounded border border-line-strong bg-surface-sunken"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {hiRes ? (
            // eslint-disable-next-line @next/next/no-img-element -- locally rendered canvas data URL, not a remote image
            <img ref={imgRef} src={hiRes.dataUrl} alt="" className="w-full select-none" draggable={false} />
          ) : (
            <p className="p-10 text-center text-xs text-ink-muted">Rendering page…</p>
          )}
          {rect && (
            <div
              className="pointer-events-none absolute border-2 border-primary"
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
            />
          )}
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PhotoCategory)}
            className="w-full rounded border border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {PHOTO_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Add Photo
          </Button>
        </div>
      </div>
    </div>
  );
}
