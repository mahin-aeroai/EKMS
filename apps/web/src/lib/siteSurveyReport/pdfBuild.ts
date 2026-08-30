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
  setCharacterSpacing,
  degrees,
  LineCapStyle,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  normalizeAnnotation,
  DELIVERY_TIMING_LABEL,
  ENTRANCE_FLOOR_LOCATION_LABEL,
  INSTALLATION_TYPE_LABEL,
  PHOTO_CATEGORY_LABEL,
  POSITION_MARKER_LABEL,
  SITE_TYPE_LABEL,
  STORE_LOCATION_TYPE_LABEL,
  SURVEY_COMPANY_LABEL,
  type PhotoCategory,
  type SiteSurveyFormData,
  type SiteSurveyMeasurement,
  type SiteSurveyPhotoAnnotation,
  type SiteSurveyPhotoAnnotationRaw,
} from "./types";

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
// for the title page's full-bleed background and, once again, every
// section-header band (see drawSectionBand). An earlier pass replaced the
// bands' own fill with a darker, dedicated SECTION_BAND token so white band
// text stayed legible against it; a later feedback round asked for bands to
// go back to plain APPLE_GREY like everywhere else, so SECTION_BAND is now
// just an alias for it -- legibility is kept by switching the band's own
// text to dark ink instead of white (the same trick the topbar's own
// "grey" variant already uses), not by darkening the fill.
const APPLE_GREY = rgb(0xa6 / 255, 0xb1 / 255, 0xb7 / 255);
// Page topbars themselves went through several revisions: near-black
// originally, then this same APPLE_GREY, then (per the mockups) back to a
// near-black bar with bigger white text, since white text on #a6b1b7 reads
// too low contrast at body-text sizes. Named separately from "black" because
// it's a touch off pure black, matching the mockups' bar colour exactly.
const TOPBAR_DARK = rgb(0.06, 0.06, 0.07);
// The Cover page used to run its own diagonal "split" black/grey topbar
// (see the now-removed SPLIT_TOP_FRAC/SPLIT_BOTTOM_FRAC constants and
// newPage's old "split" variant); per feedback asking for that diagonal cut
// removed and the bar made "full black," the Cover page now just uses this
// same TOPBAR_DARK bar, same as the Inspection Details page (see
// drawCoverPage/newPage's `variant` param).
// Every photo-led page (Main Site Photo, Site Orientation, Site Photo &
// Measurement) still uses the "old" grey bar, #a6b1b7, with dark ink
// text/icons instead of white, since white-on-black reads as too heavy
// next to a full-bleed photo. Named TOPBAR_GREY (rather than reusing
// APPLE_GREY directly at each call site) purely so the topbar call sites
// read intent, even though the colour is identical to APPLE_GREY.
const TOPBAR_GREY = APPLE_GREY;
const RED = rgb(0.64, 0.09, 0.11); // now only the obstacle-marker colour and a small decorative footer accent -- see below

// Cover page identity card -- the store name/address/SFO ID/Program/Survey
// Date/Surveyor block went through a maroon fill, the topbar's own
// near-black, a solid APPLE_GREY band, then a white/bordered/shadowed card;
// per the latest feedback round it's inverted once more -- a solid
// near-black card with light/white text -- so these tokens are named for
// what they MEAN (title/subtitle/label/value/divider/etc), not for a
// specific light-or-dark scheme, since which scheme they resolve to keeps
// changing.
const IDENTITY_CARD_BG = TOPBAR_DARK; // same near-black as the topbar bar itself
const IDENTITY_CARD_SHADOW = rgb(0x15 / 255, 0x19 / 255, 0x22 / 255); // used only at low opacity -- see drawCardShadow, now shared by every "card with a shadow" in this file, not just this one
const IDENTITY_TITLE = rgb(1, 1, 1); // white, on the card's own near-black fill -- was pure black on the old white card
const IDENTITY_SUBTITLE = rgb(0.62, 0.65, 0.69); // light grey, for the dark card -- was a darker grey meant for the old white one
const IDENTITY_LABEL = rgb(0.56, 0.59, 0.63); // light grey, a touch dimmer than IDENTITY_SUBTITLE for the small uppercase fact labels
const IDENTITY_VALUE = IDENTITY_TITLE;
const IDENTITY_PIN_BG = rgb(1, 1, 1); // white pin badge, now that the card itself is dark (was a dark charcoal badge on a white card -- inverted)
const IDENTITY_PIN_ICON = IDENTITY_CARD_BG; // the pin icon itself goes dark to read against its own now-white badge
const IDENTITY_CHIP_ICON = rgb(1, 1, 1); // white, to read against the dark card behind the now-unfilled chip
const INK = rgb(0.1, 0.1, 0.12);
const INK_SECONDARY = rgb(0.34, 0.34, 0.37);
const MUTED = rgb(0.56, 0.56, 0.6);
const WHITE = rgb(1, 1, 1);
// Bands used to fill with a darker, dedicated token here (white text tested
// at only ~2.2:1 contrast on plain APPLE_GREY, too low to keep) -- per
// feedback that bands should go back to plain Apple grey, this is now just
// an alias, and drawSectionBand instead switches its own text to dark ink
// to stay legible (matching the topbar's own "grey" variant, which has
// always used dark ink on this exact colour).
const SECTION_BAND = APPLE_GREY;
// Shared rounded-corner radius for the identity card, its pin badge/fact
// chips, every section band, and every white "table section" card (see
// drawTableSection) -- one radius everywhere a band or card needs rounding,
// so a band's own corner never mismatches the card it now sits on top of.
const CARD_RADIUS = mm(2.6);
const PLACEHOLDER_BG = rgb(0.95, 0.95, 0.96);
// Every plain divider/border rule across the whole report -- the footer
// rule, the identity card's own internal divider and fact-chip outline,
// every table cell border, the photo-placeholder box outline, and the
// Inspection Details pages' header/row rules -- now shares this one line
// weight and colour, per feedback ("keep line weight 1/2 point across
// report, use color #90999C"). Consolidates what used to be several
// separately-named greys at several different weights (BORDER at 0.6-1pt,
// IDENTITY_DIVIDER, IDENTITY_CHIP_BORDER at 0.85pt) into a single pair of
// tokens. Distinct, meaning-carrying colours -- the install-area marking
// (MARK/MARK_TEXT), the obstacle-marker red, and the Facade diagram's own
// dimension lines (drawn in INK_SECONDARY) -- are a different visual
// system and are deliberately NOT part of this rule.
const RULE_COLOR = rgb(0x90 / 255, 0x99 / 255, 0x9c / 255); // #90999C
const RULE_WEIGHT = 0.5; // pt
// Inspection Details page + its continuation pages (drawDetailsPage,
// drawInspectionDetailsContinuationPages) only -- per feedback's own exact
// hex spec: headers, questions (labels) and answers (values) all read in
// this one grey-ink colour (#656C6F) rather than the document's usual
// INK/INK_SECONDARY pairing.
const PAGE34_TEXT = rgb(0x65 / 255, 0x6c / 255, 0x6f / 255);

// ---------------------------------------------------------------------------
// Tracking (letter-spacing) -- Apple's own published values, followed
// strictly per the partner's own SF Pro Marketing Communications Typography
// Guidelines (Aug 2021), replacing this file's earlier ad-hoc
// TITLE_TRACKING/BODY_TRACKING constants. The guide publishes two tables --
// "SF Pro Display" for 18pt and above, "SF Pro Text" below 18pt -- each
// giving tracking in 1/1000 em at a handful of point sizes, with the guide's
// own instruction to "interpolate the values when working with point sizes
// between those shown here." Both tables run largest-size-first, matching
// the guide's own layout; sfTrackingPt looks up (and interpolates/clamps)
// the right one by size and converts the result into the point-space value
// pdf-lib's setCharacterSpacing (the Tc operator) expects.
// ---------------------------------------------------------------------------
const SF_TRACKING_DISPLAY: [number, number][] = [
  [80, -15],
  [72, -12],
  [60, -7],
  [48, -3],
  [36, 3],
  [30, 6],
  [24, 9],
  [18, 12],
];
const SF_TRACKING_TEXT: [number, number][] = [
  [17, -30],
  [16, -25],
  [15, -20],
  [14, -15],
  [13, -10],
  [12, -5],
  [11, 0],
  [10, 5],
  [9, 10],
  [8, 15],
  [7, 20],
  [6, 25],
];

function sfTrackingPer1000Em(sizePt: number): number {
  const table = sizePt >= 18 ? SF_TRACKING_DISPLAY : SF_TRACKING_TEXT;
  if (sizePt >= table[0][0]) return table[0][1];
  if (sizePt <= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [s1, t1] = table[i];
    const [s2, t2] = table[i + 1];
    if (sizePt <= s1 && sizePt >= s2) {
      const frac = (sizePt - s1) / (s2 - s1);
      return t1 + frac * (t2 - t1);
    }
  }
  return 0;
}

/** Apple's published tracking for `sizePt`, converted from 1/1000 em into
 * the point-space offset setCharacterSpacing expects (1/1000 em at N pt is
 * N/1000 pt) -- the standard baseline tracking used at every text draw in
 * this file from here on. */
function sfTrackingPt(sizePt: number): number {
  return (sfTrackingPer1000Em(sizePt) / 1000) * sizePt;
}

// An extra, deliberate tightening ON TOP of sfTrackingPt's own guideline
// baseline -- used only where feedback repeatedly asked for something
// visibly more condensed than the strict guideline value alone produces
// (the title page's headline/subheader, and its date/site-name lines).
// There's no actual Condensed cut of SF Pro Text licensed into this app
// (only Regular/Semibold/Italic exist, see this file's header comment on
// font licensing), so this approximates that condensed look with additional
// negative letter-spacing rather than a genuinely narrower typeface.
const EXTRA_CONDENSE_HEADLINE_PT = -0.4;
const EXTRA_CONDENSE_SMALL_PT = -0.3;

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

/**
 * A filled/bordered rectangle with small rounded corners -- pdf-lib's
 * `drawRectangle` has no native radius option, so this hand-builds the
 * outline as an SVG path (four straight edges + four quarter-circle arc
 * commands) and draws it via `drawSvgPath`, matching drawIcon's own
 * anchoring convention: (x, yTop) is the rectangle's own top-left corner,
 * extending down/right. `radius` is deliberately meant to stay small ("very
 * less radius", per feedback) -- this doesn't clamp it, but every call site
 * in this file uses 2-3pt.
 */
function drawRoundedRect(
  page: PDFPage,
  x: number,
  yTop: number,
  width: number,
  height: number,
  radius: number,
  options: { color?: ReturnType<typeof rgb>; opacity?: number; borderColor?: ReturnType<typeof rgb>; borderWidth?: number }
) {
  const r = Math.min(radius, width / 2, height / 2);
  const w = width;
  const h = height;
  // Path drawn in the icon/SVG's own local (y-down) space -- (0,0) is the
  // rectangle's top-left corner, matching how drawSvgPath is anchored
  // everywhere else in this file (see drawIcon's own comment).
  const d = [
    `M ${r},0`,
    `L ${w - r},0`,
    `A ${r},${r} 0 0 1 ${w},${r}`,
    `L ${w},${h - r}`,
    `A ${r},${r} 0 0 1 ${w - r},${h}`,
    `L ${r},${h}`,
    `A ${r},${r} 0 0 1 0,${h - r}`,
    `L 0,${r}`,
    `A ${r},${r} 0 0 1 ${r},0`,
    "Z",
  ].join(" ");
  page.drawSvgPath(d, {
    x,
    y: yTop,
    scale: 1,
    color: options.color,
    opacity: options.opacity,
    borderColor: options.borderColor,
    borderWidth: options.borderWidth,
  });
}

/**
 * Draws `text` twice at a hairline horizontal offset (same colour, both
 * copies) to visually thicken its strokes -- a "faux bold". Used only on a
 * handful of the biggest/most prominent headings (the title page's header
 * and subheader, the Cover/Details store name) where feedback specifically
 * flagged the embedded bold weight as reading "semi bold or regular" rather
 * than truly bold -- pdf-lib's `drawText` has no way to request a heavier
 * weight from an already-embedded font, so this is the only lever available
 * here. `offset` defaults to a fraction of the font size so it scales with
 * how big the text is instead of needing a different constant per call
 * site.
 */
function drawFauxBoldText(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb>; offset?: number; tracking?: number }
) {
  const { x, y, size, font, color, offset = Math.max(0.35, size * 0.012), tracking } = options;
  // Tightened letter-spacing via the low-level `Tc` (character spacing)
  // operator -- pdf-lib's high-level `drawText` has no character-spacing
  // option (confirmed by reading PDFPageOptions.d.ts) -- pushed immediately
  // before both draw calls and reset to 0 immediately after, so it never
  // leaks into a later drawText call on the same page. Every call site in
  // this file now passes sfTrackingPt-derived tracking (Apple's own
  // published tracking table, see that function's own header comment),
  // optionally with a bit of extra negative tracking layered on top where
  // feedback specifically asked for something more condensed.
  if (tracking != null) page.pushOperators(setCharacterSpacing(tracking));
  page.drawText(text, { x, y, size, font, color });
  page.drawText(text, { x: x + offset, y, size, font, color });
  if (tracking != null) page.pushOperators(setCharacterSpacing(0));
}

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

// Caller-facing shape: raw image bytes, not yet embedded in any
// PDFDocument (a PDFImage is only ever valid for the document instance
// that embedded it, and buildSiteSurveyReportPdf creates its own
// PDFDocument internally -- see the entry point below).
export interface SurveyPhotoInput {
  /** site_survey_photos.id -- carried through purely so a multi-site report can tell WHICH 'measurement'-category photo belongs to which site (see SiteSurveyMeasurement.measurementPhotoId / drawSitePages below). Not needed for any other category. */
  id?: string;
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
  id?: string;
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
  // One entry per site/opportunity surveyed at this store -- see
  // SiteSurveyMeasurement's own header comment. Always at least one entry
  // in practice (emptyReportDefaults seeds one), but drawSitePages handles
  // an empty array gracefully (draws nothing) rather than assuming.
  measurements: SiteSurveyMeasurement[];
  photos: SurveyPhotoInput[];
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  /**
   * Apple SD Gothic Neo Regular/Bold, per feedback's exact type spec for
   * the Inspection Details page and its continuation pages specifically
   * (see drawUnderlineHeader/drawUnderlineRows) -- always populated, but
   * falls back to the document's usual `font`/`bold` (SF Pro Text, or
   * Helvetica if even that failed) whenever the caller didn't supply
   * Apple SD Gothic Neo bytes or embedding them failed, so those two draw
   * functions never need their own null-check. See embedBrandFonts.
   */
  gothicFont: PDFFont;
  gothicBold: PDFFont;
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

/**
 * The largest font size (capped at `maxSize`) that fits `text` on a single
 * line within `maxWidth` -- computed directly rather than by iterating
 * downward, since a font's text width scales linearly with size. Used by
 * the title page so its big header line never wraps to a second line, no
 * matter which font (SF Pro or the Helvetica fallback) ends up embedded or
 * how long the store's own text turns out to be.
 */
function fitSingleLineFontSize(font: PDFFont, text: string, maxWidth: number, maxSize: number): number {
  const widthAtMax = font.widthOfTextAtSize(text, maxSize);
  if (widthAtMax <= maxWidth) return maxSize;
  // A hair under the exact fit so the line never touches the page edge.
  return (maxWidth / widthAtMax) * maxSize * 0.98;
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

/** Which of the two topbar treatments a page uses -- see newPage. */
type TopbarVariant = "dark" | "grey";

/**
 * Every page: a top bar (small Apple logo + title left, page eyebrow --
 * with a leading icon when one applies -- right) and a footer with page
 * number, on a plain white page. (A prior pass filled every page with a
 * very light grey background -- rolled back per feedback, back to plain
 * white.) The topbar's own colour went through several revisions; it's now
 * one of two styles per page, per feedback after the partner reviewed
 * renders against their own mockups:
 *  - "dark": solid near-black, white text/logo -- the Cover and Inspection
 *    Details pages. The Cover page used to run its own diagonal "split"
 *    black/grey cut here; per a later feedback round asking for that cut
 *    removed and the bar made "full black," it now just uses this same
 *    plain "dark" variant, same as Inspection Details.
 *  - "grey": solid APPLE_GREY (TOPBAR_GREY), dark ink text -- every
 *    photo-led page (Main Site Photo, Site Orientation, Site Photo &
 *    Measurement), since white-on-black tested as too heavy next to a
 *    full-bleed photo. The white logo PNG has poor contrast directly on
 *    this light a grey, so per feedback asking for the logo back on these
 *    pages, it now sits on its own small dark chip (TOPBAR_DARK) rather
 *    than bare on the grey bar -- reads crisply instead of washing out,
 *    while still being the real mark rather than the plain "Apple" text
 *    wordmark this variant used to fall back to (that fallback still
 *    applies when the logo itself failed to embed at all -- see
 *    embedAppleLogo -- on either variant).
 */
function newPage(ctx: Ctx, eyebrow: string, variant: TopbarVariant = "dark"): PDFPage {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;

  const barBottom = PAGE_HEIGHT - TOPBAR_HEIGHT;

  if (variant === "grey") {
    page.drawRectangle({ x: 0, y: barBottom, width: PAGE_WIDTH, height: TOPBAR_HEIGHT, color: TOPBAR_GREY });
  } else {
    page.drawRectangle({ x: 0, y: barBottom, width: PAGE_WIDTH, height: TOPBAR_HEIGHT, color: TOPBAR_DARK });
  }

  // "dark"/"split" sit their title in the black zone -> white; "grey" has
  // no black zone at all, so it always reads dark ink.
  const titleColor = variant === "grey" ? INK : WHITE;

  const logoSize = mm(6.5);
  let titleX = MARGIN;
  const titleY = PAGE_HEIGHT - TOPBAR_HEIGHT / 2 - 3.5;
  if (ctx.logo) {
    const logoH = logoSize;
    const logoW = (ctx.logo.width / ctx.logo.height) * logoH;
    if (variant === "grey") {
      const chipPad = mm(1.6);
      const chipH = logoH + chipPad * 2;
      const chipW = logoW + chipPad * 2;
      const chipBottomY = PAGE_HEIGHT - TOPBAR_HEIGHT / 2 - chipH / 2;
      drawRoundedRect(page, MARGIN, chipBottomY + chipH, chipW, chipH, mm(1.2), { color: TOPBAR_DARK });
      page.drawImage(ctx.logo, { x: MARGIN + chipPad, y: chipBottomY + chipPad, width: logoW, height: logoH });
      titleX = MARGIN + chipW + mm(3);
    } else {
      page.drawImage(ctx.logo, { x: MARGIN, y: PAGE_HEIGHT - TOPBAR_HEIGHT / 2 - logoH / 2, width: logoW, height: logoH });
      titleX = MARGIN + logoW + mm(3);
    }
  } else if (variant === "grey") {
    page.drawText("Apple", { x: MARGIN, y: PAGE_HEIGHT - TOPBAR_HEIGHT / 2 - 3.5, size: 11, font: ctx.bold, color: INK });
    titleX = MARGIN + ctx.bold.widthOfTextAtSize("Apple", 11) + mm(3);
  }
  drawFauxBoldText(page, "Apple Site Survey Report", { x: titleX, y: titleY, size: 13, font: ctx.bold, color: titleColor, tracking: sfTrackingPt(13) });

  if (eyebrow) {
    // The eyebrow always sits in the same zone as the bar itself -- the
    // grey bar ("grey" variant) or the black bar ("dark") -- so its colour
    // follows the same rule as the title text above.
    const eyebrowColor = variant === "dark" ? WHITE : INK;
    const eyebrowUpper = eyebrow.toUpperCase();
    const eyebrowSize = 10;
    const ew = ctx.bold.widthOfTextAtSize(eyebrowUpper, eyebrowSize);
    const icon = eyebrowIcon(eyebrow);
    const iconW = icon ? mm(5) + mm(1.8) : 0;
    let ex = PAGE_WIDTH - MARGIN - ew - iconW;
    if (icon) {
      drawIcon(page, icon, ex, PAGE_HEIGHT - TOPBAR_HEIGHT / 2 + mm(2.5), mm(5), eyebrowColor);
      ex += mm(5) + mm(1.8);
    }
    page.drawText(eyebrowUpper, {
      x: ex,
      y: titleY,
      size: eyebrowSize,
      font: ctx.bold,
      color: eyebrowColor,
    });
  }

  drawFooter(ctx, page);
  return page;
}

function drawFooter(ctx: Ctx, page: PDFPage) {
  page.drawLine({ start: { x: MARGIN, y: FOOTER_HEIGHT }, end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_HEIGHT }, thickness: RULE_WEIGHT, color: RULE_COLOR });

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
 * Section-header band -- returns the y to start drawing content below it.
 * Takes its own x/width (rather than always spanning the full content
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
 * `dark`, when true, fills solid black with white text -- used only for the
 * "above the photo" bands (Site Orientation, Photo Survey, the Site
 * Photo & Measurement page's own top band), per feedback. Every other band
 * (the Measurements & Material section on that same page) stays plain
 * APPLE_GREY with dark ink text, the same way the topbar's own "grey"
 * variant has always read dark ink on this exact colour (white text tested
 * at only ~2.2:1 contrast on plain APPLE_GREY, too low to keep). Square
 * corners throughout now, per feedback -- an earlier pass had these
 * rounded.
 */
function drawSectionBand(page: PDFPage, ctx: Ctx, title: string, x: number, width: number, yTop: number, rightText?: string, dark?: boolean): number {
  const bandH = mm(7);
  const fill = dark ? TOPBAR_DARK : SECTION_BAND;
  const textColor = dark ? WHITE : INK;
  page.drawRectangle({ x, y: yTop - bandH, width, height: bandH, color: fill });
  const titleX = x + mm(2.5);
  const labelTracking = sfTrackingPt(9);
  page.pushOperators(setCharacterSpacing(labelTracking));
  page.drawText(title.toUpperCase(), {
    x: titleX,
    y: yTop - bandH / 2 - 3,
    size: 9,
    font: ctx.bold,
    color: textColor,
  });
  page.pushOperators(setCharacterSpacing(0));
  if (rightText) {
    const rw = ctx.bold.widthOfTextAtSize(rightText, 9);
    page.pushOperators(setCharacterSpacing(labelTracking));
    page.drawText(rightText, { x: x + width - mm(2.5) - rw, y: yTop - bandH / 2 - 3, size: 9, font: ctx.bold, color: textColor });
    page.pushOperators(setCharacterSpacing(0));
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
  drawRoundedRect(page, contentLeft(), yTop - pinSize - mm(1), pinSize, pinSize, mm(0.8), { color: PLACEHOLDER_BG });
  drawIcon(page, "mapPin", contentLeft() + mm(0.7), yTop - mm(1.1), pinSize - mm(1.4), INK_SECONDARY);

  // Store name and address are now plain black/grey (not the previous
  // maroon) -- and a little bigger -- matching the mockups' identity block.
  // Faux-bolded (see drawFauxBoldText) per feedback that this page's title
  // reads too light at its embedded bold weight.
  drawFauxBoldText(page, data.storeName || "Untitled Site", { x: nameX, y: yTop - mm(7), size: 17, font: ctx.bold, color: INK, tracking: sfTrackingPt(17) });
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

  page.drawLine({ start: { x: contentLeft(), y: yTop - blockH }, end: { x: contentRight(), y: yTop - blockH }, thickness: RULE_WEIGHT, color: RULE_COLOR });
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
 *
 * `boxed` (default true) draws each cell as its own bordered box, the
 * original look. Passing false -- used by the Inspection Details page and
 * its continuation pages, per feedback -- drops the per-cell box entirely
 * and draws a single horizontal rule under each row instead, no vertical
 * rule between the label/value columns and no outer box.
 *
 * `padMm`, when given, overrides the default 2mm cell padding -- used by
 * the Site Photo & Measurement page to give its Measurements & Material
 * rows slightly more breathing room, per feedback to "increase row height
 * slightly" there specifically.
 */
function drawTwoColTable(page: PDFPage, ctx: Ctx, rows: TableRow[], x: number, width: number, yTop: number, labelFont?: PDFFont, boxed = true, padMm?: number): number {
  const labelColW = width * 0.42;
  const valueColW = width - labelColW;
  const pad = padMm ?? mm(2);
  const lineH = mm(4.6);
  const font = labelFont ?? ctx.bold;
  const labelTracking = sfTrackingPt(8.5);
  const valueTracking = sfTrackingPt(9);
  let y = yTop;

  for (const row of rows) {
    const iconIndent = row.icon ? mm(6) : 0;
    // Labels are wrapped too, not just values -- a handful of the newer
    // continuation-page labels ("Chain Store — Central Team Approval
    // Needed?", "Retailer Preferred Install Days/Time?", etc) run longer
    // than every original label ever did, and an un-wrapped
    // single-line drawText silently overflows past the label column's own
    // border into the value column, overlapping that row's value text.
    // Wrapping keeps every existing (short) label rendering exactly as
    // before -- it only ever adds lines once a label doesn't fit -- so this
    // is a latent-bug fix, not a visual change to the original design.
    const labelLines = wrapText(font, row.label, 8.5, labelColW - pad * 2 - iconIndent);
    const valueLines = wrapText(ctx.font, row.value || "—", 9, valueColW - pad * 2);
    const rowH = Math.max(lineH, Math.max(labelLines.length, valueLines.length) * lineH) + pad * 1.2;

    if (boxed) {
      page.drawRectangle({ x, y: y - rowH, width: labelColW, height: rowH, borderColor: RULE_COLOR, borderWidth: RULE_WEIGHT, color: WHITE });
      page.drawRectangle({
        x: x + labelColW,
        y: y - rowH,
        width: valueColW,
        height: rowH,
        borderColor: RULE_COLOR,
        borderWidth: RULE_WEIGHT,
        color: WHITE,
      });
    } else {
      page.drawLine({ start: { x, y: y - rowH }, end: { x: x + width, y: y - rowH }, thickness: RULE_WEIGHT, color: RULE_COLOR });
    }

    if (row.icon) {
      drawIcon(page, row.icon, x + pad, y - pad - 1, mm(4.2), MUTED);
    }
    // Apple's own published tracking for these sizes (see sfTrackingPt).
    page.pushOperators(setCharacterSpacing(labelTracking));
    labelLines.forEach((line, i) => {
      page.drawText(line, { x: x + pad + iconIndent, y: y - pad - 7 - i * lineH, size: 8.5, font, color: INK_SECONDARY });
    });
    page.pushOperators(setCharacterSpacing(valueTracking));
    valueLines.forEach((line, i) => {
      page.drawText(line, {
        x: x + labelColW + pad,
        y: y - pad - 7 - i * lineH,
        size: 9,
        font: ctx.font,
        color: INK,
      });
    });
    page.pushOperators(setCharacterSpacing(0));

    y -= rowH;
  }
  return y;
}

/**
 * The height drawTwoColTable(rows, width, ...) will occupy, without
 * actually drawing anything -- mirrors that function's own row-height
 * formula exactly (same labelColW/pad/lineH/wrapText call). Used by the
 * continuation pages below to decide, before drawing a whole section band +
 * table "block", whether it still fits in the current column or needs to
 * move to the next column/page -- blocks are placed as a unit (never split
 * mid-table), which every block on those pages is small enough for.
 */
function measureTwoColTableHeight(ctx: Ctx, rows: TableRow[], width: number, labelFont?: PDFFont, padMm?: number): number {
  const labelColW = width * 0.42;
  const valueColW = width - labelColW;
  const pad = padMm ?? mm(2);
  const lineH = mm(4.6);
  const font = labelFont ?? ctx.bold;
  let h = 0;
  for (const row of rows) {
    const iconIndent = row.icon ? mm(6) : 0;
    const labelLines = wrapText(font, row.label, 8.5, labelColW - pad * 2 - iconIndent);
    const valueLines = wrapText(ctx.font, row.value || "—", 9, valueColW - pad * 2);
    h += Math.max(lineH, Math.max(labelLines.length, valueLines.length) * lineH) + pad * 1.2;
  }
  return h;
}

// Row styling for drawUnderlineRows/measureUnderlineRowsHeight below -- per
// feedback's own exact spec for the Inspection Details page and its
// continuation pages: questions (labels) in Regular, answers (values) in
// Bold, both 11pt and both PAGE34_TEXT, with UNDERLINE_ROW_SPACE_AFTER_PT
// of space after each row's own rule before the next row starts ("Text
// line spacing: After 10 Points"). Distinct enough from drawTwoColTable's
// own boxed-table formula (built around the measurement page's card
// treatment) to be its own pair of functions rather than more optional
// params grafted onto that one.
const UNDERLINE_ROW_SIZE = 11;
const UNDERLINE_ROW_LINE_H = UNDERLINE_ROW_SIZE * 1.28;
const UNDERLINE_ROW_SPACE_AFTER_PT = 10;
const UNDERLINE_ROW_PAD = mm(2);

/**
 * Draws the Inspection Details page's (and its continuation pages')
 * label/value rows per the exact type spec above -- horizontal rule only
 * (no box, no vertical divider, matching drawTwoColTable's own `boxed:
 * false` look), but with its own font/size/colour/rule/spacing rules
 * rather than drawTwoColTable's. Questions use ctx.gothicFont (Apple SD
 * Gothic Neo Regular), answers ctx.gothicBold (Bold) -- see Ctx's own
 * comment on that pair's SF Pro/Helvetica fallback. See UNDERLINE_ROW_*
 * above for the shared constants also used by measureUnderlineRowsHeight's
 * own pagination math.
 */
function drawUnderlineRows(page: PDFPage, ctx: Ctx, rows: TableRow[], x: number, width: number, yTop: number): number {
  const labelColW = width * 0.42;
  const valueColW = width - labelColW;
  const tracking = sfTrackingPt(UNDERLINE_ROW_SIZE);
  let y = yTop;

  for (const row of rows) {
    const labelLines = wrapText(ctx.gothicFont, row.label, UNDERLINE_ROW_SIZE, labelColW - UNDERLINE_ROW_PAD * 2);
    const valueLines = wrapText(ctx.gothicBold, row.value || "—", UNDERLINE_ROW_SIZE, valueColW - UNDERLINE_ROW_PAD * 2);
    const lineCount = Math.max(labelLines.length, valueLines.length);
    const baseline = y - UNDERLINE_ROW_SIZE * 0.86;

    page.pushOperators(setCharacterSpacing(tracking));
    labelLines.forEach((line, i) => {
      page.drawText(line, { x: x + UNDERLINE_ROW_PAD, y: baseline - i * UNDERLINE_ROW_LINE_H, size: UNDERLINE_ROW_SIZE, font: ctx.gothicFont, color: PAGE34_TEXT });
    });
    valueLines.forEach((line, i) => {
      page.drawText(line, {
        x: x + labelColW + UNDERLINE_ROW_PAD,
        y: baseline - i * UNDERLINE_ROW_LINE_H,
        size: UNDERLINE_ROW_SIZE,
        font: ctx.gothicBold,
        color: PAGE34_TEXT,
      });
    });
    page.pushOperators(setCharacterSpacing(0));

    const ruleY = baseline - (lineCount - 1) * UNDERLINE_ROW_LINE_H - UNDERLINE_ROW_SIZE * 0.3;
    page.drawLine({ start: { x, y: ruleY }, end: { x: x + width, y: ruleY }, thickness: RULE_WEIGHT, color: RULE_COLOR });

    y = ruleY - UNDERLINE_ROW_SPACE_AFTER_PT;
  }
  return y;
}

/** The height drawUnderlineRows(rows, width, ...) will occupy -- mirrors that function's own formula exactly, same reason measureTwoColTableHeight exists alongside drawTwoColTable. */
function measureUnderlineRowsHeight(rows: TableRow[], width: number, ctx: Ctx): number {
  const labelColW = width * 0.42;
  const valueColW = width - labelColW;
  let h = 0;
  for (const row of rows) {
    const labelLines = wrapText(ctx.gothicFont, row.label, UNDERLINE_ROW_SIZE, labelColW - UNDERLINE_ROW_PAD * 2);
    const valueLines = wrapText(ctx.gothicBold, row.value || "—", UNDERLINE_ROW_SIZE, valueColW - UNDERLINE_ROW_PAD * 2);
    const lineCount = Math.max(labelLines.length, valueLines.length);
    h += lineCount * UNDERLINE_ROW_LINE_H + UNDERLINE_ROW_SPACE_AFTER_PT;
  }
  return h;
}

/**
 * A soft drop shadow behind a white rounded card -- two stacked, slightly
 * larger, low-opacity copies of the same rounded rect, offset downward.
 * pdf-lib has no blur primitive, so this is the same approximation the
 * Cover page's identity card already used (see IDENTITY_CARD_SHADOW),
 * generalised here so every white "table section" card (drawTableSection)
 * gets the same treatment.
 */
function drawCardShadow(page: PDFPage, x: number, yTop: number, width: number, height: number, radius: number) {
  const layers: { offset: number; grow: number; opacity: number }[] = [
    { offset: mm(1.6), grow: mm(1), opacity: 0.05 },
    { offset: mm(0.8), grow: mm(0.4), opacity: 0.08 },
  ];
  for (const s of layers) {
    drawRoundedRect(page, x - s.grow / 2, yTop - s.offset, width + s.grow, height, radius, {
      color: IDENTITY_CARD_SHADOW,
      opacity: s.opacity,
    });
  }
}

/**
 * One "section" -- a band (drawSectionBand) plus its two-column table
 * (drawTwoColTable) -- drawn together as a single white card with a soft
 * shadow (drawCardShadow). A prior pass rounded this card's corners and
 * gave the whole page a light-grey background; both were rolled back per
 * feedback, so this now draws square corners on a plain white page. Used
 * only by the Site/Measurement page's own Measurements & Material block --
 * the Details page and its continuation pages moved to a plain
 * header-plus-underline treatment instead (see drawUnderlineTableSection),
 * and the plain photo-only bands (Main Site Photo, Site Orientation, Photo
 * Survey, the Site page's own top band) never used this wrapper, since
 * there's no table beneath them to card-wrap.
 *
 * `padMm` is passed straight through to drawTwoColTable/
 * measureTwoColTableHeight -- see that function's own comment.
 */
function drawTableSection(
  page: PDFPage,
  ctx: Ctx,
  title: string,
  rows: TableRow[],
  x: number,
  width: number,
  yTop: number,
  rightText?: string,
  labelFont?: PDFFont,
  padMm?: number
): number {
  const bandH = mm(7);
  const totalH = bandH + measureTwoColTableHeight(ctx, rows, width, labelFont, padMm);
  drawCardShadow(page, x, yTop, width, totalH, 0);
  drawRoundedRect(page, x, yTop, width, totalH, 0, { color: WHITE });
  const afterBand = drawSectionBand(page, ctx, title, x, width, yTop, rightText);
  return drawTwoColTable(page, ctx, rows, x, width, afterBand, labelFont, true, padMm);
}

// Shared between drawUnderlineHeader (the real draw) and drawFlowingBlocks'
// own pre-measurement pass, so a continuation page's column/page-break math
// never drifts out of sync with what actually gets drawn.
const UNDERLINE_HEADER_SIZE = 12;
const UNDERLINE_HEADER_H = mm(9);

/**
 * Plain header treatment for the Inspection Details page and its
 * continuation pages -- per feedback, these lost their coloured band
 * entirely: just the section title with a thin rule underneath, matching a
 * classic "form section" look rather than a colour-blocked one. Per a
 * later, more exact spec for these two pages specifically: Bold,
 * PAGE34_TEXT (#656C6F), in ctx.gothicBold (Apple SD Gothic Neo Bold --
 * see Ctx's own comment on its SF Pro/Helvetica fallback); the rule itself
 * uses the same document-wide RULE_COLOR/RULE_WEIGHT as every other line
 * in the report (see that constant's own comment), not a page-specific
 * weight. Size was originally 14pt per that spec, then reduced to 12pt per
 * later feedback -- UNDERLINE_HEADER_H (the reserved band height) was left
 * at its original mm(9), which still reads as comfortably proportioned at
 * the smaller size. Returns the y to start drawing content below it.
 */
function drawUnderlineHeader(page: PDFPage, ctx: Ctx, title: string, x: number, width: number, yTop: number): number {
  page.pushOperators(setCharacterSpacing(sfTrackingPt(UNDERLINE_HEADER_SIZE)));
  page.drawText(title.toUpperCase(), { x, y: yTop - UNDERLINE_HEADER_H + mm(3), size: UNDERLINE_HEADER_SIZE, font: ctx.gothicBold, color: PAGE34_TEXT });
  page.pushOperators(setCharacterSpacing(0));
  page.drawLine({ start: { x, y: yTop - UNDERLINE_HEADER_H }, end: { x: x + width, y: yTop - UNDERLINE_HEADER_H }, thickness: RULE_WEIGHT, color: RULE_COLOR });
  return yTop - UNDERLINE_HEADER_H - mm(1.5);
}

/**
 * The underline-header counterpart to drawTableSection -- a plain header
 * (drawUnderlineHeader) plus rows (drawUnderlineRows), no card, no shadow.
 * Used by the Inspection Details page and its continuation pages. No
 * `labelFont` param (unlike drawTableSection) -- per the exact type spec
 * these two pages now follow, questions are always Regular and answers
 * always Bold, not caller-configurable per block the way the measurement
 * page's card treatment is.
 */
function drawUnderlineTableSection(page: PDFPage, ctx: Ctx, title: string, rows: TableRow[], x: number, width: number, yTop: number): number {
  const afterHeader = drawUnderlineHeader(page, ctx, title, x, width, yTop);
  return drawUnderlineRows(page, ctx, rows, x, width, afterHeader);
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
    page.drawRectangle({ x, y: boxY, width: w, height: h, color: PLACEHOLDER_BG, borderColor: RULE_COLOR, borderWidth: RULE_WEIGHT });
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

  page.drawRectangle({ x, y: boxY, width: w, height: h, borderColor: RULE_COLOR, borderWidth: RULE_WEIGHT });

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
 * Type sizes: originally the partner's own 72pt header / 54pt subheader /
 * 24pt date spec (all SF Pro Bold except the Regular date line). At 72pt
 * the header didn't fit on one line at this page's width, so it was
 * auto-fit to the largest size (capped at 72pt) that still renders on one
 * line -- see fitSingleLineFontSize -- with the subheader/date sizes
 * scaling down with it in the same proportion, so the whole block stays in
 * the same relative proportions even when the header shrinks to fit. A
 * later feedback round -- after repeated notes that the headline still read
 * "loose" -- reduced the whole spec by ~18% (within the requested 15-20%
 * range) and applies extra negative tracking on top of Apple's own
 * published tracking table (see EXTRA_CONDENSE_HEADLINE_PT) for a visibly
 * tighter, more condensed result than the guideline value alone gives. The
 * date line and the bottom site-name line are bold and white (bigger, for
 * the site-name line) with the same extra-condensed treatment applied at a
 * smaller magnitude (EXTRA_CONDENSE_SMALL_PT), rather than the original
 * spec's regular-weight dark grey for both.
 */
function drawTitlePage(ctx: Ctx) {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { data } = ctx;

  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: APPLE_GREY });

  const leftX = MARGIN;
  const maxTextWidth = PAGE_WIDTH - leftX - MARGIN;

  const logoTop = PAGE_HEIGHT - MARGIN - mm(2);
  if (ctx.logo) {
    const logoH = mm(10); // 1cm, per spec
    const logoW = (ctx.logo.width / ctx.logo.height) * logoH;
    page.drawImage(ctx.logo, { x: leftX, y: logoTop - logoH, width: logoW, height: logoH });
  } else {
    page.drawText("Apple", { x: leftX, y: logoTop - mm(8), size: 15, font: ctx.bold, color: WHITE });
  }

  const headerText = "Custom site installations";
  const subText = "Site survey report";
  // Reduced ~18% from the partner's original 72/54/24 spec, per feedback
  // that the headline still read loose and large -- see this function's
  // own header comment.
  const specHeaderSize = 59;
  const specSubSize = 44;
  const specDateSize = 20;

  const headerSize = fitSingleLineFontSize(ctx.bold, headerText, maxTextWidth, specHeaderSize);
  const subSize = (specSubSize / specHeaderSize) * headerSize;
  const dateSize = (specDateSize / specHeaderSize) * headerSize;
  // A bolder faux-bold offset than drawFauxBoldText's own default, just for
  // this page's two big headline lines -- feedback repeatedly asked for
  // this specific text to read heavier than the rest of the report.
  const headlineOffset = (size: number) => size * 0.02;

  let cursorY = PAGE_HEIGHT * 0.6;
  drawFauxBoldText(page, headerText, {
    x: leftX,
    y: cursorY,
    size: headerSize,
    font: ctx.bold,
    color: WHITE,
    offset: headlineOffset(headerSize),
    tracking: sfTrackingPt(headerSize) + EXTRA_CONDENSE_HEADLINE_PT,
  });
  cursorY -= headerSize * 1.05 + mm(3);
  drawFauxBoldText(page, subText, {
    x: leftX,
    y: cursorY,
    size: subSize,
    font: ctx.bold,
    color: rgb(0.18, 0.2, 0.22),
    offset: headlineOffset(subSize),
    tracking: sfTrackingPt(subSize) + EXTRA_CONDENSE_HEADLINE_PT,
  });

  const dateLabel = titlePageDateLabel(data.surveyDate);
  // Bold + white per feedback, with extra condensed tracking on top of
  // Apple's own guideline value (see EXTRA_CONDENSE_SMALL_PT).
  drawFauxBoldText(page, dateLabel, { x: leftX, y: mm(22), size: dateSize, font: ctx.bold, color: WHITE, tracking: sfTrackingPt(dateSize) + EXTRA_CONDENSE_SMALL_PT });

  const siteLine = data.storeName ? `${data.storeName}${data.sfoId ? ` — SFO ${data.sfoId}` : ""}` : "";
  if (siteLine) {
    // Bigger, bold, white, and condensed per feedback -- was 11pt regular,
    // dark grey, no tracking.
    const siteLineSize = 14;
    drawFauxBoldText(page, siteLine, { x: leftX, y: mm(22) - mm(9), size: siteLineSize, font: ctx.bold, color: WHITE, tracking: sfTrackingPt(siteLineSize) + EXTRA_CONDENSE_SMALL_PT });
  }
}

/** "September 2026" style label for the title page -- falls back to today's month/year when no survey date is set yet (e.g. previewing a draft), same spirit as the reference's own "September 2020" cover line. */
function titlePageDateLabel(surveyDate: string): string {
  if (!surveyDate) return new Date().toLocaleDateString(undefined, { year: "numeric", month: "long" });
  const d = new Date(`${surveyDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return surveyDate;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

const COVER_FACT_ICONS = ["idCard", "layoutGrid", "calendar", "store"];

/**
 * A subtle decorative grid of small dots in the bottom-right corner of the
 * Cover page's identity block, matching the mockup's own dot-grid texture
 * there (confirmed present in the mockup and absent from earlier renders).
 * `x`/`yTop` is the grid's own top-left corner; drawn outward to the right
 * and downward from there, so call sites anchor it from the block's own
 * bottom-right corner.
 */
function drawDotGrid(page: PDFPage, x: number, yTop: number, cols: number, rows: number, spacing: number, dotRadius: number, color: ReturnType<typeof rgb>, opacity: number) {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      page.drawEllipse({
        x: x + col * spacing,
        y: yTop - row * spacing,
        xScale: dotRadius,
        yScale: dotRadius,
        color,
        opacity,
      });
    }
  }
}

function drawCoverPage(ctx: Ctx) {
  const page = newPage(ctx, "", "dark");
  const { data } = ctx;
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);

  const mainPhoto = ctx.photos.find((p) => p.category === "main_site");
  const photoH = mm(108);
  drawPhotoBox(page, ctx, mainPhoto, "Main Site Photo", MARGIN, y, contentWidth(), photoH);
  y -= photoH + mm(5);

  // Near-black, softly-shadowed identity card -- see the
  // IDENTITY_CARD_*/IDENTITY_TITLE etc. tokens' own header comment for the
  // white/black history here. "Shadow" is faked with two stacked, slightly
  // larger, low-opacity copies of the same rounded rect offset downward --
  // pdf-lib has no blur primitive, so this is the closest approximation to
  // a soft drop shadow available here (see drawCardShadow for the same
  // technique, generalised for the report's other white cards).
  const blockH = mm(52);
  drawCardShadow(page, MARGIN, y, contentWidth(), blockH, CARD_RADIUS);
  drawRoundedRect(page, MARGIN, y, contentWidth(), blockH, CARD_RADIUS, { color: IDENTITY_CARD_BG });

  const dotCols = 5;
  const dotRows = 4;
  const dotSpacing = mm(3.2);
  const dotGridW = (dotCols - 1) * dotSpacing;
  const dotGridH = (dotRows - 1) * dotSpacing;
  // Reserved on the right of the fact-row area below (see factColW) so this
  // never overlaps the Surveyor column's own text -- anchored off the
  // card's own bottom-right corner (rather than its top) so the grid stays
  // pinned to that corner even if blockH changes later. Light grey dots on
  // the new white card (was white-on-grey on the old solid band).
  const dotReserve = mm(26);
  drawDotGrid(
    page,
    MARGIN + contentWidth() - mm(7) - dotGridW,
    y - blockH + mm(7) + dotGridH,
    dotCols,
    dotRows,
    dotSpacing,
    mm(0.5),
    IDENTITY_LABEL,
    0.3
  );

  // Main location badge: dark charcoal square, white pin icon (inverted
  // from the old white-badge/dark-icon treatment), bigger and more rounded
  // per the spec.
  const pinSize = mm(9.2);
  const pinPad = mm(1.9);
  const pinX = MARGIN + mm(6);
  const pinTopY = y - mm(6);
  const nameX = pinX + pinSize + mm(4);
  drawRoundedRect(page, pinX, pinTopY, pinSize, pinSize, CARD_RADIUS, { color: IDENTITY_PIN_BG });
  drawIcon(page, "mapPin", pinX + pinPad, pinTopY - pinPad, pinSize - pinPad * 2, IDENTITY_PIN_ICON);

  drawFauxBoldText(page, data.storeName || "Untitled Site", { x: nameX, y: y - mm(9.5), size: 20, font: ctx.bold, color: IDENTITY_TITLE, tracking: sfTrackingPt(20) });
  wrapText(ctx.font, data.address || "—", 10, contentWidth() * 0.55)
    .slice(0, 2)
    .forEach((line, i) => {
      page.drawText(line, { x: nameX, y: y - mm(17.5) - i * mm(5), size: 10, font: ctx.font, color: IDENTITY_SUBTITLE });
    });

  page.drawLine({ start: { x: MARGIN + mm(6), y: y - mm(24.5) }, end: { x: MARGIN + contentWidth() - mm(6), y: y - mm(24.5) }, thickness: RULE_WEIGHT, color: RULE_COLOR });

  // Icon-chip-LEFT-of-stacked-label/value fact rows -- each icon sits in
  // its own rounded chip, vertically centred against its own two-line
  // label/value pair, with a thin divider between columns. Per feedback,
  // "Surveyor" was swapped for "Survey Company" here (see the icon list
  // below too), and the chip itself is now outline-only rather than a
  // solid pale-grey fill, in the same RULE_COLOR/RULE_WEIGHT as every
  // other line in the report.
  const facts: [string, string][] = [
    ["SFO ID", data.sfoId || "—"],
    ["Program", data.program || "—"],
    ["Survey Date", formatDate(data.surveyDate)],
    ["Survey Company", data.formData.surveyCompany ? SURVEY_COMPANY_LABEL[data.formData.surveyCompany] : "—"],
  ];
  const factColW = (contentWidth() - mm(6) - dotReserve) / facts.length;
  const factRowCenterY = y - mm(38);
  const chipSize = mm(10.2);
  const chipIconSize = mm(5.6);
  const chipPad = (chipSize - chipIconSize) / 2;
  facts.forEach(([label, value], i) => {
    const fx = MARGIN + mm(6) + i * factColW;
    if (i > 0) {
      page.drawLine({
        start: { x: fx - mm(4.5), y: factRowCenterY - mm(7) },
        end: { x: fx - mm(4.5), y: factRowCenterY + mm(7) },
        thickness: RULE_WEIGHT,
        color: RULE_COLOR,
      });
    }
    const chipTopY = factRowCenterY + chipSize / 2;
    drawRoundedRect(page, fx, chipTopY, chipSize, chipSize, CARD_RADIUS, { borderColor: RULE_COLOR, borderWidth: RULE_WEIGHT });
    drawIcon(page, COVER_FACT_ICONS[i], fx + chipPad, chipTopY - chipPad, chipIconSize, IDENTITY_CHIP_ICON);
    const labelX = fx + chipSize + mm(3);
    page.drawText(label.toUpperCase(), { x: labelX, y: factRowCenterY + mm(3), size: 7.8, font: ctx.bold, color: IDENTITY_LABEL });
    page.drawText(value, { x: labelX, y: factRowCenterY - mm(5.5), size: 12.5, font: ctx.bold, color: IDENTITY_VALUE });
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
  const page = newPage(ctx, "Inspection Details", "dark");
  const { formData: f } = ctx.data;
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
  y = drawIdentityBlock(page, ctx, y);

  const colGap = mm(6);
  const colW = (contentWidth() - colGap) / 2;
  const leftX = contentLeft();
  const rightX = contentLeft() + colW + colGap;
  let leftY = y;
  const rightY = y;

  leftY = drawUnderlineTableSection(
    page,
    ctx,
    "On-site Details",
    [
      { label: "Date of Inspection", value: formatDate(ctx.data.surveyDate) },
      { label: "Surveyor Details", value: ctx.data.surveyorName },
      { label: "Store Person Contacted", value: f.storePersonContacted },
      { label: "Survey Company", value: f.surveyCompany ? SURVEY_COMPANY_LABEL[f.surveyCompany] : "" },
    ],
    leftX,
    colW,
    leftY
  );

  leftY -= mm(4);
  drawUnderlineTableSection(
    page,
    ctx,
    "Store Description",
    [
      { label: "Silicon Joins / Edges Condition", value: f.siliconJoinsCondition },
      { label: "Existing Creative / Stickers", value: f.existingCreative },
      { label: "Can Existing Creative Be Removed?", value: yesNoLabel(f.creativeRemovable, "Not Applicable") },
    ],
    leftX,
    colW,
    leftY
  );

  drawUnderlineTableSection(
    page,
    ctx,
    "Installation Details",
    [
      { label: "Time & Date of Installation", value: f.installationDateTime },
      { label: "Delivery Timings", value: f.deliveryTimes ? DELIVERY_TIMING_LABEL[f.deliveryTimes] ?? f.deliveryTimes : "" },
      { label: "Mall / Work Permits Required?", value: yesNoLabel(f.permitRequired, "Unknown") },
      { label: "Permit Details", value: f.permitDetails },
    ],
    rightX,
    colW,
    rightY
  );
}

function yesNoLabel(v: string, thirdLabel = "—"): string {
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  return v ? v : thirdLabel === "—" ? "—" : `— (${thirdLabel})`;
}

/** "Yes — <detail>" / "No" / "—" -- the Yes/No-plus-free-text-description pattern most of the new fields below use, so it's a one-liner at every call site instead of a ternary each time. */
function ynDetail(value: string, detail: string): string {
  const base = yesNoLabel(value);
  return detail ? `${base} — ${detail}` : base;
}

// ---------------------------------------------------------------------------
// Additional pages -- content the partner's later requirements spec asked
// for beyond the original Cover/Details/Photo/Measurement pages, added as
// NEW pages appended after their existing counterparts rather than
// reworking those pages' own layout, per the partner's explicit
// instruction: "keep the existing design and everything intact just add
// missing information in additional pages." Every page below reuses the
// exact same drawing primitives (newPage, drawSectionBand, drawTwoColTable,
// drawPhotoBox) and the same per-page topbar variant convention as the
// pages they extend, rather than introducing a new visual style.
// ---------------------------------------------------------------------------

interface ContinuationBlock {
  title: string;
  rows: TableRow[];
  /** Passed straight through to drawTwoColTable/measureTwoColTableHeight's own labelFont param -- ctx.bold by default, but drawSitePages below uses ctx.font (no bold) for its Measurements & Material block, matching that section's original no-bold instruction. */
  labelFont?: PDFFont;
  /** Passed straight through to drawTableSection/drawTwoColTable's own padMm param -- see drawTwoColTable's comment. Only drawSitePages' Measurements & Material block sets this, per feedback to increase its row height slightly. */
  padMm?: number;
}

/**
 * Flows a list of section "blocks" across as many pages as needed -- two
 * columns per page by default (same geometry as drawDetailsPage's own
 * two-up layout), or a single full-width column when `columns` is 1 (used
 * by drawSitePages so its one remaining Measurements & Material block
 * spreads left to right across the whole page instead of sitting in a
 * half-width column, now that the Apple Standards block that used to sit
 * beside it was removed -- see that function). Fills the left column top to
 * bottom, then the right column (2-column mode only), then starts a new
 * page, moving on to the next block whenever the current one doesn't fit
 * rather than splitting a block's own rows across a column/page boundary
 * (every block here is small enough that whole-block placement never
 * wastes much space). `eyebrow`/`variant` are passed straight to newPage
 * for each page created, so a multi-page continuation reads as one
 * consistent extension of the section it continues.
 *
 * `style` picks which of the two section treatments each block draws with:
 * "card" (default) is drawTableSection's white card + shadow + band, used
 * by drawSitePages' Measurements & Material block; "underline" is
 * drawUnderlineTableSection's plain header-plus-rule treatment, used by the
 * Inspection Details continuation pages, per feedback.
 *
 * `start`, when given, flows the FIRST block into an already-open page at
 * a caller-chosen y (both columns start there) instead of always opening a
 * fresh page -- used by drawSitePages to continue straight on from the
 * photo + Facade diagram it draws above these blocks, so a site's whole
 * section (photo, diagram, Measurements & Material table) reads as one
 * place rather than starting a new page immediately. Any page this still
 * has to add beyond that first one (when a site's content doesn't all fit)
 * opens normally via newPage, same as ever.
 */
function drawFlowingBlocks(
  ctx: Ctx,
  eyebrow: string,
  variant: TopbarVariant,
  blocks: ContinuationBlock[],
  start?: { page: PDFPage; y: number },
  columns: 1 | 2 = 2,
  style: "card" | "underline" = "card"
) {
  const colGap = columns === 2 ? mm(6) : 0;
  const colW = columns === 2 ? (contentWidth() - colGap) / 2 : contentWidth();
  const leftX = contentLeft();
  const rightX = contentLeft() + colW + colGap;
  const topY = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
  const bottomLimit = FOOTER_HEIGHT + mm(6);
  const headerH = style === "card" ? mm(7) : UNDERLINE_HEADER_H;
  const gapAfter = mm(4);

  let page = start?.page ?? newPage(ctx, eyebrow, variant);
  let col: 0 | 1 = 0;
  let y = start ? [start.y, start.y] : [topY, topY];

  for (const block of blocks) {
    if (block.rows.length === 0) continue;
    const labelFont = block.labelFont ?? ctx.bold;
    const rowsH = style === "card" ? measureTwoColTableHeight(ctx, block.rows, colW, labelFont, block.padMm) : measureUnderlineRowsHeight(block.rows, colW, ctx);
    const blockH = headerH + rowsH + gapAfter;

    if (y[col] - blockH < bottomLimit) {
      if (columns === 2 && col === 0) {
        col = 1;
      } else {
        page = newPage(ctx, eyebrow, variant);
        col = 0;
        y = [topY, topY];
      }
    }

    const x = col === 0 ? leftX : rightX;
    const by =
      style === "card"
        ? drawTableSection(page, ctx, block.title, block.rows, x, colW, y[col], undefined, labelFont, block.padMm)
        : drawUnderlineTableSection(page, ctx, block.title, block.rows, x, colW, y[col]);
    y[col] = by - gapAfter;
  }
}

/**
 * Continues the Inspection Details page (drawDetailsPage) with every field
 * from the partner's later spec not already shown there -- On-site
 * personnel details/Store description fields the original page didn't
 * capture (location type, entrances, floors, open-plan, address), then
 * Installing on site, Deliveries to store, General site information, Site
 * suitability descriptions, Site details, Safety, Graphics, and Approvals
 * in full. Same "dark" topbar as the page it continues.
 */
function drawInspectionDetailsContinuationPages(ctx: Ctx) {
  const f = ctx.data.formData;

  const openingTimes = (
    [
      ["Mon", f.openingTimeMon],
      ["Tue", f.openingTimeTue],
      ["Wed", f.openingTimeWed],
      ["Thu", f.openingTimeThu],
      ["Fri", f.openingTimeFri],
      ["Sat", f.openingTimeSat],
      ["Sun", f.openingTimeSun],
    ] as const
  )
    .filter(([, v]) => v)
    .map(([d, v]) => `${d} ${v}`)
    .join(" · ");

  const blocks: ContinuationBlock[] = [
    {
      title: "On-site Personnel Details",
      rows: [
        { label: "Apple Representative — Name", value: f.appleRepresentativeName },
        { label: "Apple Representative — Mobile", value: f.appleRepresentativeMobile },
        { label: "Apple Representative — Email", value: f.appleRepresentativeEmail },
        { label: "Retailer Representative", value: f.retailerRepresentative },
        { label: "Store Contact Number", value: f.storeContactNumber },
      ],
    },
    {
      title: "Store Description (continued)",
      rows: [
        {
          label: "Location of Store",
          value: f.storeLocationType ? STORE_LOCATION_TYPE_LABEL[f.storeLocationType] : "",
        },
        { label: "Entrances & Floors", value: f.entranceFloorLocation ? ENTRANCE_FLOOR_LOCATION_LABEL[f.entranceFloorLocation] : "" },
        { label: "Floor Apple Program Is On", value: f.floorApplProgramOn },
        { label: "Is the Store Open Plan?", value: ynDetail(f.storeOpenPlan, f.openPlanLayoutDescription) },
        { label: "Store Location (marked)", value: f.storeLocationMarker ? POSITION_MARKER_LABEL[f.storeLocationMarker] : "" },
        { label: "Apple Program Position (marked)", value: f.appleProgramPositionMarker ? POSITION_MARKER_LABEL[f.appleProgramPositionMarker] : "" },
      ],
    },
    {
      title: "Installing on Site",
      rows: [
        { label: "Store Opening Times", value: openingTimes },
        { label: "Install Outside Store Opening Hours?", value: ynDetail(f.installOutsideHours, f.installOutsideHoursDetails) },
        { label: "Retailer Preferred Install Days/Time?", value: ynDetail(f.retailerPreferredInstallTime, f.retailerPreferredInstallDetails) },
        { label: "Time & Date of Installation", value: f.installationDateTime },
        { label: "Are Work Permits Required?", value: ynDetail(f.permitRequired, f.permitDetails) },
      ],
    },
    {
      title: "Deliveries to Store",
      rows: [{ label: "Delivery Timings", value: f.deliveryTimes ? DELIVERY_TIMING_LABEL[f.deliveryTimes] ?? f.deliveryTimes : "" }],
    },
    {
      title: "General Site Information",
      rows: [
        { label: "Will Weather Conditions Affect the Install?", value: ynDetail(f.weatherAffectsInstall, f.weatherAffectsInstallDetails) },
        { label: "Extra Lighting Required at Night?", value: ynDetail(f.extraLightingRequired, f.extraLightingDescription) },
      ],
    },
    {
      title: "Site Details",
      rows: [
        { label: "Maximum Working Space", value: f.maxWorkingSpace },
        { label: "Access Equipment Available on Site?", value: ynDetail(f.accessEquipmentAvailable, f.accessEquipmentDescription) },
        { label: "Powered Access to Be Used?", value: ynDetail(f.poweredAccessUsed, f.poweredAccessDescription) },
        { label: "Any Access Issues?", value: ynDetail(f.accessIssues, f.accessIssuesDescription) },
        { label: "Site Type", value: f.siteType ? `${SITE_TYPE_LABEL[f.siteType]}${f.siteType === "temporary" && f.siteTypeDuration ? ` — ${f.siteTypeDuration}` : ""}` : "" },
      ],
    },
    {
      title: "Safety",
      rows: [
        { label: "Is the Site Safe for Installation?", value: ynDetail(f.siteSafeForInstall, f.siteSafeDescription) },
        { label: "Any Specific Safety Concerns?", value: ynDetail(f.safetyConcerns, f.safetyConcernsDetails) },
        { label: "Specific Safety Equipment Required?", value: ynDetail(f.safetyEquipmentRequired, f.safetyEquipmentDetails) },
      ],
    },
    {
      title: "Approvals",
      rows: [
        { label: "Does the Store Need Special Approvals?", value: ynDetail(f.specialApprovalsNeeded, f.specialApprovalsDetails) },
        { label: "Chain Store — Central Team Approval Needed?", value: ynDetail(f.chainCentralApprovalNeeded, f.chainCentralApprovalReason) },
      ],
    },
  ];

  drawFlowingBlocks(ctx, "Inspection Details", "dark", blocks, undefined, 2, "underline");
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
    const page = newPage(ctx, "Main Site Photo", "grey");
    const top = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
    drawPhotoBox(page, ctx, photo, "Main Site Photo", MARGIN, top, contentWidth(), top - FOOTER_HEIGHT - mm(4));
  }
}

function drawOrientationPage(ctx: Ctx) {
  // Always drawn, one box per orientation whether or not a matching photo
  // exists yet (drawPhotoBox falls back to a placeholder) -- so the export
  // loop is complete end to end before photo upload lands.
  const categories: PhotoCategory[] = ["orientation_right", "orientation_left", "orientation_opposite"];
  const page = newPage(ctx, "Site Orientation", "grey");
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
  y = drawSectionBand(page, ctx, "Site Orientation", contentLeft(), contentWidth(), y, ctx.data.storeName || undefined, true);

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

// Short topbar eyebrows (kept to "Photo Survey — A" etc, not the full
// PHOTO_CATEGORY_LABEL parenthetical) so the right-aligned eyebrow text
// never crowds the topbar -- the full descriptive label still appears on
// the page itself via drawSectionBand, same as every other photo page.
const VIEWPOINT_PAGES: { category: PhotoCategory; eyebrow: string }[] = [
  { category: "viewpoint_a", eyebrow: "Photo Survey — A" },
  { category: "viewpoint_b", eyebrow: "Photo Survey — B" },
  { category: "viewpoint_c", eyebrow: "Photo Survey — C" },
  { category: "viewpoint_d", eyebrow: "Photo Survey — D" },
];

/**
 * One full-bleed page per photo in each of the 4 new A/B/C/D photo-survey
 * viewpoint categories (mirrors drawMainSitePhotoPages's own
 * photos.length > 0 ? photos : [undefined] fallback-to-placeholder
 * pattern), each headed by a section band carrying that viewpoint's full
 * descriptive label (see PHOTO_CATEGORY_LABEL) -- so what A/B/C/D actually
 * mean is always legible on the page itself, not just inferred from a
 * short topbar eyebrow.
 */
function drawPhotoSurveyPages(ctx: Ctx) {
  for (const { category, eyebrow } of VIEWPOINT_PAGES) {
    const label = PHOTO_CATEGORY_LABEL[category];
    const photos = ctx.photos.filter((p) => p.category === category);
    const list = photos.length > 0 ? photos : [undefined];
    for (const photo of list) {
      const page = newPage(ctx, eyebrow, "grey");
      let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
      y = drawSectionBand(page, ctx, label, contentLeft(), contentWidth(), y, ctx.data.storeName || undefined, true);
      drawPhotoBox(page, ctx, photo, label, contentLeft(), y, contentWidth(), y - FOOTER_HEIGHT - mm(4));
    }
  }
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
 * drawn on the real photo beside it (see drawSitePages).
 */
function drawFacadeDiagram(page: PDFPage, ctx: Ctx, m: SiteSurveyMeasurement, x: number, yTop: number, w: number, h: number) {
  // SF Pro Regular only on this page (see drawSitePages) -- "Facade"
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

/**
 * One section per site: photo + Facade diagram up top, then the
 * Measurements & Material table flowing straight on beneath it via
 * drawFlowingBlocks -- spread the full page width now that the Apple
 * Standards block that used to sit beside it in a second column has been
 * removed entirely (per feedback) -- spilling to a same-titled "(continued)"
 * page only if a site's own content doesn't fit. (Opportunity Information
 * used to print here too -- removed entirely, see SiteSurveyFormData's own
 * header comment.) Called once per entry in ctx.data.measurements (see
 * buildSiteSurveyReportPdf) -- `index`/`total` label multi-site reports as
 * "Site 1 of 2" etc.; a single-site report (the common case) reads exactly
 * as the original one-block build did.
 *
 * `photo` is resolved by the caller via SiteSurveyMeasurement.measurementPhotoId
 * (falling back to positional assignment among uploaded 'measurement'-
 * category photos) since a multi-site report can have more than one such
 * photo -- see buildSiteSurveyReportPdf.
 */
function drawSitePages(ctx: Ctx, m: SiteSurveyMeasurement, photo: SurveyPhotoImage | undefined, index: number, total: number) {
  const eyebrow = total > 1 ? `Site Photo & Measurement — Site ${index + 1} of ${total}` : "Site Photo & Measurement";
  const bandTitle = total > 1 ? `Site ${index + 1} of ${total}` : "Site Photo & Measurement";

  const page = newPage(ctx, eyebrow, "grey");
  let y = PAGE_HEIGHT - TOPBAR_HEIGHT - mm(4);
  y = drawSectionBand(page, ctx, bandTitle, contentLeft(), contentWidth(), y, ctx.data.storeName || undefined, true);

  const halfW = (contentWidth() - mm(6)) / 2;
  const rowH = mm(88);
  drawPhotoBox(page, ctx, photo, "Site Measurement Photo", contentLeft(), y, halfW, rowH);
  drawFacadeDiagram(page, ctx, m, contentLeft() + halfW + mm(6), y, halfW, rowH);
  y -= rowH + mm(5);

  // Per feedback, the Apple Standards block is removed entirely (its
  // fields no longer print anywhere in the report), and the Measurements &
  // Material block that used to sit beside it now spreads across the full
  // page width instead of a half-width column -- see drawFlowingBlocks'
  // `columns` param.
  const bottomLimit = FOOTER_HEIGHT + mm(6);
  const minRoomForAnotherBlock = mm(30);

  const blocks: ContinuationBlock[] = [
    {
      title: "Measurements & Material",
      // SF Pro Regular only on this block, per the partner's explicit
      // instruction on the original Measurement page -- no bold labels
      // here.
      labelFont: ctx.font,
      // Per feedback to increase this block's row height slightly, beyond
      // drawTwoColTable's default mm(2) cell padding.
      padMm: mm(2.6),
      rows: [
        { label: "Visual Size (marked in green-yellow)", value: sizeLabel(m.visualWidthMm, m.visualHeightMm), icon: "squareDashed" },
        { label: "Material Size", value: `${sizeLabel(m.materialWidthMm, m.materialHeightMm)} (${bleedLabel(m)})`, icon: "tag" },
        { label: "Material Type", value: m.materialType, icon: "layers" },
        { label: "Installation Type", value: m.installationType ? INSTALLATION_TYPE_LABEL[m.installationType] ?? m.installationType : "", icon: "layoutGrid" },
        { label: "Detailed Equipment Material", value: m.equipmentDetail, icon: "frame" },
        { label: "Who Is To Source Equipment?", value: m.equipmentSource, icon: "users" },
        { label: "Who Will Do The Installation?", value: m.installedBy ? SURVEY_COMPANY_LABEL[m.installedBy] ?? m.installedBy : "", icon: "wrench" },
        { label: "Any Important Notes", value: m.measurementNotes, icon: "clipboardList" },
      ],
    },
  ];

  const continuedEyebrow = `${eyebrow} (continued)`;
  if (y - bottomLimit > minRoomForAnotherBlock) {
    drawFlowingBlocks(ctx, continuedEyebrow, "grey", blocks, { page, y: y - mm(3) }, 1);
  } else {
    drawFlowingBlocks(ctx, continuedEyebrow, "grey", blocks, undefined, 1);
  }
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
 * Registers fontkit and embeds a caller-supplied Regular+Bold font pack
 * (see this file's header comment on why unsubsetted) -- used for both SF
 * Pro Text and, separately, Apple SD Gothic Neo (see
 * buildSiteSurveyReportPdf's own two calls to this). Returns null -- never
 * throws -- when no bytes were supplied, or embedding fails for any
 * reason, so each caller's own fallback (Helvetica for SF Pro; SF
 * Pro/Helvetica for Apple SD Gothic Neo) always applies cleanly either
 * way. registerFontkit is idempotent, so calling this twice on the same
 * doc is safe.
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

export async function buildSiteSurveyReportPdf(
  data: SiteSurveyReportPdfData,
  fonts?: { regular: Uint8Array; bold: Uint8Array } | null,
  gothicNeoFonts?: { regular: Uint8Array; bold: Uint8Array } | null
): Promise<Blob> {
  const doc = await PDFDocument.create();
  const embedded = await embedBrandFonts(doc, fonts);
  const font = embedded?.font ?? (await doc.embedFont(StandardFonts.Helvetica));
  const bold = embedded?.bold ?? (await doc.embedFont(StandardFonts.HelveticaBold));
  // Apple SD Gothic Neo, for the Inspection Details pages only (see Ctx's
  // own comment) -- falls back to whatever `font`/`bold` just resolved to
  // (SF Pro Text, or Helvetica) when not supplied or embedding failed.
  const embeddedGothic = await embedBrandFonts(doc, gothicNeoFonts);
  const gothicFont = embeddedGothic?.font ?? font;
  const gothicBold = embeddedGothic?.bold ?? bold;
  const logo = await embedAppleLogo(doc);

  // Every photo must be embedded into THIS PDFDocument before any drawing
  // starts -- a PDFImage from a different document isn't valid here (see
  // SurveyPhotoInput's header comment). Embedding is async; drawing isn't,
  // so it all happens up front rather than per page.
  const photos: SurveyPhotoImage[] = await Promise.all(
    data.photos.map(async (p) => ({
      id: p.id,
      image: p.format === "png" ? await doc.embedPng(p.bytes) : await doc.embedJpg(p.bytes),
      category: p.category,
      caption: p.caption,
      annotation: normalizeAnnotation(p.annotation),
    }))
  );

  const ctx: Ctx = { doc, font, bold, gothicFont, gothicBold, data, photos, pageNumber: 0, logo };

  drawTitlePage(ctx);
  drawCoverPage(ctx);
  drawDetailsPage(ctx);
  drawInspectionDetailsContinuationPages(ctx);
  drawMainSitePhotoPages(ctx);
  drawOrientationPage(ctx);
  drawPhotoSurveyPages(ctx);

  // One combined Photo + Facade + Opportunity/Measurements/Apple Standards
  // section per site (see drawSitePages) -- resolved photo is whichever
  // 'measurement'-category upload that site's measurementPhotoId points at
  // (set on the Measurements step), falling back to positional assignment
  // by array order for older/legacy single-site data that predates that
  // picker (measurementPhotoId left null).
  const measurementPhotos = ctx.photos.filter((p) => p.category === "measurement");
  ctx.data.measurements.forEach((m, index) => {
    const photo = (m.measurementPhotoId && measurementPhotos.find((p) => p.id === m.measurementPhotoId)) || measurementPhotos[index];
    drawSitePages(ctx, m, photo, index, ctx.data.measurements.length);
  });

  const otherPhotos = ctx.photos.filter((p) => p.category === "other");
  if (otherPhotos.length > 0) {
    for (const photo of otherPhotos) {
      const page = newPage(ctx, "Additional Photo", "grey");
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
