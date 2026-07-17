"use client";

import { useRef, useState } from "react";
import type { NestPlacement, NestResult } from "@/lib/cutfile/nesting";
import { polygonBounds, rotatePolygon, translatePolygon } from "@/lib/cutfile/geometry";

const PALETTE = ["#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#BE185D", "#65A30D"];

/**
 * Renders the nested sheet and, when `onChange` is provided, lets the
 * operator drag a placed piece to override the auto-layout, or rotate one
 * in place. Each piece's outline already represents its FULL nested unit
 * (design + bleed + dot zone + margin — see the nesting-outline fix), so
 * dragging/rotating moves that whole rigid area together; there's no
 * separate "design" vs "bleed" box to keep in sync. Neither action
 * re-checks collisions — these are manual overrides, the same way
 * physically sliding or turning a sheet on a table would be. The actual
 * cut path is drawn as a crisp black wireframe on top of the (lighter)
 * per-piece fill so the real outline shape is always legible, and each
 * piece is labeled with its bounding-box size in mm.
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
  const dragStart = useRef<{ clientX: number; clientY: number; origX: number; origY: number; moved: boolean } | null>(null);

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
    dragStart.current = { clientX: e.clientX, clientY: e.clientY, origX: p.x, origY: p.y, moved: false };
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
    if (Math.abs(dxMm) > 0.2 || Math.abs(dyMm) > 0.2) dragStart.current.moved = true;
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

  /**
   * Rotates one placed piece 90° in place, around its own bounding-box
   * center — a pure rigid rotation of the already-placed outline. The
   * export transform in pdfIO.ts derives each piece's position/rotation
   * empirically from (placement.outline, placement.rotationDeg) rather
   * than trusting nesting.ts's internal math, so this stays export-safe:
   * rotating a rigid shape by θ about any point is still expressible as
   * rotate(localOutline, oldRot + θ) plus some constant translation.
   */
  function rotatePlacement(i: number) {
    if (!onChange) return;
    const p = placements[i];
    const b = polygonBounds(p.outline);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const rotated = translatePolygon(rotatePolygon(translatePolygon(p.outline, -cx, -cy), 90), cx, cy);
    onChange(
      placements.map((pl, idx) =>
        idx === i ? { ...pl, outline: rotated, rotationDeg: (pl.rotationDeg + 90) % 360 } : pl
      )
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-line bg-surface-sunken">
      <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-1.5 text-xs text-ink-muted">
        <span>
          Sheet: {sheetWidthMm.toFixed(0)} × {sheetHeightMm.toFixed(0)} mm
        </span>
        <span>{placements.length} placed</span>
      </div>
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
          const b = polygonBounds(p.outline);
          const cx = (b.minX + b.maxX) / 2;
          const cy = sheetHeightMm - (b.minY + b.maxY) / 2;
          const wMm = b.maxX - b.minX;
          const hMm = b.maxY - b.minY;
          const fontSize = Math.max(sheetWidthMm / 90, 3);
          const rotateBtnR = Math.max(sheetWidthMm / 130, 3.5);
          return (
            <g key={`${p.pieceId}-${p.instanceIndex}-${i}`}>
              {/* Fill, lightly tinted per piece so distinct pieces are easy to tell apart */}
              <path d={d} fill={color} fillOpacity={dragIdx === i ? 0.3 : 0.16} stroke="none" />
              {/* Crisp wireframe of the actual cut path — this is what ships in the cut file */}
              <path
                d={d}
                fill="none"
                stroke="#111827"
                strokeWidth={sheetWidthMm / 1200}
                strokeDasharray={dragIdx === i ? `${sheetWidthMm / 250} ${sheetWidthMm / 500}` : undefined}
                style={onChange ? { cursor: "grab" } : undefined}
                onPointerDown={onChange ? (e) => handlePointerDown(i, e) : undefined}
              />
              {/* Wider, invisible hit-area so dragging isn't limited to the thin stroke line */}
              <path
                d={d}
                fill={onChange ? "transparent" : "none"}
                stroke="transparent"
                strokeWidth={sheetWidthMm / 60}
                style={onChange ? { cursor: "grab" } : undefined}
                onPointerDown={onChange ? (e) => handlePointerDown(i, e) : undefined}
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                fontSize={fontSize}
                fill="#111827"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {wMm.toFixed(0)} × {hMm.toFixed(0)} mm
              </text>
              {onChange && (
                <g
                  transform={`translate(${b.maxX - rotateBtnR - fontSize * 0.2}, ${sheetHeightMm - b.maxY + rotateBtnR + fontSize * 0.2})`}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    rotatePlacement(i);
                  }}
                >
                  <circle r={rotateBtnR} fill="white" stroke="#111827" strokeWidth={rotateBtnR / 8} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={rotateBtnR * 1.3} style={{ pointerEvents: "none", userSelect: "none" }}>
                    ⟳
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {onChange && (
        <p className="border-t border-line bg-surface px-3 py-1.5 text-xs text-ink-muted">
          Drag a piece to move it, or use the ⟳ button to rotate it 90° — both override the auto layout and do not re-check for overlaps.
        </p>
      )}
    </div>
  );
}
