"use client";

import type { NestResult } from "@/lib/cutfile/nesting";

const PALETTE = ["#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#BE185D", "#65A30D"];

export function NestPreview({ result }: { result: NestResult }) {
  const { sheetWidthMm, sheetHeightMm, placements } = result;
  const colorByPiece = new Map<string, string>();
  let colorIdx = 0;
  for (const p of placements) {
    if (!colorByPiece.has(p.pieceId)) {
      colorByPiece.set(p.pieceId, PALETTE[colorIdx % PALETTE.length]);
      colorIdx++;
    }
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-line bg-surface-sunken">
      <svg viewBox={`0 0 ${sheetWidthMm} ${sheetHeightMm}`} className="w-full" style={{ aspectRatio: `${sheetWidthMm} / ${sheetHeightMm}` }}>
        <rect x={0} y={0} width={sheetWidthMm} height={sheetHeightMm} fill="white" stroke="#111827" strokeWidth={sheetWidthMm / 500} />
        {placements.map((p, i) => {
          const color = colorByPiece.get(p.pieceId) ?? "#2563EB";
          const d = p.outline.map((pt, j) => `${j === 0 ? "M" : "L"} ${pt.x} ${sheetHeightMm - pt.y}`).join(" ") + " Z";
          return <path key={`${p.pieceId}-${p.instanceIndex}-${i}`} d={d} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={sheetWidthMm / 1000} />;
        })}
      </svg>
    </div>
  );
}
