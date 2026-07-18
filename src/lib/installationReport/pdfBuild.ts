// Assembles the exported Installation Report PDF entirely client-side —
// mirrors the Cut File Tool's philosophy (src/lib/cutfile/pdfIO.ts): no
// server round-trip, everything from photo cropping to the final page
// layout happens in the browser. Page size and structure follow the real
// Apple Site Installation Report this was modeled from (see the reference
// PDF discussed with the operator): A3 landscape, a gray title bar, a
// per-site details table, then full-bleed photo pages per site.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prepareCoverImage } from "./imaging";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

// Matches the reference report's page size (measured off the source PDF:
// 1190.88 x 840.96pt, i.e. A3 landscape) — large enough that several
// full-size install photos per page stay legible.
const PAGE_WIDTH = mm(420);
const PAGE_HEIGHT = mm(297);
const MARGIN = mm(12);
const HEADER_HEIGHT = mm(14);
const FOOTER_HEIGHT = mm(8);

const GRAY = rgb(0.58, 0.58, 0.58);
const LIGHT_GRAY = rgb(0.9, 0.9, 0.9);
const LINE_GRAY = rgb(0.75, 0.75, 0.75);
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.42);

export interface SiteEntry {
  label: string;
  fixtureType: string;
  size: string;
  material: string;
  dateOfInstallation: string;
  installedBy: string;
  wasSuccessful: string;
  siteCondition: string;
  scaffoldingRequired: string;
  storePermissionSlots: string;
  installedArtwork: string;
  mainSlide: File | null;
  closeUp: File | null;
  cornerTL: File | null;
  cornerTR: File | null;
  cornerBL: File | null;
  cornerBR: File | null;
}

export interface StorePictures {
  storeFullCover: File | null;
  installationCloseUp: File | null;
  streetView1: File | null;
  streetView2: File | null;
  cornerPic1: File | null;
  cornerPic2: File | null;
  cornerPic3: File | null;
  cornerPic4: File | null;
}

export interface ReportData {
  storeName: string;
  address: string;
  sfoId: string;
  program: string;
  programDetails: string;
  storePictures: StorePictures;
  sites: SiteEntry[];
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  storeName: string;
  sfoId: string;
  program: string;
}

function newPage(ctx: Ctx): PDFPage {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(ctx, page);
  drawFooter(ctx, page);
  return page;
}

function drawHeader(ctx: Ctx, page: PDFPage) {
  const barY = PAGE_HEIGHT - HEADER_HEIGHT;
  page.drawRectangle({ x: 0, y: barY, width: PAGE_WIDTH, height: HEADER_HEIGHT, color: GRAY });
  page.drawText("APPLE STORE INSTALLATION REPORT", {
    x: MARGIN,
    y: barY + HEADER_HEIGHT / 2 - 5,
    size: 12,
    font: ctx.bold,
    color: rgb(1, 1, 1),
  });

  const infoY = barY - 16;
  page.drawText(ctx.storeName || "Untitled store", { x: MARGIN, y: infoY, size: 14, font: ctx.bold, color: INK });

  const rightLine1 = `SFO ID: ${ctx.sfoId || "—"}`;
  const rightLine2 = `Apple Program: ${ctx.program || "—"}`;
  const w1 = ctx.bold.widthOfTextAtSize(rightLine1, 10);
  const w2 = ctx.bold.widthOfTextAtSize(rightLine2, 10);
  page.drawText(rightLine1, { x: PAGE_WIDTH - MARGIN - w1, y: barY - 12, size: 10, font: ctx.bold, color: INK });
  page.drawText(rightLine2, { x: PAGE_WIDTH - MARGIN - w2, y: barY - 25, size: 10, font: ctx.bold, color: INK });

  page.drawLine({
    start: { x: MARGIN, y: infoY - 12 },
    end: { x: PAGE_WIDTH - MARGIN, y: infoY - 12 },
    thickness: 1,
    color: LINE_GRAY,
  });
}

function drawFooter(ctx: Ctx, page: PDFPage) {
  const text = "Apple Confidential - Internal Use Only";
  const size = 8;
  const w = ctx.font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: PAGE_WIDTH - MARGIN - w, y: FOOTER_HEIGHT / 2, size, font: ctx.font, color: MUTED });
}

/** Content area below the header/divider and above the footer, where each page type lays out its own stuff. */
function contentBounds() {
  return {
    left: MARGIN,
    right: PAGE_WIDTH - MARGIN,
    top: PAGE_HEIGHT - HEADER_HEIGHT - 42,
    bottom: FOOTER_HEIGHT + 10,
  };
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

async function drawImageBox(
  ctx: Ctx,
  page: PDFPage,
  file: File | null,
  x: number,
  y: number,
  w: number,
  h: number,
  label?: string
) {
  if (!file) {
    page.drawRectangle({ x, y, width: w, height: h, color: LIGHT_GRAY, borderColor: LINE_GRAY, borderWidth: 1 });
    const msg = "No photo attached";
    const size = 9;
    const tw = ctx.font.widthOfTextAtSize(msg, size);
    page.drawText(msg, { x: x + w / 2 - tw / 2, y: y + h / 2, size, font: ctx.font, color: MUTED });
  } else {
    const prepared = await prepareCoverImage(file, w, h);
    const img = await ctx.doc.embedJpg(prepared.bytes);
    page.drawImage(img, { x, y, width: w, height: h });
    page.drawRectangle({ x, y, width: w, height: h, borderColor: LINE_GRAY, borderWidth: 1 });
  }
  if (label) {
    page.drawText(label, { x, y: y - 13, size: 9, font: ctx.bold, color: INK });
  }
}

function drawSectionTitle(ctx: Ctx, page: PDFPage, text: string, y: number) {
  page.drawText(text, { x: MARGIN, y, size: 11, font: ctx.bold, color: INK });
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function drawStoreDetailsPage(ctx: Ctx, data: ReportData) {
  const page = newPage(ctx);
  const b = contentBounds();
  let y = b.top;

  drawSectionTitle(ctx, page, "Store details", y);
  y -= 20;

  const rows: [string, string][] = [
    ["Address", data.address || "—"],
    ["SFO ID", data.sfoId || "—"],
    ["Apple Program", data.program || "—"],
    ["Number of installation sites", String(data.sites.length)],
  ];

  const labelColWidth = mm(55);
  const rowHeight = 22;
  const tableWidth = b.right - b.left;

  for (const [label, value] of rows) {
    page.drawRectangle({ x: b.left, y: y - rowHeight, width: tableWidth, height: rowHeight, borderColor: LINE_GRAY, borderWidth: 1 });
    page.drawLine({ start: { x: b.left + labelColWidth, y }, end: { x: b.left + labelColWidth, y: y - rowHeight }, thickness: 1, color: LINE_GRAY });
    page.drawText(label, { x: b.left + 8, y: y - rowHeight / 2 - 4, size: 10, font: ctx.bold, color: INK });
    const valueLines = wrapText(ctx.font, value, 10, tableWidth - labelColWidth - 16);
    page.drawText(valueLines[0] ?? "", { x: b.left + labelColWidth + 8, y: y - rowHeight / 2 - 4, size: 10, font: ctx.font, color: INK });
    y -= rowHeight;
  }

  y -= 24;
  drawSectionTitle(ctx, page, "Program details", y);
  y -= 18;
  const detailLines = wrapText(ctx.font, data.programDetails || "—", 10, tableWidth);
  for (const line of detailLines.slice(0, 6)) {
    page.drawText(line, { x: b.left, y, size: 10, font: ctx.font, color: INK });
    y -= 14;
  }
}

async function drawStorePicturesPage(ctx: Ctx, pictures: StorePictures) {
  const page = newPage(ctx);
  const b = contentBounds();
  drawSectionTitle(ctx, page, "Store overview photos", b.top);

  const slots: [string, File | null][] = [
    ["Store Full Cover", pictures.storeFullCover],
    ["Installation Close-up", pictures.installationCloseUp],
    ["Street View 1", pictures.streetView1],
    ["Street View 2", pictures.streetView2],
    ["Corner Pic 1", pictures.cornerPic1],
    ["Corner Pic 2", pictures.cornerPic2],
    ["Corner Pic 3", pictures.cornerPic3],
    ["Corner Pic 4", pictures.cornerPic4],
  ];

  const cols = 4;
  const rows = 2;
  const gap = mm(6);
  const availW = b.right - b.left;
  const availH = b.top - 24 - b.bottom;
  const cellW = (availW - gap * (cols - 1)) / cols;
  const cellH = (availH - gap * (rows - 1) - rows * 16) / rows;

  for (let i = 0; i < slots.length; i++) {
    const [label, file] = slots[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = b.left + col * (cellW + gap);
    const y = b.top - 24 - row * (cellH + gap + 16) - cellH;
    await drawImageBox(ctx, page, file, x, y, cellW, cellH, label);
  }
}

async function drawSiteDetailsPage(ctx: Ctx, site: SiteEntry, index: number) {
  const page = newPage(ctx);
  const b = contentBounds();
  let y = b.top;

  drawSectionTitle(ctx, page, `Installation Site ${index + 1}${site.label ? ` — ${site.label}` : ""}`, y);
  y -= 20;

  const rows: [string, string][] = [
    ["Fixture Type", site.fixtureType || "—"],
    ["Size", site.size || "—"],
    ["Material", site.material || "—"],
    ["Date of Installation", site.dateOfInstallation || "—"],
    ["Installation Carried by", site.installedBy || "—"],
    ["Was the Installation Successful", site.wasSuccessful || "—"],
    ["Site / Fixture Condition", site.siteCondition || "—"],
    ["Scaffolding Required", site.scaffoldingRequired || "—"],
    ["Store Permission Slots", site.storePermissionSlots || "—"],
    ["Installed Artwork Details", site.installedArtwork || "—"],
  ];

  const labelColWidth = mm(65);
  const tableWidth = b.right - b.left;

  for (const [label, value] of rows) {
    const valueLines = wrapText(ctx.font, value, 10, tableWidth - labelColWidth - 16);
    const rowHeight = Math.max(22, valueLines.length * 13 + 9);
    page.drawRectangle({ x: b.left, y: y - rowHeight, width: tableWidth, height: rowHeight, borderColor: LINE_GRAY, borderWidth: 1 });
    page.drawLine({ start: { x: b.left + labelColWidth, y }, end: { x: b.left + labelColWidth, y: y - rowHeight }, thickness: 1, color: LINE_GRAY });
    page.drawText(label, { x: b.left + 8, y: y - 15, size: 10, font: ctx.bold, color: INK });
    valueLines.forEach((line, li) => {
      page.drawText(line, { x: b.left + labelColWidth + 8, y: y - 15 - li * 13, size: 10, font: ctx.font, color: INK });
    });
    y -= rowHeight;
    if (y < b.bottom + 40) break; // guard against an unrealistically long field list overflowing the page
  }
}

async function drawFullBleedPhotoPage(ctx: Ctx, file: File, caption: string) {
  const page = newPage(ctx);
  const b = contentBounds();
  const w = b.right - b.left;
  const h = b.top - b.bottom - 18;
  await drawImageBox(ctx, page, file, b.left, b.bottom + 18, w, h, caption);
}

async function drawCornersPage(ctx: Ctx, site: SiteEntry, index: number) {
  const page = newPage(ctx);
  const b = contentBounds();
  drawSectionTitle(ctx, page, `Installation Site ${index + 1} — Close-up Corners`, b.top);

  const gap = mm(8);
  const availW = b.right - b.left;
  const availH = b.top - 24 - b.bottom;
  const cellW = (availW - gap) / 2;
  const cellH = (availH - gap - 2 * 16) / 2;

  const corners: [string, File | null][] = [
    ["Top Left Corner", site.cornerTL],
    ["Top Right Corner", site.cornerTR],
    ["Bottom Left Corner", site.cornerBL],
    ["Bottom Right Corner", site.cornerBR],
  ];

  for (let i = 0; i < 4; i++) {
    const [label, file] = corners[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = b.left + col * (cellW + gap);
    const y = b.top - 24 - row * (cellH + gap + 16) - cellH;
    await drawImageBox(ctx, page, file, x, y, cellW, cellH, label);
  }
}

/** True if a site has at least one attached photo — used to skip empty photo pages instead of generating blank placeholder pages for a site nobody has added pictures to yet. */
function siteHasAnyPhoto(site: SiteEntry): boolean {
  return Boolean(site.mainSlide || site.closeUp || site.cornerTL || site.cornerTR || site.cornerBL || site.cornerBR);
}

export async function buildInstallationReportPdf(data: ReportData): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, bold, storeName: data.storeName, sfoId: data.sfoId, program: data.program };

  drawStoreDetailsPage(ctx, data);
  await drawStorePicturesPage(ctx, data.storePictures);

  for (let i = 0; i < data.sites.length; i++) {
    const site = data.sites[i];
    await drawSiteDetailsPage(ctx, site, i);
    if (site.mainSlide) await drawFullBleedPhotoPage(ctx, site.mainSlide, `Installation Site ${i + 1} — Main View`);
    if (site.closeUp) await drawFullBleedPhotoPage(ctx, site.closeUp, `Installation Site ${i + 1} — Close-up`);
    if (siteHasAnyPhoto(site) && (site.cornerTL || site.cornerTR || site.cornerBL || site.cornerBR)) {
      await drawCornersPage(ctx, site, i);
    }
  }

  const bytes = await doc.save();
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
