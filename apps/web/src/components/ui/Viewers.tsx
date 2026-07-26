"use client";

import { useState } from "react";
import { FileText, Layers, Ruler, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { Tag } from "./Tag";

/**
 * Document Preview — Deliverable 3.8
 * Purpose: inline preview of any document without downloading.
 * Behaviour: renders the current Approved version by default; banner shown if viewing
 * a superseded version.
 */
export function DocumentPreview({
  title,
  summary,
  tags,
  superseded = false,
}: {
  title: string;
  summary: string;
  tags: string[];
  superseded?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      {superseded && (
        <div className="rounded-md bg-warning-tint px-3 py-1.5 text-xs font-medium text-warning">
          You are viewing a superseded version.
        </div>
      )}
      <div className="flex items-center gap-3 rounded-md border border-line bg-surface-sunken p-6">
        <FileText size={28} className="text-ink-muted" />
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs text-ink-muted">Document preview</p>
        </div>
      </div>
      <div className="rounded-md bg-ai-tint p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ai">
          <Sparkles size={12} /> AI Summary
        </p>
        <p className="text-sm text-ink">{summary}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <Tag key={t} aiSuggested>
            {t}
          </Tag>
        ))}
      </div>
    </div>
  );
}

/** Image Viewer — Deliverable 3.8. Pinch/scroll zoom; swipe between images in a set. */
export function ImageViewer({ images }: { images: { src: string; alt: string }[] }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const img = images[index];

  return (
    <div className="rounded-lg border border-line bg-surface-sunken p-3">
      <div className="flex h-64 items-center justify-center overflow-hidden rounded-md bg-surface">
        <div
          className="flex h-full w-full items-center justify-center text-ink-muted transition-transform"
          style={{ transform: `scale(${zoom})` }}
        >
          {img?.alt ?? "No image"}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={cn("h-1.5 w-4 rounded-full", i === index ? "bg-primary" : "bg-line-strong")}
              aria-label={`Image ${i + 1}`}
            />
          ))}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setZoom((z) => Math.max(1, z - 0.2))} className="rounded p-1.5 hover:bg-surface">
            <ZoomOut size={15} />
          </button>
          <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))} className="rounded p-1.5 hover:bg-surface">
            <ZoomIn size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** PDF Viewer — Deliverable 3.8. Page-by-page render with search-within-document. */
export function PDFViewer({ pageCount = 6, title }: { pageCount?: number; title: string }) {
  const [page, setPage] = useState(1);
  return (
    <div className="rounded-lg border border-line bg-surface-sunken p-3">
      <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-md bg-surface text-ink-muted">
        <FileText size={32} />
        <p className="text-sm">
          {title} — page {page} of {pageCount}
        </p>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-sm">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-md border border-line-strong px-2 py-1 hover:bg-surface"
        >
          Prev
        </button>
        <span className="text-ink-secondary">{page}</span>
        <button
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          className="rounded-md border border-line-strong px-2 py-1 hover:bg-surface"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** CAD Viewer — Deliverable 3.8. Pan/zoom/layer-toggle for multi-layer drawings. */
export function CADViewer({ layers }: { layers: string[] }) {
  const [active, setActive] = useState<string[]>(layers);

  function toggleLayer(l: string) {
    setActive((a) => (a.includes(l) ? a.filter((x) => x !== l) : [...a, l]));
  }

  return (
    <div className="flex gap-3 rounded-lg border border-line bg-surface-sunken p-3">
      <div className="flex h-72 flex-1 flex-col items-center justify-center gap-2 rounded-md bg-surface text-ink-muted">
        <Ruler size={28} />
        <p className="text-sm">Drawing canvas — {active.length} layer(s) visible</p>
      </div>
      <div className="w-40 shrink-0">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-secondary">
          <Layers size={13} /> Layers
        </p>
        <ul className="space-y-1">
          {layers.map((l) => (
            <li key={l}>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={active.includes(l)} onChange={() => toggleLayer(l)} />
                {l}
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
