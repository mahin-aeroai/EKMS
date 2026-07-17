"use client";

import { useRef, useState } from "react";
import type { NestPlacement, NestResult } from "@/lib/cutfile/nesting";
import { translatePolygon } from "@/lib/cutfile/geometry";

const PALETTE = ["#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#BE185D", "#65A30D"];

/**
 * Renders the nested sheet and, when `onChange` is provided, lets the
 * operator drag a placed piece to override the auto-layout. Each piece's
 * outline already represents its FULL nested unit (design + bleed + dot
 * zone + margin — see the nesting-outline fix), so dragging moves that
 * whole rigid area together; there's no separate "design" vs "bleed" box
 * to keep in sync. Dragging does not re-check collisions — this is a
 * manual override, the same way physically sliding a sheet on a table
 * would be.
 */
export function NestPreview({
  result,
  onChange,
}: {
  result: NestResult;
  onChange?: (placements: NestPlacement[]) => void;
}) {
  const { sheetWidthMm, sheetHeightMm, placements } = result;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragStart = useRef<{ clientX: number; clientY: number; origX: number; origY: number } | null>(null);

  const colorByPiece = new Map<string, string>();
  let colorIdx = 0;
  for (const p of placements) {
    if (!colorByPiece.has(p.pieceId)) {
      colorByPiece.set(p.pieceId, PALETTE[colorIdx % PALETTE.length]);
      colorIdx++;
    }
  }

  function handlePointerDown(i: number, e: React.PointerEvent) {
    if (!onChange) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = placements[i];
    dragStart.current = { clientX: e.clientX, clientY: e.clientY, origX: p.x, origY: p.y };
    setDragIdx(i);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragIdx === null || !dragStart.current || !onChange) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dxMm = ((e.clientX - dragStart.current.clientX) / rect.width) * sheetWidthMm;
    // Screen Y grows downward, sheet mm Y grows upward — flip the delta.
    const dyMm = -((e.clientY - dragStart.current.clientY) / rect.height) * sheetHeightMm;
    const newX = dragStart.current.origX + dxMm;
    const newY = dragStart.current.origY + dyMm;
    const moved = placements[dragIdx];
    const shiftX = newX - moved.x;
    const shiftY = newY - moved.y;
    onChange(
      placements.map((p, i) =>
        i === dragIdx ? { ...p, x: newX, y: newY, outline: translatePolygon(p.outline, shiftX, shiftY) } : p
      )
    );
  }

  function handlePointerUp() {
    setDragIdx(null);
    dragStart.current = null;
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-line bg-surface-sunken">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${sheetWidthMm} ${sheetHeightMm}`}
        className="w-full touch-none select-none"
        style={{ aspectRatio: `${sheetWidthMm} / ${sheetHeightMm}` }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <rect x={0} y={0} width={sheetWidthMm} height={sheetHeightMm} fill="white" stroke="#111827" strokeWidth={sheetWidthMm / 500} />
        {placements.map((p, i) => {
          const color = colorByPiece.get(p.pieceId) ?? "#2563EB";
          const d = p.outline.map((pt, j) => `${j === 0 ? "M" : "L"} ${pt.x} ${sheetHeightMm - pt.y}`).join(" ") + " Z";
          return (
            <path
              key={`${p.pieceId}-${p.instanceIndex}-${i}`}
              d={d}
              fill={color}
              fillOpacity={dragIdx === i ? 0.55 : 0.35}
              stroke={color}
              strokeWidth={sheetWidthMm / 1000}
              style={onChange ? { cursor: "grab" } : undefined}
              onPointerDown={onChange ? (e) => handlePointerDown(i, e) : undefined}
            />
          );
        })}
      </svg>
      {onChange && (
        <p className="border-t border-line bg-surface px-3 py-1.5 text-xs text-ink-muted">
          Drag a piece to move it manually — this overrides the auto layout and does not re-check for overlaps.
        </p>
      )}
    </div>
  );
}
