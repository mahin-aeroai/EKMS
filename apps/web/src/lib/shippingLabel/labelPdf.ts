// Builds MMDI's LFG Connect "Shipping Label" PDF entirely client-side (same
// no-server-round-trip approach as Site Survey Report's own pdfBuild.ts,
// which this deliberately does NOT deep-import from -- see this repo's
// OPERATIONS.md entry for why: that file's drawing helpers are unexported
// and tightly coupled to its own A4-LANDSCAPE, 15-page report data shape,
// while this label is a single A4-PORTRAIT page per site. Only genuinely
// exported pieces (normalizeAnnotation + the annotation/measurement types)
// are reused from siteSurveyReport/types.ts; the photo-clipping, annotation
// and Facade-diagram drawing logic below is a fresh, simpler port of that
// file's own drawPhotoBox/drawAnnotation/drawFacadeDiagram, at label scale.
//
// One page per site, split top/bottom exactly as requested: the top half is
// a shipping address block (outlet name, SFO ID, program, address, ASM
// contact), the bottom half is a "Site Photo & Measurement" block styled
// after the Site Survey Report reference -- photo (with its yellow
// installation-area annotation, when one exists) beside a Facade dimension
// diagram, then a Measurements & Material table underneath, when a
// completed Site Survey Report exists for that site (`site.measurement` is
// set by the caller only in that case). Sites with no completed survey fall
// back to a plain text-only Measurements & Material table built from
// lfg_sites' own (now bleed-unit-corrected) Width/Height/Bleed/Material/Qty
// fields instead -- no photo, no Facade diagram -- per the confirmed scope
// (every active site gets a label; a missing survey degrades gracefully
// rather than blocking or fabricating a photo).

import {
  PDFDocument,
  StandardFonts,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  rectangle as clipRectOp,
  clip as clipOp,
  endPath as endPathOp,
  degrees,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { normalizeAnnotation, type SiteSurveyPhotoAnnotation, type SiteSurveyPhotoAnnotationRaw } from "@/lib/siteSurveyReport/types";

// ---------------------------------------------------------------------------
// Page geometry -- A4 PORTRAIT (unlike Site Survey Report's A4 landscape)
// ---------------------------------------------------------------------------

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;
const PAGE_WIDTH = mm(210);
const PAGE_HEIGHT = mm(297);
const MARGIN = mm(10);

// Design tokens -- same palette as Site Survey Report's pdfBuild.ts (see
// that file) so a label reads as visually consistent with the report it's
// often paired with, not a separately-designed document.
const RED = rgb(0.64, 0.09, 0.11);
const INK = rgb(0.1, 0.1, 0.12);
const INK_SECONDARY = rgb(0.34, 0.34, 0.37);
const MUTED = rgb(0.56, 0.56, 0.6);
const WHITE = rgb(1, 1, 1);
const PLACEHOLDER_BG = rgb(0.95, 0.95, 0.96);
const RULE_COLOR = rgb(0x90 / 255, 0x99 / 255, 0x9c / 255);
const RULE_WEIGHT = 0.5;
const MARK = rgb(0.86, 0.91, 0.24);
const MARK_TEXT = rgb(0.42, 0.46, 0.06);
const TABLE_LABEL_BG = rgb(0.97, 0.97, 0.97);

interface Ctx {
  font: PDFFont;
  bold: PDFFont;
}

interface SurveyPhotoImage {
  image: PDFImage;
  annotation: SiteSurveyPhotoAnnotation | null;
  cropOffsetX: number;
  cropOffsetY: number;
}

interface TableRow {
  label: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Public input shape
// ---------------------------------------------------------------------------

/** Raw photo bytes for the site's measurement photo, when a completed survey has one -- caller fetches these (e.g. via the same signed-URL API route the Site Survey Report editor uses) before calling buildShippingLabelsPdf, same reasoning as SurveyPhotoInput in pdfBuild.ts (a PDFImage is only valid for the PDFDocument that embedded it). */
export interface ShippingLabelPhotoInput {
  bytes: Uint8Array;
  format: "png" | "jpg";
  annotation?: SiteSurveyPhotoAnnotationRaw | null;
  cropOffsetX?: number | null;
  cropOffsetY?: number | null;
}

/** The subset of a completed Site Survey Report's SiteSurveyMeasurement this label draws -- present only when the caller found a usable (status "ready" or "generated") report for the site. */
export interface ShippingLabelMeasurement {
  visualWidthMm: number | null;
  visualHeightMm: number | null;
  materialWidthMm: number | null;
  materialHeightMm: number | null;
  bleedTopMm: number | null;
  bleedRightMm: number | null;
  bleedBottomMm: number | null;
  bleedLeftMm: number | null;
  materialType: string | null;
}

export interface ShippingLabelSiteInput {
  id: string;
  outletName: string;
  sfoId: string | null;
  storeAddress: string | null;
  city: string | null;
  state: string | null;
  programName: string | null;
  asmName: string | null;
  asmMobile: string | null;
  asmEmail: string | null;
  escalationEmail: string | null;
  /** lfg_sites' own Width/Height, already converted to mm by the caller (see lib/lfg-units' mmToInches/inchesToMm -- lfg_sites stores these in inches). Used only for the no-survey fallback table. */
  widthMm: number | null;
  heightMm: number | null;
  /** lfg_sites' own Bleed -- stored as raw mm (no unit conversion), unlike Width/Height. See apps/web/src/app/workspaces/lfg/sizes/page.tsx's own comment on this. Used only for the no-survey fallback table. */
  bleedMm: number | null;
  material: string | null;
  numberOfSites: number | null;
  /** Set only when the caller found a usable completed Site Survey Report for this site -- drives the photo + Facade diagram + survey-sourced table. Omitted/undefined falls back to the plain text table built from this site's own widthMm/heightMm/bleedMm/material/numberOfSites above. */
  measurement?: ShippingLabelMeasurement | null;
  photo?: ShippingLabelPhotoInput | null;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function sizeLabel(w: number | null | undefined, h: number | null | undefined): string {
  if (w == null && h == null) return "—";
  return `${w ?? "—"}mm × ${h ?? "—"}mm`;
}

/** "30mm bleed across all sides" when uniform, otherwise spelled out per side -- ported verbatim from Site Survey Report's own bleedLabel. */
function bleedLabel(m: Pick<ShippingLabelMeasurement, "bleedLeftMm" | "bleedRightMm" | "bleedTopMm" | "bleedBottomMm">): string {
  const [l, r, t, b] = [m.bleedLeftMm, m.bleedRightMm, m.bleedTopMm, m.bleedBottomMm];
  if (l == null && r == null && t == null && b == null) return "no bleed specified";
  if (l === r && r === t && t === b) return `${l ?? 0}mm bleed across all sides`;
  return `${l ?? "—"} / ${r ?? "—"} / ${t ?? "—"} / ${b ?? "—"} mm bleed (L / R / T / B)`;
}

/**
 * A simple boxed two-column label/value table -- a smaller, self-contained
 * port of Site Survey Report's drawTwoColTable (no icon column, no
 * pagination bookkeeping, since a label's table never spans more than a
 * handful of rows on one fixed-height page).
 */
function drawTwoColTable(page: PDFPage, ctx: Ctx, rows: TableRow[], x: number, width: number, yTop: number): number {
  const labelColW = width * 0.4;
  const valueColW = width - labelColW;
  const pad = mm(2.4);
  const lineH = mm(4.8);
  let y = yTop;

  for (const row of rows) {
    const labelLines = wrapText(ctx.bold, row.label, 9, labelColW - pad * 2);
    const valueLines = wrapText(ctx.font, row.value || "—", 9.5, valueColW - pad * 2);
    const rowH = Math.max(lineH, Math.max(labelLines.length, valueLines.length) * lineH) + pad * 1.2;

    page.drawRectangle({ x, y: y - rowH, width: labelColW, height: rowH, borderColor: RULE_COLOR, borderWidth: RULE_WEIGHT, color: TABLE_LABEL_BG });
    page.drawRectangle({ x: x + labelColW, y: y - rowH, width: valueColW, height: rowH, borderColor: RULE_COLOR, borderWidth: RULE_WEIGHT, color: WHITE });

    labelLines.forEach((line, i) => {
      page.drawText(line, { x: x + pad, y: y - pad - 7 - i * lineH, size: 9, font: ctx.bold, color: INK_SECONDARY });
    });
    valueLines.forEach((line, i) => {
      page.drawText(line, { x: x + labelColW + pad, y: y - pad - 7 - i * lineH, size: 9.5, font: ctx.font, color: INK });
    });

    y -= rowH;
  }
  return y;
}

/** The yellow installation-area outline + any obstacle cut-outs, ported verbatim (at this file's own mm scale) from Site Survey Report's drawAnnotation. */
function drawAnnotation(page: PDFPage, ctx: Ctx, annotation: SiteSurveyPhotoAnnotation, imgX: number, imgY: number, drawW: number, drawH: number) {
  const toPage = (p: { x: number; y: number }) => ({ x: imgX + p.x * drawW, y: imgY + drawH - p.y * drawH });

  const pts = annotation.points.map(toPage);
  for (let i = 0; i < pts.length; i++) {
    page.drawLine({ start: pts[i], end: pts[(i + 1) % pts.length], thickness: 2, color: MARK });
  }

  for (const o of annotation.obstacles) {
    const rectX = imgX + o.x * drawW;
    const rectY = imgY + drawH - (o.y + o.h) * drawH;
    const rectW = o.w * drawW;
    const rectH = o.h * drawH;
    page.drawRectangle({ x: rectX, y: rectY, width: rectW, height: rectH, color: RED, opacity: 0.15, borderColor: RED, borderWidth: 1 });
    page.drawLine({ start: { x: rectX, y: rectY }, end: { x: rectX + rectW, y: rectY + rectH }, thickness: 1, color: RED });
    page.drawLine({ start: { x: rectX, y: rectY + rectH }, end: { x: rectX + rectW, y: rectY }, thickness: 1, color: RED });
  }
}

/**
 * A photo box: cover-fit real image (clipped to the box, annotation drawn
 * inside the same clip) when present, otherwise a placeholder -- ported
 * from Site Survey Report's drawPhotoBox, minus the caption bar (labels
 * don't carry photo captions).
 */
function drawPhotoBox(page: PDFPage, ctx: Ctx, photo: SurveyPhotoImage | undefined, label: string, x: number, yTop: number, w: number, h: number) {
  const boxY = yTop - h;

  if (!photo) {
    page.drawRectangle({ x, y: boxY, width: w, height: h, color: PLACEHOLDER_BG, borderColor: RULE_COLOR, borderWidth: RULE_WEIGHT });
    const text = `${label} — not available`;
    const tw = ctx.font.widthOfTextAtSize(text, 8);
    page.drawText(text, { x: x + (w - tw) / 2, y: yTop - h / 2, size: 8, font: ctx.font, color: MUTED });
    return;
  }

  const img = photo.image;
  const scale = Math.max(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const overflowX = Math.max(0, drawW - w);
  const overflowY = Math.max(0, drawH - h);
  const imgX = x - overflowX * (photo.cropOffsetX / 100);
  const imgY = boxY - overflowY * (1 - photo.cropOffsetY / 100);

  page.drawRectangle({ x, y: boxY, width: w, height: h, borderColor: RULE_COLOR, borderWidth: RULE_WEIGHT });

  page.pushOperators(pushGraphicsState(), clipRectOp(x, boxY, w, h), clipOp(), endPathOp());
  page.drawImage(img, { x: imgX, y: imgY, width: drawW, height: drawH });
  if (photo.annotation && photo.annotation.points.length >= 3) {
    drawAnnotation(page, ctx, photo.annotation, imgX, imgY, drawW, drawH);
  }
  page.pushOperators(popGraphicsState());
}

/** An arrowed dimension line, ported verbatim from Site Survey Report's drawDimensionLine. */
function drawDimensionLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, color: ReturnType<typeof rgb>) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const arrowLen = mm(2);
  const arrowW = mm(0.9);
  const thickness = 0.8;

  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x1 + ux * arrowLen + px * arrowW, y: y1 + uy * arrowLen + py * arrowW }, thickness, color });
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x1 + ux * arrowLen - px * arrowW, y: y1 + uy * arrowLen - py * arrowW }, thickness, color });
  page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 - ux * arrowLen + px * arrowW, y: y2 - uy * arrowLen + py * arrowW }, thickness, color });
  page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 - ux * arrowLen - px * arrowW, y: y2 - uy * arrowLen - py * arrowW }, thickness, color });
}

/** The "Facade" schematic (marked rectangle + width/height dimension arrows), ported from Site Survey Report's drawFacadeDiagram at this file's smaller scale. */
function drawFacadeDiagram(page: PDFPage, ctx: Ctx, m: Pick<ShippingLabelMeasurement, "visualWidthMm" | "visualHeightMm">, x: number, yTop: number, w: number, h: number) {
  page.drawText("Facade", { x, y: yTop - mm(6), size: 11, font: ctx.font, color: INK });

  const vw = m.visualWidthMm ?? 0;
  const vh = m.visualHeightMm ?? 0;
  const diagramTop = yTop - mm(10);
  const diagramBottom = yTop - h;

  if (vw <= 0 || vh <= 0) {
    const text = "Visual size not available";
    const tw = ctx.font.widthOfTextAtSize(text, 8);
    page.drawText(text, { x: x + (w - tw) / 2, y: (diagramTop + diagramBottom) / 2, size: 8, font: ctx.font, color: MUTED });
    return;
  }

  const leftGutter = mm(11);
  const bottomGutter = mm(9);
  const rightPad = mm(3);
  const availW = w - leftGutter - rightPad;
  const availH = diagramTop - bottomGutter - diagramBottom;
  const scale = Math.min(availW / vw, availH / vh);
  const rectW = vw * scale;
  const rectH = vh * scale;
  const rectX = x + leftGutter + (availW - rectW) / 2;
  const rectY = diagramBottom + bottomGutter + (availH - rectH) / 2;

  page.drawRectangle({ x: rectX, y: rectY, width: rectW, height: rectH, color: MARK, borderColor: MARK_TEXT, borderWidth: 1 });

  const dimY = rectY - mm(4.2);
  drawDimensionLine(page, rectX, dimY, rectX + rectW, dimY, INK_SECONDARY);
  const widthLabel = `${vw} mm`;
  const wlw = ctx.font.widthOfTextAtSize(widthLabel, 7.5);
  page.drawText(widthLabel, { x: rectX + (rectW - wlw) / 2, y: dimY - mm(4), size: 7.5, font: ctx.font, color: INK_SECONDARY });

  const dimX = rectX - mm(4.2);
  drawDimensionLine(page, dimX, rectY, dimX, rectY + rectH, INK_SECONDARY);
  const heightLabel = `${vh} mm`;
  const hlw = ctx.font.widthOfTextAtSize(heightLabel, 7.5);
  page.drawText(heightLabel, {
    x: dimX - mm(2.8),
    y: rectY + rectH / 2 - hlw / 2,
    size: 7.5,
    font: ctx.font,
    color: INK_SECONDARY,
    rotate: degrees(90),
  });
}

// ---------------------------------------------------------------------------
// Top-half: address block
// ---------------------------------------------------------------------------

function drawAddressHalf(page: PDFPage, ctx: Ctx, site: ShippingLabelSiteInput, x: number, yTop: number, w: number, h: number) {
  const boxBottom = yTop - h;
  page.drawRectangle({ x, y: boxBottom, width: w, height: h, borderColor: RULE_COLOR, borderWidth: RULE_WEIGHT });

  const bandH = mm(9);
  page.drawRectangle({ x, y: yTop - bandH, width: w, height: bandH, color: RED });
  page.drawText("SHIP TO", { x: x + mm(4), y: yTop - mm(6.2), size: 10, font: ctx.bold, color: WHITE });
  if (site.sfoId) {
    const t = `SFO ID: ${site.sfoId}`;
    const tw = ctx.font.widthOfTextAtSize(t, 9);
    page.drawText(t, { x: x + w - mm(4) - tw, y: yTop - mm(6.1), size: 9, font: ctx.font, color: WHITE });
  }

  let y = yTop - bandH - mm(9);
  const nameLines = wrapText(ctx.bold, site.outletName || "—", 19, w - mm(8)).slice(0, 2);
  nameLines.forEach((line, i) => {
    page.drawText(line, { x: x + mm(4), y: y - i * mm(8.5), size: 19, font: ctx.bold, color: INK });
  });
  y -= nameLines.length * mm(8.5) + mm(3.5);

  if (site.programName) {
    page.drawText(site.programName, { x: x + mm(4), y, size: 10, font: ctx.font, color: INK_SECONDARY });
    y -= mm(7);
  }

  const addrParts = [site.storeAddress, [site.city, site.state].filter(Boolean).join(", ")].filter(Boolean) as string[];
  for (const part of addrParts) {
    for (const line of wrapText(ctx.font, part, 11, w - mm(8))) {
      page.drawText(line, { x: x + mm(4), y, size: 11, font: ctx.font, color: INK });
      y -= mm(5.6);
    }
  }
  y -= mm(2.5);

  page.drawLine({ start: { x: x + mm(4), y }, end: { x: x + w - mm(4), y }, thickness: RULE_WEIGHT, color: RULE_COLOR });
  y -= mm(6.5);

  const contactRows: [string, string][] = [];
  if (site.asmName) contactRows.push(["ASM", site.asmName]);
  if (site.asmMobile) contactRows.push(["Mobile", site.asmMobile]);
  if (site.asmEmail) contactRows.push(["Email", site.asmEmail]);
  if (site.escalationEmail) contactRows.push(["Escalation", site.escalationEmail]);

  const valueX = x + mm(28);
  for (const [label, value] of contactRows) {
    if (y - mm(5.6) < boxBottom + mm(4)) break; // stop rather than overflow the box on a very sparse-data outlier
    page.drawText(label, { x: x + mm(4), y, size: 8.5, font: ctx.bold, color: MUTED });
    for (const line of wrapText(ctx.font, value, 9.5, x + w - mm(4) - valueX)) {
      page.drawText(line, { x: valueX, y, size: 9.5, font: ctx.font, color: INK });
      y -= mm(5.2);
    }
  }
}

// ---------------------------------------------------------------------------
// Bottom-half: Site Photo & Measurement block
// ---------------------------------------------------------------------------

function drawMeasurementHalf(page: PDFPage, ctx: Ctx, site: ShippingLabelSiteInput, photoImage: SurveyPhotoImage | undefined, x: number, yTop: number, w: number, h: number) {
  const boxBottom = yTop - h;
  page.drawRectangle({ x, y: boxBottom, width: w, height: h, borderColor: RULE_COLOR, borderWidth: RULE_WEIGHT });

  let y = yTop - mm(7);
  page.drawText("SITE PHOTO & MEASUREMENT", { x: x + mm(4), y, size: 11, font: ctx.bold, color: INK });
  y -= mm(9);

  const innerX = x + mm(4);
  const innerW = w - mm(8);
  const m = site.measurement;

  if (m) {
    const gap = mm(4);
    const halfW = (innerW - gap) / 2;
    const rowH = mm(50);
    drawPhotoBox(page, ctx, photoImage, "Site Photo", innerX, y, halfW, rowH);
    drawFacadeDiagram(page, ctx, m, innerX + halfW + gap, y, halfW, rowH);
    y -= rowH + mm(5);

    const rows: TableRow[] = [
      { label: "Visual Size (marked)", value: sizeLabel(m.visualWidthMm, m.visualHeightMm) },
      { label: "Material Size", value: `${sizeLabel(m.materialWidthMm, m.materialHeightMm)} (${bleedLabel(m)})` },
      { label: "Material Type", value: m.materialType || site.material || "—" },
      { label: "Quantity", value: String(site.numberOfSites ?? 1) },
    ];
    drawTwoColTable(page, ctx, rows, innerX, innerW, y);
  } else {
    // No completed Site Survey Report for this site -- text-only fallback
    // table built from lfg_sites' own fields, per the confirmed scope (no
    // photo, no Facade diagram, since there's no real photo to show).
    y -= mm(3);
    const rows: TableRow[] = [
      { label: "Panel Size", value: sizeLabel(site.widthMm, site.heightMm) },
      { label: "Bleed", value: site.bleedMm != null ? `${site.bleedMm}mm` : "not specified" },
      { label: "Material", value: site.material || "—" },
      { label: "Quantity", value: String(site.numberOfSites ?? 1) },
    ];
    const note = "No completed Site Survey Report on file for this site — showing recorded panel size instead of a site photo.";
    const noteLines = wrapText(ctx.font, note, 8.5, innerW);
    noteLines.forEach((line, i) => {
      page.drawText(line, { x: innerX, y: y - i * mm(4.2), size: 8.5, font: ctx.font, color: MUTED });
    });
    y -= noteLines.length * mm(4.2) + mm(5);
    drawTwoColTable(page, ctx, rows, innerX, innerW, y);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function buildShippingLabelsPdf(sites: ShippingLabelSiteInput[]): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { font, bold };

  const half = PAGE_HEIGHT / 2;
  const gap = mm(3);
  const contentX = MARGIN;
  const contentW = PAGE_WIDTH - MARGIN * 2;

  for (const site of sites) {
    let photoImage: SurveyPhotoImage | undefined;
    if (site.photo) {
      const img = site.photo.format === "png" ? await doc.embedPng(site.photo.bytes) : await doc.embedJpg(site.photo.bytes);
      photoImage = {
        image: img,
        annotation: normalizeAnnotation(site.photo.annotation ?? null),
        cropOffsetX: site.photo.cropOffsetX ?? 50,
        cropOffsetY: site.photo.cropOffsetY ?? 50,
      };
    }

    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    drawAddressHalf(page, ctx, site, contentX, PAGE_HEIGHT - MARGIN, contentW, PAGE_HEIGHT - MARGIN - (half + gap / 2));

    page.drawLine({
      start: { x: MARGIN, y: half },
      end: { x: PAGE_WIDTH - MARGIN, y: half },
      thickness: 0.75,
      color: MUTED,
      dashArray: [4, 3],
    });
    // Plain hyphens, not a scissors glyph -- pdf-lib's standard Helvetica
    // is WinAnsi-encoded and throws ("WinAnsi cannot encode...") on any
    // character outside that set, confirmed live when this shipped with a
    // "✂" here.
    const cutLabel = "- - CUT HERE - -";
    const cutW = font.widthOfTextAtSize(cutLabel, 7);
    page.drawRectangle({ x: PAGE_WIDTH / 2 - cutW / 2 - mm(1.5), y: half - mm(2), width: cutW + mm(3), height: mm(4), color: WHITE });
    page.drawText(cutLabel, { x: PAGE_WIDTH / 2 - cutW / 2, y: half - mm(1.2), size: 7, font, color: MUTED });

    drawMeasurementHalf(page, ctx, site, photoImage, contentX, half - gap / 2, contentW, half - gap / 2 - MARGIN);
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
