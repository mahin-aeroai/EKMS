// Assembles the exported Site Survey Report PDF entirely client-side, same
// as Installation Report's own pdfBuild.ts (no server round-trip -- see
// that file's header comment). Structured the same way (design tokens, a
// repeating header/footer helper, one drawing function per page type,
// PDFDocument built up page by page, Blob + <a download> at the end) but
// deliberately does NOT reuse Installation Report's own "editorial
// magazine" visual language (A3 landscape, rounded cards, ghost numerals).
// This instead matches the *reference* Apple Site Inspection/Survey Report
// PDF's own look: A4 portrait, a dark grey top bar, a red site-identity
// header block, grey section-header bands, and plain bordered two-column
// tables -- so an exported report reads as "the same document, filled in
// digitally" rather than a different-looking redesign.
//
// Photos: every photo section is written to gracefully render an empty
// placeholder slot when a category has no matching photo yet (see
// drawPhotoBox), rather than assuming photos always exist -- still true
// now that milestone 3 (PhotosStep.tsx) uploads real ones, since any given
// report can still be missing a category. `SurveyPhotoInput` takes raw
// image bytes (fetched from R2 by the caller) rather than an already
// -embedded PDFImage, since a PDFImage is only ever valid for the
// PDFDocument that embedded it, and this file creates its own.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { PhotoCategory, SiteSurveyFormData, SiteSurveyMeasurement } from "./types";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

const PAGE_WIDTH = mm(210);
const PAGE_HEIGHT = mm(297);
const MARGIN = mm(14);
const TOPBAR_HEIGHT = mm(13);
const FOOTER_HEIGHT = mm(8);

// ---------------------------------------------------------------------------
// Design tokens -- matching the reference PDF's own palette, not
// Installation Report's
// ---------------------------------------------------------------------------

const DARKBAR = rgb(0.16, 0.16, 0.18); // top bar
const RED = rgb(0.64, 0.09, 0.11); // header identity block
const INK = rgb(0.1, 0.1, 0.12);
const INK_SECONDARY = rgb(0.34, 0.34, 0.37);
const MUTED = rgb(0.56, 0.56, 0.6);
const WHITE = rgb(1, 1, 1);
const SECTION_BAND = rgb(0.91, 0.91, 0.93);
const BORDER = rgb(0.8, 0.8, 0.83);
const PLACEHOLDER_BG = rgb(0.95, 0.95, 0.96);

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

// Caller-facing shape: raw image bytes, not yet embedded in any
// PDFDocument (a PDFImage is only ever valid for the document instance
// that embedded it, and buildSiteSurveyReportPdf creates its own
// PDFDocument internally -- see the entry point below).
export interface SurveyPhotoInput {
  bytes: Uint8Array;
  /** "jpg" unless the source file was a PNG (site_survey_photos rows are always uploaded as JPEG -- see the upload-url route -- but PNG is supported for future extracted-from-PDF pages, which rasterize to PNG). */
  format?: "jpg" | "png";
  category: PhotoCategory;
  caption: string | null;
  /** Fractional {x,y,w,h} red box, only ever present for the measurement photo. */
  annotation: { x: number; y: number; w: number; h: number } | null;
}

// Internal shape once a photo's bytes have been embedded into this build's
// PDFDocument -- what the drawing functions below actually consume.
interface SurveyPhotoImage {
  image: PDFImage;
  category: PhotoCategory;
  caption: string | null;
  annotation: { x: number; y: number; w: number; h: number } | null;
}

export interface SiteSurveyReportPdfData {
  storeName: string;
  address: string;
  sfoId: string;
  program: string;
  surveyDate: string; // yyyy-mm-dd or ""
  surveyorName: string;
  formData: SiteSurveyFormData;
  measurement: SiteSurveyMeasurement;
  photos: SurveyPhotoInput[];
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  data: SiteSurveyReportPdfData;
  photos: SurveyPhotoImage[];
  pageNumber: number;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function formatDate(value: string): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

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

function contentLeft() {
  return MARGIN;
}
function contentRight() {
  return PAGE_WIDTH - MARGIN;
}
function contentWidth() {
  return contentRight() - contentLeft();
}

/** Every page: a slim dark top bar (title left, page eyebrow right) and a footer with page number. */
function newPage(ctx: Ctx, eyebrow: string): PDFPage {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - TOPBAR_HEIGHT, width: PAGE_WIDTH, height: TOPBAR_HEIGHT, color: DARKBAR });
  page.drawText("Site Survey Report", {
    x: MARGIN,
    y: PAGE_HEIGHT - TOPBAR_HEIGHT / 2 - 3,
    size: 10.5,
    font: ctx.bold,
    color: WHITE,
  });
  const eyebrowUpper = eyebrow.toUpperCase();
  const ew = ctx.font.widthOfTextAtSize(eyebrowUpper, 8.5);
  page.drawText(eyebrowUpper, {
    x: PAGE_WIDTH - MARGIN - ew,
    y: PAGE_HEIGHT - TOPBAR_HEIGHT / 2 - 3,
    size: 8.5,
    font: ctx.font,
    color: rgb(0.85, 0.85, 0.87),
  });

  drawFooter(ctx, page);
  return page;
}

function drawFooter(ctx: Ctx, page: PDFPage) {
  page.drawLine({ start: { x: MARGIN, y: FOOTER_HEIGHT }, end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_HEIGHT }, thickness: 0.75, color: BORDER });
  const left = ctx.data.storeName ? `${ctx.data.storeName}${ctx.data.sfoId ? ` — SFO ${ctx.data.sfoId}` : ""}` : "Site Survey Report";
  page.drawText(left, { x: MARGIN, y: FOOTER_HEIGHT / 2 - 2, size: 7.5, font: ctx.font, color: MUTED });
  const right = `Page ${ctx.pageNumber}`;
  const rw = ctx.font.widthOfTextAtSize(right, 7.5);
  page.drawText(right, { x: PAGE_WIDTH - MARGIN - rw, y: FOOTER_HEIGHT / 2 - 2, size: 7.5, font: ctx.font, color: MUTED });
}

/** Grey section-header band -- returns the y to start drawing content below it. */
function drawSectionBand(page: PDFPage, ctx: Ctx, title: string, yTop: number): number {
  const bandH = mm(7);
  page.drawRectangle({ x: contentLeft(), y: yTop - bandH, width: contentWidth(), height: bandH, color: SECTION_BAND });
  page.drawText(title.toUpperCase(), {
    x: contentLeft() + mm(2.5),
    y: yTop - bandH / 2 - 3,
    size: 9,
    font: ctx.bold,
    color: INK_SECONDARY,
  });
  return yTop - bandH;
}

interface TableRow {
  label: string;
  value: string;
}

/** A plain bordered 2-column (label | value) table, matching the reference's inspection-details page. Returns the y position after the table; wraps long values. */
function drawTwoColTable(page: PDFPage, ctx: Ctx, rows: TableRow[], yTop: number): number {
  const labelColW = contentWidth() * 0.38;
  const valueColW = contentWidth() - labelColW;
  const pad = mm(2);
  const lineH = mm(4.6);
  let y = yTop;

  for (const row of rows) {
    const valueLines = wrapText(ctx.font, row.value || "—", 9, valueColW - pad * 2);
    const rowH = Math.max(lineH, valueLines.length * lineH) + pad * 1.2;

    page.drawRectangle({ x: contentLeft(), y: y - rowH, width: labelColW, height: rowH, borderColor: BORDER, borderWidth: 0.6, color: WHITE });
    page.drawRectangle({
      x: contentLeft() + labelColW,
      y: y - rowH,
      width: valueColW,
      height: rowH,
      borderColor: BORDER,
      borderWidth: 0.6,
      color: WHITE,
    });

    page.drawText(row.label, { x: contentLeft() + pad, y: y - pad - 7, size: 8.5, font: ctx.bold, color: INK_SECONDARY });
    valueLines.forEach((line, i) => {
      page.drawText(line, {
        x: contentLeft() + labelColW + pad,
        y: y - pad - 7 - i * lineH,
        size: 9,
        font: ctx.font,
        color: INK,
      });
    });

    y -= rowH;
  }
  return y;
}

/** A photo box: draws the real image (cover-fit) when present, otherwise a dashed placeholder naming what's missing -- lets the manual-fill export loop work end to end before photo upload (milestone 3) exists. */
function drawPhotoBox(page: PDFPage, ctx: Ctx, photo: SurveyPhotoImage | undefined, label: string, x: number, yTop: number, w: number, h: number) {
  if (!photo) {
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: PLACEHOLDER_BG, borderColor: BORDER, borderWidth: 0.75 });
    const text = `${label} — not yet added`;
    const tw = ctx.font.widthOfTextAtSize(text, 8.5);
    page.drawText(text, { x: x + (w - tw) / 2, y: yTop - h / 2, size: 8.5, font: ctx.font, color: MUTED });
    return;
  }

  const img = photo.image;
  const scale = Math.max(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: BORDER, borderWidth: 0.75 });
  page.drawImage(img, { x: x + (w - drawW) / 2, y: yTop - h - (drawH - h) / 2, width: drawW, height: drawH });

  if (photo.annotation) {
    const { x: ax, y: ay, w: aw, h: ah } = photo.annotation;
    page.drawRectangle({
      x: x + ax * w,
      y: yTop - ay * h - ah * h,
      width: aw * w,
      height: ah * h,
      borderColor: RED,
      borderWidth: 1.5,
    });
  }

  if (photo.caption) {
    page.drawRectangle({ x, y: yTop - h, width: w, height: mm(6), color: rgb(0, 0, 0), opacity: 0.55 });
    page.drawText(photo.caption, { x: x + mm(1.5), y: yTop - h + mm(1.7), size: 7.5, font: ctx.font, color: WHITE });
  }
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function drawCoverPage(ctx: Ctx) {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;
  const { data } = ctx;

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - mm(30), width: PAGE_WIDTH, height: mm(30), color: DARKBAR });
  page.drawText("SITE SURVEY REPORT", { x: MARGIN, y: PAGE_HEIGHT - mm(19), size: 20, font: ctx.bold, color: WHITE });

  const mainPhoto = ctx.photos.find((p) => p.category === "main_site");
  const photoTop = PAGE_HEIGHT - mm(30);
  const photoH = mm(120);
  drawPhotoBox(page, ctx, mainPhoto, "Main Site Photo", MARGIN, photoTop, contentWidth(), photoH);

  const blockTop = photoTop - photoH - mm(6);
  const blockH = mm(58);
  page.drawRectangle({ x: MARGIN, y: blockTop - blockH, width: contentWidth(), height: blockH, color: RED });

  const nameSize = 18;
  page.drawText(data.storeName || "Untitled Site", { x: MARGIN + mm(5), y: blockTop - mm(11), size: nameSize, font: ctx.bold, color: WHITE });
  wrapText(ctx.font, data.address || "—", 10.5, contentWidth() - mm(10)).forEach((line, i) => {
    page.drawText(line, { x: MARGIN + mm(5), y: blockTop - mm(19) - i * mm(5), size: 10.5, font: ctx.font, color: rgb(0.96, 0.9, 0.9) });
  });

  const facts: [string, string][] = [
    ["SFO ID", data.sfoId || "—"],
    ["Program", data.program || "—"],
    ["Survey Date", formatDate(data.surveyDate)],
    ["Surveyor", data.surveyorName || "—"],
  ];
  const factColW = contentWidth() / 2;
  facts.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const fx = MARGIN + mm(5) + col * factColW;
    const fy = blockTop - mm(34) - row * mm(11);
    page.drawText(label.toUpperCase(), { x: fx, y: fy, size: 7.5, font: ctx.bold, color: rgb(0.93, 0.82, 0.82) });
    page.drawText(value, { x: fx, y: fy - mm(5), size: 10.5, font: ctx.font, color: WHITE });
  });

  drawFooter(ctx, page);
}

function drawDetailsPage(ctx: Ctx) {
  const page = newPage(ctx, "Inspection Details");
  const { formData: f } = ctx.data;
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);

  y = drawSectionBand(page, ctx, "On-site Details", y);
  y = drawTwoColTable(
    page,
    ctx,
    [
      { label: "Date of Inspection", value: formatDate(ctx.data.surveyDate) },
      { label: "Surveyor Details", value: ctx.data.surveyorName },
      { label: "Store Person Contacted", value: f.storePersonContacted },
      { label: "Printer", value: f.printer },
    ],
    y
  );

  y -= mm(3);
  y = drawSectionBand(page, ctx, "Site Suitability", y);
  y = drawTwoColTable(
    page,
    ctx,
    [
      { label: "High & uninterrupted visibility?", value: yesNoLabel(f.siteVisibility) },
      { label: "Premium location?", value: yesNoLabel(f.premiumLocation) },
      { label: "Potential issues with location", value: f.potentialIssues },
    ],
    y
  );

  y -= mm(3);
  y = drawSectionBand(page, ctx, "Store Description", y);
  y = drawTwoColTable(
    page,
    ctx,
    [
      { label: "Silicon joins / edges condition", value: f.siliconJoinsCondition },
      { label: "Perspex cover condition", value: f.perspexCondition },
      { label: "Lighting / backlit potential", value: f.lightingDescription },
      { label: "Existing creative / stickers", value: f.existingCreative },
      { label: "Can existing creative be removed?", value: yesNoLabel(f.creativeRemovable, "Not Applicable") },
      { label: "Additional store observations", value: f.additionalStoreNotes },
    ],
    y
  );

  return y;
}

function drawInstallationDetailsPage(ctx: Ctx) {
  const page = newPage(ctx, "Installation Details");
  const { formData: f } = ctx.data;
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);

  y = drawSectionBand(page, ctx, "Installation Details", y);
  y = drawTwoColTable(
    page,
    ctx,
    [
      { label: "Time & date of installation", value: f.installationDateTime },
      { label: "Delivery times into store", value: f.deliveryTimes },
      { label: "Mall / work permits required?", value: yesNoLabel(f.permitRequired, "Unknown") },
      { label: "Permit details", value: f.permitDetails },
    ],
    y
  );

  y -= mm(3);
  y = drawSectionBand(page, ctx, "Additional Details", y);
  drawTwoColTable(page, ctx, [{ label: "General notes", value: f.generalNotes }], y);
}

function yesNoLabel(v: string, thirdLabel = "—"): string {
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  return v ? v : thirdLabel === "—" ? "—" : `— (${thirdLabel})`;
}

const ORIENTATION_LABELS: Record<string, string> = {
  orientation_right: "Right",
  orientation_left: "Left",
  orientation_opposite: "Opposite",
};

function drawMainSitePhotoPages(ctx: Ctx) {
  const photos = ctx.photos.filter((p) => p.category === "main_site");
  const list = photos.length > 0 ? photos : [undefined];
  for (const photo of list) {
    const page = newPage(ctx, "Main Site Photo");
    const top = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
    drawPhotoBox(page, ctx, photo, "Main Site Photo", MARGIN, top, contentWidth(), top - FOOTER_HEIGHT - mm(4));
  }
}

function drawOrientationPage(ctx: Ctx) {
  // Always drawn, one box per orientation whether or not a matching photo
  // exists yet (drawPhotoBox falls back to a placeholder) -- so the export
  // loop is complete end to end before photo upload (milestone 3) lands.
  const categories: PhotoCategory[] = ["orientation_right", "orientation_left", "orientation_opposite"];
  const page = newPage(ctx, "Site Orientation");
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
  y = drawSectionBand(page, ctx, "Site Orientation", y);

  const gap = mm(4);
  const boxW = (contentWidth() - gap * 2) / 3;
  const boxH = mm(85);
  categories.forEach((cat, i) => {
    const photo = ctx.photos.find((p) => p.category === cat);
    const x = contentLeft() + i * (boxW + gap);
    drawPhotoBox(page, ctx, photo, ORIENTATION_LABELS[cat], x, y, boxW, boxH);
    const label = ORIENTATION_LABELS[cat];
    const lw = ctx.bold.widthOfTextAtSize(label, 9);
    page.drawText(label, { x: x + (boxW - lw) / 2, y: y - boxH - mm(4.5), size: 9, font: ctx.bold, color: INK_SECONDARY });
  });
}

/** Draws a simple facade dimension diagram: an outer rect (material size) with an inner rect (visual size) and bleed dimension callouts on each side -- the reference PDF's hand-drawn Facade sketch, redrawn as clean vector shapes. */
function drawFacadeDiagram(page: PDFPage, ctx: Ctx, m: SiteSurveyMeasurement, x: number, yTop: number, w: number, h: number) {
  page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: BORDER, borderWidth: 0.75, color: WHITE });

  const vw = m.visualWidthMm ?? 0;
  const vh = m.visualHeightMm ?? 0;
  const mw = m.materialWidthMm ?? vw;
  const mh = m.materialHeightMm ?? vh;

  if (mw <= 0 || mh <= 0) {
    const text = "Add Visual/Material size to draw the dimension diagram";
    const tw = ctx.font.widthOfTextAtSize(text, 8.5);
    page.drawText(text, { x: x + (w - tw) / 2, y: yTop - h / 2, size: 8.5, font: ctx.font, color: MUTED });
    return;
  }

  const pad = mm(10);
  const availW = w - pad * 2;
  const availH = h - pad * 2;
  const scale = Math.min(availW / mw, availH / mh);
  const outerW = mw * scale;
  const outerH = mh * scale;
  const outerX = x + (w - outerW) / 2;
  const outerY = yTop - h + (h - outerH) / 2;

  page.drawRectangle({ x: outerX, y: outerY, width: outerW, height: outerH, borderColor: INK_SECONDARY, borderWidth: 1 });

  const bl = (m.bleedLeftMm ?? 0) * scale;
  const br = (m.bleedRightMm ?? 0) * scale;
  const bt = (m.bleedTopMm ?? 0) * scale;
  const bb = (m.bleedBottomMm ?? 0) * scale;
  const innerX = outerX + bl;
  const innerY = outerY + bb;
  const innerW = Math.max(0, outerW - bl - br);
  const innerH = Math.max(0, outerH - bt - bb);
  page.drawRectangle({ x: innerX, y: innerY, width: innerW, height: innerH, borderColor: RED, borderWidth: 1.25 });

  page.drawText(`Material ${mw}mm × ${mh}mm`, { x: outerX, y: outerY + outerH + mm(2.5), size: 8, font: ctx.bold, color: INK_SECONDARY });
  const visualLabel = `Visual ${vw}mm × ${vh}mm`;
  const vlw = ctx.font.widthOfTextAtSize(visualLabel, 7.5);
  page.drawText(visualLabel, { x: innerX + (innerW - vlw) / 2, y: innerY + innerH / 2, size: 7.5, font: ctx.font, color: RED });
}

function drawMeasurementPage(ctx: Ctx) {
  const page = newPage(ctx, "Site Photo & Measurement");
  const m = ctx.data.measurement;
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
  y = drawSectionBand(page, ctx, "Site Photo & Measurement", y);

  const photo = ctx.photos.find((p) => p.category === "measurement");
  const halfW = (contentWidth() - mm(4)) / 2;
  const rowH = mm(85);
  drawPhotoBox(page, ctx, photo, "Site Measurement Photo", contentLeft(), y, halfW, rowH);
  drawFacadeDiagram(page, ctx, m, contentLeft() + halfW + mm(4), y, halfW, rowH);
  y -= rowH + mm(4);

  y = drawTwoColTable(
    page,
    ctx,
    [
      { label: "Visual Size", value: sizeLabel(m.visualWidthMm, m.visualHeightMm) },
      { label: "Material Size", value: sizeLabel(m.materialWidthMm, m.materialHeightMm) },
      { label: "Bleed (L / R / T / B)", value: `${m.bleedLeftMm ?? "—"} / ${m.bleedRightMm ?? "—"} / ${m.bleedTopMm ?? "—"} / ${m.bleedBottomMm ?? "—"} mm` },
      { label: "Material Type", value: m.materialType },
      { label: "Installation Type", value: m.installationType },
      { label: "Equipment Required", value: m.equipmentDetail },
      { label: "Equipment Source", value: m.equipmentSource },
      { label: "Installed By", value: m.installedBy },
      { label: "Notes", value: m.measurementNotes },
    ],
    y
  );
}

function sizeLabel(w: number | null, h: number | null): string {
  if (w == null && h == null) return "—";
  return `${w ?? "—"}mm × ${h ?? "—"}mm`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function buildSiteSurveyReportPdf(data: SiteSurveyReportPdfData): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Every photo must be embedded into THIS PDFDocument before any drawing
  // starts -- a PDFImage from a different document isn't valid here (see
  // SurveyPhotoInput's header comment). Embedding is async; drawing isn't,
  // so it all happens up front rather than per page.
  const photos: SurveyPhotoImage[] = await Promise.all(
    data.photos.map(async (p) => ({
      image: p.format === "png" ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes),
      category: p.category,
      caption: p.caption,
      annotation: p.annotation,
    }))
  );

  const ctx: Ctx = { doc, font, bold, data, photos, pageNumber: 0 };

  drawCoverPage(ctx);
  drawDetailsPage(ctx);
  drawInstallationDetailsPage(ctx);
  drawMainSitePhotoPages(ctx);
  drawOrientationPage(ctx);
  drawMeasurementPage(ctx);

  const otherPhotos = ctx.photos.filter((p) => p.category === "other");
  if (otherPhotos.length > 0) {
    for (const photo of otherPhotos) {
      const page = newPage(ctx, "Additional Photo");
      const top = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
      drawPhotoBox(page, ctx, photo, "Additional Photo", MARGIN, top, contentWidth(), top - FOOTER_HEIGHT - mm(4));
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
