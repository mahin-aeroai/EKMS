// Assembles the exported Site Survey Report PDF entirely client-side, same
// as Installation Report's own pdfBuild.ts (no server round-trip -- see
// that file's header comment). Structured the same way (design tokens, a
// repeating header/footer helper, one drawing function per page type,
// PDFDocument built up page by page, Blob + <a download> at the end) but
// deliberately does NOT reuse Installation Report's own "editorial
// magazine" visual language (A3 landscape, rounded cards, ghost numerals).
// This instead matches the *reference* Apple Site Inspection/Survey Report
// PDF's own look: A4 LANDSCAPE, a dark grey top bar, a red site-identity
// block, grey section-header bands (each carrying the page's own site-name
// recap on the right, exactly as the reference repeats it), and plain
// bordered two-column tables -- so an exported report reads as "the same
// document, filled in digitally" rather than a different-looking redesign.
// Landscape (not the original portrait A4) matches the real Apple-issued
// reference reports this feature was rebuilt against a second time, which
// are all landscape; it also gives the consolidated Inspection Details
// page (see drawDetailsPage) enough width to fit every field on one page,
// same as the reference does, instead of spreading across two mostly-empty
// portrait pages.
//
// Photos: every photo section is written to gracefully render an empty
// placeholder slot when a category has no matching photo yet (see
// drawPhotoBox), rather than assuming photos always exist. `SurveyPhotoInput`
// takes raw image bytes (fetched from R2 by the caller) rather than an
// already-embedded PDFImage, since a PDFImage is only ever valid for the
// PDFDocument that embedded it, and this file creates its own.
//
// Every photo box now clips the drawn image to its own box bounds via a PDF
// clipping path (see drawPhotoBox) -- cover-fit scaling makes the drawn
// image *larger* than the box on one axis by design (that's how "cover"
// crops), and pdf-lib's drawImage has no built-in cropping, so without an
// explicit clip the oversized image spills straight past the box edges and
// over whatever is drawn next to it. That was visible as photos bleeding
// across the Site Orientation page's 3-photo grid and past the page edge.
//
// Fonts: the caller may pass Apple's own SF Pro Text (fetched via
// pdfFonts.ts, never committed to this repo -- see that file's header
// comment) as the `fonts` param on buildSiteSurveyReportPdf below, in which
// case it's embedded via fontkit instead of pdf-lib's built-in Helvetica.
// Embedded WITHOUT subsetting (`subset: false`) -- SF Pro's outlines are
// CFF-flavoured, and pdf-lib/fontkit's subsetter reliably produces a
// corrupt embedded font for CFF outlines (confirmed against this exact
// font: poppler refuses to parse the subsetted output, "Embedded font file
// may be invalid" then a hard render failure, whereas the unsubsetted
// embed renders correctly everywhere it was tested -- poppler, cairo).
// Costs ~300-350KB extra per weight in the output PDF (fixed, once per
// document, not per page) -- an acceptable tradeoff for a working font
// over a broken subsetted one. If SF Pro fails to embed for any reason
// (corrupt bytes, a future pdf-lib/fontkit incompatibility), the build
// falls back to Helvetica rather than failing outright.

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
import fontkit from "@pdf-lib/fontkit";
import type { PhotoCategory, SiteSurveyFormData, SiteSurveyMeasurement } from "./types";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

// Landscape A4 -- see header comment for why (matches the real reference
// reports, and gives the consolidated details page room to breathe).
const PAGE_WIDTH = mm(297);
const PAGE_HEIGHT = mm(210);
const MARGIN = mm(14);
const TOPBAR_HEIGHT = mm(13);
const FOOTER_HEIGHT = mm(8);

// ---------------------------------------------------------------------------
// Design tokens -- matching the reference PDF's own palette, not
// Installation Report's
// ---------------------------------------------------------------------------

const DARKBAR = rgb(0.16, 0.16, 0.18); // top bar
const RED = rgb(0.64, 0.09, 0.11); // brand/identity accent (cover block, site name)
const INK = rgb(0.1, 0.1, 0.12);
const INK_SECONDARY = rgb(0.34, 0.34, 0.37);
const MUTED = rgb(0.56, 0.56, 0.6);
const WHITE = rgb(1, 1, 1);
const SECTION_BAND = rgb(0.91, 0.91, 0.93);
const BORDER = rgb(0.8, 0.8, 0.83);
const PLACEHOLDER_BG = rgb(0.95, 0.95, 0.96);

// The installation-area marking colour -- greenish-yellow, matching the
// on-screen annotation tool in PhotosStep.tsx's AnnotationEditor (keep
// these two in sync; search for MARK_COLOR_HEX in that file). Deliberately
// NOT the reference PDF's red -- this app's own marking convention. MARK is
// used for the border/fill itself; MARK_TEXT is a darker olive shade of the
// same hue for any text drawn in this colour, since pale greenish-yellow
// text is close to unreadable on a white page.
const MARK = rgb(0.86, 0.91, 0.24);
const MARK_TEXT = rgb(0.42, 0.46, 0.06);

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
  /** Fractional {x,y,w,h} installation-area marker, top-left origin relative to the FULL original image as shown uncropped in the editor -- only ever present for the measurement photo. */
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
  if (eyebrow) {
    const eyebrowUpper = eyebrow.toUpperCase();
    const ew = ctx.font.widthOfTextAtSize(eyebrowUpper, 8.5);
    page.drawText(eyebrowUpper, {
      x: PAGE_WIDTH - MARGIN - ew,
      y: PAGE_HEIGHT - TOPBAR_HEIGHT / 2 - 3,
      size: 8.5,
      font: ctx.font,
      color: rgb(0.85, 0.85, 0.87),
    });
  }

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

/**
 * Grey section-header band -- returns the y to start drawing content below
 * it. Takes its own x/width (rather than always spanning the full content
 * width) so the consolidated Inspection Details page can draw two
 * independent columns of sections side by side, matching the reference's
 * own two-up layout on one landscape page instead of the original's two
 * separate, mostly-empty portrait pages.
 *
 * rightText, when given, is drawn right-aligned in the same band -- used to
 * repeat the site name alongside a section title, exactly as the reference
 * PDF repeats "iMaging @ Model Town, Jalandhar" beside "Site Photo and
 * measurement" on its own final page.
 */
function drawSectionBand(page: PDFPage, ctx: Ctx, title: string, x: number, width: number, yTop: number, rightText?: string): number {
  const bandH = mm(7);
  page.drawRectangle({ x, y: yTop - bandH, width, height: bandH, color: SECTION_BAND });
  page.drawText(title.toUpperCase(), {
    x: x + mm(2.5),
    y: yTop - bandH / 2 - 3,
    size: 9,
    font: ctx.bold,
    color: INK_SECONDARY,
  });
  if (rightText) {
    const rw = ctx.bold.widthOfTextAtSize(rightText, 9);
    page.drawText(rightText, { x: x + width - mm(2.5) - rw, y: yTop - bandH / 2 - 3, size: 9, font: ctx.bold, color: INK });
  }
  return yTop - bandH;
}

/**
 * The site name / address / SFO ID / Program header block that sits above
 * the Inspection Details page's tables -- mirrors the reference PDF's own
 * plain-text (not colour-blocked) identity header repeated at the top of
 * its inspection-details page.
 */
function drawIdentityBlock(page: PDFPage, ctx: Ctx, yTop: number): number {
  const { data } = ctx;
  const blockH = mm(22);

  page.drawText(data.storeName || "Untitled Site", { x: contentLeft(), y: yTop - mm(7), size: 15, font: ctx.bold, color: RED });
  wrapText(ctx.font, data.address || "—", 9.5, contentWidth() * 0.55)
    .slice(0, 2)
    .forEach((line, i) => {
      page.drawText(line, { x: contentLeft(), y: yTop - mm(13) - i * mm(4.6), size: 9.5, font: ctx.font, color: rgb(0.5, 0.16, 0.17) });
    });

  const facts: [string, string][] = [
    ["SFO ID", data.sfoId || "—"],
    ["Program", data.program || "—"],
  ];
  const factColW = contentWidth() * 0.16;
  const factX = contentRight() - factColW * facts.length;
  facts.forEach(([label, value], i) => {
    const fx = factX + i * factColW;
    page.drawText(label.toUpperCase(), { x: fx, y: yTop - mm(4), size: 7.5, font: ctx.bold, color: MUTED });
    page.drawText(value, { x: fx, y: yTop - mm(10), size: 10.5, font: ctx.bold, color: INK });
  });

  page.drawLine({ start: { x: contentLeft(), y: yTop - blockH }, end: { x: contentRight(), y: yTop - blockH }, thickness: 0.75, color: BORDER });
  return yTop - blockH - mm(3);
}

interface TableRow {
  label: string;
  value: string;
}

/** A plain bordered 2-column (label | value) table, matching the reference's inspection-details page. Takes its own x/width for the same two-column-page reason as drawSectionBand above. Returns the y position after the table; wraps long values. */
function drawTwoColTable(page: PDFPage, ctx: Ctx, rows: TableRow[], x: number, width: number, yTop: number): number {
  const labelColW = width * 0.42;
  const valueColW = width - labelColW;
  const pad = mm(2);
  const lineH = mm(4.6);
  let y = yTop;

  for (const row of rows) {
    const valueLines = wrapText(ctx.font, row.value || "—", 9, valueColW - pad * 2);
    const rowH = Math.max(lineH, valueLines.length * lineH) + pad * 1.2;

    page.drawRectangle({ x, y: y - rowH, width: labelColW, height: rowH, borderColor: BORDER, borderWidth: 0.6, color: WHITE });
    page.drawRectangle({
      x: x + labelColW,
      y: y - rowH,
      width: valueColW,
      height: rowH,
      borderColor: BORDER,
      borderWidth: 0.6,
      color: WHITE,
    });

    page.drawText(row.label, { x: x + pad, y: y - pad - 7, size: 8.5, font: ctx.bold, color: INK_SECONDARY });
    valueLines.forEach((line, i) => {
      page.drawText(line, {
        x: x + labelColW + pad,
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

/**
 * A photo box: draws the real image (cover-fit) when present, otherwise a
 * dashed placeholder naming what's missing, or a greenish-yellow-marked box
 * when the photo carries an installation-area annotation (the measurement
 * photo only).
 *
 * The drawn image is clipped to exactly [x, boxY, w, h] via a PDF clipping
 * path -- cover-fit scaling (`Math.max`) intentionally makes the drawn
 * image larger than the box on whichever axis doesn't match the box's own
 * aspect ratio, and pdf-lib's drawImage has no built-in crop, so without
 * this clip the oversized image spills past the box edges (see file header
 * comment).
 *
 * When an annotation is present, its fractional {x,y,w,h} is relative to
 * the FULL original image as shown uncropped in the editor (top-left
 * origin -- see PhotosStep.tsx's AnnotationEditor), so it's converted using
 * the same drawW/drawH/imgX/imgY the image itself was placed with, not the
 * box's own w/h -- using the box's dimensions directly (as a previous
 * version did) only happens to line up when the box's aspect ratio matches
 * the photo's own, and silently drifts off the real marked area otherwise.
 * The annotation rectangle is drawn inside the same clip as the image, so a
 * marked area that falls partly in the cover-fit-cropped-off portion of the
 * photo is clipped at the box edge rather than spilling out of it.
 */
function drawPhotoBox(page: PDFPage, ctx: Ctx, photo: SurveyPhotoImage | undefined, label: string, x: number, yTop: number, w: number, h: number) {
  const boxY = yTop - h;

  if (!photo) {
    page.drawRectangle({ x, y: boxY, width: w, height: h, color: PLACEHOLDER_BG, borderColor: BORDER, borderWidth: 0.75 });
    const text = `${label} — not yet added`;
    const tw = ctx.font.widthOfTextAtSize(text, 8.5);
    page.drawText(text, { x: x + (w - tw) / 2, y: yTop - h / 2, size: 8.5, font: ctx.font, color: MUTED });
    return;
  }

  const img = photo.image;
  const scale = Math.max(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const imgX = x + (w - drawW) / 2;
  const imgY = boxY - (drawH - h) / 2;

  page.drawRectangle({ x, y: boxY, width: w, height: h, borderColor: BORDER, borderWidth: 0.75 });

  page.pushOperators(pushGraphicsState(), clipRectOp(x, boxY, w, h), clipOp(), endPathOp());
  page.drawImage(img, { x: imgX, y: imgY, width: drawW, height: drawH });

  if (photo.annotation) {
    const { x: ax, y: ay, w: aw, h: ah } = photo.annotation;
    page.drawRectangle({
      x: imgX + ax * drawW,
      y: imgY + drawH - (ay + ah) * drawH,
      width: aw * drawW,
      height: ah * drawH,
      borderColor: MARK,
      borderWidth: 2.5,
    });
  }
  page.pushOperators(popGraphicsState());

  if (photo.caption) {
    page.drawRectangle({ x, y: boxY, width: w, height: mm(6), color: rgb(0, 0, 0), opacity: 0.55 });
    page.drawText(photo.caption, { x: x + mm(1.5), y: boxY + mm(1.7), size: 7.5, font: ctx.font, color: WHITE });
  }
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function drawCoverPage(ctx: Ctx) {
  const page = newPage(ctx, "");
  const { data } = ctx;
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);

  const mainPhoto = ctx.photos.find((p) => p.category === "main_site");
  const photoH = mm(108);
  drawPhotoBox(page, ctx, mainPhoto, "Main Site Photo", MARGIN, y, contentWidth(), photoH);
  y -= photoH + mm(5);

  const blockH = mm(46);
  page.drawRectangle({ x: MARGIN, y: y - blockH, width: contentWidth(), height: blockH, color: RED });

  page.drawText(data.storeName || "Untitled Site", { x: MARGIN + mm(5), y: y - mm(10), size: 17, font: ctx.bold, color: WHITE });
  wrapText(ctx.font, data.address || "—", 10.5, contentWidth() * 0.55)
    .slice(0, 2)
    .forEach((line, i) => {
      page.drawText(line, { x: MARGIN + mm(5), y: y - mm(17) - i * mm(5), size: 10.5, font: ctx.font, color: rgb(0.96, 0.9, 0.9) });
    });

  const facts: [string, string][] = [
    ["SFO ID", data.sfoId || "—"],
    ["Program", data.program || "—"],
    ["Survey Date", formatDate(data.surveyDate)],
    ["Surveyor", data.surveyorName || "—"],
  ];
  const factColW = contentWidth() / facts.length;
  facts.forEach(([label, value], i) => {
    const fx = MARGIN + mm(5) + i * factColW;
    page.drawText(label.toUpperCase(), { x: fx, y: y - mm(28), size: 7.5, font: ctx.bold, color: rgb(0.93, 0.82, 0.82) });
    page.drawText(value, { x: fx, y: y - mm(34), size: 10.5, font: ctx.font, color: WHITE });
  });
}

/**
 * Every ~20 one-off Q&A field, consolidated onto a single landscape page in
 * two side-by-side columns -- matching the reference PDF's own single
 * inspection-details page, instead of the original portrait build's two
 * separate, mostly-empty pages (which only existed because a portrait page
 * didn't have the width for two columns).
 */
function drawDetailsPage(ctx: Ctx) {
  const page = newPage(ctx, "Inspection Details");
  const { formData: f } = ctx.data;
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
  y = drawIdentityBlock(page, ctx, y);

  const colGap = mm(6);
  const colW = (contentWidth() - colGap) / 2;
  const leftX = contentLeft();
  const rightX = contentLeft() + colW + colGap;
  let leftY = y;
  let rightY = y;

  leftY = drawSectionBand(page, ctx, "On-site Details", leftX, colW, leftY);
  leftY = drawTwoColTable(
    page,
    ctx,
    [
      { label: "Date of Inspection", value: formatDate(ctx.data.surveyDate) },
      { label: "Surveyor Details", value: ctx.data.surveyorName },
      { label: "Store Person Contacted", value: f.storePersonContacted },
      { label: "Printer", value: f.printer },
    ],
    leftX,
    colW,
    leftY
  );

  leftY -= mm(3);
  leftY = drawSectionBand(page, ctx, "Store Description", leftX, colW, leftY);
  drawTwoColTable(
    page,
    ctx,
    [
      { label: "Silicon Joins / Edges Condition", value: f.siliconJoinsCondition },
      { label: "Perspex Cover Condition", value: f.perspexCondition },
      { label: "Lighting / Backlit Potential", value: f.lightingDescription },
      { label: "Existing Creative / Stickers", value: f.existingCreative },
      { label: "Can Existing Creative Be Removed?", value: yesNoLabel(f.creativeRemovable, "Not Applicable") },
      { label: "Additional Store Observations", value: f.additionalStoreNotes },
    ],
    leftX,
    colW,
    leftY
  );

  rightY = drawSectionBand(page, ctx, "Site Suitability", rightX, colW, rightY);
  rightY = drawTwoColTable(
    page,
    ctx,
    [
      { label: "High & Uninterrupted Visibility?", value: yesNoLabel(f.siteVisibility) },
      { label: "Premium Location?", value: yesNoLabel(f.premiumLocation) },
      { label: "Potential Issues With Location", value: f.potentialIssues },
    ],
    rightX,
    colW,
    rightY
  );

  rightY -= mm(3);
  rightY = drawSectionBand(page, ctx, "Installation Details", rightX, colW, rightY);
  rightY = drawTwoColTable(
    page,
    ctx,
    [
      { label: "Time & Date of Installation", value: f.installationDateTime },
      { label: "Delivery Times Into Store", value: f.deliveryTimes },
      { label: "Mall / Work Permits Required?", value: yesNoLabel(f.permitRequired, "Unknown") },
      { label: "Permit Details", value: f.permitDetails },
    ],
    rightX,
    colW,
    rightY
  );

  rightY -= mm(3);
  rightY = drawSectionBand(page, ctx, "Additional Details", rightX, colW, rightY);
  drawTwoColTable(page, ctx, [{ label: "General Notes", value: f.generalNotes }], rightX, colW, rightY);
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
  // loop is complete end to end before photo upload lands.
  const categories: PhotoCategory[] = ["orientation_right", "orientation_left", "orientation_opposite"];
  const page = newPage(ctx, "Site Orientation");
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
  y = drawSectionBand(page, ctx, "Site Orientation", contentLeft(), contentWidth(), y, ctx.data.storeName || undefined);

  const gap = mm(6);
  const boxW = (contentWidth() - gap * 2) / 3;
  const boxH = mm(118);
  categories.forEach((cat, i) => {
    const photo = ctx.photos.find((p) => p.category === cat);
    const x = contentLeft() + i * (boxW + gap);
    drawPhotoBox(page, ctx, photo, ORIENTATION_LABELS[cat], x, y, boxW, boxH);
    const label = ORIENTATION_LABELS[cat];
    const lw = ctx.bold.widthOfTextAtSize(label, 9);
    page.drawText(label, { x: x + (boxW - lw) / 2, y: y - boxH - mm(5), size: 9, font: ctx.bold, color: INK_SECONDARY });
  });
}

/**
 * A dimension line: a straight line between two points with an open
 * chevron arrowhead at each end, generic to any direction (used both for
 * the facade diagram's horizontal width and vertical height dimensions
 * below) -- the reference PDF's own arrowed dimension lines under/beside
 * its Facade rectangle, redrawn as clean vectors.
 */
function drawDimensionLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, color: ReturnType<typeof rgb>) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const arrowLen = mm(2.2);
  const arrowW = mm(1);
  const thickness = 0.9;

  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });

  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x1 + ux * arrowLen + px * arrowW, y: y1 + uy * arrowLen + py * arrowW }, thickness, color });
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x1 + ux * arrowLen - px * arrowW, y: y1 + uy * arrowLen - py * arrowW }, thickness, color });
  page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 - ux * arrowLen + px * arrowW, y: y2 - uy * arrowLen + py * arrowW }, thickness, color });
  page.drawLine({ start: { x: x2, y: y2 }, end: { x: x2 - ux * arrowLen - px * arrowW, y: y2 - uy * arrowLen - py * arrowW }, thickness, color });
}

/**
 * The reference PDF's "Facade" schematic: a solid rectangle representing
 * the marked (Visual size) installation area, with arrowed dimension lines
 * giving its width (below) and height (rotated, to its left) -- redrawn
 * here as a filled rectangle in this app's own greenish-yellow marking
 * colour (see MARK) rather than the reference's arbitrary orange, since
 * this rectangle represents the exact same area as the greenish-yellow box
 * drawn on the real photo beside it (see drawMeasurementPage).
 */
function drawFacadeDiagram(page: PDFPage, ctx: Ctx, m: SiteSurveyMeasurement, x: number, yTop: number, w: number, h: number) {
  page.drawText("Facade", { x, y: yTop - mm(7), size: 13, font: ctx.bold, color: INK });

  const vw = m.visualWidthMm ?? 0;
  const vh = m.visualHeightMm ?? 0;

  const diagramTop = yTop - mm(12);
  const diagramBottom = yTop - h;

  if (vw <= 0 || vh <= 0) {
    const text = "Add Visual size to draw the Facade diagram";
    const tw = ctx.font.widthOfTextAtSize(text, 8.5);
    page.drawText(text, { x: x + (w - tw) / 2, y: (diagramTop + diagramBottom) / 2, size: 8.5, font: ctx.font, color: MUTED });
    return;
  }

  const leftGutter = mm(13);
  const bottomGutter = mm(11);
  const rightPad = mm(4);
  const availW = w - leftGutter - rightPad;
  const availH = diagramTop - bottomGutter - diagramBottom;
  const scale = Math.min(availW / vw, availH / vh);
  const rectW = vw * scale;
  const rectH = vh * scale;
  const rectX = x + leftGutter + (availW - rectW) / 2;
  const rectY = diagramBottom + bottomGutter + (availH - rectH) / 2;

  page.drawRectangle({ x: rectX, y: rectY, width: rectW, height: rectH, color: MARK, borderColor: MARK_TEXT, borderWidth: 1 });

  // Width dimension (below the rectangle)
  const dimY = rectY - mm(5);
  drawDimensionLine(page, rectX, dimY, rectX + rectW, dimY, INK_SECONDARY);
  const widthLabel = `${vw} mm`;
  const wlw = ctx.bold.widthOfTextAtSize(widthLabel, 8.5);
  page.drawText(widthLabel, { x: rectX + (rectW - wlw) / 2, y: dimY - mm(4.5), size: 8.5, font: ctx.bold, color: INK_SECONDARY });

  // Height dimension (left of the rectangle), label rotated to read
  // bottom-to-top alongside the vertical arrow, same as the reference.
  const dimX = rectX - mm(5);
  drawDimensionLine(page, dimX, rectY, dimX, rectY + rectH, INK_SECONDARY);
  const heightLabel = `${vh} mm`;
  const hlw = ctx.bold.widthOfTextAtSize(heightLabel, 8.5);
  page.drawText(heightLabel, {
    x: dimX - mm(3.2),
    y: rectY + rectH / 2 - hlw / 2,
    size: 8.5,
    font: ctx.bold,
    color: INK_SECONDARY,
    rotate: degrees(90),
  });
}

function drawMeasurementPage(ctx: Ctx) {
  const page = newPage(ctx, "Site Photo & Measurement");
  const m = ctx.data.measurement;
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
  y = drawSectionBand(page, ctx, "Site Photo & Measurement", contentLeft(), contentWidth(), y, ctx.data.storeName || undefined);

  const photo = ctx.photos.find((p) => p.category === "measurement");
  const halfW = (contentWidth() - mm(6)) / 2;
  const rowH = mm(105);
  drawPhotoBox(page, ctx, photo, "Site Measurement Photo", contentLeft(), y, halfW, rowH);
  drawFacadeDiagram(page, ctx, m, contentLeft() + halfW + mm(6), y, halfW, rowH);
  y -= rowH + mm(5);

  drawTwoColTable(
    page,
    ctx,
    [
      { label: "Visual Size (marked in green-yellow)", value: sizeLabel(m.visualWidthMm, m.visualHeightMm) },
      { label: "Material Size", value: `${sizeLabel(m.materialWidthMm, m.materialHeightMm)} (${bleedLabel(m)})` },
      { label: "Material Type", value: m.materialType },
      { label: "Installation Type", value: m.installationType },
      { label: "Detailed Equipment Material", value: m.equipmentDetail },
      { label: "Who Is To Source Equipment?", value: m.equipmentSource },
      { label: "Who Will Do The Installation?", value: m.installedBy },
      { label: "Any Important Notes", value: m.measurementNotes },
    ],
    contentLeft(),
    contentWidth(),
    y
  );
}

/** "30mm bleed across all sides" when uniform (the common case -- see MeasurementStep.tsx's default), otherwise spelled out per side -- matching the reference table's own phrasing ("30mm bleed across all sides") instead of a separate, easy-to-miss Bleed row. */
function bleedLabel(m: SiteSurveyMeasurement): string {
  const [l, r, t, b] = [m.bleedLeftMm, m.bleedRightMm, m.bleedTopMm, m.bleedBottomMm];
  if (l == null && r == null && t == null && b == null) return "no bleed specified";
  if (l === r && r === t && t === b) return `${l ?? 0}mm bleed across all sides`;
  return `${l ?? "—"} / ${r ?? "—"} / ${t ?? "—"} / ${b ?? "—"} mm bleed (L / R / T / B)`;
}

function sizeLabel(w: number | null, h: number | null): string {
  if (w == null && h == null) return "—";
  return `${w ?? "—"}mm × ${h ?? "—"}mm`;
}

/**
 * Registers fontkit and embeds the caller-supplied SF Pro Text bytes
 * (see this file's header comment on why unsubsetted). Returns null --
 * never throws -- when no bytes were supplied, or embedding fails for any
 * reason, so buildSiteSurveyReportPdf's Helvetica fallback always applies
 * cleanly either way.
 */
async function embedBrandFonts(doc: PDFDocument, fonts: { regular: Uint8Array; bold: Uint8Array } | null | undefined): Promise<{ font: PDFFont; bold: PDFFont } | null> {
  if (!fonts) return null;
  try {
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fonts.regular, { subset: false });
    const bold = await doc.embedFont(fonts.bold, { subset: false });
    return { font, bold };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function buildSiteSurveyReportPdf(data: SiteSurveyReportPdfData, fonts?: { regular: Uint8Array; bold: Uint8Array } | null): Promise<Blob> {
  const doc = await PDFDocument.create();
  const embedded = await embedBrandFonts(doc, fonts);
  const font = embedded?.font ?? (await doc.embedFont(StandardFonts.Helvetica));
  const bold = embedded?.bold ?? (await doc.embedFont(StandardFonts.HelveticaBold));

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
