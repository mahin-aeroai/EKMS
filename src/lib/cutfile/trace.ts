// Auto-traces a cut-contour polygon from a design's actual silhouette,
// instead of requiring the operator to place every vertex by hand. Renders
// the PDF page onto a transparent canvas (no background fill first) and
// tries two ways to find the shape:
//
// 1. Alpha: if the PDF itself has a transparent background, whatever
//    rendered non-transparent IS the shape.
// 2. Color difference: most real production art (like a star sitting on a
//    solid-color background rectangle that fills the whole page) has no
//    transparency at all — everything renders opaque. In that case, sample
//    the four corners as the presumed background color and trace whatever
//    differs from it by more than a threshold. This is the common case in
//    practice and was previously unsupported (traces would just fail on
//    any file with a solid background fill, which is most of them).
//
// If neither approach finds a clear foreground/background split (e.g. a
// genuinely solid, single-color page, or a busy photographic design with
// no distinct edge), `outline` comes back empty and the caller should tell
// the operator to reshape the outline by hand.
"use client";

import * as pdfjsLib from "pdfjs-dist";
import type { Point } from "./geometry";

export interface TraceResult {
  outline: Point[]; // canvas-local mm polygon, bottom-left origin, sized to contentWidthMm x contentHeightMm
  method: "alpha" | "color-diff" | "none";
  /** Average fill color of the traced shape, 0-1 per channel — used to draw a matching color-bleed stroke on export. Only set when method !== "none". */
  fillColorRgb?: { r: number; g: number; b: number };
}

const COLOR_DIFF_THRESHOLD = 28; // roughly-perceptible RGB distance; tuned to ignore antialiasing, catch real edges

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

  const alphaMask = new Uint8Array(width * height);
  let opaqueCount = 0;
  for (let i = 0; i < width * height; i++) {
    if (img[i * 4 + 3] >= 16) {
      alphaMask[i] = 1;
      opaqueCount++;
    }
  }

  const hasTransparency = opaqueCount > 0 && opaqueCount < width * height - 4;
  let mask: Uint8Array;
  let method: TraceResult["method"];

  if (hasTransparency) {
    mask = alphaMask;
    method = "alpha";
  } else {
    const bg = sampleBackgroundColor(img, width, height);
    mask = new Uint8Array(width * height);
    let diffCount = 0;
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      if (colorDistance(img[o], img[o + 1], img[o + 2], bg) > COLOR_DIFF_THRESHOLD) {
        mask[i] = 1;
        diffCount++;
      }
    }
    // No clear split: either a flat solid page, or a design with no
    // distinct edge against its own corners (busy photo, gradient, etc).
    if (diffCount === 0 || diffCount >= width * height * 0.97) {
      return { outline: [], method: "none" };
    }
    method = "color-diff";
  }

  keepLargestComponent(mask, width, height);
  const contour = traceBoundary(mask, width, height);
  if (!contour || contour.length < 3) return { outline: [], method: "none" };
  // Sample color from pixels just inside the traced boundary rather than
  // averaging the whole shape — a whole-shape average washes out to a
  // muddy blend for gradient-filled designs (e.g. a rainbow star), while
  // the edge is what actually needs to match for the color-bleed stroke.
  const fillColorRgb = averageColorNearBoundary(img, mask, contour, width, height);

  const simplified = simplifyPolygon(contour, Math.max(width, height) * 0.0025);

  const mmPerPxX = opts.contentWidthMm / width;
  const mmPerPxY = opts.contentHeightMm / height;
  const outline: Point[] = simplified.map((p) => ({
    x: p.x * mmPerPxX,
    y: opts.contentHeightMm - p.y * mmPerPxY, // pixel rows go top-down; mm frame is bottom-left origin
  }));

  return { outline, method, fillColorRgb };
}

function sampleBackgroundColor(img: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const pts: [number, number][] = [
    [1, 1],
    [width - 2, 1],
    [1, height - 2],
    [width - 2, height - 2],
  ];
  let r = 0, g = 0, b = 0;
  for (const [x, y] of pts) {
    const i = (y * width + x) * 4;
    r += img[i];
    g += img[i + 1];
    b += img[i + 2];
  }
  return [r / pts.length, g / pts.length, b / pts.length];
}

function colorDistance(r: number, g: number, b: number, ref: [number, number, number]): number {
  return Math.hypot(r - ref[0], g - ref[1], b - ref[2]);
}

/**
 * Averages pixel color a few px INSIDE the traced boundary (walking along
 * the inward normal from each boundary point, staying within the mask),
 * subsampled along the contour for speed. This is the color that actually
 * sits at the cut edge, which is what the color-bleed stroke needs to
 * match — a whole-shape average would blur toward the design's overall
 * average color instead, which can look visibly wrong for a gradient or
 * multi-color fill.
 */
function averageColorNearBoundary(
  img: Uint8ClampedArray,
  mask: Uint8Array,
  contour: Point[],
  width: number,
  height: number
): { r: number; g: number; b: number } | undefined {
  const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= width || yy >= height ? 0 : mask[yy * width + xx]);
  const insetPx = Math.max(1, Math.round(Math.max(width, height) * 0.01)); // ~1% of the longest side, inward from the edge

  let r = 0, g = 0, b = 0, n = 0;
  const step = Math.max(1, Math.floor(contour.length / 400)); // cap sample count on long contours
  for (let i = 0; i < contour.length; i += step) {
    const p = contour[i];
    const prev = contour[(i - step + contour.length) % contour.length];
    const next = contour[(i + step) % contour.length];
    // Approximate inward normal from the local tangent direction.
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    // Rotate tangent -90° for one candidate normal; the mask tells us which
    // side is actually "inward" (foreground).
    let nx = ty / len;
    let ny = -tx / len;
    let sx = Math.round(p.x + nx * insetPx);
    let sy = Math.round(p.y + ny * insetPx);
    if (!at(sx, sy)) {
      nx = -nx;
      ny = -ny;
      sx = Math.round(p.x + nx * insetPx);
      sy = Math.round(p.y + ny * insetPx);
    }
    if (!at(sx, sy)) {
      sx = p.x;
      sy = p.y; // fall back to the boundary pixel itself
    }
    const o = (sy * width + sx) * 4;
    r += img[o];
    g += img[o + 1];
    b += img[o + 2];
    n++;
  }
  if (n === 0) return undefined;
  return { r: r / n / 255, g: g / n / 255, b: b / n / 255 };
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

/**
 * Samples a representative "edge color" from an already-rendered preview
 * (the same PNG data URL loadPdf() produces) — averages a thin band of
 * pixels around the outer border. Used for the "add bleed beyond print
 * size" mode: when the uploaded PDF is pure trim size with no bleed baked
 * in, the newly generated bleed band gets filled with this color rather
 * than being left blank, so a keder sewn 12-14mm out from the design edge
 * has real material (not white gaps) under it.
 */
export function sampleEdgeColorFromDataUrl(dataUrl: string): Promise<{ r: number; g: number; b: number } | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(undefined);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const { width, height } = canvas;
        const bandPx = Math.max(1, Math.round(Math.min(width, height) * 0.02));
        const data = ctx.getImageData(0, 0, width, height).data;
        let r = 0, g = 0, b = 0, n = 0;
        const sampleAt = (x: number, y: number) => {
          const o = (y * width + x) * 4;
          r += data[o];
          g += data[o + 1];
          b += data[o + 2];
          n++;
        };
        const step = Math.max(1, Math.round(Math.max(width, height) / 300));
        for (let x = 0; x < width; x += step) {
          for (let d = 0; d < bandPx; d++) {
            sampleAt(x, d);
            sampleAt(x, height - 1 - d);
          }
        }
        for (let y = 0; y < height; y += step) {
          for (let d = 0; d < bandPx; d++) {
            sampleAt(d, y);
            sampleAt(width - 1 - d, y);
          }
        }
        if (n === 0) {
          resolve(undefined);
          return;
        }
        resolve({ r: r / n / 255, g: g / n / 255, b: b / n / 255 });
      } catch {
        resolve(undefined);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}
