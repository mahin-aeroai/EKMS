// Builds the customer-facing Estimate PDF entirely client-side (same
// philosophy as Cut File Tool / Installation Report — see
// src/lib/installationReport/pdfBuild.ts) — no server round-trip.
//
// Layout is modeled on two real sample quotes the user shared (IKEA Worli
// and an Apple Q4 estimate): Date / To / Attn / SUB / Quote No. / Job No.
// block, a line-items table (Product No., Design/Product, Width×Height,
// Qty, SQFT, Rate, Amount, Tax, Grand Total per line), fixed "Prices" /
// "JOB Completion Time" / "Delivery time" / "Payment Schedule" paragraphs
// (exact wording supplied by the user — see BOILERPLATE below), a closing
// paragraph, and a signing block.
//
// Typography: Caladea at 9pt throughout, one size for the whole document
// (only bold/regular weight varies, e.g. table header vs body) per the
// user's request for a smaller, uniform font. Caladea, not Cambria: the
// user asked for Cambria, but Cambria is a Microsoft-licensed font that
// can't legally be bundled/redistributed by us, and PDF generation needs
// real font bytes embedded (a visitor's OS-installed fonts aren't
// reachable from JS). Caladea is Google's purpose-built, OFL-licensed,
// metric-compatible substitute for Cambria (what LibreOffice itself
// substitutes when Cambria isn't installed) — user confirmed this
// tradeoff. Font files: public/fonts/Caladea-{Regular,Bold}.ttf,
// converted from the official @fontsource/caladea npm package's WOFF2s;
// public/fonts/Caladea-OFL-LICENSE.txt is the required license notice.
//
// MMDI's own letterhead details (address/phone/email/web, signatory name)
// are transcribed from the sample quote's own footer/signature block
// (word/footer1.xml) — MMDI's fixed details, not user input, so they live
// here as constants. The sample's scanned signature image is deliberately
// NOT reproduced (user confirmed): a blank line sits above the printed
// name for a wet/e-signature instead of auto-stamping a real person's
// handwriting onto every generated PDF.
//
// Versioning: every save creates a new row in `estimates` rather than
// updating one in place (see supabase-estimate-builder-versions-
// migration.sql) — `version`/`quoteNumber` here are just for display,
// e.g. quoteNumber "IKEA-EST-0001-V2" with version 2.

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { EstimatePaymentTermsType } from "@mmdi/shared/rows";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

const PAGE_WIDTH = mm(210); // A4
const PAGE_HEIGHT = mm(297);
const MARGIN = mm(20);
const FOOTER_H = mm(13);
const FONT_SIZE = 9;

const INK = rgb(0.08, 0.09, 0.11);
const MUTED = rgb(0.4, 0.42, 0.46);
const BORDER = rgb(0.8, 0.81, 0.84);
const HEADER_BG = rgb(0.94, 0.95, 0.96);

// MMDI's own letterhead details — transcribed from the sample quote's
// footer (word/footer1.xml) and signature block, not user input.
const MMDI = {
  legalName: "Macromedia Digital Imaging Private Limited",
  address: "23B & 24, Phase 5, IDA – Cherlapally, Hyderabad – 500051",
  phone: "+91 40 2726 7777 / 8888",
  email: "info@mmdi.in",
  web: "www.mmdi.in",
  signOffLine: "For MACROMEDIA DIGITAL IMAGING PVT. LTD.",
};

// Exact wording supplied by the user — kept as fixed boilerplate rather
// than derived from the per-estimate job-completion/delivery/payment
// inputs, which now just PREFILL these fields (still editable) instead of
// being spliced into a different fixed sentence.
const BOILERPLATE = {
  priceNotes: [
    "The quoted amount is only for supply in all respects as per details given above in accordance with the BOQ items.",
    "Installation charges are included, for detailed specifications please check enclosure of BOQ sheet.",
  ],
  jobCompletionTrailer: "Any sort of delay shall be intimated accordingly the expected time for completion given may vary.",
  closing:
    "We trust our offer is in line with your requirements. Further if you may feel like, contact us for any sort of clarification or assistance required. It shall be our pleasure to fulfill your requirements in the best possible manner always.",
  thanking: "Thanking and assuring you of our best services at all the times.",
};

// HSN 4911 ("printed matter, pictures, other than periodicals") covers
// every line item this business quotes -- signage, wall graphics, vinyl
// prints, etc. -- so it's shown as a fixed value on every line rather than
// a per-line field the user would have to fill in every time.
const HSN_CODE_PRINTED_PRODUCTS = "4911";

export const DEFAULT_JOB_COMPLETION_TIME = "The overall job is expected to be completed according to the given Schedule.";
export const DEFAULT_DELIVERY_COMMITMENT =
  "Same day delivery within Hyderabad city, out station deliveries based on logistics with effect from the provided conditions are true.";

export interface EstimatePdfLine {
  productNo: string | null;
  productName: string;
  designName: string | null;
  description: string | null;
  additionalDescription: string | null;
  uom: string | null;
  calcMode: "nos" | "sqft";
  widthCm: number | null;
  heightCm: number | null;
  quantity: number;
  sqftTotal: number | null;
  unitRate: number;
  transportationRate: number;
  installationRate: number;
}

export interface EstimatePdfData {
  quoteNumber: string;
  version: number;
  createdAt: string;
  customerName: string;
  siteLegalEntityName: string | null;
  jobNumber: string | null;
  customerAddress: string | null;
  customerGstin: string | null;
  attentionPerson: string | null;
  quoteSubject: string | null;
  gstPercent: number;
  jobCompletionTime: string | null;
  deliveryCommitment: string | null;
  paymentTermsType: EstimatePaymentTermsType;
  paymentTermsDays: number | null;
  notes: string | null;
  salespersonName: string | null;
  salespersonDesignation: string | null;
  salespersonPhone: string | null;
  salespersonEmail: string | null;
  lines: EstimatePdfLine[];
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatLongDate(iso: string): string {
  const d = iso ? new Date(iso) : new Date();
  const day = d.getDate();
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${day}${ordinal(day)} ${month}, ${d.getFullYear()}`;
}

function rupee(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export type SizeUnit = "cm" | "ft" | "in";

// Width/Height entry unit is driven by the line's own UOM text rather than
// a separate field: the Estimate Builder's UOM dropdown (for SQFT-priced
// lines) writes exactly "cm"/"ft"/"in" here, and Width/Height are read in
// whichever unit this resolves to instead of always being cm. Deliberately
// treats anything containing "sq" ("SQFT"/"Sq.Ft"/"Sq Ft") as cm -- those
// describe the (already square-feet) OUTPUT area unit that every
// sqft-priced line already produces via the cm-to-inches-to-/144 math, not
// a request to enter Width/Height in feet. Exported so both this file and
// the Estimate Builder page derive the same unit identically from the
// same stored uom text -- no separate DB column needed, since uom is
// already persisted per line.
export function getSizeUnit(uom: string | null | undefined): SizeUnit {
  const u = (uom ?? "").toLowerCase().trim();
  if (!u || u.includes("sq")) return "cm";
  if (/\bft\b|feet/.test(u)) return "ft";
  if (/\bin\b|inch/.test(u)) return "in";
  return "cm";
}

function lineAmount(l: EstimatePdfLine): number {
  const base = l.calcMode === "sqft" ? (l.sqftTotal ?? 0) * l.unitRate : l.quantity * l.unitRate;
  return base + l.transportationRate + l.installationRate;
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

// Like wrapText, but respects explicit "\n"s in the input as forced line
// breaks first (wrapText alone treats "\n" as just another whitespace
// separator between words, so e.g. "Name\nHSN: 4911" could get silently
// re-joined onto one wrapped line). Table cells that stack multiple
// distinct pieces of text -- product name, description, HSN code -- use
// this so each piece reliably starts its own line, still word-wrapping
// within itself if it's too long for the column.
function wrapParagraphs(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (para === "") {
      lines.push("");
    } else {
      lines.push(...wrapText(font, para, size, maxWidth));
    }
  }
  return lines;
}

interface Logo {
  image: Awaited<ReturnType<PDFDocument["embedJpg"]>>;
  w: number;
  h: number;
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  logo: Logo | null;
  quoteNumber: string;
  pageNumber: number;
  cols: ReturnType<typeof tableCols>;
}

const LOGO_H = mm(12);

function drawLogoTopRight(ctx: Ctx, page: PDFPage) {
  if (!ctx.logo) return;
  const w = (ctx.logo.w / ctx.logo.h) * LOGO_H;
  page.drawImage(ctx.logo.image, { x: PAGE_WIDTH - MARGIN - w, y: PAGE_HEIGHT - MARGIN - LOGO_H + mm(4), width: w, height: LOGO_H });
}

function drawFooter(ctx: Ctx, page: PDFPage) {
  const y = FOOTER_H;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: BORDER });
  const size = FONT_SIZE - 1.5;
  const line1 = `${MMDI.legalName}, ${MMDI.address}`;
  const line2 = `Ph.: ${MMDI.phone}   |   ${MMDI.email}   |   ${MMDI.web}`;
  page.drawText(line1, { x: MARGIN, y: y - 11, size, font: ctx.font, color: MUTED });
  page.drawText(line2, { x: MARGIN, y: y - 22, size, font: ctx.font, color: MUTED });
  const right = `${ctx.quoteNumber}  ·  Page ${ctx.pageNumber}`;
  const rw = ctx.font.widthOfTextAtSize(right, size);
  page.drawText(right, { x: PAGE_WIDTH - MARGIN - rw, y: y - 22, size, font: ctx.font, color: MUTED });
}

function newPage(ctx: Ctx): { page: PDFPage; y: number } {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;
  drawLogoTopRight(ctx, page);
  drawFooter(ctx, page);
  return { page, y: PAGE_HEIGHT - MARGIN };
}

const CONTENT_BOTTOM = FOOTER_H + mm(8);

/** Advances to a new page if `need` more points won't fit above the footer. */
function ensure(ctx: Ctx, state: { page: PDFPage; y: number }, need: number) {
  if (state.y - need < CONTENT_BOTTOM) {
    const next = newPage(ctx);
    state.page = next.page;
    state.y = next.y;
  }
}

// Widths sum to exactly 170mm = PAGE_WIDTH(210mm) - MARGIN(20mm) * 2, so
// the table always lands flush with both margins — recompute this sum if
// the column list changes. Width/Height collapses cm-only into one column
// (rather than separate cm + inch columns) so everything still fits
// comfortably at 9pt instead of the ~6.5pt a full cm+inch table would need.
//
// Amount/Shipping/Installation are three separate columns rather than one
// lump "Amount" that silently folds transportation+installation in --
// that used to mean a line billed as 2 nos x Rs.2000 with Rs.1000 shipping
// showed a flat Rs.5000 "Amount" with no visible breakdown, which read as
// the base rate being wrong rather than shipping being added on top.
//
// The Tax column's label is built per-document from the estimate's own
// gstPercent ("GST@18%") rather than a generic "Tax" -- the user quotes at
// different GST rates per estimate and wants the rate visible in the
// header rather than having to infer it from Tax/Amount.
function tableCols(gstPercent: number) {
  return [
    { label: "Product No.", width: mm(15) },
    { label: "Design / Product", width: mm(33) },
    { label: "W × H", width: mm(17) },
    { label: "Qty", width: mm(8) },
    { label: "SQFT", width: mm(12) },
    { label: "Rate", width: mm(12) },
    { label: "Amount", width: mm(13) },
    { label: "Shipping", width: mm(13) },
    { label: "Instl.", width: mm(12) },
    { label: `GST @${gstPercent}%`, width: mm(12) },
    { label: "Grand Total", width: mm(23) },
  ] as const;
}

function tableWidth(cols: readonly { width: number }[]) {
  return cols.reduce((s, c) => s + c.width, 0);
}

const ROW_H = mm(7);
// Extra vertical space budgeted per wrapped line beyond the first, and the
// combined top+bottom padding, when a cell (almost always Design/Product)
// needs more than one line -- rows used to be a fixed ROW_H tall and simply
// clipped every cell to its first wrapped line, silently cutting off long
// product descriptions/design names instead of growing the row.
const ROW_LINE_H = FONT_SIZE - 1 + 3;
const ROW_V_PAD = 6;

// Shared by header + body rows: wraps every cell to its column's width up
// front so the row's required height is known before anything is drawn,
// then figures out how tall the row needs to be (usually 1 line; more
// when a cell -- a long column header like "GST @18%", or Design/Product
// -- runs past its column width and needs a second line instead of
// overflowing into the next column).
function wrapRowCells(cols: readonly { width: number }[], cells: string[], font: PDFFont, size: number): string[][] {
  return cells.map((text, i) => wrapParagraphs(font, text, size, cols[i].width - 6));
}

function rowHeightFor(wrapped: string[][]): number {
  const maxLines = Math.max(1, ...wrapped.map((l) => l.length));
  return maxLines <= 1 ? ROW_H : maxLines * ROW_LINE_H + ROW_V_PAD * 2;
}

function drawWrappedCells(
  page: PDFPage,
  cols: readonly { width: number }[],
  wrapped: string[][],
  rowH: number,
  y: number,
  font: PDFFont,
  size: number
) {
  let x = MARGIN;
  wrapped.forEach((lines, i) => {
    const col = cols[i];
    if (lines.length <= 1) {
      // Single line: centered vertically in the row.
      page.drawText(lines[0] ?? "", { x: x + 3, y: y - rowH / 2 - size / 2 + 1, size, font, color: INK });
    } else {
      const firstBaseline = y - ROW_V_PAD - size;
      lines.forEach((line, j) => {
        page.drawText(line, { x: x + 3, y: firstBaseline - j * ROW_LINE_H, size, font, color: INK });
      });
    }
    x += col.width;
  });
}

function drawTableHeader(ctx: Ctx, state: { page: PDFPage; y: number }) {
  const size = FONT_SIZE - 1;
  const labels = ctx.cols.map((c) => c.label);
  const wrapped = wrapRowCells(ctx.cols, labels, ctx.bold, size);
  const rowH = rowHeightFor(wrapped);
  ensure(ctx, state, rowH);
  const width = tableWidth(ctx.cols);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, color: HEADER_BG });
  drawWrappedCells(state.page, ctx.cols, wrapped, rowH, state.y, ctx.bold, size);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, borderColor: BORDER, borderWidth: 0.75 });
  state.y -= rowH;
}

function drawTableRow(ctx: Ctx, state: { page: PDFPage; y: number }, cells: string[], opts?: { bold?: boolean }) {
  const size = FONT_SIZE - 1;
  const font = opts?.bold ? ctx.bold : ctx.font;
  const wrapped = wrapRowCells(ctx.cols, cells, font, size);
  const rowH = rowHeightFor(wrapped);

  const yBefore = state.y;
  ensure(ctx, state, rowH);
  if (state.y !== yBefore) {
    // `ensure` just started a fresh page mid-table -- repeat the header
    // before this row so a page break never leaves an unlabeled table.
    drawTableHeader(ctx, state);
  }
  const width = tableWidth(ctx.cols);
  drawWrappedCells(state.page, ctx.cols, wrapped, rowH, state.y, font, size);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, borderColor: BORDER, borderWidth: 0.5 });
  state.y -= rowH;
}

export async function generateEstimatePdf(data: EstimatePdfData): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const [regularBytes, boldBytes] = await Promise.all([
    fetch("/fonts/Caladea-Regular.ttf").then((r) => r.arrayBuffer()),
    fetch("/fonts/Caladea-Bold.ttf").then((r) => r.arrayBuffer()),
  ]);
  const font = await doc.embedFont(regularBytes);
  const bold = await doc.embedFont(boldBytes);

  let logo: Logo | null = null;
  try {
    const res = await fetch("/brand/mmdi-logo.jpg");
    if (res.ok) {
      const image = await doc.embedJpg(await res.arrayBuffer());
      logo = { image, w: image.width, h: image.height };
    }
  } catch {
    // Logo is cosmetic — a missing/blocked fetch shouldn't stop the PDF.
  }

  const versionLabel = data.version > 1 ? ` (Version ${data.version})` : " (Version 1)";
  const ctx: Ctx = { doc, font, bold, logo, quoteNumber: data.quoteNumber || "—", pageNumber: 0, cols: tableCols(data.gstPercent) };
  const state = newPage(ctx);
  const contentW = PAGE_WIDTH - MARGIN * 2;
  const size = FONT_SIZE;

  // ---- Date / To / Attn / SUB / Quote No. ----
  state.page.drawText(`Date: ${formatLongDate(data.createdAt)}`, { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 20;

  state.page.drawText("To,", { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 13;
  state.page.drawText(data.siteLegalEntityName || data.customerName, { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 12;
  if (data.customerAddress) {
    for (const line of wrapText(font, data.customerAddress, size, contentW)) {
      state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
      state.y -= 12;
    }
  }
  if (data.customerGstin) {
    state.page.drawText(`GST: ${data.customerGstin}`, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  state.y -= 8;

  state.page.drawText("Dear Sir/Madam,", { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 17;

  if (data.attentionPerson) {
    state.page.drawText(`Attn: ${data.attentionPerson},`, { x: MARGIN, y: state.y, size, font: bold, color: INK });
    state.y -= 12;
  }
  if (data.quoteSubject) {
    for (const line of wrapText(bold, `SUB: ${data.quoteSubject}`, size, contentW)) {
      state.page.drawText(line, { x: MARGIN, y: state.y, size, font: bold, color: INK });
      state.y -= 12;
    }
  }
  state.page.drawText(`Quote No.: ${data.quoteNumber}${versionLabel}`, { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 12;
  if (data.jobNumber) {
    state.page.drawText(`Campaign/Job#/Program: ${data.jobNumber}`, { x: MARGIN, y: state.y, size, font: bold, color: INK });
    state.y -= 12;
  }
  state.y -= 7;

  const intro =
    "With reference to the above subject requirement, we hereby feel pleasure in submitting our proposal for the supply of the below items as per the given specifications. Please find below quote for your kind approval.";
  for (const line of wrapText(font, intro, size, contentW)) {
    state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  state.y -= 6;

  // ---- Line items table ----
  drawTableHeader(ctx, state);
  let subtotal = 0;
  let transportTotal = 0;
  let installTotal = 0;
  for (const l of data.lines) {
    const amount = lineAmount(l);
    const base = l.calcMode === "sqft" ? (l.sqftTotal ?? 0) * l.unitRate : l.quantity * l.unitRate;
    subtotal += base;
    transportTotal += l.transportationRate;
    installTotal += l.installationRate;
    const tax = (amount * data.gstPercent) / 100;
    const sizeUnit = getSizeUnit(l.uom);
    // Design/Product cell stacks four distinct pieces, each starting its
    // own line (via wrapParagraphs' "\n" handling) and wrapping further
    // within itself if long: the name, the full description (description +
    // additionalDescription -- e.g. "bubble free vinyl UV print" specs that
    // used to be dropped from the PDF even though the on-screen table
    // already showed them), then the HSN code every printed line carries.
    const nameLine = [l.designName, l.productName].filter(Boolean).join(" — ") || l.productName;
    const descLine = [l.description, l.additionalDescription].filter(Boolean).join(" — ");
    const productCell = [nameLine, descLine, `HSN: ${HSN_CODE_PRINTED_PRODUCTS}`].filter(Boolean).join("\n");
    drawTableRow(ctx, state, [
      l.productNo || "—",
      productCell,
      l.calcMode === "sqft" && l.widthCm && l.heightCm ? `${l.widthCm}${sizeUnit} × ${l.heightCm}${sizeUnit}` : "—",
      // The SQFT column already carries the area-priced total, so the
      // Qty column just shows the bare count there instead of repeating
      // the unit a second time (e.g. "4" not "4 SQFT") -- the unit still
      // shows for "nos" lines, where there's no other column carrying it.
      l.calcMode === "sqft" ? String(l.quantity) : `${l.quantity} ${l.uom ?? ""}`.trim(),
      l.calcMode === "sqft" ? (l.sqftTotal ?? 0).toFixed(2) : "—",
      rupee(l.unitRate),
      rupee(base),
      l.transportationRate ? rupee(l.transportationRate) : "—",
      l.installationRate ? rupee(l.installationRate) : "—",
      rupee(tax),
      rupee(amount + tax),
    ]);
  }

  const taxableTotal = subtotal + transportTotal + installTotal;
  const gstAmount = (taxableTotal * data.gstPercent) / 100;
  const grandTotal = taxableTotal + gstAmount;
  drawTableRow(
    ctx,
    state,
    ["", "", "", "", "", "Totals", rupee(subtotal), rupee(transportTotal), rupee(installTotal), rupee(gstAmount), rupee(grandTotal)],
    { bold: true }
  );
  state.y -= 14;

  // The line-item table has no room left for a pre-tax subtotal column
  // (Tax already has to squeeze in ahead of Grand Total at 12mm), so the
  // taxable value / GST / final value breakdown lives here instead, as
  // three separate lines rather than one opaque "Grand Total" figure.
  ensure(ctx, state, 48);
  state.page.drawText(`Total Taxable Value (INR): ${rupee(taxableTotal)}`, { x: MARGIN, y: state.y, size: size + 1, font: bold, color: INK });
  state.y -= 16;
  state.page.drawText(`GST @${data.gstPercent}% (INR): ${rupee(gstAmount)}`, { x: MARGIN, y: state.y, size: size + 1, font: bold, color: INK });
  state.y -= 16;
  state.page.drawText(`Total Value (INR): ${rupee(grandTotal)}`, { x: MARGIN, y: state.y, size: size + 1, font: bold, color: INK });
  state.y -= 22;

  // ---- Prices / Job completion / Delivery / Payment schedule — exact
  // wording the user specified, kept fixed rather than derived. ----
  ensure(ctx, state, 50);
  state.page.drawText("Prices:", { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 13;
  for (const note of BOILERPLATE.priceNotes) {
    for (const line of wrapText(font, `•  ${note}`, size, contentW)) {
      ensure(ctx, state, 12);
      state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
      state.y -= 12;
    }
  }
  state.y -= 8;

  ensure(ctx, state, 40);
  state.page.drawText("JOB Completion Time:", { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 13;
  for (const line of wrapText(font, data.jobCompletionTime || DEFAULT_JOB_COMPLETION_TIME, size, contentW)) {
    ensure(ctx, state, 12);
    state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  for (const line of wrapText(font, BOILERPLATE.jobCompletionTrailer, size, contentW)) {
    ensure(ctx, state, 12);
    state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  state.y -= 8;

  ensure(ctx, state, 30);
  state.page.drawText("Delivery time:", { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 13;
  for (const line of wrapText(font, data.deliveryCommitment || DEFAULT_DELIVERY_COMMITMENT, size, contentW)) {
    ensure(ctx, state, 12);
    state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  state.y -= 8;

  ensure(ctx, state, 30);
  state.page.drawText("Payment Schedule:", { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 13;
  const paymentLine =
    data.paymentTermsType === "advance"
      ? "100% advance payment before commencement of work."
      : data.paymentTermsType === "against_delivery"
        ? "Payment against delivery."
        : data.paymentTermsDays
          ? `${data.paymentTermsDays} days from the date of supply.`
          : "To be confirmed.";
  state.page.drawText(paymentLine, { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 20;

  if (data.notes) {
    ensure(ctx, state, 30);
    state.page.drawText("Notes:", { x: MARGIN, y: state.y, size, font: bold, color: INK });
    state.y -= 13;
    for (const line of wrapText(font, data.notes, size, contentW)) {
      ensure(ctx, state, 12);
      state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
      state.y -= 12;
    }
    state.y -= 8;
  }

  ensure(ctx, state, 40);
  for (const line of wrapText(font, BOILERPLATE.closing, size, contentW)) {
    ensure(ctx, state, 12);
    state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  state.y -= 6;
  ensure(ctx, state, 12);
  state.page.drawText(BOILERPLATE.thanking, { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 26;

  // ---- Signing block ----
  // Prints this estimate's own sales person (name/designation/mobile/
  // email, snapshotted on save from public.employees at pick time) instead
  // of a hardcoded default name -- and no blank gap above it: that gap
  // used to hold space for a wet/e-signature above a bare printed name,
  // but there's nothing to leave room for now that this is a full
  // business-card-style block instead of just a name. An estimate with no
  // sales person picked just shows the sign-off line with nothing below.
  ensure(ctx, state, 60);
  state.page.drawText(MMDI.signOffLine, { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 14;
  const signatoryLines = [
    data.salespersonName,
    data.salespersonDesignation,
    data.salespersonPhone ? `Mobile: ${data.salespersonPhone}` : null,
    data.salespersonEmail ? `Email: ${data.salespersonEmail}` : null,
  ].filter((l): l is string => !!l);
  for (const line of signatoryLines) {
    ensure(ctx, state, 12);
    state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
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
