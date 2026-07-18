// Assembles the exported Installation Report PDF entirely client-side — no
// server round-trip, everything from photo cropping to page layout happens
// in the browser (mirrors the Cut File Tool's philosophy, see
// src/lib/cutfile/pdfIO.ts). This is a from-scratch premium redesign: a
// large hero cover with a KPI dashboard, modern rounded information cards
// instead of plain tables, a curated icon system drawn with primitive
// shapes (no external icon fonts/images needed inside a generated PDF),
// and a photo gallery with a big adaptive hero + uniform grids. Page size
// stays A3 landscape, matching the original reference report.

import {
  PDFDocument,
  StandardFonts,
  rgb,
  LineCapStyle,
  type PDFFont,
  type PDFPage,
  type Color,
} from "pdf-lib";
import {
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  appendBezierCurve,
  closePath,
  clip,
  endPath,
} from "pdf-lib";
import { prepareCoverImage, getImageDimensions } from "./imaging";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

const PAGE_WIDTH = mm(420);
const PAGE_HEIGHT = mm(297);
const MARGIN = mm(16);
const TOPBAR_HEIGHT = mm(15);
const FOOTER_HEIGHT = mm(9);

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const INK = rgb(0.07, 0.07, 0.09);
const INK_SECONDARY = rgb(0.32, 0.33, 0.37);
const MUTED = rgb(0.55, 0.56, 0.6);
const ACCENT = rgb(0, 0.42, 0.83);
const ACCENT_TINT = rgb(0.9, 0.95, 1);
const INK_DARK_BG = rgb(0.07, 0.08, 0.11);
const SURFACE = rgb(1, 1, 1);
const SURFACE_ALT = rgb(0.965, 0.965, 0.975);
const BORDER = rgb(0.87, 0.87, 0.9);
const SHADOW = rgb(0.04, 0.04, 0.07);
const SUCCESS = rgb(0.13, 0.58, 0.34);
const SUCCESS_TINT = rgb(0.9, 0.97, 0.93);
const WARNING = rgb(0.75, 0.5, 0.03);
const WARNING_TINT = rgb(1, 0.96, 0.87);
const DANGER = rgb(0.78, 0.19, 0.19);
const DANGER_TINT = rgb(1, 0.92, 0.92);

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export interface SiteEntry {
  label: string;

  // Installation Details — Fixture Type / Material / Sign Type are picked
  // from the reusable master catalogs (installation_report_fixture_types
  // etc.); Size is free text since it varies per site.
  fixtureType: string;
  material: string;
  signType: string;
  size: string;

  // Installation Schedule — Team is picked from the reusable roster; Date
  // and Status are specific to this site's visit.
  dateOfInstallation: string;
  installedByTeam: string;
  installationStatus: string;

  installedArtwork: string;
  storePermissionSlots: string;

  // Quality Inspection
  wasSuccessful: string;
  siteCondition: string;
  fixtureCondition: string;
  scaffoldingRequired: string;
  inspectorRemarks: string;
  overallStatus: string;

  // Photos — none of these ever leave the browser.
  mainSlide: File | null;
  closeUp: File | null;
  cornerTL: File | null;
  cornerTR: File | null;
  cornerBL: File | null;
  cornerBR: File | null;
  beforePhoto: File | null;
  afterPhoto: File | null;
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
  campaign: string;

  creativeProgram: string;
  creativeCampaign: string;
  creativeName: string;
  creativeVersion: string;

  programDetails: string;
  storePictures: StorePictures;
  sites: SiteEntry[];
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  storeName: string;
  sfoId: string;
  pageNumber: number;
}

// ---------------------------------------------------------------------------
// Low-level drawing primitives
// ---------------------------------------------------------------------------

/** Rounded rect SVG path, local coordinates with (0,0) at the top-left corner and y increasing downward (standard SVG convention) — combines with drawSvgPath's built-in y-flip so callers just pass a normal top-left page position. */
function roundedRectSvgPath(w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M ${rr},0 H ${w - rr} A ${rr},${rr} 0 0 1 ${w},${rr} V ${h - rr} A ${rr},${rr} 0 0 1 ${w - rr},${h} H ${rr} A ${rr},${rr} 0 0 1 0,${h - rr} V ${rr} A ${rr},${rr} 0 0 1 ${rr},0 Z`;
}

/** Fills (and optionally strokes) a rounded rectangle. `xLeft`/`yTop` are the top-left corner in normal PDF (y-up) coordinates — matches how the rest of this file tracks a "cursor" that moves down the page. */
function roundedRectFill(
  page: PDFPage,
  xLeft: number,
  yTop: number,
  w: number,
  h: number,
  r: number,
  fill?: Color,
  border?: { color: Color; width?: number },
  opacity?: number
) {
  page.drawSvgPath(roundedRectSvgPath(w, h, r), {
    x: xLeft,
    y: yTop,
    color: fill,
    borderColor: border?.color,
    borderWidth: border?.width ?? (border ? 1 : 0),
    opacity,
  });
}

/** A card: white rounded rect with a soft drop shadow and hairline border. */
function drawCardBg(page: PDFPage, xLeft: number, yTop: number, w: number, h: number, r = 10) {
  roundedRectFill(page, xLeft + 1.5, yTop - 2, w, h, r, SHADOW, undefined, 0.12);
  roundedRectFill(page, xLeft, yTop, w, h, r, SURFACE, { color: BORDER, width: 1 });
}

const CIRCLE_K = 0.5522847498;

/** Starts a rounded-rect clip region in normal PDF (y-up) coordinates, matching drawImage's own (x, y=bottom-left) convention. Must be paired with endRoundedClip() after the clipped drawing calls. */
function beginRoundedClip(page: PDFPage, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const k = rr * CIRCLE_K;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x + rr, y),
    lineTo(x + w - rr, y),
    appendBezierCurve(x + w - rr + k, y, x + w, y + rr - k, x + w, y + rr),
    lineTo(x + w, y + h - rr),
    appendBezierCurve(x + w, y + h - rr + k, x + w - rr + k, y + h, x + w - rr, y + h),
    lineTo(x + rr, y + h),
    appendBezierCurve(x + rr - k, y + h, x, y + h - rr + k, x, y + h - rr),
    lineTo(x, y + rr),
    appendBezierCurve(x, y + rr - k, x + rr - k, y, x + rr, y),
    closePath(),
    clip(),
    endPath()
  );
}

function endRoundedClip(page: PDFPage) {
  page.pushOperators(popGraphicsState());
}

function fitFontSize(font: PDFFont, text: string, maxWidth: number, maxSize: number, minSize = 16): number {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 1;
  return size;
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

function formatDate(value: string): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Icon chips — small drawn glyphs (no external icon assets needed inside a
// generated PDF). Kept deliberately simple: a rounded tint-colored square
// with a 2-4 stroke glyph inside.
// ---------------------------------------------------------------------------

type IconKind = "sites" | "check" | "pending" | "calendar" | "team" | "camera" | "pin" | "tag" | "store" | "clipboard" | "shield";

function drawIconChip(page: PDFPage, kind: IconKind, x: number, yTop: number, size: number, color: Color, tint: Color) {
  roundedRectFill(page, x, yTop, size, size, size * 0.28, tint);
  const cx = x + size / 2;
  const cy = yTop - size / 2;
  const s = size * 0.5;

  switch (kind) {
    case "check":
      page.drawLine({ start: { x: cx - s * 0.36, y: cy - s * 0.02 }, end: { x: cx - s * 0.08, y: cy - s * 0.3 }, thickness: 1.7, color, lineCap: LineCapStyle.Round });
      page.drawLine({ start: { x: cx - s * 0.08, y: cy - s * 0.3 }, end: { x: cx + s * 0.42, y: cy + s * 0.34 }, thickness: 1.7, color, lineCap: LineCapStyle.Round });
      break;
    case "pending":
      page.drawCircle({ x: cx, y: cy, size: s * 0.42, borderColor: color, borderWidth: 1.6 });
      page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy + s * 0.26 }, thickness: 1.3, color, lineCap: LineCapStyle.Round });
      page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + s * 0.2, y: cy }, thickness: 1.3, color, lineCap: LineCapStyle.Round });
      break;
    case "sites":
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
        page.drawCircle({ x: cx + dx * s * 0.22, y: cy + dy * s * 0.22, size: s * 0.14, color });
      });
      break;
    case "calendar":
      page.drawRectangle({ x: cx - s * 0.4, y: cy - s * 0.35, width: s * 0.8, height: s * 0.68, borderColor: color, borderWidth: 1.4 });
      page.drawLine({ start: { x: cx - s * 0.4, y: cy + s * 0.1 }, end: { x: cx + s * 0.4, y: cy + s * 0.1 }, thickness: 1.2, color });
      page.drawLine({ start: { x: cx - s * 0.18, y: cy + s * 0.33 }, end: { x: cx - s * 0.18, y: cy + s * 0.18 }, thickness: 1.2, color, lineCap: LineCapStyle.Round });
      page.drawLine({ start: { x: cx + s * 0.18, y: cy + s * 0.33 }, end: { x: cx + s * 0.18, y: cy + s * 0.18 }, thickness: 1.2, color, lineCap: LineCapStyle.Round });
      break;
    case "team":
      page.drawCircle({ x: cx - s * 0.15, y: cy + s * 0.14, size: s * 0.15, color });
      page.drawCircle({ x: cx + s * 0.15, y: cy + s * 0.14, size: s * 0.15, color });
      page.drawEllipse({ x: cx - s * 0.15, y: cy - s * 0.18, xScale: s * 0.19, yScale: s * 0.14, color });
      page.drawEllipse({ x: cx + s * 0.15, y: cy - s * 0.18, xScale: s * 0.19, yScale: s * 0.14, color });
      break;
    case "camera":
      page.drawRectangle({ x: cx - s * 0.42, y: cy - s * 0.3, width: s * 0.84, height: s * 0.54, borderColor: color, borderWidth: 1.4 });
      page.drawCircle({ x: cx, y: cy - s * 0.02, size: s * 0.17, borderColor: color, borderWidth: 1.3 });
      page.drawRectangle({ x: cx - s * 0.14, y: cy + s * 0.24, width: s * 0.28, height: s * 0.1, color });
      break;
    case "pin":
      page.drawCircle({ x: cx, y: cy + s * 0.14, size: s * 0.22, borderColor: color, borderWidth: 1.5 });
      page.drawLine({ start: { x: cx, y: cy - s * 0.08 }, end: { x: cx, y: cy - s * 0.38 }, thickness: 1.5, color, lineCap: LineCapStyle.Round });
      break;
    case "tag":
      page.drawRectangle({ x: cx - s * 0.36, y: cy - s * 0.24, width: s * 0.72, height: s * 0.48, borderColor: color, borderWidth: 1.3 });
      page.drawCircle({ x: cx - s * 0.14, y: cy, size: s * 0.06, color });
      break;
    case "store":
      page.drawRectangle({ x: cx - s * 0.4, y: cy - s * 0.32, width: s * 0.8, height: s * 0.58, borderColor: color, borderWidth: 1.4 });
      page.drawLine({ start: { x: cx - s * 0.4, y: cy - s * 0.02 }, end: { x: cx + s * 0.4, y: cy - s * 0.02 }, thickness: 1.1, color });
      page.drawLine({ start: { x: cx - s * 0.14, y: cy + s * 0.26 }, end: { x: cx - s * 0.4, y: cy - s * 0.02 }, thickness: 1.1, color });
      page.drawLine({ start: { x: cx + s * 0.14, y: cy + s * 0.26 }, end: { x: cx + s * 0.4, y: cy - s * 0.02 }, thickness: 1.1, color });
      break;
    case "clipboard":
      page.drawRectangle({ x: cx - s * 0.32, y: cy - s * 0.4, width: s * 0.64, height: s * 0.8, borderColor: color, borderWidth: 1.4 });
      page.drawRectangle({ x: cx - s * 0.14, y: cy + s * 0.3, width: s * 0.28, height: s * 0.12, color });
      page.drawLine({ start: { x: cx - s * 0.16, y: cy + s * 0.04 }, end: { x: cx + s * 0.16, y: cy + s * 0.04 }, thickness: 1, color });
      page.drawLine({ start: { x: cx - s * 0.16, y: cy - s * 0.12 }, end: { x: cx + s * 0.16, y: cy - s * 0.12 }, thickness: 1, color });
      break;
    case "shield":
      page.drawCircle({ x: cx, y: cy, size: s * 0.4, borderColor: color, borderWidth: 1.5 });
      page.drawLine({ start: { x: cx - s * 0.16, y: cy }, end: { x: cx - s * 0.03, y: cy - s * 0.14 }, thickness: 1.4, color, lineCap: LineCapStyle.Round });
      page.drawLine({ start: { x: cx - s * 0.03, y: cy - s * 0.14 }, end: { x: cx + s * 0.2, y: cy + s * 0.16 }, thickness: 1.4, color, lineCap: LineCapStyle.Round });
      break;
  }
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusTone(status: string): { fg: Color; tint: Color } {
  const s = (status || "").toLowerCase();
  if (["pass", "completed", "yes", "active"].includes(s)) return { fg: SUCCESS, tint: SUCCESS_TINT };
  if (["fail", "no", "delayed", "cancelled"].includes(s)) return { fg: DANGER, tint: DANGER_TINT };
  if (!s || s === "—") return { fg: MUTED, tint: SURFACE_ALT };
  return { fg: WARNING, tint: WARNING_TINT };
}

/** Right-aligned rounded status pill, e.g. "PASS" / "CONDITIONAL". Returns the pill's width. */
function drawStatusPill(ctx: Ctx, page: PDFPage, text: string, xRight: number, yTop: number): number {
  const label = (text || "—").toUpperCase();
  const size = 8.5;
  const { fg, tint } = statusTone(text);
  const padX = 10;
  const h = 18;
  const w = ctx.bold.widthOfTextAtSize(label, size) + padX * 2;
  const x = xRight - w;
  roundedRectFill(page, x, yTop, w, h, h / 2, tint);
  page.drawText(label, { x: x + padX, y: yTop - h / 2 - size * 0.36, size, font: ctx.bold, color: fg });
  return w;
}

// ---------------------------------------------------------------------------
// Page scaffold
// ---------------------------------------------------------------------------

function contentBounds() {
  return {
    left: MARGIN,
    right: PAGE_WIDTH - MARGIN,
    top: PAGE_HEIGHT - TOPBAR_HEIGHT - mm(7),
    bottom: FOOTER_HEIGHT + mm(3),
  };
}

/** Every interior page (everything after the cover) gets a slim top bar — store name/SFO left, section eyebrow right, thin accent rule — and a matching footer. */
function newPage(ctx: Ctx, eyebrow: string): PDFPage {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;

  const barY = PAGE_HEIGHT - TOPBAR_HEIGHT;
  page.drawText(ctx.storeName || "Untitled store", { x: MARGIN, y: barY + TOPBAR_HEIGHT / 2 - 3, size: 10.5, font: ctx.bold, color: INK });
  const sfo = `SFO ID ${ctx.sfoId || "—"}`;
  page.drawText(sfo, { x: MARGIN, y: barY + TOPBAR_HEIGHT / 2 - 15, size: 8, font: ctx.font, color: MUTED });

  const eyebrowUpper = eyebrow.toUpperCase();
  const ew = ctx.bold.widthOfTextAtSize(eyebrowUpper, 9);
  page.drawText(eyebrowUpper, { x: PAGE_WIDTH - MARGIN - ew, y: barY + TOPBAR_HEIGHT / 2 - 3, size: 9, font: ctx.bold, color: ACCENT });

  page.drawLine({ start: { x: MARGIN, y: barY }, end: { x: PAGE_WIDTH - MARGIN, y: barY }, thickness: 1.2, color: ACCENT });

  drawFooter(ctx, page);
  return page;
}

function drawFooter(ctx: Ctx, page: PDFPage) {
  page.drawLine({ start: { x: MARGIN, y: FOOTER_HEIGHT }, end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_HEIGHT }, thickness: 0.75, color: BORDER });
  const left = "Apple Confidential - Internal Use Only";
  page.drawText(left, { x: MARGIN, y: FOOTER_HEIGHT / 2 - 2, size: 7.5, font: ctx.font, color: MUTED });
  const right = `Page ${ctx.pageNumber}`;
  const rw = ctx.font.widthOfTextAtSize(right, 7.5);
  page.drawText(right, { x: PAGE_WIDTH - MARGIN - rw, y: FOOTER_HEIGHT / 2 - 2, size: 7.5, font: ctx.font, color: MUTED });
}

function drawSectionHeading(ctx: Ctx, page: PDFPage, text: string, x: number, yTop: number): number {
  page.drawRectangle({ x, y: yTop - 21, width: 4, height: 21, color: ACCENT });
  page.drawText(text, { x: x + 14, y: yTop - 15.5, size: 19, font: ctx.bold, color: INK });
  return yTop - 34;
}

// ---------------------------------------------------------------------------
// Info cards
// ---------------------------------------------------------------------------

interface CardRow {
  label: string;
  value: string;
}

/** Modern label/value list card — replaces the old grid-of-table-cells look. Returns the y just below the card. */
function drawInfoCard(
  ctx: Ctx,
  page: PDFPage,
  opts: { x: number; yTop: number; w: number; title: string; icon: IconKind; rows: CardRow[]; badge?: string }
): number {
  const { x, yTop, w, title, icon, rows, badge } = opts;
  const padX = 18;
  const headerH = 40;
  const rowH = 30;
  const h = headerH + rows.length * rowH + 12;

  drawCardBg(page, x, yTop, w, h);
  drawIconChip(page, icon, x + padX, yTop - 13, 24, ACCENT, ACCENT_TINT);
  page.drawText(title, { x: x + padX + 32, y: yTop - 27, size: 12.5, font: ctx.bold, color: INK });
  if (badge) drawStatusPill(ctx, page, badge, x + w - padX, yTop - 13);

  page.drawLine({ start: { x: x + padX, y: yTop - headerH }, end: { x: x + w - padX, y: yTop - headerH }, thickness: 0.75, color: BORDER });

  rows.forEach((row, i) => {
    const rowTop = yTop - headerH - i * rowH;
    page.drawText(row.label.toUpperCase(), { x: x + padX, y: rowTop - 15, size: 8, font: ctx.bold, color: MUTED });
    const valueLines = wrapText(ctx.font, row.value || "—", 10.5, w - padX * 2);
    page.drawText(valueLines[0] ?? "—", { x: x + padX, y: rowTop - 27, size: 10.5, font: ctx.font, color: INK });
    if (i < rows.length - 1) {
      page.drawLine({
        start: { x: x + padX, y: rowTop - rowH },
        end: { x: x + w - padX, y: rowTop - rowH },
        thickness: 0.5,
        color: BORDER,
      });
    }
  });

  return yTop - h;
}

/** Same card chrome, but for a longer freeform paragraph (Program Details, Inspector Remarks) instead of label/value rows. */
function drawTextCard(ctx: Ctx, page: PDFPage, opts: { x: number; yTop: number; w: number; title: string; icon: IconKind; text: string; minLines?: number }): number {
  const { x, yTop, w, title, icon, text } = opts;
  const padX = 18;
  const headerH = 40;
  const bodyLines = wrapText(ctx.font, text || "No additional notes.", 10.5, w - padX * 2);
  const shownLines = bodyLines.slice(0, Math.max(opts.minLines ?? 3, bodyLines.length));
  const h = headerH + shownLines.length * 15 + 20;

  drawCardBg(page, x, yTop, w, h);
  drawIconChip(page, icon, x + padX, yTop - 13, 24, ACCENT, ACCENT_TINT);
  page.drawText(title, { x: x + padX + 32, y: yTop - 27, size: 12.5, font: ctx.bold, color: INK });
  page.drawLine({ start: { x: x + padX, y: yTop - headerH }, end: { x: x + w - padX, y: yTop - headerH }, thickness: 0.75, color: BORDER });

  shownLines.forEach((line, i) => {
    page.drawText(line, { x: x + padX, y: yTop - headerH - 18 - i * 15, size: 10.5, font: ctx.font, color: INK_SECONDARY });
  });

  return yTop - h;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

async function drawPhotoBox(
  ctx: Ctx,
  page: PDFPage,
  file: File | null,
  x: number,
  yBottom: number,
  w: number,
  h: number,
  caption?: string,
  subcaption?: string
) {
  const r = 10;
  if (!file) {
    roundedRectFill(page, x, yBottom + h, w, h, r, SURFACE_ALT, { color: BORDER, width: 1 });
    const msg = "No photo attached";
    const size = 9.5;
    const tw = ctx.font.widthOfTextAtSize(msg, size);
    page.drawText(msg, { x: x + w / 2 - tw / 2, y: yBottom + h / 2, size, font: ctx.font, color: MUTED });
  } else {
    const prepared = await prepareCoverImage(file, w, h);
    const img = await ctx.doc.embedJpg(prepared.bytes);
    beginRoundedClip(page, x, yBottom, w, h, r);
    page.drawImage(img, { x, y: yBottom, width: w, height: h });
    endRoundedClip(page);
    roundedRectFill(page, x, yBottom + h, w, h, r, undefined, { color: BORDER, width: 1 });
  }
  if (caption) {
    page.drawText(caption, { x, y: yBottom - 14, size: 10, font: ctx.bold, color: INK });
    if (subcaption) {
      page.drawText(subcaption, { x, y: yBottom - 26, size: 8.5, font: ctx.italic, color: MUTED });
    }
  }
}

/** Lays out `items` in a fixed-column grid of equal-sized cells with captions, filling row-major (last row left-aligned by simply having fewer cells). */
async function drawPhotoGrid(
  ctx: Ctx,
  page: PDFPage,
  items: { file: File | null; caption: string }[],
  x: number,
  yTop: number,
  w: number,
  h: number,
  cols: number
) {
  const gap = mm(6);
  const captionH = 30;
  const rows = Math.ceil(items.length / cols);
  const cellW = (w - gap * (cols - 1)) / cols;
  const cellH = (h - gap * (rows - 1) - rows * captionH) / rows;

  for (let i = 0; i < items.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * (cellW + gap);
    const cellTop = yTop - row * (cellH + captionH + gap);
    const cellBottom = cellTop - cellH;
    await drawPhotoBox(ctx, page, items[i].file, cx, cellBottom, cellW, cellH, items[i].caption);
  }
}

/** Full-page hero photo — orientation-adaptive: landscape sources get a wide box, portrait sources get a taller centered box, so nothing looks stretched or awkwardly cropped. */
async function drawHeroPage(ctx: Ctx, eyebrow: string, heading: string, file: File | null, caption: string, subcaption: string) {
  const page = newPage(ctx, eyebrow);
  const b = contentBounds();
  let y = drawSectionHeading(ctx, page, heading, b.left, b.top);
  y -= 8;

  const availW = b.right - b.left;
  const availH = y - b.bottom - 34;

  let boxW = availW;
  let boxH = availH;
  if (file) {
    try {
      const dims = await getImageDimensions(file);
      const isPortrait = dims.height > dims.width * 1.05;
      if (isPortrait) {
        boxW = Math.min(availW, availH * 0.72);
        boxH = availH;
      } else {
        boxW = availW;
        boxH = Math.min(availH, availW * 0.56);
      }
    } catch {
      // fall back to the full-width landscape box computed above
    }
  }

  const boxX = b.left + (availW - boxW) / 2;
  const boxYBottom = y - boxH - 34;
  await drawPhotoBox(ctx, page, file, boxX, boxYBottom, boxW, boxH, caption, subcaption);
}

// ---------------------------------------------------------------------------
// Dashboard computation
// ---------------------------------------------------------------------------

function computeDashboard(data: ReportData) {
  const total = data.sites.length;
  const completed = data.sites.filter((s) => (s.overallStatus || "").toLowerCase() === "pass").length;
  const pending = total - completed;

  const dates = Array.from(new Set(data.sites.map((s) => s.dateOfInstallation).filter(Boolean)));
  const dateLabel = dates.length === 0 ? "—" : dates.length === 1 ? formatDate(dates[0]) : `${dates.length} dates`;

  const teams = Array.from(new Set(data.sites.map((s) => s.installedByTeam).filter(Boolean)));
  const teamLabel = teams.length === 0 ? "—" : teams.length === 1 ? teams[0] : `${teams.length} teams`;

  const overall =
    total === 0
      ? "—"
      : data.sites.some((s) => (s.overallStatus || "").toLowerCase() === "fail")
        ? "Fail"
        : data.sites.some((s) => (s.overallStatus || "").toLowerCase() === "conditional")
          ? "Conditional"
          : "Pass";

  return { total, completed, pending, dateLabel, teamLabel, overall };
}

// ---------------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------------

function drawCoverPage(ctx: Ctx, data: ReportData) {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;

  const heroH = mm(105);
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - heroH, width: PAGE_WIDTH, height: heroH, color: INK_DARK_BG });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - heroH - 3, width: PAGE_WIDTH, height: 3, color: ACCENT });

  const eyebrow = "APPLE STORE INSTALLATION REPORT";
  page.drawText(eyebrow, { x: MARGIN, y: PAGE_HEIGHT - mm(20), size: 11, font: ctx.bold, color: rgb(0.55, 0.78, 1) });

  const titleSize = fitFontSize(ctx.bold, data.storeName || "Untitled store", PAGE_WIDTH - MARGIN * 2, 40, 22);
  page.drawText(data.storeName || "Untitled store", { x: MARGIN, y: PAGE_HEIGHT - mm(38), size: titleSize, font: ctx.bold, color: rgb(1, 1, 1) });

  const metaParts = [`SFO ID ${data.sfoId || "—"}`, `Program ${data.program || "—"}`, data.campaign ? `Campaign ${data.campaign}` : null].filter(Boolean);
  page.drawText((metaParts as string[]).join("   ·   "), { x: MARGIN, y: PAGE_HEIGHT - mm(50), size: 12, font: ctx.font, color: rgb(0.82, 0.84, 0.9) });

  if (data.address) {
    const addrLines = wrapText(ctx.font, data.address, 10.5, PAGE_WIDTH - MARGIN * 2);
    page.drawText(addrLines[0], { x: MARGIN, y: PAGE_HEIGHT - mm(60), size: 10.5, font: ctx.font, color: rgb(0.65, 0.67, 0.74) });
  }

  const generated = `Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} via MMDI ONE`;
  const gw = ctx.italic.widthOfTextAtSize(generated, 9.5);
  page.drawText(generated, { x: PAGE_WIDTH - MARGIN - gw, y: PAGE_HEIGHT - mm(96), size: 9.5, font: ctx.italic, color: rgb(0.6, 0.62, 0.7) });

  // ---- KPI dashboard row ----
  const dash = computeDashboard(data);
  const kpis: { icon: IconKind; label: string; value: string; tone?: "status" }[] = [
    { icon: "sites", label: "Total Sites", value: String(dash.total) },
    { icon: "check", label: "Completed", value: String(dash.completed) },
    { icon: "pending", label: "Pending", value: String(dash.pending) },
    { icon: "calendar", label: "Installation Date", value: dash.dateLabel },
    { icon: "team", label: "Installation Team", value: dash.teamLabel },
    { icon: "shield", label: "Overall Status", value: dash.overall, tone: "status" },
  ];

  const rowTop = PAGE_HEIGHT - heroH - mm(14);
  const gap = mm(6);
  const cardW = (PAGE_WIDTH - MARGIN * 2 - gap * (kpis.length - 1)) / kpis.length;
  const cardH = mm(40);

  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * (cardW + gap);
    drawCardBg(page, x, rowTop, cardW, cardH, 12);
    drawIconChip(page, kpi.icon, x + 14, rowTop - 14, 20, ACCENT, ACCENT_TINT);
    const valueColor = kpi.tone === "status" ? statusTone(kpi.value).fg : INK;
    const valueSize = fitFontSize(ctx.bold, kpi.value, cardW - 28, 20, 12);
    page.drawText(kpi.value, { x: x + 14, y: rowTop - 60, size: valueSize, font: ctx.bold, color: valueColor });
    page.drawText(kpi.label.toUpperCase(), { x: x + 14, y: rowTop - cardH + 12, size: 7.5, font: ctx.bold, color: MUTED });
  });

  drawFooter(ctx, page);
}

function drawStoreAndCreativePage(ctx: Ctx, data: ReportData) {
  const page = newPage(ctx, "Store & Creative Details");
  const b = contentBounds();
  let y = drawSectionHeading(ctx, page, "Store & Creative Information", b.left, b.top);
  y -= 6;

  const gap = mm(8);
  const colW = (b.right - b.left - gap) / 2;

  const storeBottom = drawInfoCard(ctx, page, {
    x: b.left,
    yTop: y,
    w: colW,
    title: "Store Information",
    icon: "store",
    rows: [
      { label: "Store Name", value: data.storeName },
      { label: "Address", value: data.address },
      { label: "SFO ID", value: data.sfoId },
      { label: "Program", value: data.program },
      { label: "Campaign", value: data.campaign },
    ],
  });

  const creativeBottom = drawInfoCard(ctx, page, {
    x: b.left + colW + gap,
    yTop: y,
    w: colW,
    title: "Creative Details",
    icon: "tag",
    rows: [
      { label: "Program", value: data.creativeProgram || data.program },
      { label: "Campaign", value: data.creativeCampaign || data.campaign },
      { label: "Creative Name / Artwork", value: data.creativeName },
      { label: "Creative Version", value: data.creativeVersion },
    ],
  });

  const notesTop = Math.min(storeBottom, creativeBottom) - mm(8);
  drawTextCard(ctx, page, {
    x: b.left,
    yTop: notesTop,
    w: b.right - b.left,
    title: "Program Details",
    icon: "clipboard",
    text: data.programDetails,
    minLines: 3,
  });
}

async function drawStorePicturesPages(ctx: Ctx, pictures: StorePictures) {
  const page = newPage(ctx, "Store Overview");
  const b = contentBounds();
  let y = drawSectionHeading(ctx, page, "Store Overview Photos", b.left, b.top);
  y -= 8;

  const availW = b.right - b.left;
  const heroH = mm(70);
  const heroBottom = y - heroH;
  await drawPhotoBox(ctx, page, pictures.storeFullCover, b.left, heroBottom - 30, availW, heroH, "Store Full Cover", "Primary storefront view");

  const gridTop = heroBottom - 30 - mm(16);
  const gridItems = [
    { file: pictures.installationCloseUp, caption: "Installation Close-up" },
    { file: pictures.streetView1, caption: "Street View 1" },
    { file: pictures.streetView2, caption: "Street View 2" },
    { file: pictures.cornerPic1, caption: "Corner Pic 1" },
    { file: pictures.cornerPic2, caption: "Corner Pic 2" },
    { file: pictures.cornerPic3, caption: "Corner Pic 3" },
    { file: pictures.cornerPic4, caption: "Corner Pic 4" },
  ];
  await drawPhotoGrid(ctx, page, gridItems, b.left, gridTop, availW, gridTop - b.bottom, 4);
}

async function drawSiteOverviewPage(ctx: Ctx, site: SiteEntry, index: number) {
  const page = newPage(ctx, `Installation Site ${index + 1}`);
  const b = contentBounds();
  const heading = `Installation Site ${index + 1}${site.label ? ` — ${site.label}` : ""}`;
  page.drawRectangle({ x: b.left, y: b.top - 21, width: 4, height: 21, color: ACCENT });
  page.drawText(heading, { x: b.left + 14, y: b.top - 15.5, size: 19, font: ctx.bold, color: INK });
  drawStatusPill(ctx, page, site.overallStatus || "Pending", b.right, b.top - 4);
  let y = b.top - 34;

  const gap = mm(8);
  const colW = (b.right - b.left - gap) / 2;

  const detailsBottom = drawInfoCard(ctx, page, {
    x: b.left,
    yTop: y,
    w: colW,
    title: "Installation Details",
    icon: "clipboard",
    rows: [
      { label: "Fixture Type", value: site.fixtureType },
      { label: "Material", value: site.material },
      { label: "Sign Type", value: site.signType },
      { label: "Size", value: site.size },
    ],
  });

  const scheduleBottom = drawInfoCard(ctx, page, {
    x: b.left + colW + gap,
    yTop: y,
    w: colW,
    title: "Installation Schedule",
    icon: "calendar",
    rows: [
      { label: "Installation Date", value: formatDate(site.dateOfInstallation) },
      { label: "Installation Team", value: site.installedByTeam },
      { label: "Installation Status", value: site.installationStatus },
      { label: "Installed Artwork", value: site.installedArtwork },
    ],
  });

  y = Math.min(detailsBottom, scheduleBottom) - mm(8);

  // Quality Inspection — full width, denser 2-column grid of short fields
  // plus a remarks paragraph, so it reads as one coherent inspection block.
  const padX = 18;
  const headerH = 40;
  const qRows: CardRow[] = [
    { label: "Installation Successful", value: site.wasSuccessful },
    { label: "Scaffolding Required", value: site.scaffoldingRequired },
    { label: "Store Permission Slot", value: site.storePermissionSlots },
    { label: "Site Condition", value: site.siteCondition },
    { label: "Fixture Condition", value: site.fixtureCondition },
  ];
  const qCols = 3;
  const qRowH = 30;
  const qRowCount = Math.ceil(qRows.length / qCols);
  const remarksLines = wrapText(ctx.font, site.inspectorRemarks || "No remarks.", 10, b.right - b.left - padX * 2);
  const remarksH = remarksLines.length * 14 + 26;
  const qH = headerH + qRowCount * qRowH + remarksH + 12;
  const qW = b.right - b.left;

  drawCardBg(page, b.left, y, qW, qH);
  drawIconChip(page, "shield", b.left + padX, y - 13, 24, ACCENT, ACCENT_TINT);
  page.drawText("Quality Inspection", { x: b.left + padX + 32, y: y - 27, size: 12.5, font: ctx.bold, color: INK });
  drawStatusPill(ctx, page, site.overallStatus || "Pending", b.left + qW - padX, y - 13);
  page.drawLine({ start: { x: b.left + padX, y: y - headerH }, end: { x: b.left + qW - padX, y: y - headerH }, thickness: 0.75, color: BORDER });

  const qColW = (qW - padX * 2) / qCols;
  qRows.forEach((row, i) => {
    const col = i % qCols;
    const rIdx = Math.floor(i / qCols);
    const cx = b.left + padX + col * qColW;
    const rowTop = y - headerH - rIdx * qRowH;
    page.drawText(row.label.toUpperCase(), { x: cx, y: rowTop - 15, size: 7.5, font: ctx.bold, color: MUTED });
    const lines = wrapText(ctx.font, row.value || "—", 10, qColW - 10);
    page.drawText(lines[0] ?? "—", { x: cx, y: rowTop - 27, size: 10, font: ctx.font, color: INK });
  });

  const remarksTop = y - headerH - qRowCount * qRowH - 10;
  page.drawText("INSPECTOR REMARKS", { x: b.left + padX, y: remarksTop, size: 7.5, font: ctx.bold, color: MUTED });
  remarksLines.forEach((line, i) => {
    page.drawText(line, { x: b.left + padX, y: remarksTop - 14 - i * 14, size: 10, font: ctx.font, color: INK_SECONDARY });
  });
}

async function drawCornersPage(ctx: Ctx, site: SiteEntry, index: number) {
  const page = newPage(ctx, `Installation Site ${index + 1}`);
  const b = contentBounds();
  let y = drawSectionHeading(ctx, page, `Site ${index + 1} — Corner Inspection`, b.left, b.top);
  y -= 8;

  const items = [
    { file: site.cornerTL, caption: "Top Left Corner" },
    { file: site.cornerTR, caption: "Top Right Corner" },
    { file: site.cornerBL, caption: "Bottom Left Corner" },
    { file: site.cornerBR, caption: "Bottom Right Corner" },
  ];
  await drawPhotoGrid(ctx, page, items, b.left, y, b.right - b.left, y - b.bottom, 2);
}

async function drawBeforeAfterPage(ctx: Ctx, site: SiteEntry, index: number) {
  const page = newPage(ctx, `Installation Site ${index + 1}`);
  const b = contentBounds();
  let y = drawSectionHeading(ctx, page, `Site ${index + 1} — Before & After`, b.left, b.top);
  y -= 8;

  const items = [
    { file: site.beforePhoto, caption: "Before" },
    { file: site.afterPhoto, caption: "After" },
  ];
  await drawPhotoGrid(ctx, page, items, b.left, y, b.right - b.left, y - b.bottom, 2);
}

function siteHasCornerPhoto(site: SiteEntry): boolean {
  return Boolean(site.cornerTL || site.cornerTR || site.cornerBL || site.cornerBR);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function buildInstallationReportPdf(data: ReportData): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const ctx: Ctx = { doc, font, bold, italic, storeName: data.storeName, sfoId: data.sfoId, pageNumber: 0 };

  drawCoverPage(ctx, data);
  drawStoreAndCreativePage(ctx, data);
  await drawStorePicturesPages(ctx, data.storePictures);

  for (let i = 0; i < data.sites.length; i++) {
    const site = data.sites[i];
    await drawSiteOverviewPage(ctx, site, i);
    if (site.mainSlide) await drawHeroPage(ctx, `Installation Site ${i + 1}`, `Site ${i + 1} — Main Slide`, site.mainSlide, "Main Installation View", "Primary photo of the completed installation");
    if (site.closeUp) await drawHeroPage(ctx, `Installation Site ${i + 1}`, `Site ${i + 1} — Close-up View`, site.closeUp, "Close-up View", "Detail shot of the fixture / artwork");
    if (siteHasCornerPhoto(site)) await drawCornersPage(ctx, site, i);
    if (site.beforePhoto || site.afterPhoto) await drawBeforeAfterPage(ctx, site, i);
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
