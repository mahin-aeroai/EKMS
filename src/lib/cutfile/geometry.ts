// Shared geometry helpers for the Cut File Tool (bleed + cut-dot placement,
// and the nesting engine). Everything here works in millimeters unless a
// name ends in `Pt` (PDF points, 1/72in) — PDF page boxes are always in pt.

export const PT_PER_MM = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

export function ptToMm(pt: number): number {
  return pt / PT_PER_MM;
}

export interface Point {
  x: number;
  y: number;
}

export interface DotSpec {
  id: string;
  x: number; // mm, bottom-left origin, relative to the FULL output canvas (trim + bleed + dot zone + margin)
  y: number;
}

export interface DotLayoutParams {
  // Full size of the UPLOADED page, as-is. Production art in this workflow
  // is delivered already including its own bleed (e.g. a "4100x1100 with
  // 14mm bleed" file is a 4128x1128mm page) — this function does not add a
  // second, independent bleed margin on top of that. `bleedMm` below is
  // purely informational (used to draw a trim reference line) and never
  // changes canvas size or content placement — see the bug this fixed.
  trimWidthMm: number;
  trimHeightMm: number;
  bleedMm: number;
  dotDiameterMm: number;
  marginMm: number; // clear space beyond the dot, to the outer edge of the sheet
  topCount: number;
  bottomCount: number;
  leftCount: number; // interior dots only, corners are covered by top/bottom counts
  rightCount: number;
}

export interface DotLayoutResult {
  canvasWidthMm: number;
  canvasHeightMm: number;
  contentOffsetMm: number; // how far in from the new canvas edge the original (already bleed-inclusive) content is placed
  dots: DotSpec[];
}

/**
 * Computes the default (auto) dot layout: the original uploaded page —
 * already trim + its own bleed, untouched — is centered on a larger canvas
 * that adds only a dot zone + clear margin on every side. Dots are placed
 * at the center of the dot zone unless the user drags them elsewhere
 * afterward (see DotSpec — these are just the starting positions).
 *
 * IMPORTANT: `bleedMm` is NOT added into the canvas size here. Earlier this
 * function treated the incoming width/height as a bare trim size and added
 * bleedMm on top of it — but the incoming size is actually the uploaded
 * PDF's full page, which already includes its bleed. Adding bleedMm again
 * inflated the canvas and shifted the content off-center (reported by the
 * user as the design "going down" in the exported PDF). `bleedMm` is kept
 * on the params only so the UI can draw a dashed trim-reference line inset
 * from the content edge.
 */
export function computeDotLayout(params: DotLayoutParams): DotLayoutResult {
  const { trimWidthMm, trimHeightMm, dotDiameterMm, marginMm, topCount, bottomCount, leftCount, rightCount } = params;
  const dotZoneMm = dotDiameterMm; // the band the dot occupies, one diameter wide
  const sideExtraMm = dotZoneMm + marginMm;

  const canvasWidthMm = trimWidthMm + 2 * sideExtraMm;
  const canvasHeightMm = trimHeightMm + 2 * sideExtraMm;

  // distance from the outer canvas edge to the center of the dot band
  const dotCenterOffset = marginMm + dotDiameterMm / 2;

  const topY = canvasHeightMm - dotCenterOffset;
  const bottomY = dotCenterOffset;
  const leftX = dotCenterOffset;
  const rightX = canvasWidthMm - dotCenterOffset;

  const dots: DotSpec[] = [];
  let n = 0;

  // Top / bottom edges: evenly spaced including the two corner positions.
  distributeInclusive(topCount, leftX, rightX).forEach((x) => dots.push({ id: `d${n++}`, x, y: topY }));
  distributeInclusive(bottomCount, leftX, rightX).forEach((x) => dots.push({ id: `d${n++}`, x, y: bottomY }));

  // Left / right edges: interior points only (corners already placed above).
  distributeInterior(leftCount, bottomY, topY).forEach((y) => dots.push({ id: `d${n++}`, x: leftX, y }));
  distributeInterior(rightCount, bottomY, topY).forEach((y) => dots.push({ id: `d${n++}`, x: rightX, y }));

  return { canvasWidthMm, canvasHeightMm, contentOffsetMm: sideExtraMm, dots };
}

function distributeInclusive(count: number, from: number, to: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(from + to) / 2];
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(from + ((to - from) * i) / (count - 1));
  return out;
}

function distributeInterior(count: number, from: number, to: number): number[] {
  if (count <= 0) return [];
  const span = to - from;
  const out: number[] = [];
  for (let i = 1; i <= count; i++) out.push(from + (span * i) / (count + 1));
  return out;
}

// ---------------------------------------------------------------------------
// Polygon helpers (used by the cut-contour editor + nesting engine)
// ---------------------------------------------------------------------------

export function polygonBounds(poly: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function translatePolygon(poly: Point[], dx: number, dy: number): Point[] {
  return poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function rotatePolygon(poly: Point[], degrees: number): Point[] {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return poly.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
}

/** Point-in-polygon, even-odd rule. Used for rasterizing pieces onto the nesting grid. */
export function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Simple rectangle polygon, corners in CCW order starting bottom-left. Useful as a fallback outline. */
export function rectPolygon(widthMm: number, heightMm: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: widthMm, y: 0 },
    { x: widthMm, y: heightMm },
    { x: 0, y: heightMm },
  ];
}
