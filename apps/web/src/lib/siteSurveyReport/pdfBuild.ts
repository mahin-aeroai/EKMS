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
  LineCapStyle,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { normalizeAnnotation, type PhotoCategory, type SiteSurveyFormData, type SiteSurveyMeasurement, type SiteSurveyPhotoAnnotation, type SiteSurveyPhotoAnnotationRaw } from "./types";

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

// Apple's own grey, exactly as specified by the partner (#a6b1b7) -- kept
// for every section-header band (see drawSectionBand) and the title page's
// full-bleed background, matching the partner-supplied design mockups.
const APPLE_GREY = rgb(0xa6 / 255, 0xb1 / 255, 0xb7 / 255);
// Page topbars themselves went through three revisions: near-black
// originally, then this same APPLE_GREY, and now -- per the mockups
// (screenshots of the actual target design system) -- back to a near-black
// bar with bigger white text, since white text on #a6b1b7 reads too low
// contrast at body-text sizes. Named separately from "black" because it's a
// touch off pure black, matching the mockups' bar colour exactly.
const TOPBAR_DARK = rgb(0.06, 0.06, 0.07);
// The cover page's identity block was originally filled with a maroon/red
// (see RED below); the mockups show this block in the same near-black as
// the topbar instead, so it's pulled out as its own token even though the
// value matches TOPBAR_DARK today, to keep the two call sites independently
// nameable if they diverge later.
const IDENTITY_BLOCK = TOPBAR_DARK;
const RED = rgb(0.64, 0.09, 0.11); // now only the obstacle-marker colour and a small decorative footer accent -- see below
const INK = rgb(0.1, 0.1, 0.12);
const INK_SECONDARY = rgb(0.34, 0.34, 0.37);
const MUTED = rgb(0.56, 0.56, 0.6);
const WHITE = rgb(1, 1, 1);
const SECTION_BAND = APPLE_GREY;
const BORDER = rgb(0.8, 0.8, 0.83);
const PLACEHOLDER_BG = rgb(0.95, 0.95, 0.96);
// Muted light-grey text for secondary lines drawn on IDENTITY_BLOCK/TOPBAR_DARK
// backgrounds (labels, addresses) -- readable on near-black without being
// full white, matching the mockups' two-tone white/grey text on dark bars.
const ON_DARK_MUTED = rgb(0.72, 0.73, 0.75);

// The installation-area marking colour -- greenish-yellow, matching the
// on-screen annotation tool in PhotosStep.tsx's AnnotationEditor (keep
// these two in sync; search for MARK_COLOR_HEX in that file). Deliberately
// NOT the reference PDF's red -- this app's own marking convention. MARK is
// used for the border/fill itself; MARK_TEXT is a darker olive shade of the
// same hue for any text drawn in this colour, since pale greenish-yellow
// text is close to unreadable on a white page.
const MARK = rgb(0.86, 0.91, 0.24);
const MARK_TEXT = rgb(0.42, 0.46, 0.06);

// Obstacle/cut-out colour -- reuses the same brand RED (defined below) at
// low opacity for the fill, full-strength for the border and cross, so an
// obstruction inside the marked area (a pillar, pipe, etc.) reads clearly
// as "excluded", distinct from the greenish-yellow marking colour itself.

// ---------------------------------------------------------------------------
// Icons -- outline-only glyphs matching the mockups' icon-led section bands,
// fact rows, and table rows. Each `d` string is a flattened SVG path
// combining every primitive (path/circle/rect/line) in the icon's real
// lucide-react v1.24.0 source (`node_modules/lucide-react/dist/esm/icons/*.mjs`),
// generated by a one-off script rather than hand-drawn, so these are exact
// reproductions of Lucide's own outlines -- not a trademarked mark, just a
// generic icon set already used elsewhere in this app's UI (PhotosStep.tsx
// etc. import the same lucide-react package directly). Drawn stroke-only
// (no fill), 24x24 viewBox, matching Lucide's own strokeWidth=2 style -- see
// drawIcon.
const ICONS: Record<string, string> = {
  mapPin: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0 M9,10 A3,3 0 1,0 15,10 A3,3 0 1,0 9,10",
  idCard: "M16 10h2 M16 14h2 M6.17 15a3 3 0 0 1 5.66 0 M7,11 A2,2 0 1,0 11,11 A2,2 0 1,0 7,11 M2,5 H22 V19 H2 Z",
  layoutGrid: "M3,3 H10 V10 H3 Z M14,3 H21 V10 H14 Z M14,14 H21 V21 H14 Z M3,14 H10 V21 H3 Z",
  calendar: "M8 2v4 M16 2v4 M3,4 H21 V22 H3 Z M3 10h18",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M8,7 A4,4 0 1,0 16,7 A4,4 0 1,0 8,7",
  clipboardList: "M8,2 H16 V6 H8 Z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M12 11h4 M12 16h4 M8 11h.01 M8 16h.01",
  shieldCheck: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z m9 12 2 2 4-4",
  store: "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5 M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244 M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05",
  wrench: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z",
  fileText: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M10 9H8 M16 13H8 M16 17H8",
  camera: "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z M9,13 A3,3 0 1,0 15,13 A3,3 0 1,0 9,13",
  squareDashed: "M5 3a2 2 0 0 0-2 2 M19 3a2 2 0 0 1 2 2 M21 19a2 2 0 0 1-2 2 M5 21a2 2 0 0 1-2-2 M9 3h1 M9 21h1 M14 3h1 M14 21h1 M3 9v1 M21 9v1 M3 14v1 M21 14v1",
  tag: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z M7,7.5 A0.5,0.5 0 1,0 8,7.5 A0.5,0.5 0 1,0 7,7.5",
  layers: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12 M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
  frame: "M22,6 L2,6 M22,18 L2,18 M6,2 L6,22 M18,2 L18,22",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3.128a4 4 0 0 1 0 7.744 M22 21v-2a4 4 0 0 0-3-3.87 M5,7 A4,4 0 1,0 13,7 A4,4 0 1,0 5,7",
};

/**
 * Draws an icon by name from ICONS, `size` points square, anchored the same
 * way this file anchors everything else -- (x, yTop) is the icon's own
 * top-left corner, extending downward -- confirmed by reading pdf-lib's
 * PDFPage.drawSvgPath implementation directly: it applies
 * scale(options.scale, -options.scale), so an SVG's own y-down 24x24
 * coordinate space needs no manual flipping here. No-op (draws nothing) for
 * an unknown name, so a typo'd icon key never throws mid-render.
 */
function drawIcon(page: PDFPage, name: string, x: number, yTop: number, size: number, color: ReturnType<typeof rgb>) {
  const d = ICONS[name];
  if (!d) return;
  page.drawSvgPath(d, {
    x,
    y: yTop,
    scale: size / 24,
    borderColor: color,
    borderWidth: 2,
    borderLineCap: LineCapStyle.Round,
  });
}

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
  /** Installation-area marker (polygon + obstacle cut-outs), top-left origin fractional coords relative to the FULL original image as shown uncropped in the editor -- only ever present for the measurement photo. Whatever shape is actually in the DB (new or the original single-rectangle one) -- normalized once, below, before any drawing happens. */
  annotation: SiteSurveyPhotoAnnotationRaw;
}

// Internal shape once a photo's bytes have been embedded into this build's
// PDFDocument -- what the drawing functions below actually consume.
interface SurveyPhotoImage {
  image: PDFImage;
  category: PhotoCategory;
  caption: string | null;
  annotation: SiteSurveyPhotoAnnotation | null;
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
  /** Apple's real logo mark (public/brand/apple-logo-white.png), embedded once up front -- null when the fetch/embed failed, in which case every draw site falls back to a plain "Apple" text wordmark. See embedAppleLogo. */
  logo: PDFImage | null;
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

// Which icon (if any) leads a page's topbar eyebrow text -- matches the
// mockups' camera icon beside "SITE PHOTO & MEASUREMENT" and clipboard icon
// beside "INSPECTION DETAILS".
function eyebrowIcon(eyebrow: string): string | null {
  if (/inspection details/i.test(eyebrow)) return "clipboardList";
  if (/photo|measurement|orientation/i.test(eyebrow)) return "camera";
  return null;
}

/**
 * Every page: a near-black top bar (small Apple logo + title left, page
 * eyebrow -- with a leading icon when one applies -- right) and a footer
 * with page number. The topbar's own colour/size went through three
 * revisions in this feature -- see TOPBAR_DARK's own comment for why it's
 * back to near-black with bigger white text now, matching the partner's
 * design mockups.
 */
function newPage(ctx: Ctx, eyebrow: string): PDFPage {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - TOPBAR_HEIGHT, width: PAGE_WIDTH, height: TOPBAR_HEIGHT, color: TOPBAR_DARK });

  const logoSize = mm(6.5);
  let titleX = MARGIN;
  const titleY = PAGE_HEIGHT - TOPBAR_HEIGHT / 2 - 3.5;
  if (ctx.logo) {
    const logoH = logoSize;
    const logoW = (ctx.logo.width / ctx.logo.height) * logoH;
    page.drawImage(ctx.logo, { x: MARGIN, y: PAGE_HEIGHT - TOPBAR_HEIGHT / 2 - logoH / 2, width: logoW, height: logoH });
    titleX = MARGIN + logoW + mm(3);
  }
  page.drawText("Apple Site Survey Report", {
    x: titleX,
    y: titleY,
    size: 13,
    font: ctx.bold,
    color: WHITE,
  });

  if (eyebrow) {
    const eyebrowUpper = eyebrow.toUpperCase();
    const eyebrowSize = 10;
    const ew = ctx.bold.widthOfTextAtSize(eyebrowUpper, eyebrowSize);
    const icon = eyebrowIcon(eyebrow);
    const iconW = icon ? mm(5) + mm(1.8) : 0;
    let ex = PAGE_WIDTH - MARGIN - ew - iconW;
    if (icon) {
      drawIcon(page, icon, ex, PAGE_HEIGHT - TOPBAR_HEIGHT / 2 + mm(2.5), mm(5), WHITE);
      ex += mm(5) + mm(1.8);
    }
    page.drawText(eyebrowUpper, {
      x: ex,
      y: titleY,
      size: eyebrowSize,
      font: ctx.bold,
      color: WHITE,
    });
  }

  drawFooter(ctx, page);
  return page;
}

function drawFooter(ctx: Ctx, page: PDFPage) {
  page.drawLine({ start: { x: MARGIN, y: FOOTER_HEIGHT }, end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_HEIGHT }, thickness: 0.75, color: BORDER });

  const iconSize = mm(3.4);
  drawIcon(page, "store", MARGIN, FOOTER_HEIGHT / 2 + mm(1.9), iconSize, MUTED);
  const left = ctx.data.storeName ? `${ctx.data.storeName}${ctx.data.sfoId ? ` — SFO ${ctx.data.sfoId}` : ""}` : "Apple Site Survey Report";
  page.drawText(left, { x: MARGIN + iconSize + mm(1.5), y: FOOTER_HEIGHT / 2 - 2, size: 7.5, font: ctx.font, color: MUTED });

  const right = `Page ${ctx.pageNumber}`;
  const rw = ctx.font.widthOfTextAtSize(right, 7.5);
  // A thin red accent bar just left of the page number -- a small decorative
  // echo of the mockups' own red footer accent, now that the identity
  // block/topbar are black rather than red.
  page.drawRectangle({ x: PAGE_WIDTH - MARGIN - rw - mm(2.5), y: FOOTER_HEIGHT / 2 - 3, width: 1, height: mm(3.6), color: RED });
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
 *
 * `icon`, when given, is drawn to the left of the title (matching the
 * mockups' icon-led section bands -- ON-SITE DETAILS, STORE DESCRIPTION,
 * etc.), shifting the title text right to make room.
 */
function drawSectionBand(page: PDFPage, ctx: Ctx, title: string, x: number, width: number, yTop: number, rightText?: string, icon?: string): number {
  const bandH = mm(7);
  page.drawRectangle({ x, y: yTop - bandH, width, height: bandH, color: SECTION_BAND });
  let titleX = x + mm(2.5);
  if (icon) {
    const iconSize = mm(4.2);
    drawIcon(page, icon, titleX, yTop - bandH / 2 + mm(2.4), iconSize, INK_SECONDARY);
    titleX += iconSize + mm(1.8);
  }
  page.drawText(title.toUpperCase(), {
    x: titleX,
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

  const pinSize = mm(5.5);
  const nameX = contentLeft() + pinSize + mm(2.5);
  // A rounded-square pin badge behind the location icon, matching the
  // mockups' pale-grey icon chip beside the store name.
  page.drawRectangle({ x: contentLeft(), y: yTop - pinSize - mm(1), width: pinSize, height: pinSize, color: PLACEHOLDER_BG });
  drawIcon(page, "mapPin", contentLeft() + mm(0.7), yTop - mm(1.1), pinSize - mm(1.4), INK_SECONDARY);

  // Store name and address are now plain black/grey (not the previous
  // maroon) -- and a little bigger -- matching the mockups' identity block.
  page.drawText(data.storeName || "Untitled Site", { x: nameX, y: yTop - mm(7), size: 17, font: ctx.bold, color: INK });
  wrapText(ctx.font, data.address || "—", 10.5, contentWidth() * 0.5)
    .slice(0, 2)
    .forEach((line, i) => {
      page.drawText(line, { x: nameX, y: yTop - mm(14) - i * mm(5), size: 10.5, font: ctx.font, color: MUTED });
    });

  const facts: [string, string][] = [
    ["SFO ID", data.sfoId || "—"],
    ["Program", data.program || "—"],
  ];
  const factColW = contentWidth() * 0.16;
  const factX = contentRight() - factColW * facts.length;
  facts.forEach(([label, value], i) => {
    const fx = factX + i * factColW;
    page.drawText(label.toUpperCase(), { x: fx, y: yTop - mm(4), size: 8, font: ctx.bold, color: MUTED });
    page.drawText(value, { x: fx, y: yTop - mm(11), size: 12, font: ctx.bold, color: INK });
  });

  page.drawLine({ start: { x: contentLeft(), y: yTop - blockH }, end: { x: contentRight(), y: yTop - blockH }, thickness: 0.75, color: BORDER });
  return yTop - blockH - mm(3);
}

interface TableRow {
  label: string;
  value: string;
  /** Icon key drawn before the label, matching the mockups' icon-led table rows (Details page tables, the measurement table). Optional -- rows without one just indent normally. */
  icon?: string;
}

/**
 * A plain bordered 2-column (label | value) table, matching the reference's
 * inspection-details page. Takes its own x/width for the same
 * two-column-page reason as drawSectionBand above. Returns the y position
 * after the table; wraps long values.
 *
 * `labelFont` defaults to ctx.bold; the Site Photo & Measurement page passes
 * ctx.font instead so that page uses SF Pro Regular only, per the partner's
 * explicit instruction not to bold anything there.
 */
function drawTwoColTable(page: PDFPage, ctx: Ctx, rows: TableRow[], x: number, width: number, yTop: number, labelFont?: PDFFont): number {
  const labelColW = width * 0.42;
  const valueColW = width - labelColW;
  const pad = mm(2);
  const lineH = mm(4.6);
  const font = labelFont ?? ctx.bold;
  let y = yTop;

  for (const row of rows) {
    const iconIndent = row.icon ? mm(6) : 0;
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

    if (row.icon) {
      drawIcon(page, row.icon, x + pad, y - pad - 1, mm(4.2), MUTED);
    }
    page.drawText(row.label, { x: x + pad + iconIndent, y: y - pad - 7, size: 8.5, font, color: INK_SECONDARY });
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
 * Draws the installation-area marking on a photo already placed at
 * [imgX, imgY, drawW, drawH] (see drawPhotoBox): the outline as an
 * arbitrary closed polygon (>=3 points -- edge by edge via drawLine, since
 * pdf-lib has no native polygon primitive), plus each obstacle cut-out as
 * its own rectangle with a diagonal cross and a text note, in a
 * contrasting red rather than the marking colour itself, so an
 * obstruction inside the marked area (a pillar, pipe, etc.) reads clearly
 * as excluded rather than as more installable area.
 */
function drawAnnotation(
  page: PDFPage,
  ctx: Ctx,
  annotation: SiteSurveyPhotoAnnotation,
  imgX: number,
  imgY: number,
  drawW: number,
  drawH: number
) {
  const toPage = (p: { x: number; y: number }) => ({ x: imgX + p.x * drawW, y: imgY + drawH - p.y * drawH });

  const pts = annotation.points.map(toPage);
  for (let i = 0; i < pts.length; i++) {
    page.drawLine({ start: pts[i], end: pts[(i + 1) % pts.length], thickness: 2.5, color: MARK });
  }

  for (const o of annotation.obstacles) {
    const rectX = imgX + o.x * drawW;
    const rectY = imgY + drawH - (o.y + o.h) * drawH;
    const rectW = o.w * drawW;
    const rectH = o.h * drawH;

    page.drawRectangle({ x: rectX, y: rectY, width: rectW, height: rectH, color: RED, opacity: 0.15, borderColor: RED, borderWidth: 1.25 });
    page.drawLine({ start: { x: rectX, y: rectY }, end: { x: rectX + rectW, y: rectY + rectH }, thickness: 1, color: RED });
    page.drawLine({ start: { x: rectX, y: rectY + rectH }, end: { x: rectX + rectW, y: rectY }, thickness: 1, color: RED });

    if (o.note) {
      const noteSize = 7;
      const noteLines = wrapText(ctx.font, o.note, noteSize, Math.max(rectW, mm(30))).slice(0, 2);
      let noteY = rectY - mm(3.6);
      for (const line of noteLines) {
        const lw = ctx.font.widthOfTextAtSize(line, noteSize);
        page.drawRectangle({ x: rectX - mm(0.8), y: noteY - mm(0.8), width: lw + mm(1.6), height: mm(3.6), color: WHITE, opacity: 0.82 });
        page.drawText(line, { x: rectX, y: noteY, size: noteSize, font: ctx.font, color: RED });
        noteY -= mm(3.8);
      }
    }
  }
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
 * When an annotation is present, its points/obstacles are fractional
 * coordinates relative to the FULL original image as shown uncropped in
 * the editor (top-left origin -- see PhotosStep.tsx's AnnotationEditor), so
 * they're converted using the same drawW/drawH/imgX/imgY the image itself
 * was placed with, not the box's own w/h -- using the box's dimensions
 * directly (as a previous version did) only happens to line up when the
 * box's aspect ratio matches the photo's own, and silently drifts off the
 * real marked area otherwise. The annotation is drawn inside the same clip
 * as the image, so a marking that falls partly in the cover-fit-cropped-off
 * portion of the photo is clipped at the box edge rather than spilling out
 * of it.
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

  if (photo.annotation && photo.annotation.points.length >= 3) {
    drawAnnotation(page, ctx, photo.annotation, imgX, imgY, drawW, drawH);
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

/**
 * True page 1 -- a plain, full-bleed branded title page, matching the real
 * reference report's own front cover: solid Apple-grey background, the
 * "Apple" wordmark top-left, a big bold two-line title, and the survey's
 * month/year -- rather than diving straight into the photo+facts page
 * below (which is what page 1 used to be, before this was added).
 *
 * Deliberately UNNUMBERED: no topbar, no footer, and it doesn't advance
 * ctx.pageNumber -- matching how the reference itself doesn't count its own
 * cover slide in its page numbering, and so every later page's "Page N"
 * still lines up with its position in the actual report content.
 *
 * On the Apple logo: the partner's own logo asset (public/brand/
 * apple-logo-white.png -- a real image, extracted from the partner's own
 * supplied design mockups, not hand-redrawn) is embedded here at exactly
 * 1cm tall, per the partner's explicit spec. If the asset failed to embed
 * for any reason (see embedAppleLogo), this falls back to a plain "Apple"
 * text wordmark rather than attempting to redraw the trademarked mark from
 * scratch.
 *
 * Type sizes (header 72pt / subheader 54pt / date 24pt, all SF Pro) are
 * also the partner's explicit spec -- large enough that the header line
 * doesn't fit in one line at this page's content width, so it's wrapped via
 * wrapText the same way any other long value on this page would be.
 */
function drawTitlePage(ctx: Ctx) {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { data } = ctx;

  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: APPLE_GREY });

  const leftX = MARGIN + mm(4);
  const maxTextWidth = PAGE_WIDTH - leftX - MARGIN;

  const logoTop = PAGE_HEIGHT - MARGIN - mm(2);
  if (ctx.logo) {
    const logoH = mm(10); // 1cm, per spec
    const logoW = (ctx.logo.width / ctx.logo.height) * logoH;
    page.drawImage(ctx.logo, { x: leftX, y: logoTop - logoH, width: logoW, height: logoH });
  } else {
    page.drawText("Apple", { x: leftX, y: logoTop - mm(8), size: 15, font: ctx.bold, color: WHITE });
  }

  const headerSize = 72;
  const subSize = 54;
  const dateSize = 24;
  const headerLines = wrapText(ctx.bold, "Custom site installations", headerSize, maxTextWidth);
  const subLines = wrapText(ctx.bold, "Site survey report", subSize, maxTextWidth);
  const headerLineH = headerSize * 1.08;
  const subLineH = subSize * 1.1;

  let cursorY = PAGE_HEIGHT * 0.64;
  headerLines.forEach((line) => {
    page.drawText(line, { x: leftX, y: cursorY, size: headerSize, font: ctx.bold, color: WHITE });
    cursorY -= headerLineH;
  });
  cursorY -= mm(2);
  subLines.forEach((line) => {
    page.drawText(line, { x: leftX, y: cursorY, size: subSize, font: ctx.bold, color: rgb(0.18, 0.2, 0.22) });
    cursorY -= subLineH;
  });

  const dateLabel = titlePageDateLabel(data.surveyDate);
  page.drawText(dateLabel, { x: leftX, y: mm(22), size: dateSize, font: ctx.font, color: rgb(0.2, 0.22, 0.24) });

  const siteLine = data.storeName ? `${data.storeName}${data.sfoId ? ` — SFO ${data.sfoId}` : ""}` : "";
  if (siteLine) {
    page.drawText(siteLine, { x: leftX, y: mm(22) - mm(9), size: 11, font: ctx.font, color: rgb(0.27, 0.3, 0.32) });
  }
}

/** "September 2026" style label for the title page -- falls back to today's month/year when no survey date is set yet (e.g. previewing a draft), same spirit as the reference's own "September 2020" cover line. */
function titlePageDateLabel(surveyDate: string): string {
  if (!surveyDate) return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long" });
  const d = new Date(`${surveyDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return surveyDate;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

const COVER_FACT_ICONS = ["idCard", "layoutGrid", "calendar", "user"];

function drawCoverPage(ctx: Ctx) {
  const page = newPage(ctx, "");
  const { data } = ctx;
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);

  const mainPhoto = ctx.photos.find((p) => p.category === "main_site");
  const photoH = mm(108);
  drawPhotoBox(page, ctx, mainPhoto, "Main Site Photo", MARGIN, y, contentWidth(), photoH);
  y -= photoH + mm(5);

  // Black identity block (was maroon/red -- see IDENTITY_BLOCK's comment),
  // matching the mockups' near-black data card.
  const blockH = mm(46);
  page.drawRectangle({ x: MARGIN, y: y - blockH, width: contentWidth(), height: blockH, color: IDENTITY_BLOCK });

  const pinSize = mm(6.5);
  const nameX = MARGIN + mm(5) + pinSize + mm(2.5);
  page.drawRectangle({ x: MARGIN + mm(5), y: y - mm(11) - mm(1), width: pinSize, height: pinSize, color: rgb(0.95, 0.95, 0.96) });
  drawIcon(page, "mapPin", MARGIN + mm(5) + mm(0.8), y - mm(2.5), pinSize - mm(1.6), INK_SECONDARY);

  page.drawText(data.storeName || "Untitled Site", { x: nameX, y: y - mm(10), size: 19, font: ctx.bold, color: WHITE });
  wrapText(ctx.font, data.address || "—", 10.5, contentWidth() * 0.55)
    .slice(0, 2)
    .forEach((line, i) => {
      page.drawText(line, { x: nameX, y: y - mm(17) - i * mm(5), size: 10.5, font: ctx.font, color: ON_DARK_MUTED });
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
    const iconSize = mm(4.2);
    drawIcon(page, COVER_FACT_ICONS[i], fx, y - mm(24), iconSize, ON_DARK_MUTED);
    const labelX = fx + iconSize + mm(1.6);
    page.drawText(label.toUpperCase(), { x: labelX, y: y - mm(24) + iconSize / 2 - 3, size: 7.5, font: ctx.bold, color: ON_DARK_MUTED });
    page.drawText(value, { x: fx, y: y - mm(34), size: 11, font: ctx.bold, color: WHITE });
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

  leftY = drawSectionBand(page, ctx, "On-site Details", leftX, colW, leftY, undefined, "clipboardList");
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
  leftY = drawSectionBand(page, ctx, "Store Description", leftX, colW, leftY, undefined, "store");
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

  rightY = drawSectionBand(page, ctx, "Site Suitability", rightX, colW, rightY, undefined, "shieldCheck");
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
  rightY = drawSectionBand(page, ctx, "Installation Details", rightX, colW, rightY, undefined, "wrench");
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
  rightY = drawSectionBand(page, ctx, "Additional Details", rightX, colW, rightY, undefined, "fileText");
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
  y = drawSectionBand(page, ctx, "Site Orientation", contentLeft(), contentWidth(), y, ctx.data.storeName || undefined, "camera");

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
  // SF Pro Regular only on this page (see drawMeasurementPage) -- "Facade"
  // and the dimension labels below use ctx.font, not ctx.bold.
  page.drawText("Facade", { x, y: yTop - mm(7), size: 13, font: ctx.font, color: INK });

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
  const wlw = ctx.font.widthOfTextAtSize(widthLabel, 8.5);
  page.drawText(widthLabel, { x: rectX + (rectW - wlw) / 2, y: dimY - mm(4.5), size: 8.5, font: ctx.font, color: INK_SECONDARY });

  // Height dimension (left of the rectangle), label rotated to read
  // bottom-to-top alongside the vertical arrow, same as the reference.
  const dimX = rectX - mm(5);
  drawDimensionLine(page, dimX, rectY, dimX, rectY + rectH, INK_SECONDARY);
  const heightLabel = `${vh} mm`;
  const hlw = ctx.font.widthOfTextAtSize(heightLabel, 8.5);
  page.drawText(heightLabel, {
    x: dimX - mm(3.2),
    y: rectY + rectH / 2 - hlw / 2,
    size: 8.5,
    font: ctx.font,
    color: INK_SECONDARY,
    rotate: degrees(90),
  });
}

function drawMeasurementPage(ctx: Ctx) {
  const page = newPage(ctx, "Site Photo & Measurement");
  const m = ctx.data.measurement;
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
  y = drawSectionBand(page, ctx, "Site Photo & Measurement", contentLeft(), contentWidth(), y, ctx.data.storeName || undefined, "camera");

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
      { label: "Visual Size (marked in green-yellow)", value: sizeLabel(m.visualWidthMm, m.visualHeightMm), icon: "squareDashed" },
      { label: "Material Size", value: `${sizeLabel(m.materialWidthMm, m.materialHeightMm)} (${bleedLabel(m)})`, icon: "tag" },
      { label: "Material Type", value: m.materialType, icon: "layers" },
      { label: "Installation Type", value: m.installationType, icon: "layoutGrid" },
      { label: "Detailed Equipment Material", value: m.equipmentDetail, icon: "frame" },
      { label: "Who Is To Source Equipment?", value: m.equipmentSource, icon: "users" },
      { label: "Who Will Do The Installation?", value: m.installedBy, icon: "wrench" },
      { label: "Any Important Notes", value: m.measurementNotes, icon: "clipboardList" },
    ],
    contentLeft(),
    contentWidth(),
    y,
    // SF Pro Regular only on this page, per the partner's explicit
    // instruction -- no bold labels here, unlike every other table.
    ctx.font
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

/**
 * Fetches and embeds the real Apple logo mark (public/brand/apple-logo-white.png
 * -- a transparent white PNG extracted from the partner's own supplied
 * design mockups, following this app's existing brand-asset convention --
 * see estimateBuilder/pdf.ts's own logo-embedding pattern, which this
 * mirrors). Cosmetic only: returns null on any fetch/embed failure so the
 * document still builds, with every draw site falling back to a plain
 * "Apple" text wordmark.
 */
async function embedAppleLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const res = await fetch("/brand/apple-logo-white.png");
    if (!res.ok) return null;
    return await doc.embedPng(await res.arrayBuffer());
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
  const logo = await embedAppleLogo(doc);

  // Every photo must be embedded into THIS PDFDocument before any drawing
  // starts -- a PDFImage from a different document isn't valid here (see
  // SurveyPhotoInput's header comment). Embedding is async; drawing isn't,
  // so it all happens up front rather than per page.
  const photos: SurveyPhotoImage[] = await Promise.all(
    data.photos.map(async (p) => ({
      image: p.format === "png" ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes),
      category: p.category,
      caption: p.caption,
      annotation: normalizeAnnotation(p.annotation),
    }))
  );

  const ctx: Ctx = { doc, font, bold, data, photos, pageNumber: 0, logo };

  drawTitlePage(ctx);
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
