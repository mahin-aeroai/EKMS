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
import { prepareCoverImage, getImageDimensions, type PhotoValue } from "./imaging";

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

  // Creative — picked per site from the Creative Master, since different
  // sites within the same store can carry different artwork.
  creativeName: string;

  // Installation Schedule — Team is picked from the reusable roster,
  // Status is specific to this site's visit. Installation Date lives at
  // report level now (every site in a report shares one visit date).
  installedByTeam: string;
  installationStatus: string;

  storePermissionSlots: string;

  // Quality Inspection
  wasSuccessful: string;
  siteCondition: string;
  fixtureCondition: string;
  scaffoldingRequired: string;
  inspectorRemarks: string;
  overallStatus: string;

  // Photos — none of these ever leave the browser. Each carries the
  // operator's pan/zoom framing alongside the file (see PhotoValue in
  // imaging.ts) instead of always auto-centering.
  mainSlide: PhotoValue | null;
  closeUp: PhotoValue | null;
  cornerTL: PhotoValue | null;
  cornerTR: PhotoValue | null;
  cornerBL: PhotoValue | null;
  cornerBR: PhotoValue | null;
}

export interface StorePictures {
  storeFullCover: PhotoValue | null;
  installationCloseUp: PhotoValue | null;
  streetView1: PhotoValue | null;
  streetView2: PhotoValue | null;
}

export interface ReportData {
  storeName: string;
  address: string;
  sfoId: string;
  program: string;

  // Season/rollout program (Fall 25, Spring 26...) — chosen once per
  // report from the Program Master, applies to every site in it.
  seasonProgram: string;
  // Installation Date — also chosen once per report; every site in a
  // report shares the same visit date.
  installationDate: string;

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
  installationDate: string;
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

/**
 * Big editorial section heading — this is the "creative and professional"
 * layer the earlier, more informative-looking 19pt heading didn't deliver.
 * An optional oversized ghost numeral sits behind the title (classic
 * annual-report device for numbered sections like installation sites);
 * cards drawn afterwards simply paint over it, so it only ever shows
 * through the surrounding whitespace.
 */
function drawSectionHeading(ctx: Ctx, page: PDFPage, text: string, x: number, yTop: number, opts?: { bigNumber?: string }): number {
  if (opts?.bigNumber) {
    page.drawText(opts.bigNumber, { x: x - 4, y: yTop - 88, size: 108, font: ctx.bold, color: SURFACE_ALT });
  }
  page.drawRectangle({ x, y: yTop - 30, width: 5, height: 30, color: ACCENT });
  const size = fitFontSize(ctx.bold, text, PAGE_WIDTH - MARGIN * 2 - 20, 28, 18);
  page.drawText(text, { x: x + 16, y: yTop - 22, size, font: ctx.bold, color: INK });
  return yTop - 44;
}

// ---------------------------------------------------------------------------
// Info cards
// ---------------------------------------------------------------------------

interface CardRow {
  label: string;
  value: string;
}


interface KpiTile {
  icon: IconKind;
  label: string;
  value: string;
  tone?: "status";
}

/**
 * A row of big dashboard-style tiles (icon, large value, small label) —
 * originally just the cover page's KPI dashboard, pulled out so the same
 * "glanceable facts, generously sized" treatment can fill out the Store
 * Information and Site Overview pages instead of leaving them as a couple
 * of skinny list cards with a lot of blank page below. `cardH` is the
 * caller's choice deliberately — a taller row uses more of the page.
 */
function drawKpiRow(ctx: Ctx, page: PDFPage, x: number, rowTop: number, w: number, cardH: number, tiles: KpiTile[]): number {
  const gap = mm(6);
  const cardW = (w - gap * (tiles.length - 1)) / tiles.length;

  tiles.forEach((tile, i) => {
    const cx = x + i * (cardW + gap);
    drawCardBg(page, cx, rowTop, cardW, cardH, 12);
    drawIconChip(page, tile.icon, cx + 14, rowTop - 14, 20, ACCENT, ACCENT_TINT);
    const valueColor = tile.tone === "status" ? statusTone(tile.value).fg : INK;
    const valueSize = fitFontSize(ctx.bold, tile.value || "—", cardW - 28, 20, 10);
    const valueLines = wrapText(ctx.bold, tile.value || "—", valueSize, cardW - 28);
    page.drawText(valueLines[0] ?? "—", { x: cx + 14, y: rowTop - 60, size: valueSize, font: ctx.bold, color: valueColor });
    if (valueLines[1]) {
      page.drawText(valueLines[1], { x: cx + 14, y: rowTop - 60 - valueSize * 1.15, size: valueSize, font: ctx.bold, color: valueColor });
    }
    page.drawText(tile.label.toUpperCase(), { x: cx + 14, y: rowTop - cardH + 12, size: 7.5, font: ctx.bold, color: MUTED });
  });

  return rowTop - cardH;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/**
 * Editorial photo box — caption sits directly on the photo over a soft dark
 * gradient scrim (built from stacked translucent bars, darkest at the
 * bottom) instead of on a line below it, the way a modern photo-led report
 * or magazine spread captions its images. Falls back to a plain
 * below-image caption when there's no photo to overlay onto. `badge`, if
 * given, is a small pill in the top-left corner of the photo (e.g. "TL").
 */
async function drawPhotoBoxOverlay(
  ctx: Ctx,
  page: PDFPage,
  photo: PhotoValue | null,
  x: number,
  yBottom: number,
  w: number,
  h: number,
  caption?: string,
  subcaption?: string,
  badge?: string,
  r = 12
) {
  if (!photo) {
    roundedRectFill(page, x, yBottom + h, w, h, r, SURFACE_ALT, { color: BORDER, width: 1 });
    const msg = "No photo attached";
    const size = 9.5;
    const tw = ctx.font.widthOfTextAtSize(msg, size);
    page.drawText(msg, { x: x + w / 2 - tw / 2, y: yBottom + h / 2, size, font: ctx.font, color: MUTED });
    if (caption) {
      page.drawText(caption, { x, y: yBottom - 14, size: 10, font: ctx.bold, color: INK });
      if (subcaption) page.drawText(subcaption, { x, y: yBottom - 26, size: 8.5, font: ctx.italic, color: MUTED });
    }
    return;
  }

  const prepared = await prepareCoverImage(photo.file, w, h, photo);
  const img = await ctx.doc.embedJpg(prepared.bytes);
  beginRoundedClip(page, x, yBottom, w, h, r);
  page.drawImage(img, { x, y: yBottom, width: w, height: h });

  if (caption) {
    const scrimH = Math.min(h * 0.42, 74);
    const steps = 28;
    for (let i = 0; i < steps; i++) {
      const stepH = scrimH / steps;
      const t = i / (steps - 1);
      const eased = t * t;
      page.drawRectangle({ x, y: yBottom + i * stepH, width: w, height: stepH + 0.75, color: rgb(0, 0, 0), opacity: 0.5 - eased * 0.46 });
    }
  }
  endRoundedClip(page);
  roundedRectFill(page, x, yBottom + h, w, h, r, undefined, { color: BORDER, width: 1 });

  if (badge) {
    const size = 7.5;
    const padX = 8;
    const bw = ctx.bold.widthOfTextAtSize(badge.toUpperCase(), size) + padX * 2;
    roundedRectFill(page, x + 10, yBottom + h - 10, bw, 16, 8, rgb(1, 1, 1), undefined, 0.85);
    page.drawText(badge.toUpperCase(), { x: x + 10 + padX, y: yBottom + h - 10 - 11.5, size, font: ctx.bold, color: INK });
  }

  if (caption) {
    page.drawText(caption, { x: x + 12, y: yBottom + 14, size: 11, font: ctx.bold, color: rgb(1, 1, 1) });
    if (subcaption) {
      page.drawText(subcaption, { x: x + 12, y: yBottom + 4, size: 8, font: ctx.italic, color: rgb(0.92, 0.92, 0.94) });
    }
  }
}

/**
 * Editorial "spread" page for a site's two hero shots — a big Main Slide
 * background photo with the Close-up rendered as a smaller framed inset
 * card floating over its bottom-right corner (a common magazine layout:
 * one dominant image, one accent image), instead of two nearly identical
 * full-bleed pages back to back. Falls back to a single full-page hero
 * when only one of the two photos exists.
 */
async function drawSiteSpreadPage(ctx: Ctx, site: SiteEntry, index: number) {
  const mainSlide = site.mainSlide;
  const closeUp = site.closeUp;
  if (!mainSlide && !closeUp) return;

  const page = newPage(ctx, `Installation Site ${index + 1}`);
  const b = contentBounds();
  const heading = `Site ${index + 1} — Installation Views`;
  let y = drawSectionHeading(ctx, page, heading, b.left, b.top);
  y -= 6;

  const availW = b.right - b.left;
  const availH = y - b.bottom;

  if (mainSlide && closeUp) {
    await drawPhotoBoxOverlay(ctx, page, mainSlide, b.left, y - availH, availW, availH, "Main Installation View", "Primary photo of the completed installation");

    const insetW = availW * 0.32;
    const insetH = availH * 0.42;
    const insetX = b.left + availW - insetW - mm(10);
    const insetYBottom = y - availH + mm(10);
    // White frame/mat behind the inset, like a photo card set on top of the hero image.
    roundedRectFill(page, insetX - 6, insetYBottom + insetH + 6, insetW + 12, insetH + 12, 14, SHADOW, undefined, 0.18);
    roundedRectFill(page, insetX - 5, insetYBottom + insetH + 5, insetW + 10, insetH + 10, 13, SURFACE);
    await drawPhotoBoxOverlay(ctx, page, closeUp, insetX, insetYBottom, insetW, insetH, "Close-up View", undefined, undefined, 9);
  } else {
    const file = mainSlide ?? closeUp;
    const label = mainSlide ? "Main Installation View" : "Close-up View";
    const sub = mainSlide ? "Primary photo of the completed installation" : "Detail shot of the fixture / artwork";

    let boxW = availW;
    let boxH = availH;
    if (file) {
      try {
        const dims = await getImageDimensions(file.file);
        const isPortrait = dims.height > dims.width * 1.05;
        if (isPortrait) {
          boxW = Math.min(availW, availH * 0.72);
          boxH = availH;
        } else {
          boxH = Math.min(availH, availW * 0.62);
        }
      } catch {
        // fall back to the full-width landscape box computed above
      }
    }
    const boxX = b.left + (availW - boxW) / 2;
    await drawPhotoBoxOverlay(ctx, page, file, boxX, y - boxH, boxW, boxH, label, sub);
  }
}

// ---------------------------------------------------------------------------
// Dashboard computation
// ---------------------------------------------------------------------------

function computeDashboard(data: ReportData) {
  const total = data.sites.length;
  const completed = data.sites.filter((s) => (s.overallStatus || "").toLowerCase() === "pass").length;
  const pending = total - completed;

  const dateLabel = formatDate(data.installationDate);

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

  const metaParts = [`SFO ID ${data.sfoId || "—"}`, `Program ${data.program || "—"}`, data.seasonProgram ? `Season ${data.seasonProgram}` : null].filter(Boolean);
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
  const kpis: KpiTile[] = [
    { icon: "sites", label: "Total Sites", value: String(dash.total) },
    { icon: "check", label: "Completed", value: String(dash.completed) },
    { icon: "pending", label: "Pending", value: String(dash.pending) },
    { icon: "calendar", label: "Installation Date", value: dash.dateLabel },
    { icon: "team", label: "Installation Team", value: dash.teamLabel },
    { icon: "shield", label: "Overall Status", value: dash.overall, tone: "status" },
  ];

  const rowTop = PAGE_HEIGHT - heroH - mm(14);
  drawKpiRow(ctx, page, MARGIN, rowTop, PAGE_WIDTH - MARGIN * 2, mm(40), kpis);

  drawFooter(ctx, page);
}

function drawStoreAndCreativePage(ctx: Ctx, data: ReportData) {
  const page = newPage(ctx, "Store Details");
  const b = contentBounds();
  let y = drawSectionHeading(ctx, page, "Store Information", b.left, b.top);
  y -= 6;

  const availW = b.right - b.left;

  // Glanceable facts row, same dashboard language as the cover — fills the
  // top of the page with real visual weight instead of a couple of
  // skinny label/value cards that left most of it blank.
  const kpis: KpiTile[] = [
    { icon: "pin", label: "SFO ID", value: data.sfoId || "—" },
    { icon: "store", label: "Store Program", value: data.program || "—" },
    { icon: "tag", label: "Program", value: data.seasonProgram || "—" },
    { icon: "calendar", label: "Installation Date", value: formatDate(data.installationDate) },
    { icon: "sites", label: "No of Sites", value: String(data.sites.length) },
  ];
  y = drawKpiRow(ctx, page, b.left, y, availW, mm(44), kpis);
  y -= mm(8);

  // Full-width "Store Location" hero card fills the rest of the page —
  // large store name, full address, and a footer note tying it to the
  // rest of the report — instead of ending the page early.
  const cardH = y - b.bottom;
  const padX = 28;
  drawCardBg(page, b.left, y, availW, cardH, 16);

  drawIconChip(page, "pin", b.left + padX, y - padX + 2, 26, ACCENT, ACCENT_TINT);
  page.drawText("STORE LOCATION", { x: b.left + padX + 38, y: y - padX - 12, size: 9.5, font: ctx.bold, color: MUTED });

  const nameSize = fitFontSize(ctx.bold, data.storeName || "Untitled store", availW - padX * 2, 30, 18);
  page.drawText(data.storeName || "Untitled store", { x: b.left + padX, y: y - padX - 48, size: nameSize, font: ctx.bold, color: INK });

  const addrLines = wrapText(ctx.font, data.address || "No address on file.", 14, availW - padX * 2 - mm(20)).slice(0, 5);
  addrLines.forEach((line, i) => {
    page.drawText(line, { x: b.left + padX, y: y - padX - 82 - i * 22, size: 14, font: ctx.font, color: INK_SECONDARY });
  });

  // A giant pale store-initial monogram fills the blank space below the
  // address instead of leaving it empty — the same "oversized faint
  // background character" device used for the site-numeral watermark on
  // the installation site pages, reused here for visual consistency.
  const footerLineY = y - cardH + 40;
  const addrBottom = y - padX - 82 - addrLines.length * 22;
  const blankTop = addrBottom - 24;
  const blankBottom = footerLineY + 20;
  const blankH = blankTop - blankBottom;
  if (blankH > 80) {
    const monogram = (data.storeName || "?").trim().charAt(0).toUpperCase() || "?";
    const monoSize = Math.min(blankH * 0.85, 280);
    const monoW = ctx.bold.widthOfTextAtSize(monogram, monoSize);
    page.drawText(monogram, {
      x: b.left + availW / 2 - monoW / 2,
      y: blankBottom + (blankH - monoSize) / 2 + monoSize * 0.18,
      size: monoSize,
      font: ctx.bold,
      color: SURFACE_ALT,
    });
  }

  page.drawLine({ start: { x: b.left + padX, y: footerLineY }, end: { x: b.left + availW - padX, y: footerLineY }, thickness: 0.75, color: BORDER });
  page.drawText("Every site in this report shares this store, this program, and this installation date.", {
    x: b.left + padX,
    y: y - cardH + 22,
    size: 10,
    font: ctx.italic,
    color: MUTED,
  });
}

/**
 * Store Overview Photos as an editorial mosaic instead of a uniform grid:
 * a big hero (Store Full Cover) on the left, full page height, and the
 * remaining three shots stacked on the right — the same "one dominant
 * image, supporting images smaller" idea real photo-led reports use,
 * rather than equal boxes in rows.
 */
async function drawStorePicturesPages(ctx: Ctx, pictures: StorePictures) {
  const page = newPage(ctx, "Store Overview");
  const b = contentBounds();
  let y = drawSectionHeading(ctx, page, "Store Overview Photos", b.left, b.top);
  y -= 6;

  const availW = b.right - b.left;
  const availH = y - b.bottom;
  const gap = mm(6);

  const heroW = availW * 0.58;
  await drawPhotoBoxOverlay(ctx, page, pictures.storeFullCover, b.left, y - availH, heroW, availH, "Store Full Cover", "Primary storefront view");

  const stackX = b.left + heroW + gap;
  const stackW = availW - heroW - gap;
  const stackItems = [
    { file: pictures.installationCloseUp, caption: "Installation Close-up" },
    { file: pictures.streetView1, caption: "Street View 1" },
    { file: pictures.streetView2, caption: "Street View 2" },
  ];
  const stackCellH = (availH - gap * (stackItems.length - 1)) / stackItems.length;
  for (let i = 0; i < stackItems.length; i++) {
    const cellTop = y - i * (stackCellH + gap);
    await drawPhotoBoxOverlay(ctx, page, stackItems[i].file, stackX, cellTop - stackCellH, stackW, stackCellH, stackItems[i].caption);
  }
}

async function drawSiteOverviewPage(ctx: Ctx, site: SiteEntry, index: number) {
  const page = newPage(ctx, `Installation Site ${index + 1}`);
  const b = contentBounds();
  const heading = site.label ? `Site ${index + 1} — ${site.label}` : `Installation Site ${index + 1}`;
  page.drawText(String(index + 1).padStart(2, "0"), { x: b.left - 4, y: b.top - 88, size: 108, font: ctx.bold, color: SURFACE_ALT });
  page.drawRectangle({ x: b.left, y: b.top - 30, width: 5, height: 30, color: ACCENT });
  const headingSize = fitFontSize(ctx.bold, heading, b.right - b.left - 140, 28, 18);
  page.drawText(heading, { x: b.left + 16, y: b.top - 22, size: headingSize, font: ctx.bold, color: INK });
  drawStatusPill(ctx, page, site.overallStatus || "Pending", b.right, b.top - 8);
  let y = b.top - 44;

  const availW = b.right - b.left;

  // Glanceable facts row — same dashboard tiles as the cover/store pages —
  // instead of two skinny label/value cards.
  const kpis: KpiTile[] = [
    { icon: "clipboard", label: "Fixture Type", value: site.fixtureType || "—" },
    { icon: "tag", label: "Material", value: site.material || "—" },
    { icon: "pin", label: "Sign Type", value: site.signType || "—" },
    { icon: "sites", label: "Size", value: site.size || "—" },
    { icon: "camera", label: "Creative", value: site.creativeName || "—" },
    { icon: "team", label: "Installation Team", value: site.installedByTeam || "—" },
  ];
  y = drawKpiRow(ctx, page, b.left, y, availW, mm(44), kpis);
  y -= mm(8);

  // Quality Inspection — full width, denser 3-column grid of short fields
  // (now including Date/Status, since those no longer have their own
  // card) plus a remarks paragraph, stretched to fill the rest of the
  // page instead of stopping partway down it.
  const padX = 22;
  const headerH = 44;
  const qRows: CardRow[] = [
    { label: "Installation Date", value: formatDate(ctx.installationDate) },
    { label: "Installation Status", value: site.installationStatus },
    { label: "Installation Successful", value: site.wasSuccessful },
    { label: "Scaffolding Required", value: site.scaffoldingRequired },
    { label: "Store Permission Slot", value: site.storePermissionSlots },
    { label: "Site Condition", value: site.siteCondition },
    { label: "Fixture Condition", value: site.fixtureCondition },
  ];
  const qCols = 3;
  const qRowH = 36;
  const qRowCount = Math.ceil(qRows.length / qCols);
  const remarksLines = wrapText(ctx.font, site.inspectorRemarks || "No remarks.", 11, availW - padX * 2);
  const remarksH = remarksLines.length * 16 + 30;
  const naturalQH = headerH + qRowCount * qRowH + remarksH + 16;
  const qH = Math.max(naturalQH, y - b.bottom);
  const qW = availW;

  drawCardBg(page, b.left, y, qW, qH, 14);
  drawIconChip(page, "shield", b.left + padX, y - 15, 26, ACCENT, ACCENT_TINT);
  page.drawText("Quality Inspection", { x: b.left + padX + 36, y: y - 30, size: 15, font: ctx.bold, color: INK });
  drawStatusPill(ctx, page, site.overallStatus || "Pending", b.left + qW - padX, y - 15);
  page.drawLine({ start: { x: b.left + padX, y: y - headerH }, end: { x: b.left + qW - padX, y: y - headerH }, thickness: 0.75, color: BORDER });

  const qColW = (qW - padX * 2) / qCols;
  qRows.forEach((row, i) => {
    const col = i % qCols;
    const rIdx = Math.floor(i / qCols);
    const cx = b.left + padX + col * qColW;
    const rowTop = y - headerH - rIdx * qRowH;
    page.drawText(row.label.toUpperCase(), { x: cx, y: rowTop - 17, size: 8, font: ctx.bold, color: MUTED });
    const lines = wrapText(ctx.font, row.value || "—", 11, qColW - 10);
    page.drawText(lines[0] ?? "—", { x: cx, y: rowTop - 31, size: 11, font: ctx.font, color: INK });
  });

  const remarksTop = y - headerH - qRowCount * qRowH - 12;
  page.drawText("INSPECTOR REMARKS", { x: b.left + padX, y: remarksTop, size: 8, font: ctx.bold, color: MUTED });
  remarksLines.forEach((line, i) => {
    page.drawText(line, { x: b.left + padX, y: remarksTop - 16 - i * 16, size: 11, font: ctx.font, color: INK_SECONDARY });
  });

  // Same device as the Store Information page's giant monogram: when the
  // card has been stretched to fill the page and there's real blank space
  // left under the remarks, a huge pale echo of the card's own icon fills
  // it instead of leaving it empty.
  const contentBottom = remarksTop - 16 - remarksLines.length * 16;
  const cardBottom = y - qH + 24;
  const blankH = contentBottom - cardBottom;
  if (blankH > 90) {
    const ghostSize = Math.min(blankH * 0.5, qW * 0.2, 300);
    const ghostCx = b.left + qW / 2;
    const ghostCy = cardBottom + blankH / 2 + 14;
    drawIconChip(page, "shield", ghostCx - ghostSize / 2, ghostCy + ghostSize / 2, ghostSize, SURFACE_ALT, SURFACE);

    const caption = "Quality checks recorded for this installation";
    const cw = ctx.italic.widthOfTextAtSize(caption, 10.5);
    page.drawText(caption, { x: ghostCx - cw / 2, y: ghostCy - ghostSize / 2 - 22, size: 10.5, font: ctx.italic, color: MUTED });
  }
}

async function drawCornersPage(ctx: Ctx, site: SiteEntry, index: number) {
  const page = newPage(ctx, `Installation Site ${index + 1}`);
  const b = contentBounds();
  let y = drawSectionHeading(ctx, page, `Site ${index + 1} — Corner Inspection`, b.left, b.top);
  y -= 6;

  const availW = b.right - b.left;
  const availH = y - b.bottom;
  const gap = mm(4);
  const cellW = (availW - gap) / 2;
  const cellH = (availH - gap) / 2;

  const corners: { file: PhotoValue | null; caption: string; badge: string }[] = [
    { file: site.cornerTL, caption: "Top Left Corner", badge: "TL" },
    { file: site.cornerTR, caption: "Top Right Corner", badge: "TR" },
    { file: site.cornerBL, caption: "Bottom Left Corner", badge: "BL" },
    { file: site.cornerBR, caption: "Bottom Right Corner", badge: "BR" },
  ];
  for (let i = 0; i < 4; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = b.left + col * (cellW + gap);
    const cellTop = y - row * (cellH + gap);
    await drawPhotoBoxOverlay(ctx, page, corners[i].file, cx, cellTop - cellH, cellW, cellH, corners[i].caption, undefined, corners[i].badge);
  }
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
  const ctx: Ctx = {
    doc,
    font,
    bold,
    italic,
    storeName: data.storeName,
    sfoId: data.sfoId,
    installationDate: data.installationDate,
    pageNumber: 0,
  };

  drawCoverPage(ctx, data);
  drawStoreAndCreativePage(ctx, data);
  await drawStorePicturesPages(ctx, data.storePictures);

  for (let i = 0; i < data.sites.length; i++) {
    const site = data.sites[i];
    await drawSiteOverviewPage(ctx, site, i);
    await drawSiteSpreadPage(ctx, site, i);
    if (siteHasCornerPhoto(site)) await drawCornersPage(ctx, site, i);
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
