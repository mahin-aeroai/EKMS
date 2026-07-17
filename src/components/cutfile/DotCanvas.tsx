"use client";

import { useRef, useState } from "react";
import type { DotSpec } from "@/lib/cutfile/geometry";

/**
 * Shows the rendered design preview inside the full output canvas (trim +
 * bleed + dot zone + margin), with each cut-dot as a draggable circle so the
 * operator can nudge a mark off the design if it lands somewhere awkward.
 * All coordinates in the `dots` array are in mm relative to the full canvas
 * (bottom-left origin); this component only handles screen<->mm conversion
 * and drag interaction, positions are reported back via onChange.
 */
export function DotCanvas({
  canvasWidthMm,
  canvasHeightMm,
  contentOffsetMm,
  contentWidthMm,
  contentHeightMm,
  previewDataUrl,
  dotDiameterMm,
  dots,
  onChange,
}: {
  canvasWidthMm: number;
  canvasHeightMm: number;
  contentOffsetMm: number;
  contentWidthMm: number;
  contentHeightMm: number;
  previewDataUrl: string | null;
  dotDiameterMm: number;
  dots: DotSpec[];
  onChange: (dots: DotSpec[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // SVG viewBox is in mm directly (bottom-left origin like PDF), so we flip Y
  // only for the <image> placement, using a top-level transform instead of
  // per-element math.
  const viewBox = `0 0 ${canvasWidthMm} ${canvasHeightMm}`;

  function screenToMm(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * canvasWidthMm;
    const py = canvasHeightMm - ((clientY - rect.top) / rect.height) * canvasHeightMm;
    return { x: px, y: py };
  }

  function handlePointerDown(id: string, e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingId(id);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingId) return;
    const { x, y } = screenToMm(e.clientX, e.clientY);
    onChange(
      dots.map((d) =>
        d.id === draggingId
          ? { ...d, x: clamp(x, 0, canvasWidthMm), y: clamp(y, 0, canvasHeightMm) }
          : d
      )
    );
  }

  function handlePointerUp() {
    setDraggingId(null);
  }

  const radiusMm = dotDiameterMm / 2;

  return (
    <div className="w-full overflow-hidden rounded-lg border border-line bg-surface-sunken">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full touch-none select-none"
        style={{ aspectRatio: `${canvasWidthMm} / ${canvasHeightMm}` }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Outer canvas boundary */}
        <rect x={0} y={0} width={canvasWidthMm} height={canvasHeightMm} fill="white" stroke="#D1D5DB" strokeWidth={canvasWidthMm / 800} />

        {/* Original design preview, placed at its offset within the canvas */}
        {previewDataUrl && (
          <image
            href={previewDataUrl}
            x={contentOffsetMm}
            y={canvasHeightMm - contentOffsetMm - contentHeightMm}
            width={contentWidthMm}
            height={contentHeightMm}
            preserveAspectRatio="none"
          />
        )}

        {/* Content boundary (trim + the original file's own bleed) */}
        <rect
          x={contentOffsetMm}
          y={canvasHeightMm - contentOffsetMm - contentHeightMm}
          width={contentWidthMm}
          height={contentHeightMm}
          fill="none"
          stroke="#2563EB"
          strokeDasharray={`${canvasWidthMm / 400} ${canvasWidthMm / 200}`}
          strokeWidth={canvasWidthMm / 1000}
        />

        {/* Dots */}
        {dots.map((d) => (
          <circle
            key={d.id}
            cx={d.x}
            cy={canvasHeightMm - d.y}
            r={radiusMm}
            fill="black"
            stroke={draggingId === d.id ? "#EF4444" : "white"}
            strokeWidth={radiusMm * 0.25}
            onPointerDown={(e) => handlePointerDown(d.id, e)}
            style={{ cursor: "grab" }}
          />
        ))}
      </svg>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
