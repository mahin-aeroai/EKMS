// Builds the Sign Estimator Cost Sheet PDF entirely client-side -- same
// philosophy/page-setup helpers as Import Duty's PDF generator
// (src/lib/importDuty/pdf.ts), reused here rather than duplicated.
//
// "Instead of print pdf give download pdf" -- CostSheetTab's "Print / PDF"
// button just called window.print(), which opens the browser's print
// dialog and requires the user to manually choose "Save as PDF" as a
// destination. This generates and downloads a real .pdf file directly,
// same one-click pattern as every other tool's "Download PDF" (Import
// Duty, Material Ordering, Estimate Builder).
//
// Portrait A4 (this cost sheet reads top-to-bottom like a quote, unlike
// Import Duty's wide multi-column tables) and Times-Roman/Bold -- pdf-lib
// only ships the 14 standard PDF fonts (no Cambria among them, and
// embedding a real Cambria .ttf isn't something this sandbox can
// source/license) -- StandardFonts.TimesRoman/TimesRomanBold is the
// closest built-in serif substitute, same family Cambria itself was
// designed to modernize. Matches the same choice already made for the
// Import Duty PDF.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { EstimateSnapshot } from "@/app/workspaces/sign-estimator/types";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

// Portrait A4.
const PAGE_WIDTH = mm(210);
const PAGE_HEIGHT = mm(297);
const MARGIN = mm(16);
const FOOTER_H = mm(13);
const FONT_SIZE = 10;

const INK = rgb(0.08, 0.09, 0.11);
const MUTED = rgb(0.4, 0.42, 0.46);
const BORDER = rgb(0.8, 0.81, 0.84);
const HEADER_BG = rgb(0.94, 0.95, 0.96);
const TOTAL_BG = rgb(0.9, 0.93, 0.98);

// Same MMDI letterhead details as the Import Duty / Material Ordering /
// Estimate Builder PDFs (see those files' own MMDI constant) -- this
// business's own fixed particulars, not user input.
const MMDI = {
  legalName: "Macromedia Digital Imaging Private Limited",
  address: "23B & 24, Phase 5, IDA – Cherlapally, Hyderabad – 500051",
  phone: "+91 40 2726 7777 / 8888",
  email: "info@mmdi.in",
  web: "www.mmdi.in",
};

export interface SignEstimatorPdfData {
  ref: string;
  createdAt: string;
  client: string | null;
  calc: EstimateSnapshot;
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

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${day}${ordinal(day)} ${month}, ${d.getFullYear()}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

function fmtRupee(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
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

type Col = { label: string; width: number; align?: "left" | "right" };

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  ref: string;
  pageNumber: number;
}

function drawFooter(ctx: Ctx, page: PDFPage) {
  const y = FOOTER_H;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: BORDER });
  const size = FONT_SIZE - 1.5;
  const line1 = `${MMDI.legalName}, ${MMDI.address}`;
  const line2 = `Ph.: ${MMDI.phone}   |   ${MMDI.email}   |   ${MMDI.web}`;
  page.drawText(line1, { x: MARGIN, y: y - 11, size, font: ctx.font, color: MUTED });
  page.drawText(line2, { x: MARGIN, y: y - 22, size, font: ctx.font, color: MUTED });
  const right = `${ctx.ref}  ·  Page ${ctx.pageNumber}`;
  const rw = ctx.font.widthOfTextAtSize(right, size);
  page.drawText(right, { x: PAGE_WIDTH - MARGIN - rw, y: y - 22, size, font: ctx.font, color: MUTED });
}

function newPage(ctx: Ctx): { page: PDFPage; y: number } {
  const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;
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

function tableWidth(cols: readonly Col[]) {
  return cols.reduce((s, c) => s + c.width, 0);
}

const ROW_LINE_H = FONT_SIZE - 1 + 2;
const ROW_V_PAD = 4;

// Label / Detail / Value 3-column row, mirroring CostSheetTab's <Row>
// component on screen: label (bold when `strong`), a small muted
// multi-line detail block, and a right-aligned value.
function drawCostRow(
  ctx: Ctx,
  state: { page: PDFPage; y: number },
  cols: readonly Col[],
  label: string,
  detail: string,
  value: string,
  opts?: { strong?: boolean; big?: boolean }
) {
  const size = opts?.big ? FONT_SIZE : FONT_SIZE - 1;
  const detailSize = FONT_SIZE - 2.5;
  const labelFont = opts?.strong ? ctx.bold : ctx.font;
  const wrapped = [wrapText(labelFont, label, size, cols[0].width - 6), detail ? wrapText(ctx.font, detail, detailSize, cols[1].width - 6) : [""], [value]];
  const maxLines = Math.max(1, ...wrapped.map((l) => l.length));
  const lineH = Math.max(ROW_LINE_H, detailSize + 3);
  const rowH = maxLines * lineH + ROW_V_PAD * 2;

  ensure(ctx, state, rowH);

  // Highlight the two headline totals (Total Taxable Value, Final Amount)
  // with the same light totals-row background Import Duty's PDF uses --
  // drawn before the text so it sits behind it.
  if (opts?.big) {
    state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width: tableWidth(cols), height: rowH, color: TOTAL_BG });
  }

  let x = MARGIN;
  // Label
  {
    const firstBaseline = state.y - ROW_V_PAD - size;
    wrapped[0].forEach((line, j) => state.page.drawText(line, { x: x + 3, y: firstBaseline - j * lineH, size, font: labelFont, color: INK }));
    x += cols[0].width;
  }
  // Detail (muted, smaller)
  {
    const firstBaseline = state.y - ROW_V_PAD - detailSize;
    wrapped[1].forEach((line, j) => state.page.drawText(line, { x: x + 3, y: firstBaseline - j * lineH, size: detailSize, font: ctx.font, color: MUTED }));
    x += cols[1].width;
  }
  // Value (right-aligned)
  {
    const valFont = opts?.strong ? ctx.bold : ctx.font;
    const vw = valFont.widthOfTextAtSize(value, size);
    const firstBaseline = state.y - ROW_V_PAD - size;
    state.page.drawText(value, { x: x + cols[2].width - 3 - vw, y: firstBaseline, size, font: valFont, color: INK });
  }

  if (opts?.strong) {
    state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width: tableWidth(cols), height: 0.75, color: BORDER });
  }
  state.y -= rowH;
}

function sectionHeading(ctx: Ctx, state: { page: PDFPage; y: number }, text: string) {
  const BAR_H = 16;
  ensure(ctx, state, BAR_H + 6);
  // The bar's TOP edge is `state.y` (the incoming cursor) -- it must never
  // extend above the cursor, or it draws over whatever row was just placed
  // above it (this bit us: a 2-line wrapped row directly above a section
  // header rendered with its second line underneath the header's bar).
  const barBottom = state.y - BAR_H;
  state.page.drawRectangle({ x: MARGIN, y: barBottom, width: tableWidth(costCols()), height: BAR_H, color: HEADER_BG });
  state.page.drawText(text, { x: MARGIN + 3, y: barBottom + 5, size: FONT_SIZE - 1, font: ctx.bold, color: INK });
  state.y = barBottom - 6;
}

function costCols(): Col[] {
  // Content width is 178mm (210mm page - 2x16mm margin). Item gets a bit
  // more room than a pure 1:2:1 split would give it -- several of the bold
  // "strong" totals rows (e.g. "Raw Material Cost — Signage (per sign)")
  // are label-only with no detail text, and were wrapping to 2 lines
  // unnecessarily at a narrower width.
  return [
    { label: "Item", width: mm(58), align: "left" },
    { label: "Detail", width: mm(85), align: "left" },
    { label: "Amount", width: mm(35), align: "right" },
  ];
}

export async function generateSignEstimatorPdf(data: SignEstimatorPdfData): Promise<Blob> {
  const doc = await PDFDocument.create();
  // Closest built-in serif to Cambria -- see file header note.
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);

  const ctx: Ctx = { doc, font, bold, ref: data.ref || "—", pageNumber: 0 };
  const state = newPage(ctx);
  const c = data.calc;
  const size = FONT_SIZE;
  const cols = costCols();

  // ---- Header ----
  state.page.drawText("MMDI ONE — Sign Estimator", { x: MARGIN, y: state.y, size: size + 4, font: bold, color: INK });
  state.y -= 15;
  state.page.drawText("Professional Costing System", { x: MARGIN, y: state.y, size: size - 2, font, color: MUTED });

  const refText = data.ref || "—";
  const refW = bold.widthOfTextAtSize(refText, size);
  state.page.drawText(refText, { x: PAGE_WIDTH - MARGIN - refW, y: state.y + 15, size, font: bold, color: INK });
  const dateText = formatLongDate(data.createdAt);
  const dateW = font.widthOfTextAtSize(dateText, size - 2);
  state.page.drawText(dateText, { x: PAGE_WIDTH - MARGIN - dateW, y: state.y, size: size - 2, font, color: MUTED });
  const clientText = `Client: ${data.client || "—"}`;
  const clientW = font.widthOfTextAtSize(clientText, size - 1);
  state.page.drawText(clientText, { x: PAGE_WIDTH - MARGIN - clientW, y: state.y - 12, size: size - 1, font, color: INK });
  state.y -= 20;
  state.page.drawLine({ start: { x: MARGIN, y: state.y }, end: { x: PAGE_WIDTH - MARGIN, y: state.y }, thickness: 0.75, color: BORDER });
  state.y -= 16;

  // ---- Sign Specification ----
  const areaSqft = ((c.widthMM / 304.8) * (c.heightMM / 304.8)).toFixed(2);
  const specLines = [
    `Category: ${c.categoryLabel}`,
    `Dimensions: ${c.dimW} x ${c.dimH} ${c.dimUnit}   |   Size: ${c.widthMM} x ${c.heightMM} mm   |   Area: ${areaSqft} sq.ft   |   Quantity: ${c.qty} pcs`,
  ];
  ensure(ctx, state, 34);
  state.page.drawText("SIGN SPECIFICATION", { x: MARGIN, y: state.y, size: size - 2, font: bold, color: MUTED });
  state.y -= 13;
  for (const line of specLines) {
    state.page.drawText(line, { x: MARGIN, y: state.y, size: size - 1, font, color: INK });
    state.y -= 13;
  }
  state.y -= 6;

  // ---- Section 1: Materials ----
  sectionHeading(ctx, state, "1. MATERIALS — PROFILE, BACKING SHEET, ACCESSORIES, LED");
  if (c.profile) {
    const profPerBarCost = c.profile.barsRequired > 0 ? c.profile.cost / c.profile.barsRequired : 0;
    const profRatePerRFT = c.profile.stockLenMM > 0 ? profPerBarCost / (c.profile.stockLenMM / 304.8) : 0;
    const profRatePerRM = c.profile.stockLenMM > 0 ? profPerBarCost / (c.profile.stockLenMM / 1000) : 0;
    const nestedNote = c.qty > 1 ? ` (nested across all ${c.qty} signs — ${fmtRupee(c.profile.cost)} total)` : "";
    drawCostRow(
      ctx,
      state,
      cols,
      "Profile",
      `${c.profile.name}\n${(c.profile.stockLenMM / 1000).toFixed(2)}m stock bar @ ${fmtRupee(profPerBarCost)}/bar (Rs.${profRatePerRFT.toFixed(2)}/RFT, Rs.${profRatePerRM.toFixed(2)}/RM) — ${c.profile.barsRequired} bar(s), ${c.profile.utilPct}% utilisation${nestedNote}`,
      fmtRupee(c.qty > 0 ? c.profile.cost / c.qty : 0)
    );
  }
  if (c.sheet) {
    const colorNote = c.sheet.color && c.sheet.color !== "—" ? ` — ${c.sheet.color}` : "";
    drawCostRow(
      ctx,
      state,
      cols,
      "Backing Sheet",
      `${c.sheet.name}${colorNote}\nRs.${c.sheet.costPerSqFt}/sq.ft x ${c.sheet.chargeableSqFt} sq.ft chargeable (${c.sheet.wastePct}% waste)`,
      fmtRupee(c.sheet.cost)
    );
  }
  if (c.accessories.length > 0) {
    drawCostRow(
      ctx,
      state,
      cols,
      "Accessories",
      c.accessories.map((a) => `${a.name} (${a.qty} ${a.unit})`).join(", "),
      fmtRupee(c.accessories.reduce((s, a) => s + a.lineCost, 0))
    );
  }
  if (c.led) {
    const ledDetail =
      c.led.mode === "bar"
        ? `${c.led.modelName}\n${c.led.numBars} bar(s), ${c.led.totalPieces} pieces — ${c.led.watt} W total`
        : `${c.led.modelName}\n${c.led.cols} x ${c.led.rows} grid, ${c.led.count} modules — ${c.led.watt} W total`;
    drawCostRow(ctx, state, cols, `LED ${c.led.mode === "bar" ? "Bars" : "Modules"}`, ledDetail, fmtRupee(c.led.cost));
  }
  if (c.driver) {
    drawCostRow(
      ctx,
      state,
      cols,
      "LED Driver",
      `Requirement ${c.driver.requiredW} W — ${c.driver.count} x ${c.driver.driverWatt}W selected (${c.driver.utilPct}% utilisation)`,
      fmtRupee(c.driver.cost)
    );
  }
  drawCostRow(ctx, state, cols, "Raw Material Cost — Signage (per sign)", "", fmtRupee(c.pricing.raw), { strong: true });
  state.y -= 6;

  // ---- Section 2: Cost Build-Up ----
  sectionHeading(ctx, state, "2. COST BUILD-UP — OVERHEADS, LABOUR, MARKUP");
  drawCostRow(ctx, state, cols, "Raw Material Cost", "", fmtRupee(c.pricing.raw));
  drawCostRow(ctx, state, cols, `Overhead (${c.pricing.ovhPct}%)`, "", fmtRupee(c.pricing.ovh));
  drawCostRow(ctx, state, cols, "Labour", "", fmtRupee(c.pricing.labour));
  drawCostRow(ctx, state, cols, "Signage Production Cost", "", fmtRupee(c.pricing.costAll), { strong: true });
  drawCostRow(
    ctx,
    state,
    cols,
    `Markup (${c.pricing.markupPct}%)`,
    "",
    fmtRupee((c.pricing.signageSell ?? c.pricing.sell) + c.pricing.discAmt - c.pricing.costAll)
  );
  if (c.pricing.discAmt > 0) {
    drawCostRow(ctx, state, cols, `Discount (${c.pricing.discPct}%)`, "", `-${fmtRupee(c.pricing.discAmt)}`);
  }
  drawCostRow(
    ctx,
    state,
    cols,
    "Signage Selling Price (ex-GST)",
    c.pricing.signagePriceBasis === "sqft" && c.pricing.signageRatePerSqft != null ? `Rs.${c.pricing.signageRatePerSqft}/sq.ft` : "",
    fmtRupee(c.pricing.signageSell ?? c.pricing.sell),
    { strong: true }
  );
  state.y -= 6;

  // ---- Section 3: Printing & Finishing ----
  sectionHeading(ctx, state, "3. PRINTING & FINISHING");
  if (c.print) {
    const prodNote = c.print.productionSqFt != null ? ` (production area ${c.print.productionSqFt} sq.ft, ref. only, not charged)` : "";
    drawCostRow(
      ctx,
      state,
      cols,
      "Print Media",
      `${c.print.mediaName} — ${c.print.finishingLabel}\n${c.print.sqFt} sq.ft chargeable${prodNote}`,
      fmtRupee(c.print.cost)
    );
  }
  drawCostRow(
    ctx,
    state,
    cols,
    "Printing Selling Price",
    c.pricing.printPriceBasis === "sqft" && c.pricing.printRatePerSqft != null ? `Rs.${c.pricing.printRatePerSqft}/sq.ft` : "",
    fmtRupee(c.pricing.printSell ?? 0),
    { strong: true }
  );
  drawCostRow(ctx, state, cols, "Packing & Forwarding", "", fmtRupee(c.pricing.shipping ?? 0), { strong: true });
  drawCostRow(ctx, state, cols, "Installation Selling Price", "", fmtRupee(c.pricing.installSell ?? 0), { strong: true });
  drawCostRow(
    ctx,
    state,
    cols,
    "Total — Printing, Packing & Forwarding, Installation",
    "",
    fmtRupee((c.pricing.printSell ?? 0) + (c.pricing.shipping ?? 0) + (c.pricing.installSell ?? 0)),
    { strong: true }
  );
  state.y -= 6;

  // ---- Section 4: Total Taxable Value, GST & Total ----
  sectionHeading(ctx, state, "4. TOTAL TAXABLE VALUE, GST & TOTAL");
  drawCostRow(ctx, state, cols, "Total Taxable Value (ex-GST)", "", fmtRupee(c.pricing.sell), { strong: true, big: true });
  drawCostRow(ctx, state, cols, `GST ${c.pricing.gstPct}%`, "", fmtRupee(c.pricing.gstAmt));
  drawCostRow(ctx, state, cols, "Final Amount (incl. GST)", "", fmtRupee(c.pricing.final), { strong: true, big: true });

  // ---- Footer note ----
  state.y -= 14;
  ensure(ctx, state, 14);
  const footerNote = `Generated by MMDI ONE Sign Estimator - ${formatLongDate(data.createdAt)} - This is a system-generated estimate`;
  const fw = font.widthOfTextAtSize(footerNote, size - 2.5);
  state.page.drawText(footerNote, { x: (PAGE_WIDTH - fw) / 2, y: state.y, size: size - 2.5, font, color: MUTED });

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
