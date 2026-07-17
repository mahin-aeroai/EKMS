// Auto-traces a cut-contour polygon from a design's actual silhouette,
// instead of requiring the operator to place every vertex by hand. Works
// by rendering the PDF page onto a transparent canvas (no background
// fill) and tracing the boundary of whatever pixels came out non-
// transparent. This only works for artwork that actually has a
// transparent background in the source PDF (a shape like a star with
// nothing behind it) — production art that bleeds a solid background to
// the edge has no transparency to trace, and this returns
// `hadTransparency: false` so the caller can tell the operator to edit
// the outline by hand instead.
"use client";

import * as pdfjsLib from "pdfjs-dist";
import type { Point } from "./geometry";

export interface TraceResult {
  outline: Point[]; // canvas-local mm polygon, bottom-left origin, sized to contentWidthMm x contentHeightMm
  hadTransparency: boolean;
}

export async function traceOutlineFromPdf(
  bytes: ArrayBuffer,
  opts: { contentWidthMm: number; contentHeightMm: number; maxDimPx?: number }
): Promise<TraceResult> {
  const maxDimPx = opts.maxDimPx ?? 900;
  const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  const page = await doc.getPage(1);
  const [x0, y0, x1, y1] = page.view;
  const widthPt = x1 - x0;
  const heightPt = y1 - y0;
  const scale = Math.min(maxDimPx / widthPt, maxDimPx / heightPt, 4);
  const viewport = page.getViewport({ scale: Math.max(scale, 0.05) });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  // Deliberately no background fill first — if the PDF itself has no
  // opaque background, transparent regions stay transparent here.
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  const ALPHA_THRESHOLD = 16;
  let opaqueCount = 0;
  for (let i = 0; i < width * height; i++) {
    if (img[i * 4 + 3] >= ALPHA_THRESHOLD) {
      mask[i] = 1;
      opaqueCount++;
    }
  }

  if (opaqueCount === 0 || opaqueCount >= width * height - 4) {
    // Nothing rendered, or the page is fully opaque (no transparency to trace).
    return { outline: [], hadTransparency: false };
  }

  keepLargestComponent(mask, width, height);
  const contour = traceBoundary(mask, width, height);
  if (!contour || contour.length < 3) return { outline: [], hadTransparency: false };

  const simplified = simplifyPolygon(contour, Math.max(width, height) * 0.0025);

  const mmPerPxX = opts.contentWidthMm / width;
  const mmPerPxY = opts.contentHeightMm / height;
  const outline: Point[] = simplified.map((p) => ({
    x: p.x * mmPerPxX,
    y: opts.contentHeightMm - p.y * mmPerPxY, // pixel rows go top-down; mm frame is bottom-left origin
  }));

  return { outline, hadTransparency: true };
}

/** Zeros out every connected foreground component except the largest one (4-connected flood fill), to ignore anti-aliasing specks/noise. */
function keepLargestComponent(mask: Uint8Array, width: number, height: number) {
  const labels = new Int32Array(width * height).fill(-1);
  const areas: number[] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const label = areas.length;
    let area = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      area++;
      const x = idx % width;
      const y = (idx / width) | 0;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y < height - 1 ? idx + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && mask[n] && labels[n] === -1) {
          labels[n] = label;
          stack.push(n);
        }
      }
    }
    areas.push(area);
  }

  if (areas.length <= 1) return;
  let bestLabel = 0;
  for (let i = 1; i < areas.length; i++) if (areas[i] > areas[bestLabel]) bestLabel = i;
  for (let i = 0; i < mask.length; i++) mask[i] = labels[i] === bestLabel ? 1 : 0;
}

/** Moore-neighbor boundary tracing of the (now single-component) mask's outer contour. */
function traceBoundary(mask: Uint8Array, width: number, height: number): Point[] | null {
  const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= width || yy >= height ? 0 : mask[yy * width + xx]);

  let start: { x: number; y: number } | null = null;
  outer: for (let y = 0; y < height && !start; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] && (at(x - 1, y) === 0 || at(x + 1, y) === 0 || at(x, y - 1) === 0 || at(x, y + 1) === 0)) {
        start = { x, y };
        break outer;
      }
    }
  }
  if (!start) return null;

  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  const contour: Point[] = [];
  let cx = start.x;
  let cy = start.y;
  let backtrackDir = 6;
  const maxSteps = width * height * 2;
  let steps = 0;
  do {
    contour.push({ x: cx, y: cy });
    let found = false;
    for (let k = 0; k < 8; k++) {
      const dir = (backtrackDir + 1 + k) % 8;
      const nx = cx + dirs[dir][0];
      const ny = cy + dirs[dir][1];
      if (at(nx, ny)) {
        cx = nx;
        cy = ny;
        backtrackDir = (dir + 4) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    steps++;
  } while ((cx !== start.x || cy !== start.y) && steps < maxSteps);

  return contour;
}

function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  let simplified = douglasPeucker(points, epsilon);
  if (simplified.length < 3) simplified = points.slice(0, 3);
  if (simplified.length > 200) simplified = douglasPeucker(points, epsilon * 3);
  return simplified;
}

function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[end]];
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}
