// All PDF parsing/rendering (pdfjs-dist) and PDF generation (pdf-lib)
// happens here, and entirely client-side — a File object never leaves the
// browser. Nothing in this module makes a network request.
"use client";

import * as pdfjsLib from "pdfjs-dist";
import {
  PDFDocument,
  type PDFPage,
  degrees,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  stroke,
  setLineWidth,
  setStrokingColor,
  setDashPattern,
} from "pdf-lib";
import { mmToPt, ptToMm, rotatePolygon, type Point, type DotSpec } from "./geometry";
import type { NestPlacement } from "./nesting";

/**
 * Draws a closed polygon as a thin stroked vector line — the actual cut
 * path a machine like a Zund table follows, as opposed to the rasterized
 * artwork underneath it. Uses pdf-lib's raw content-stream operators
 * (rather than drawSvgPath, which expects SVG's y-down convention and
 * would need every point flipped) so the incoming points can be handed
 * over directly in the same y-up mm space used everywhere else in this
 * tool. Bright magenta by default — a common stand-in for a dedicated
 * "CutContour" spot color, which pdf-lib can't create directly.
 */
function drawCutPath(page: PDFPage, outlineMm: Point[], color = rgb(1, 0, 1), lineWidthMm = 0.25) {
  if (outlineMm.length < 2) return;
  page.pushOperators(
    pushGraphicsState(),
    setStrokingColor(color),
    setLineWidth(mmToPt(lineWidthMm)),
    setDashPattern([], 0),
    moveTo(mmToPt(outlineMm[0].x), mmToPt(outlineMm[0].y)),
    ...outlineMm.slice(1).map((p) => lineTo(mmToPt(p.x), mmToPt(p.y))),
    closePath(),
    stroke(),
    popGraphicsState()
  );
}

/**
 * Draws one cut-registration dot: a white halo (so the mark stays visible
 * to the operator when the material is flipped for cutting from the
 * reverse side on a Zund table) with the black dot on top. Order matters —
 * PDF content paints in the order it's issued, so the white circle is
 * drawn first and the black circle over it.
 */
function drawDot(page: PDFPage, xMm: number, yMm: number, dotDiameterMm: number, haloMm: number) {
  const xPt = mmToPt(xMm);
  const yPt = mmToPt(yMm);
  if (haloMm > 0) {
    page.drawCircle({ x: xPt, y: yPt, size: mmToPt(dotDiameterMm / 2 + haloMm), color: rgb(1, 1, 1) });
  }
  page.drawCircle({ x: xPt, y: yPt, size: mmToPt(dotDiameterMm / 2), color: rgb(0, 0, 0) });
}

let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  workerConfigured = true;
}

export interface LoadedPdf {
  bytes: ArrayBuffer;
  widthMm: number;
  heightMm: number;
  previewDataUrl: string;
  previewWidthPx: number;
  previewHeightPx: number;
}

/**
 * Loads a PDF file, reads its page size, and renders a capped-resolution
 * preview. The preview is intentionally low-res (longest side <= maxDimPx)
 * so a "very heavy" high-res source file (large embedded photos etc.)
 * doesn't stall the browser — only the final export touches full-resolution
 * content, and even then it re-embeds the original page rather than
 * re-rasterizing it, so nothing is lost.
 */
export async function loadPdf(file: File, maxDimPx = 1400): Promise<LoadedPdf> {
  ensureWorker();
  const bytes = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  const page = await doc.getPage(1);
  const [x0, y0, x1, y1] = page.view;
  const widthPt = x1 - x0;
  const heightPt = y1 - y0;
  const widthMm = ptToMm(widthPt);
  const heightMm = ptToMm(heightPt);

  const scale = Math.min(maxDimPx / widthPt, maxDimPx / heightPt, 1);
  const viewport = page.getViewport({ scale: Math.max(scale, 0.02) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  return {
    bytes,
    widthMm,
    heightMm,
    previewDataUrl: canvas.toDataURL("image/png"),
    previewWidthPx: canvas.width,
    previewHeightPx: canvas.height,
  };
}

/**
 * Builds the final bleed+dot-marks PDF for a single design: the original
 * page (trim + its own bleed, untouched) centered on a larger canvas, with
 * solid black circles stamped at each dot position.
 */
export async function buildDotPlacementPdf(opts: {
  originalBytes: ArrayBuffer;
  canvasWidthMm: number;
  canvasHeightMm: number;
  contentOffsetMm: number;
  dots: DotSpec[];
  dotDiameterMm: number;
  dotHaloMm?: number; // white halo width around each black dot, default 2mm
  outline?: Point[]; // optional cut-contour, in the same canvas-local mm frame as `dots`
}): Promise<Blob> {
  const { originalBytes, canvasWidthMm, canvasHeightMm, contentOffsetMm, dots, dotDiameterMm, outline } = opts;
  const haloMm = opts.dotHaloMm ?? 2;

  const outDoc = await PDFDocument.create();
  const [embedded] = await outDoc.embedPdf(originalBytes, [0]);

  const page = outDoc.addPage([mmToPt(canvasWidthMm), mmToPt(canvasHeightMm)]);
  page.drawPage(embedded, {
    x: mmToPt(contentOffsetMm),
    y: mmToPt(contentOffsetMm),
  });

  for (const dot of dots) {
    drawDot(page, dot.x, dot.y, dotDiameterMm, haloMm);
  }

  if (outline && outline.length >= 3) {
    drawCutPath(page, outline);
  }

  const bytes = await outDoc.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

export interface NestSourceFile {
  pieceId: string;
  bytes: ArrayBuffer;
  // The SAME local outline array that was passed into nestPieces() for this
  // piece (the un-rotated, un-translated cut-contour, in canvas-local mm —
  // i.e. the piece's own bottom-left-origin frame that also anchors
  // contentOffsetMm and dots below). Needed to recover exactly how nesting
  // rotated + translated this piece, so the design and dots can be placed
  // as one rigid body consistent with placement.outline, without having to
  // assume anything about nesting.ts's internal normalization math.
  outline: Point[];
  contentOffsetMm: Point; // where the original PDF page sits inside the canvas-local frame
  dots: DotSpec[]; // in the same canvas-local frame
  dotDiameterMm: number;
  dotHaloMm?: number;
}

/**
 * Builds the combined nested-sheet PDF: one blank page at the material
 * size, with each placed piece's ORIGINAL page content embedded at its
 * nested position and rotation (full original resolution preserved),
 * PLUS that piece's cut dots (white halo + black) and a stroked cut-path
 * following its outline — all three move together as one rigid body per
 * placement, since a nested unit is the full design + bleed + dot zone +
 * margin, not just the bare design.
 */
export async function buildNestedSheetPdf(opts: {
  sheetWidthMm: number;
  sheetHeightMm: number;
  placements: NestPlacement[];
  sources: NestSourceFile[];
  drawCutPaths?: boolean; // default true
}): Promise<Blob> {
  const { sheetWidthMm, sheetHeightMm, placements, sources } = opts;
  const drawCutPaths = opts.drawCutPaths ?? true;
  const outDoc = await PDFDocument.create();
  const page = outDoc.addPage([mmToPt(sheetWidthMm), mmToPt(sheetHeightMm)]);

  const embeddedByPiece = new Map<string, Awaited<ReturnType<typeof outDoc.embedPdf>>[number]>();
  const sourceByPiece = new Map<string, NestSourceFile>();
  for (const src of sources) {
    const [embedded] = await outDoc.embedPdf(src.bytes, [0]);
    embeddedByPiece.set(src.pieceId, embedded);
    sourceByPiece.set(src.pieceId, src);
  }

  for (const placement of placements) {
    const embedded = embeddedByPiece.get(placement.pieceId);
    const src = sourceByPiece.get(placement.pieceId);
    if (!embedded || !src || placement.outline.length === 0 || src.outline.length === 0) continue;

    // Recover the piece's actual rotate+translate transform empirically:
    // rotate the piece's own local outline by the placement's rotation and
    // compare its first vertex to the corresponding vertex nesting.ts
    // already placed on the sheet (placement.outline). The difference is a
    // constant translation for this placement — apply that same
    // rotate-then-translate to any other local-frame point (the design's
    // content offset, each dot center) to keep everything rigidly attached.
    const rot = placement.rotationDeg;
    const rotatedLocalOutline = rotatePolygon(src.outline, rot);
    const constX = placement.outline[0].x - rotatedLocalOutline[0].x;
    const constY = placement.outline[0].y - rotatedLocalOutline[0].y;
    const toSheet = (p: Point): Point => {
      const [r] = rotatePolygon([p], rot);
      return { x: r.x + constX, y: r.y + constY };
    };

    const designPos = toSheet(src.contentOffsetMm);
    page.drawPage(embedded, {
      x: mmToPt(designPos.x),
      y: mmToPt(designPos.y),
      rotate: degrees(rot),
    });

    for (const dot of src.dots) {
      const dp = toSheet({ x: dot.x, y: dot.y });
      drawDot(page, dp.x, dp.y, src.dotDiameterMm, src.dotHaloMm ?? 2);
    }

    if (drawCutPaths) {
      drawCutPath(page, placement.outline);
    }
  }

  const bytes = await outDoc.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
