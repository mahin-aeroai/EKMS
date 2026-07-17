"use client";

import { useRef, useState } from "react";
import type { Point } from "@/lib/cutfile/geometry";

/**
 * Editable cut-contour outline for a single piece, drawn over its preview.
 * Defaults to a rectangle matching the page's own trim size, but every
 * vertex can be dragged, edge midpoints can be clicked to insert a new
 * vertex, and a vertex can be double-clicked to remove it (min 3 points) —
 * this is how "move around based on design shape" gets handled without
 * needing perfect automatic contour detection from the PDF.
 */
export function OutlineCanvas({
  widthMm,
  heightMm,
  previewDataUrl,
  outline,
  onChange,
}: {
  widthMm: number;
  heightMm: number;
  previewDataUrl: string | null;
  outline: Point[];
  onChange: (outline: Point[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const viewBox = `0 0 ${widthMm} ${heightMm}`;

  function screenToMm(clientX: number, clientY: number): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * widthMm;
    const py = heightMm - ((clientY - rect.top) / rect.height) * heightMm;
    return { x: clamp(px, 0, widthMm), y: clamp(py, 0, heightMm) };
  }

  function handlePointerDown(idx: number, e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingIdx(idx);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (draggingIdx === null) return;
    const p = screenToMm(e.clientX, e.clientY);
    onChange(outline.map((pt, i) => (i === draggingIdx ? p : pt)));
  }

  function handlePointerUp() {
    setDraggingIdx(null);
  }

  function removeVertex(idx: number) {
    if (outline.length <= 3) return;
    onChange(outline.filter((_, i) => i !== idx));
  }

  function insertMidpoint(idx: number) {
    const a = outline[idx];
    const b = outline[(idx + 1) % outline.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const next = [...outline];
    next.splice(idx + 1, 0, mid);
    onChange(next);
  }

  const pointRadius = Math.max(widthMm, heightMm) / 150;
  const pathD =
    outline.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${heightMm - p.y}`).join(" ") + " Z";

  return (
    <div className="w-full overflow-hidden rounded-lg border border-line bg-surface-sunken">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full touch-none select-none"
        style={{ aspectRatio: `${widthMm} / ${heightMm}` }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <rect x={0} y={0} width={widthMm} height={heightMm} fill="white" stroke="#D1D5DB" strokeWidth={widthMm / 800} />
        {previewDataUrl && (
          <image href={previewDataUrl} x={0} y={0} width={widthMm} height={heightMm} preserveAspectRatio="none" opacity={0.85} />
        )}

        <path d={pathD} fill="rgba(37,99,235,0.12)" stroke="#2563EB" strokeWidth={widthMm / 500} />

        {/* Edge midpoint "add point" handles */}
        {outline.map((p, i) => {
          const next = outline[(i + 1) % outline.length];
          const mx = (p.x + next.x) / 2;
          const my = (p.y + next.y) / 2;
          return (
            <circle
              key={`mid-${i}`}
              cx={mx}
              cy={heightMm - my}
              r={pointRadius * 0.6}
              fill="#93C5FD"
              stroke="#2563EB"
              strokeWidth={pointRadius * 0.15}
              style={{ cursor: "copy" }}
              onClick={() => insertMidpoint(i)}
            />
          );
        })}

        {/* Vertices */}
        {outline.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={heightMm - p.y}
            r={pointRadius}
            fill="#2563EB"
            stroke={draggingIdx === i ? "#EF4444" : "white"}
            strokeWidth={pointRadius * 0.3}
            style={{ cursor: "grab" }}
            onPointerDown={(e) => handlePointerDown(i, e)}
            onDoubleClick={() => removeVertex(i)}
          />
        ))}
      </svg>
      <p className="border-t border-line bg-surface px-3 py-1.5 text-xs text-ink-muted">
        Drag a point to reshape · click a light dot on an edge to add a point · double-click a point to remove it
      </p>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
