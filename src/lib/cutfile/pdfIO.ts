// All PDF parsing/rendering (pdfjs-dist) and PDF generation (pdf-lib)
// happens here, and entirely client-side — a File object never leaves the
// browser. Nothing in this module makes a network request.
"use client";

import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import { mmToPt, ptToMm, type Point, type DotSpec } from "./geometry";
import type { NestPlacement } from "./nesting";

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
}): Promise<Blob> {
  const { originalBytes, canvasWidthMm, canvasHeightMm, contentOffsetMm, dots, dotDiameterMm } = opts;

  const outDoc = await PDFDocument.create();
  const [embedded] = await outDoc.embedPdf(originalBytes, [0]);

  const page = outDoc.addPage([mmToPt(canvasWidthMm), mmToPt(canvasHeightMm)]);
  page.drawPage(embedded, {
    x: mmToPt(contentOffsetMm),
    y: mmToPt(contentOffsetMm),
  });

  const radiusPt = mmToPt(dotDiameterMm / 2);
  for (const dot of dots) {
    page.drawCircle({
      x: mmToPt(dot.x),
      y: mmToPt(dot.y),
      size: radiusPt,
      color: rgb(0, 0, 0),
    });
  }

  const bytes = await outDoc.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

export interface NestSourceFile {
  pieceId: string;
  bytes: ArrayBuffer;
}

/**
 * Builds the combined nested-sheet PDF: one blank page at the material
 * size, with each placed piece's ORIGINAL page content embedded at its
 * nested position and rotation (full original resolution preserved).
 */
export async function buildNestedSheetPdf(opts: {
  sheetWidthMm: number;
  sheetHeightMm: number;
  placements: NestPlacement[];
  sources: NestSourceFile[];
  pieceOriginMm: Record<string, Point>; // each piece's outline-space (0,0) in ITS OWN page's bottom-left mm coords — normally {x:0,y:0}
}): Promise<Blob> {
  const { sheetWidthMm, sheetHeightMm, placements, sources } = opts;
  const outDoc = await PDFDocument.create();
  const page = outDoc.addPage([mmToPt(sheetWidthMm), mmToPt(sheetHeightMm)]);

  const embeddedByPiece = new Map<string, Awaited<ReturnType<typeof outDoc.embedPdf>>[number]>();
  for (const src of sources) {
    const [embedded] = await outDoc.embedPdf(src.bytes, [0]);
    embeddedByPiece.set(src.pieceId, embedded);
  }

  for (const placement of placements) {
    const embedded = embeddedByPiece.get(placement.pieceId);
    if (!embedded) continue;
    // placement.x/y is the translation applied AFTER rotating the outline
    // about its own local origin and normalizing to non-negative bounds —
    // see nesting.ts. pdf-lib's drawPage rotates the embedded page about
    // (x,y) using the SAME convention (rotate about local origin, then
    // translate to x,y), so we can pass the values straight through.
    page.drawPage(embedded, {
      x: mmToPt(placement.x),
      y: mmToPt(placement.y),
      rotate: degrees(placement.rotationDeg),
    });
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
