"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Crop, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { useUserRole, canDelete, canWrite } from "@/lib/UserRoleContext";
import { PHOTO_CATEGORY_LABEL, type PhotoCategory, type SiteSurveyPhotoRow } from "@/lib/siteSurveyReport/types";

// Matches pdfBuild.ts's MARK constant (rgb(0.86, 0.91, 0.24)) -- the same
// greenish-yellow used to mark the installation area, here and in the
// generated PDF, so the on-screen tool previews the exact colour that ends
// up in the exported report.
const MARK_COLOR_HEX = "#dbe83d";

// Upload + organize photos for a Site Survey Report -- multiple photos per
// category (Main Site, Site Orientation Right/Left/Opposite, Site
// Measurement, Other), reorder/caption/recategorize/delete, and for the
// Site Measurement photo specifically a simple drag-corners rectangle
// annotation tool marking exactly where the sign will install, drawn as a
// greenish-yellow box (MARK_COLOR_HEX below -- keep in sync with
// pdfBuild.ts's MARK/MARK_TEXT constants, which render the same marker
// into the generated PDF, both on the real photo and redrawn as the
// Facade diagram's solid rectangle). Photos are stored client-side as JPEG (resized to a max
// dimension before upload, matching the presign route's fixed
// image/jpeg content type) and go straight to R2 via a presigned PUT --
// see /api/site-survey-reports/[reportId]/photos/upload-url. The DB row
// is written client-side via Supabase only after the R2 PUT succeeds,
// same order of operations as every other photo-upload flow in this app
// (see LfgSiteWorkspaceClient.handleUpload).

const CATEGORY_ORDER: PhotoCategory[] = ["main_site", "orientation_right", "orientation_left", "orientation_opposite", "measurement", "other"];

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

interface Props {
  reportId: string;
  photos: SiteSurveyPhotoRow[];
  onReload: () => void;
}

export function PhotosStep({ reportId, photos, onReload }: Props) {
  const { toast } = useToast();
  const role = useUserRole();
  // site_survey_photos' DELETE policy is admin-only (same uniform
  // role-based RLS as every table, no own-draft-delete addendum for
  // photos -- matching Installation Report's own photos table, see
  // supabase-installation-reports-schema.sql). Hiding the button for
  // editors/viewers avoids a delete that looks like it worked (RLS blocks
  // it silently -- Supabase reports success with 0 rows affected, not an
  // error) but doesn't actually remove the photo.
  const canDeletePhoto = canDelete(role);
  // site_survey_photos' INSERT policy is admin/editor -- see
  // upload-url/route.ts's matching check -- so a viewer never sees an
  // upload control that would fail server-side anyway.
  const canUpload = canWrite(role);
  const [uploadingCategory, setUploadingCategory] = useState<PhotoCategory | null>(null);
  const [annotatingId, setAnnotatingId] = useState<string | null>(null);
  const fileInputs = useRef<Partial<Record<PhotoCategory, HTMLInputElement | null>>>({});

  async function resizeToJpeg(file: File): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c2d = canvas.getContext("2d");
    if (!c2d) throw new Error("Canvas not supported");
    c2d.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode image"))), "image/jpeg", JPEG_QUALITY)
    );
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function handleFileSelected(category: PhotoCategory, file: File) {
    setUploadingCategory(category);
    try {
      const jpegBytes = await resizeToJpeg(file);

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

      const putRes = await fetch(uploadData.url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: jpegBytes as unknown as BodyInit,
      });
      if (!putRes.ok) {
        toast("danger", "Upload to storage failed");
        return;
      }

      const sortOrder = photos.filter((p) => p.category === category).length;
      const { error: insertError } = await supabase.from("site_survey_photos").insert({
        report_id: reportId,
        category,
        relative_path: uploadData.relative_path,
        source: "uploaded",
        sort_order: sortOrder,
      });
      if (insertError) {
        toast("danger", `Uploaded, but couldn't record it: ${insertError.message}`);
        return;
      }
      toast("success", "Photo added");
      onReload();
    } catch {
      toast("danger", "Couldn't process that image");
    } finally {
      setUploadingCategory(null);
    }
  }

  async function handleDelete(photoId: string) {
    const { error } = await supabase.from("site_survey_photos").delete().eq("id", photoId);
    if (error) {
      toast("danger", `Couldn't delete photo: ${error.message}`);
      return;
    }
    if (annotatingId === photoId) setAnnotatingId(null);
    onReload();
  }

  async function handleCaptionChange(photoId: string, caption: string) {
    const { error } = await supabase.from("site_survey_photos").update({ caption: caption || null }).eq("id", photoId);
    if (error) toast("danger", "Couldn't save caption");
    onReload();
  }

  async function handleCategoryChange(photo: SiteSurveyPhotoRow, category: PhotoCategory) {
    const sortOrder = photos.filter((p) => p.category === category).length;
    const { error } = await supabase.from("site_survey_photos").update({ category, sort_order: sortOrder }).eq("id", photo.id);
    if (error) toast("danger", "Couldn't recategorize photo");
    onReload();
  }

  async function handleMove(photo: SiteSurveyPhotoRow, direction: -1 | 1) {
    const siblings = photos.filter((p) => p.category === photo.category).sort((a, b) => a.sort_order - b.sort_order);
    const index = siblings.findIndex((p) => p.id === photo.id);
    const swapWith = siblings[index + direction];
    if (!swapWith) return;
    await Promise.all([
      supabase.from("site_survey_photos").update({ sort_order: swapWith.sort_order }).eq("id", photo.id),
      supabase.from("site_survey_photos").update({ sort_order: photo.sort_order }).eq("id", swapWith.id),
    ]);
    onReload();
  }

  async function handleSaveAnnotation(photoId: string, annotation: { x: number; y: number; w: number; h: number } | null) {
    const { error } = await supabase.from("site_survey_photos").update({ annotation }).eq("id", photoId);
    if (error) toast("danger", "Couldn't save the annotation");
    else toast("success", annotation ? "Annotation saved" : "Annotation cleared");
    onReload();
  }

  return (
    <div className="flex flex-col gap-6">
      {CATEGORY_ORDER.map((category) => {
        const items = photos.filter((p) => p.category === category).sort((a, b) => a.sort_order - b.sort_order);
        return (
          <div key={category} className="rounded-lg border border-line">
            <div className="flex items-center justify-between rounded-t-lg border-b border-line bg-surface-sunken px-4 py-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-ink-secondary">{PHOTO_CATEGORY_LABEL[category]}</h2>
              {canUpload && (
                <div>
                  <input
                    ref={(el) => {
                      fileInputs.current[category] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void handleFileSelected(category, file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={uploadingCategory === category}
                    onClick={() => fileInputs.current[category]?.click()}
                  >
                    <Plus size={13} /> Add Photo
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3 p-4">
              {items.length === 0 && <p className="text-xs text-ink-muted">No photos in this category yet.</p>}
              {items.map((photo, i) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  canMoveUp={i > 0}
                  canMoveDown={i < items.length - 1}
                  onMove={(dir) => handleMove(photo, dir)}
                  onDelete={() => handleDelete(photo.id)}
                  onCaptionChange={(v) => handleCaptionChange(photo.id, v)}
                  onCategoryChange={(v) => handleCategoryChange(photo, v)}
                  onAnnotate={category === "measurement" ? () => setAnnotatingId(photo.id) : undefined}
                  canDeletePhoto={canDeletePhoto}
                  canEdit={canUpload}
                />
              ))}
            </div>
          </div>
        );
      })}

      {annotatingId && (
        <AnnotationEditor photo={photos.find((p) => p.id === annotatingId)!} onClose={() => setAnnotatingId(null)} onSave={handleSaveAnnotation} />
      )}
    </div>
  );
}

function useSignedPhotoUrl(photo: SiteSurveyPhotoRow): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/site-survey-reports/${photo.report_id}/photos/${photo.id}/signed-url`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.url) setUrl(data.url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo.report_id, photo.id]);
  return url;
}

function PhotoCard({
  photo,
  canMoveUp,
  canMoveDown,
  onMove,
  onDelete,
  onCaptionChange,
  onCategoryChange,
  onAnnotate,
  canDeletePhoto,
  canEdit,
}: {
  photo: SiteSurveyPhotoRow;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onCaptionChange: (v: string) => void;
  onCategoryChange: (v: PhotoCategory) => void;
  onAnnotate?: () => void;
  canDeletePhoto: boolean;
  /** site_survey_photos' UPDATE policy is admin/editor -- move/recategorize/caption/annotate all fail RLS for a viewer, so those controls render read-only for one. */
  canEdit: boolean;
}) {
  const url = useSignedPhotoUrl(photo);
  const [caption, setCaption] = useState(photo.caption ?? "");

  return (
    <div className="flex w-48 flex-col gap-2 rounded-md border border-line-strong p-2">
      <div className="flex h-32 items-center justify-center overflow-hidden rounded bg-surface-sunken">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL
          <img src={url} alt={photo.caption ?? "Site survey photo"} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-ink-muted">Loading…</span>
        )}
      </div>
      {canEdit ? (
        <>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => onCaptionChange(caption)}
            placeholder="Caption (optional)"
            className="w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
          />
          <select
            value={photo.category}
            onChange={(e) => onCategoryChange(e.target.value as PhotoCategory)}
            className="w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {PHOTO_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          {photo.caption && <p className="truncate text-xs text-ink-secondary">{photo.caption}</p>}
          <p className="text-xs text-ink-muted">{PHOTO_CATEGORY_LABEL[photo.category]}</p>
        </>
      )}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {canEdit && (
            <>
              <Button variant="icon" size="sm" aria-label="Move earlier" disabled={!canMoveUp} onClick={() => onMove(-1)}>
                <ArrowUp size={13} />
              </Button>
              <Button variant="icon" size="sm" aria-label="Move later" disabled={!canMoveDown} onClick={() => onMove(1)}>
                <ArrowDown size={13} />
              </Button>
            </>
          )}
          {canEdit && onAnnotate && (
            <Button variant="icon" size="sm" aria-label="Annotate" onClick={onAnnotate}>
              <Crop size={13} />
            </Button>
          )}
        </div>
        {canDeletePhoto && (
          <Button variant="icon" size="sm" aria-label="Delete photo" onClick={onDelete}>
            <Trash2 size={13} className="text-danger" />
          </Button>
        )}
      </div>
      {photo.annotation && <p className="text-[10px] text-success">Annotated</p>}
    </div>
  );
}

/** Drag-corners rectangle annotation tool: click-drag on the image to draw the greenish-yellow installation-area box (fractional 0-1 coords relative to the image's natural size, so it stays correct at any display size, including in the exported PDF). */
function AnnotationEditor({
  photo,
  onClose,
  onSave,
}: {
  photo: SiteSurveyPhotoRow;
  onClose: () => void;
  onSave: (photoId: string, annotation: { x: number; y: number; w: number; h: number } | null) => void;
}) {
  const url = useSignedPhotoUrl(photo);
  const imgRef = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(photo.annotation);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

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

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-lg bg-surface-overlay p-5 shadow-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Mark the installation area</h3>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-sunken">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-ink-secondary">Click and drag on the photo to draw a greenish-yellow box around the exact area where the sign will install.</p>
        <div
          className="relative select-none overflow-hidden rounded border border-line-strong bg-surface-sunken"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL
            <img ref={imgRef} src={url} alt="" className="w-full select-none" draggable={false} />
          ) : (
            <p className="p-10 text-center text-xs text-ink-muted">Loading photo…</p>
          )}
          {rect && (
            <div
              className="pointer-events-none absolute border-[3px]"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
                borderColor: MARK_COLOR_HEX,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
              }}
            />
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRect(null)}>
            Clear
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(photo.id, rect && rect.w > 0.01 && rect.h > 0.01 ? rect : null);
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
