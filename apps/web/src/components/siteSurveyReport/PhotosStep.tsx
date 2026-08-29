"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Crop, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { useUserRole, canDelete, canWrite } from "@/lib/UserRoleContext";
import {
  normalizeAnnotation,
  PHOTO_CATEGORY_LABEL,
  type AnnotationObstacle,
  type AnnotationPoint,
  type PhotoCategory,
  type SiteSurveyPhotoAnnotation,
  type SiteSurveyPhotoRow,
} from "@/lib/siteSurveyReport/types";

// Matches pdfBuild.ts's MARK constant (rgb(0.86, 0.91, 0.24)) -- the same
// greenish-yellow used to mark the installation area, here and in the
// generated PDF, so the on-screen tool previews the exact colour that ends
// up in the exported report.
const MARK_COLOR_HEX = "#dbe83d";

// Upload + organize photos for a Site Survey Report -- multiple photos per
// category (Main Site, Site Orientation Right/Left/Opposite, Site
// Measurement, Other), reorder/caption/recategorize/delete, and for the
// Site Measurement photo specifically a polygon annotation tool marking
// exactly where the sign will install, drawn in greenish-yellow
// (MARK_COLOR_HEX below -- keep in sync with pdfBuild.ts's MARK/MARK_TEXT
// constants, which render the same marker into the generated PDF, both on
// the real photo and redrawn as the Facade diagram's solid rectangle). A
// real installed area on a real photo is essentially never a perfect
// axis-aligned rectangle once perspective is involved, so the tool starts
// with a click-drag rectangle (familiar first gesture) but every corner --
// and any point dragged out from an edge -- can then be repositioned
// independently to trace the actual shape, plus any number of separate
// obstacle cut-outs (a pillar, pipe, etc.) each with its own text note --
// see AnnotationEditor below. Photos are stored client-side as JPEG (resized to a max
// dimension before upload, matching the presign route's fixed
// image/jpeg content type) and go straight to R2 via a presigned PUT --
// see /api/site-survey-reports/[reportId]/photos/upload-url. The DB row
// is written client-side via Supabase only after the R2 PUT succeeds,
// same order of operations as every other photo-upload flow in this app
// (see LfgSiteWorkspaceClient.handleUpload).

const CATEGORY_ORDER: PhotoCategory[] = [
  "main_site",
  "orientation_right",
  "orientation_left",
  "orientation_opposite",
  "viewpoint_a",
  "viewpoint_b",
  "viewpoint_c",
  "viewpoint_d",
  "measurement",
  "other",
];

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

  async function handleSaveAnnotation(photoId: string, annotation: SiteSurveyPhotoAnnotation | null) {
    const { error } = await supabase.from("site_survey_photos").update({ annotation }).eq("id", photoId);
    if (error) toast("danger", "Couldn't save the annotation");
    else toast("success", annotation ? "Annotation saved" : "Annotation cleared");
    onReload();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Each category is a self-sizing tile in a responsive grid, not a
          full-width box -- a category with only 1-2 photos used to leave a
          large empty strip to the right of its cards when it always spanned
          the full content width; as a tile among several per row, it's only
          ever as wide as the grid column, so a couple of small photo cards
          fill it naturally. Categories with more photos simply grow taller
          within their own cell (grid rows are independent). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CATEGORY_ORDER.map((category) => {
          const items = photos.filter((p) => p.category === category).sort((a, b) => a.sort_order - b.sort_order);
          return (
            <div key={category} className="flex flex-col rounded-lg border border-line">
              <div className="flex items-center justify-between gap-2 rounded-t-lg border-b border-line bg-surface-sunken px-3 py-2">
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
                      <Plus size={13} /> Add
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-wrap gap-2 p-3">
                {items.length === 0 && <p className="text-xs text-ink-muted">No photos yet.</p>}
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
      </div>

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
    <div className="flex w-32 flex-col gap-2 rounded-md border border-line-strong p-2">
      <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-surface-sunken">
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
        </div>
        {canDeletePhoto && (
          <Button variant="icon" size="sm" aria-label="Delete photo" onClick={onDelete}>
            <Trash2 size={13} className="text-danger" />
          </Button>
        )}
      </div>
      {/* The marking tool used to be a bare icon button easy to miss entirely
          (and easy to mistake for an actual crop, not a mark) -- now a
          full-width labeled button, plus a status line either way so it's
          obvious at a glance whether this photo still needs marking. */}
      {canEdit && onAnnotate && (
        <Button variant="secondary" size="sm" className="w-full justify-center" onClick={onAnnotate}>
          <Crop size={13} /> {photo.annotation ? "Edit marked area" : "Mark installation area"}
        </Button>
      )}
      {onAnnotate &&
        (photo.annotation ? (
          <p className="text-[10px] text-success">✓ Installation area marked</p>
        ) : (
          <p className="text-[10px] text-warning">Not marked yet</p>
        ))}
    </div>
  );
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Recomputes an obstacle rectangle from one corner being dragged to `point`, keeping the opposite corner fixed -- a normal resize-by-corner, including flipping to whichever corner is actually top-left afterwards if dragged past the opposite one. */
function resizeObstacleCorner(o: AnnotationObstacle, corner: "nw" | "ne" | "sw" | "se", point: AnnotationPoint): AnnotationObstacle {
  const opposite = {
    nw: { x: o.x + o.w, y: o.y + o.h },
    ne: { x: o.x, y: o.y + o.h },
    sw: { x: o.x + o.w, y: o.y },
    se: { x: o.x, y: o.y },
  }[corner];
  return {
    ...o,
    x: Math.min(opposite.x, point.x),
    y: Math.min(opposite.y, point.y),
    w: Math.abs(opposite.x - point.x),
    h: Math.abs(opposite.y - point.y),
  };
}

type DragState =
  | { kind: "draw-rect"; start: AnnotationPoint }
  | { kind: "point"; index: number }
  | { kind: "obstacle-move"; index: number; grabDX: number; grabDY: number }
  | { kind: "obstacle-corner"; index: number; corner: "nw" | "ne" | "sw" | "se" }
  | null;

/**
 * Polygon annotation tool. Before this, the marking was a single
 * axis-aligned rectangle -- but a real installed area on a real photo is
 * essentially never a perfect rectangle once perspective is involved, so
 * this instead: starts the same familiar way (click-drag a rectangle), but
 * every corner of it can then be dragged independently, a small handle at
 * each edge's midpoint can be dragged out to insert a new corner there
 * (double-click a corner to remove it again, down to a minimum of 3), and
 * any number of separate obstacle cut-outs (a pillar, pipe, etc.) can be
 * added, each its own draggable/resizable rectangle with a text note
 * edited in the list below the photo.
 */
function AnnotationEditor({
  photo,
  onClose,
  onSave,
}: {
  photo: SiteSurveyPhotoRow;
  onClose: () => void;
  onSave: (photoId: string, annotation: SiteSurveyPhotoAnnotation | null) => void;
}) {
  const url = useSignedPhotoUrl(photo);
  const imgRef = useRef<HTMLImageElement>(null);
  const initial = normalizeAnnotation(photo.annotation);
  const [points, setPoints] = useState<AnnotationPoint[]>(initial?.points ?? []);
  const [obstacles, setObstacles] = useState<AnnotationObstacle[]>(initial?.obstacles ?? []);
  const [tempRect, setTempRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<DragState>(null);

  function toFraction(e: React.MouseEvent): AnnotationPoint | null {
    const el = imgRef.current;
    if (!el) return null;
    const bounds = el.getBoundingClientRect();
    const x = clamp((e.clientX - bounds.left) / bounds.width, 0, 1);
    const y = clamp((e.clientY - bounds.top) / bounds.height, 0, 1);
    return { x, y };
  }

  function handleContainerMouseDown(e: React.MouseEvent) {
    if (points.length > 0) return; // once a polygon exists, editing happens only via its handles
    const point = toFraction(e);
    if (!point) return;
    setDrag({ kind: "draw-rect", start: point });
    setTempRect({ x: point.x, y: point.y, w: 0, h: 0 });
  }

  function handleContainerMouseMove(e: React.MouseEvent) {
    if (!drag) return;
    const point = toFraction(e);
    if (!point) return;
    if (drag.kind === "draw-rect") {
      setTempRect({
        x: Math.min(drag.start.x, point.x),
        y: Math.min(drag.start.y, point.y),
        w: Math.abs(point.x - drag.start.x),
        h: Math.abs(point.y - drag.start.y),
      });
    } else if (drag.kind === "point") {
      const index = drag.index;
      setPoints((prev) => prev.map((p, i) => (i === index ? point : p)));
    } else if (drag.kind === "obstacle-move") {
      const { index, grabDX, grabDY } = drag;
      setObstacles((prev) =>
        prev.map((o, i) => (i === index ? { ...o, x: clamp(point.x - grabDX, 0, 1 - o.w), y: clamp(point.y - grabDY, 0, 1 - o.h) } : o))
      );
    } else if (drag.kind === "obstacle-corner") {
      const { index, corner } = drag;
      setObstacles((prev) => prev.map((o, i) => (i === index ? resizeObstacleCorner(o, corner, point) : o)));
    }
  }

  function handleContainerMouseUp() {
    if (drag?.kind === "draw-rect" && tempRect && tempRect.w > 0.01 && tempRect.h > 0.01) {
      setPoints([
        { x: tempRect.x, y: tempRect.y },
        { x: tempRect.x + tempRect.w, y: tempRect.y },
        { x: tempRect.x + tempRect.w, y: tempRect.y + tempRect.h },
        { x: tempRect.x, y: tempRect.y + tempRect.h },
      ]);
    }
    setTempRect(null);
    setDrag(null);
  }

  function handleAddObstacle() {
    setObstacles((prev) => [...prev, { x: 0.42, y: 0.42, w: 0.16, h: 0.16, note: "" }]);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-lg bg-surface-overlay p-5 shadow-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Mark the installation area</h3>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-sunken">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-ink-secondary">
          {points.length === 0
            ? "Click and drag on the photo to draw a starting box."
            : "Drag a corner to align it exactly with the photo. Drag the small dot on an edge to add a new corner there — double-click a corner to remove it."}
        </p>
        <div
          className="relative select-none overflow-hidden rounded border border-line-strong bg-surface-sunken"
          onMouseDown={handleContainerMouseDown}
          onMouseMove={handleContainerMouseMove}
          onMouseUp={handleContainerMouseUp}
          onMouseLeave={handleContainerMouseUp}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL
            <img ref={imgRef} src={url} alt="" className="w-full select-none" draggable={false} />
          ) : (
            <p className="p-10 text-center text-xs text-ink-muted">Loading photo…</p>
          )}

          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {tempRect && (
              <rect
                x={tempRect.x * 100}
                y={tempRect.y * 100}
                width={tempRect.w * 100}
                height={tempRect.h * 100}
                fill="none"
                stroke={MARK_COLOR_HEX}
                strokeWidth={0.6}
              />
            )}
            {points.length >= 3 && (
              <polygon
                points={points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                fill="none"
                stroke={MARK_COLOR_HEX}
                strokeWidth={0.6}
              />
            )}
            {obstacles.map((o, i) => (
              <g key={i}>
                <rect x={o.x * 100} y={o.y * 100} width={o.w * 100} height={o.h * 100} fill="rgba(220,38,38,0.12)" stroke="#dc2626" strokeWidth={0.5} />
                <line x1={o.x * 100} y1={o.y * 100} x2={(o.x + o.w) * 100} y2={(o.y + o.h) * 100} stroke="#dc2626" strokeWidth={0.4} />
                <line x1={(o.x + o.w) * 100} y1={o.y * 100} x2={o.x * 100} y2={(o.y + o.h) * 100} stroke="#dc2626" strokeWidth={0.4} />
              </g>
            ))}
          </svg>

          {points.length >= 3 &&
            points.map((p, i) => {
              const next = points[(i + 1) % points.length];
              const mx = (p.x + next.x) / 2;
              const my = (p.y + next.y) / 2;
              return (
                <div
                  key={`mid-${i}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const insertAt = i + 1;
                    setPoints((prev) => [...prev.slice(0, insertAt), { x: mx, y: my }, ...prev.slice(insertAt)]);
                    setDrag({ kind: "point", index: insertAt });
                  }}
                  title="Drag to add a corner here"
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-copy rounded-full border border-white/80 bg-white/70 opacity-70 hover:opacity-100"
                  style={{ left: `${mx * 100}%`, top: `${my * 100}%` }}
                />
              );
            })}

          {points.map((p, i) => (
            <div
              key={i}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDrag({ kind: "point", index: i });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (points.length > 3) setPoints((prev) => prev.filter((_, j) => j !== i));
              }}
              title="Drag to reposition — double-click to remove"
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white shadow"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, background: MARK_COLOR_HEX }}
            />
          ))}

          {obstacles.map((o, i) => (
            <div key={i}>
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const point = toFraction(e);
                  if (!point) return;
                  setDrag({ kind: "obstacle-move", index: i, grabDX: point.x - o.x, grabDY: point.y - o.y });
                }}
                title="Drag to move this obstacle"
                className="absolute cursor-move"
                style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%`, width: `${o.w * 100}%`, height: `${o.h * 100}%` }}
              />
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <div
                  key={corner}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDrag({ kind: "obstacle-corner", index: i, corner });
                  }}
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border border-white bg-danger"
                  style={{
                    left: `${(corner.includes("w") ? o.x : o.x + o.w) * 100}%`,
                    top: `${(corner.includes("n") ? o.y : o.y + o.h) * 100}%`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 rounded border border-line-strong p-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-ink">Obstacles / cut-outs</h4>
            <Button variant="secondary" size="sm" onClick={handleAddObstacle} disabled={points.length < 3}>
              <Plus size={12} /> Add obstacle
            </Button>
          </div>
          {obstacles.length === 0 && (
            <p className="text-xs text-ink-muted">None — add one for a pillar, pipe, or other obstruction inside the marked area.</p>
          )}
          {obstacles.map((o, i) => (
            <div key={i} className="flex items-center gap-2 rounded border border-line-strong p-1.5">
              <span className="text-xs text-ink-muted">#{i + 1}</span>
              <input
                value={o.note}
                onChange={(e) => {
                  const note = e.target.value;
                  setObstacles((prev) => prev.map((existing, j) => (j === i ? { ...existing, note } : existing)));
                }}
                placeholder="e.g. Pillar — 300 × 200mm"
                className="flex-1 rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
              />
              <Button variant="icon" size="sm" aria-label="Remove obstacle" onClick={() => setObstacles((prev) => prev.filter((_, j) => j !== i))}>
                <Trash2 size={12} className="text-danger" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setPoints([]);
              setObstacles([]);
              setTempRect(null);
            }}
          >
            Clear
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(photo.id, points.length >= 3 ? { points, obstacles } : null);
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
