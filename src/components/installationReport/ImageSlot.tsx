"use client";

import { useEffect, useMemo, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { createPreviewUrl } from "@/lib/installationReport/imaging";

/**
 * One photo slot: click to pick a file straight from the operator's local
 * drive (camera roll export, a folder of site photos, whatever — nothing
 * here ever leaves the browser), shows a thumbnail once picked, and a small
 * X to clear it. Used for every photo box across the Installation Report
 * form — the store-level pictures and each site's main/close-up/corner
 * shots all render one of these.
 */
export function ImageSlot({
  label,
  file,
  onChange,
  aspect = "video",
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  aspect?: "video" | "square" | "wide";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

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

  const aspectClass = aspect === "square" ? "aspect-square" : aspect === "wide" ? "aspect-[21/9]" : "aspect-video";

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`relative ${aspectClass} w-full overflow-hidden rounded-md border border-dashed border-line-strong bg-surface-sunken`}
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={label}
              className="h-full w-full cursor-pointer object-cover"
              onClick={() => inputRef.current?.click()}
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
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-muted hover:text-ink-secondary"
          >
            <ImagePlus size={18} />
            <span className="text-[11px]">Choose photo</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </div>
      <p className="truncate text-[11px] text-ink-muted">{label}</p>
    </div>
  );
}
