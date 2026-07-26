"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, RefreshCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { createPreviewUrl, defaultPhotoTransform, photoValueFromFile, type PhotoValue } from "@/lib/installationReport/imaging";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * One photo slot: click to pick a file straight from the operator's local
 * drive (camera roll export, a folder of site photos, whatever — nothing
 * here ever leaves the browser), shows a thumbnail once picked, and lets the
 * operator drag the photo around inside its frame and zoom in/out to choose
 * exactly what shows before it's baked into the exported PDF (see
 * PhotoValue / prepareCoverImage in imaging.ts for how that framing is
 * applied at export time). Used for every photo box across the Installation
 * Report form — the store-level pictures and each site's main/close-up/
 * corner shots all render one of these.
 */
export function ImageSlot({
  label,
  value,
  onChange,
  aspect = "video",
  size = "normal",
}: {
  label: string;
  value: PhotoValue | null;
  onChange: (value: PhotoValue | null) => void;
  aspect?: "video" | "square" | "wide";
  /** "large" gives the tile noticeably more height — use for the hero shots (Main Slide / Close-up) so they're easier to frame; corner/overview shots stay "normal". */
  size?: "normal" | "large";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startFocalX: number;
    startFocalY: number;
    bgW: number;
    bgH: number;
    moved: boolean;
  } | null>(null);

  const file = value?.file ?? null;
  const transform = value ?? { file: null as unknown as File, ...defaultPhotoTransform() };

  // Derived, not stored in state -- computing this in an effect would mean
  // calling setState synchronously on every file change (flagged by
  // react-hooks/set-state-in-effect, and the same cascading-render issue).
  // useMemo recomputes it during render instead; a separate cleanup-only
  // effect below just revokes the previous object URL, which needs no
  // setState at all.
  const previewUrl = useMemo(() => (file ? createPreviewUrl(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    // No reset-to-zero branch when previewUrl is cleared: geometry is only
    // ever rendered while previewUrl is truthy (see the JSX below), so a
    // stale naturalSize lingering after a photo is removed is harmless, and
    // avoids a synchronous setState directly in the effect body.
    if (!previewUrl) return;
    const img = new Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aspectClass = aspect === "square" ? "aspect-square" : aspect === "wide" ? "aspect-[21/9]" : "aspect-video";
  const sizeClass = size === "large" ? "min-h-[220px]" : "";

  // "Cover" base scale (fills the container with no gaps at zoom 1) times
  // the operator's zoom, matching the math in imaging.ts's prepareCoverImage
  // so the exported crop matches what's previewed here.
  const geometry = useMemo(() => {
    const { w: cw, h: ch } = containerSize;
    const { w: nw, h: nh } = naturalSize;
    if (!cw || !ch || !nw || !nh) return null;
    const coverScale = Math.max(cw / nw, ch / nh);
    const scale = coverScale * Math.max(MIN_ZOOM, transform.zoom || 1);
    const bgW = nw * scale;
    const bgH = nh * scale;
    const rawX = cw / 2 - transform.focalX * bgW;
    const rawY = ch / 2 - transform.focalY * bgH;
    const minX = Math.min(0, cw - bgW);
    const minY = Math.min(0, ch - bgH);
    const posX = Math.min(0, Math.max(minX, rawX));
    const posY = Math.min(0, Math.max(minY, rawY));
    return { bgW, bgH, posX, posY, minX, minY };
  }, [containerSize, naturalSize, transform.focalX, transform.focalY, transform.zoom]);

  function handlePointerDown(e: React.PointerEvent) {
    if (!file || !geometry) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startFocalX: transform.focalX,
      startFocalY: transform.focalY,
      bgW: geometry.bgW,
      bgH: geometry.bgH,
      moved: false,
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !geometry) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
    const startPosX = containerSize.w / 2 - drag.startFocalX * drag.bgW;
    const startPosY = containerSize.h / 2 - drag.startFocalY * drag.bgH;
    const rawX = startPosX + dx;
    const rawY = startPosY + dy;
    const posX = Math.min(0, Math.max(geometry.minX, rawX));
    const posY = Math.min(0, Math.max(geometry.minY, rawY));
    const focalX = (containerSize.w / 2 - posX) / drag.bgW;
    const focalY = (containerSize.h / 2 - posY) / drag.bgH;
    onChange({ ...transform, file: file as File, focalX, focalY });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleZoom(nextZoom: number) {
    if (!file) return;
    onChange({ ...transform, file, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)) });
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={containerRef}
        className={`relative ${aspectClass} ${sizeClass} w-full touch-none select-none overflow-hidden rounded-md border border-dashed border-line-strong bg-surface-sunken`}
      >
        {previewUrl ? (
          <>
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="absolute inset-0 cursor-grab bg-cover bg-no-repeat active:cursor-grabbing"
              style={
                geometry
                  ? {
                      backgroundImage: `url(${previewUrl})`,
                      backgroundSize: `${geometry.bgW}px ${geometry.bgH}px`,
                      backgroundPosition: `${geometry.posX}px ${geometry.posY}px`,
                    }
                  : { backgroundImage: `url(${previewUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
              }
            />
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            >
              <X size={12} />
            </button>
            <button
              type="button"
              aria-label={`Replace ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
              className="absolute left-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            >
              <RefreshCw size={12} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-muted hover:text-ink-secondary"
          >
            <ImagePlus size={size === "large" ? 24 : 18} />
            <span className="text-[11px]">Choose photo</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            onChange(picked ? photoValueFromFile(picked) : null);
            e.target.value = "";
          }}
        />
      </div>
      {file && (
        <div className="flex items-center gap-1.5 px-0.5">
          <ZoomOut size={11} className="shrink-0 text-ink-muted" />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={transform.zoom || 1}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="h-1 flex-1 accent-primary"
            aria-label={`Zoom ${label}`}
          />
          <ZoomIn size={11} className="shrink-0 text-ink-muted" />
        </div>
      )}
      <p className="truncate text-[11px] text-ink-muted">{label}{file ? " — drag to reposition, slider to zoom" : ""}</p>
    </div>
  );
}
