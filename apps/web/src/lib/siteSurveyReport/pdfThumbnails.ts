"use client";

// Client-side PDF page rasterization for the Review step's "pick a page,
// crop out the photo" flow -- same pdfjs-dist pattern as the Cut File
// Tool's loadPdf() (src/lib/cutfile/pdfIO.ts), reused rather than
// reinvented since it's already the proven way this app rasterizes a PDF
// page to a canvas. AI extraction can tell us which pages likely contain
// which category of photo (pageHints), but not draw a pixel-precise crop
// box -- a person does that last step here, on a real rendered page.

import * as pdfjsLib from "pdfjs-dist";

let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  workerConfigured = true;
}

export interface RasterizedPage {
  page: number;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

/** One low-res thumbnail per page -- for browsing/picking, not cropping. */
export async function rasterizeAllPagesThumbnails(bytes: ArrayBuffer, maxDimPx = 480): Promise<RasterizedPage[]> {
  ensureWorker();
  const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  const pages: RasterizedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    pages.push(await rasterizeSinglePage(doc, i, maxDimPx));
  }
  return pages;
}

/** One page at a higher resolution -- for the actual crop-to-photo tool, where crop precision matters. */
export async function rasterizeOnePageHiRes(bytes: ArrayBuffer, pageNumber: number, maxDimPx = 1600): Promise<RasterizedPage> {
  ensureWorker();
  const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  return rasterizeSinglePage(doc, pageNumber, maxDimPx);
}

async function rasterizeSinglePage(doc: pdfjsLib.PDFDocumentProxy, pageNumber: number, maxDimPx: number): Promise<RasterizedPage> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(maxDimPx / base.width, maxDimPx / base.height, 1);
  const viewport = page.getViewport({ scale: Math.max(scale, 0.05) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { page: pageNumber, dataUrl: canvas.toDataURL("image/png"), widthPx: canvas.width, heightPx: canvas.height };
}

/** Crops a fractional {x,y,w,h} region (0-1) out of a rasterized page's dataUrl and re-encodes it as JPEG bytes, ready to upload. */
export async function cropToJpeg(dataUrl: string, rect: { x: number; y: number; w: number; h: number }, quality = 0.85): Promise<Uint8Array> {
  const img = await loadImage(dataUrl);
  const sx = rect.x * img.width;
  const sy = rect.y * img.height;
  const sw = rect.w * img.width;
  const sh = rect.h * img.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode image"))), "image/jpeg", quality)
  );
  return new Uint8Array(await blob.arrayBuffer());
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load image"));
    img.src = src;
  });
}
