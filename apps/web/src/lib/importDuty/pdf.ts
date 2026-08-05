// Builds the Import Duty / Landing Cost calculation PDF entirely
// client-side — same philosophy as Material Ordering's PDF generator
// (src/lib/materialOrdering/pdf.ts), whose page-setup/table/ensure()
// structure this is modeled on.
//
// Landscape A4 (was portrait) and a serif font, per the user's request for
// a more detailed, spreadsheet-like working paper. pdf-lib only ships the
// 14 standard PDF fonts (no Cambria among them, and embedding a real
// Cambria .ttf isn't something this sandbox can source/license) --
// StandardFonts.TimesRoman / TimesRomanBold is the closest built-in serif
// substitute, same family Cambria itself was designed to modernize.
//
// Per the user's "make this detailed including sizes etc.", this now
// prints THREE tables per shipment instead of one condensed table:
//   1. Line Items    -- the raw inputs (size, qty, currency, rate, exchange
//                        rate, resulting Inv. Value / Sq.Ft), so a reviewer
//                        can see exactly what was typed in.
//   2. Cost & Duty Breakdown -- Assessable Value, BCD/SW Cess/IGST (rate
//                        AND amount), Duty, Total Cost, Cost per Qty/Sq.Ft.
//   3. Apportioned Shipment Costs -- each line's share of the shipment-
//                        level Freight/Insurance/Freight-Ex-Works/Clearing
//                        Charges, which should sum back to the shipment
//                        totals shown near the top (an audit cross-check).
// This mirrors the on-screen Calculator tab's own split between a line's
// input fields and its computed "mini receipt".

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ImportDutyLine, ImportDutyStatus } from "@mmdi/shared/rows";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

// Landscape A4.
const PAGE_WIDTH = mm(297);
const PAGE_HEIGHT = mm(210);
const MARGIN = mm(16);
const FOOTER_H = mm(13);
const FONT_SIZE = 10;

const INK = rgb(0.08, 0.09, 0.11);
const MUTED = rgb(0.4, 0.42, 0.46);
const BORDER = rgb(0.8, 0.81, 0.84);
const HEADER_BG = rgb(0.94, 0.95, 0.96);
const TOTAL_BG = rgb(0.9, 0.93, 0.98);

// Same MMDI letterhead details as the Material Ordering / Estimate Builder
// PDFs (see those files' own MMDI constant) — this business's own fixed
// particulars, not user input.
const MMDI = {
  legalName: "Macromedia Digital Imaging Private Limited",
  address: "23B & 24, Phase 5, IDA – Cherlapally, Hyderabad – 500051",
  phone: "+91 40 2726 7777 / 8888",
  email: "info@mmdi.in",
  web: "www.mmdi.in",
};

export interface ImportDutyPdfData {
  ref: string;
  createdAt: string;
  status: ImportDutyStatus;
  supplier_name: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  bill_of_entry_no: string | null;
  bill_of_entry_date: string | null;
  notes: string | null;
  // Shipment-level costs -- see supabase-import-duty-schema.sql's header;
  // apportioned per line inside `lines` (apportioned_freight etc.).
  freight: number;
  freight_ex_works: number;
  clearing_charges: number;
  insurance: number;
  lines: ImportDutyLine[];
}

// Width and Length/Height each get their own column now (see Table 1
// below) -- this just formats one cell's value + unit, e.g. "2,600.00 mm".
function fmtSizeCell(value: number, uom: string): string {
  return `${fmtNum(value)} ${uom}`;
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
  return `${day}${ordinal(day)} ${month}, ${d.getFullYear()}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function fmtPercent(n: number): string {
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
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

const ROW_H = mm(8);
const ROW_LINE_H = FONT_SIZE - 1 + 3;
const ROW_V_PAD = 6;

function wrapRowCells(cols: readonly Col[], cells: string[], font: PDFFont, size: number): string[][] {
  return cells.map((text, i) => wrapParagraphs(font, text, size, cols[i].width - 6));
}

function rowHeightFor(wrapped: string[][]): number {
  const maxLines = Math.max(1, ...wrapped.map((l) => l.length));
  return maxLines <= 1 ? ROW_H : maxLines * ROW_LINE_H + ROW_V_PAD * 2;
}

function drawWrappedCells(page: PDFPage, cols: readonly Col[], wrapped: string[][], rowH: number, y: number, font: PDFFont, size: number) {
  let x = MARGIN;
  wrapped.forEach((lines, i) => {
    const col = cols[i];
    const cellX = (text: string) => (col.align === "right" ? x + col.width - 3 - font.widthOfTextAtSize(text, size) : x + 3);
    if (lines.length <= 1) {
      const text = lines[0] ?? "";
      page.drawText(text, { x: cellX(text), y: y - rowH / 2 - size / 2 + 1, size, font, color: INK });
    } else {
      const firstBaseline = y - ROW_V_PAD - size;
      lines.forEach((line, j) => {
        page.drawText(line, { x: cellX(line), y: firstBaseline - j * ROW_LINE_H, size, font, color: INK });
      });
    }
    x += col.width;
  });
}

function drawTableHeader(ctx: Ctx, state: { page: PDFPage; y: number }, cols: readonly Col[]) {
  const size = FONT_SIZE - 1;
  const labels = cols.map((c) => c.label);
  const wrapped = wrapRowCells(cols, labels, ctx.bold, size);
  const rowH = rowHeightFor(wrapped);
  ensure(ctx, state, rowH);
  const width = tableWidth(cols);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, color: HEADER_BG });
  drawWrappedCells(state.page, cols, wrapped, rowH, state.y, ctx.bold, size);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, borderColor: BORDER, borderWidth: 0.75 });
  state.y -= rowH;
}

function drawTableRow(ctx: Ctx, state: { page: PDFPage; y: number }, cols: readonly Col[], cells: string[]) {
  const size = FONT_SIZE - 1;
  const wrapped = wrapRowCells(cols, cells, ctx.font, size);
  const rowH = rowHeightFor(wrapped);

  const yBefore = state.y;
  ensure(ctx, state, rowH);
  if (state.y !== yBefore) {
    drawTableHeader(ctx, state, cols);
  }
  const width = tableWidth(cols);
  drawWrappedCells(state.page, cols, wrapped, rowH, state.y, ctx.font, size);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, borderColor: BORDER, borderWidth: 0.5 });
  state.y -= rowH;
}

function drawTotalsRow(ctx: Ctx, state: { page: PDFPage; y: number }, cols: readonly Col[], cells: string[]) {
  const size = FONT_SIZE - 1;
  const wrapped = wrapRowCells(cols, cells, ctx.bold, size);
  const rowH = rowHeightFor(wrapped);
  ensure(ctx, state, rowH);
  const width = tableWidth(cols);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, color: TOTAL_BG });
  drawWrappedCells(state.page, cols, wrapped, rowH, state.y, ctx.bold, size);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, borderColor: BORDER, borderWidth: 0.75 });
  state.y -= rowH;
}

function sectionHeading(ctx: Ctx, state: { page: PDFPage; y: number }, text: string) {
  ensure(ctx, state, 16);
  state.page.drawText(text, { x: MARGIN, y: state.y, size: FONT_SIZE, font: ctx.bold, color: INK });
  state.y -= 14;
}

// ---------------------------------------------------------------------
// Table 1 -- Line Items (the raw inputs, so a reviewer sees exactly what
// was typed in: size, qty, currency, rate, exchange rate).
// ---------------------------------------------------------------------
function lineItemCols(): Col[] {
  return [
    { label: "Product", width: mm(34), align: "left" },
    { label: "Sizing", width: mm(16), align: "left" },
    { label: "Width", width: mm(24), align: "right" },
    { label: "Length / Height", width: mm(26), align: "right" },
    { label: "Qty", width: mm(16), align: "right" },
    { label: "Currency", width: mm(16), align: "left" },
    { label: "Rate", width: mm(18), align: "right" },
    { label: "Exch. Rate", width: mm(18), align: "right" },
    { label: "Inv. Value (INR)", width: mm(24), align: "right" },
    { label: "Sq.Ft", width: mm(18), align: "right" },
  ];
}

// ---------------------------------------------------------------------
// Table 2 -- Cost & Duty Breakdown (the computed outputs: Assessable
// Value, each duty component's rate AND amount, Total Cost).
// ---------------------------------------------------------------------
function costBreakdownCols(): Col[] {
  return [
    { label: "Product", width: mm(34), align: "left" },
    { label: "Assessable Value (INR)", width: mm(26), align: "right" },
    { label: "BCD %", width: mm(14), align: "right" },
    { label: "BCD Amount (INR)", width: mm(20), align: "right" },
    { label: "SW Cess %", width: mm(16), align: "right" },
    { label: "SW Cess Amount (INR)", width: mm(22), align: "right" },
    { label: "Duty (INR)", width: mm(18), align: "right" },
    { label: "IGST %", width: mm(14), align: "right" },
    { label: "IGST Amount (INR)", width: mm(20), align: "right" },
    { label: "Total Cost (INR)", width: mm(24), align: "right" },
    { label: "Cost / Qty (INR)", width: mm(20), align: "right" },
    { label: "Cost / Sq.Ft (INR)", width: mm(20), align: "right" },
  ];
}

// ---------------------------------------------------------------------
// Table 3 -- Apportioned Shipment Costs (each line's share of the
// shipment-level Freight/Insurance/Freight-Ex-Works/Clearing Charges --
// should sum back to the shipment totals printed near the top).
// ---------------------------------------------------------------------
function apportionmentCols(): Col[] {
  return [
    { label: "Product", width: mm(34), align: "left" },
    { label: "Freight (INR)", width: mm(28), align: "right" },
    { label: "Insurance (INR)", width: mm(28), align: "right" },
    { label: "Freight, Ex Works (INR)", width: mm(32), align: "right" },
    { label: "Clearing Charges (INR)", width: mm(32), align: "right" },
  ];
}

export async function generateImportDutyPdf(data: ImportDutyPdfData): Promise<Blob> {
  const doc = await PDFDocument.create();
  // Closest built-in serif to Cambria -- see file header note.
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);

  const ctx: Ctx = { doc, font, bold, ref: data.ref || "—", pageNumber: 0 };
  const state = newPage(ctx);
  const contentW = PAGE_WIDTH - MARGIN * 2;
  const size = FONT_SIZE;

  // ---- Title / ref / date / status ----
  state.page.drawText("Import Duty & Landing Cost Calculation", { x: MARGIN, y: state.y, size: size + 4, font: bold, color: INK });
  state.y -= 22;
  state.page.drawText(`Ref: ${data.ref}`, { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 14;
  state.page.drawText(`Date: ${formatLongDate(data.createdAt)}`, { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 14;
  state.page.drawText(`Status: ${data.status === "final" ? "Final" : "Draft"}`, { x: MARGIN, y: state.y, size, font, color: MUTED });
  state.y -= 20;

  // ---- Shipment details block ----
  state.page.drawText("Supplier:", { x: MARGIN, y: state.y, size, font: bold, color: INK });
  const supplierLabelW = bold.widthOfTextAtSize("Supplier: ", size);
  state.page.drawText(data.supplier_name || "—", { x: MARGIN + supplierLabelW, y: state.y, size, font, color: INK });
  state.y -= 14;

  const detailLine1 = [`Invoice No: ${data.invoice_no || "—"}`, `Invoice Date: ${formatLongDate(data.invoice_date)}`].join("   |   ");
  state.page.drawText(detailLine1, { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 14;

  const detailLine2 = [
    `Bill of Entry No: ${data.bill_of_entry_no || "—"}`,
    `Bill of Entry Date: ${formatLongDate(data.bill_of_entry_date)}`,
  ].join("   |   ");
  state.page.drawText(detailLine2, { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 16;

  // ---- Shipment-level costs (apportioned per line -- see Table 3) ----
  const shipmentBits = [
    `Freight: Rs. ${fmtNum(data.freight)}`,
    `Freight (Ex Works): Rs. ${fmtNum(data.freight_ex_works)}`,
    `Clearing Charges: Rs. ${fmtNum(data.clearing_charges)}`,
    `Insurance: Rs. ${fmtNum(data.insurance)}`,
  ].join("   |   ");
  state.page.drawText(shipmentBits, { x: MARGIN, y: state.y, size: size - 1, font, color: MUTED });
  state.y -= 20;

  // Running totals, accumulated once while building Table 1/2/3 below.
  let totalInv = 0;
  let totalSqft = 0;
  let totalAssessable = 0;
  let totalBcd = 0;
  let totalSwCess = 0;
  let totalIgst = 0;
  let totalDuty = 0;
  let totalCost = 0;
  let totalFreight = 0;
  let totalInsurance = 0;
  let totalFreightExWorks = 0;
  let totalClearing = 0;

  // ---- Table 1: Line Items ----
  sectionHeading(ctx, state, "Line Items");
  const cols1 = lineItemCols();
  drawTableHeader(ctx, state, cols1);
  for (const l of data.lines) {
    totalInv += l.inv_value;
    totalSqft += l.sqft_total;
    const lengthCell = l.size_mode === "roll" ? fmtSizeCell(l.qty, l.length_uom) : fmtSizeCell(l.height, l.uom);
    drawTableRow(ctx, state, cols1, [
      l.product_name || "—",
      l.size_mode === "roll" ? "Roll" : "Pieces",
      fmtSizeCell(l.width, l.uom),
      lengthCell,
      fmtNum(l.qty),
      l.currency,
      fmtNum(l.rate),
      fmtNum(l.exchange_rate),
      fmtNum(l.inv_value),
      fmtNum(l.sqft_total),
    ]);
  }
  drawTotalsRow(ctx, state, cols1, ["TOTAL", "", "", "", "", "", "", "", fmtNum(totalInv), fmtNum(totalSqft)]);
  state.y -= 16;

  // ---- Table 2: Cost & Duty Breakdown ----
  sectionHeading(ctx, state, "Cost & Duty Breakdown");
  const cols2 = costBreakdownCols();
  drawTableHeader(ctx, state, cols2);
  for (const l of data.lines) {
    totalAssessable += l.assessable_value;
    totalBcd += l.bcd_amount;
    totalSwCess += l.sw_cess_amount;
    totalIgst += l.igst_amount;
    totalDuty += l.total_duty;
    totalCost += l.total_cost;
    drawTableRow(ctx, state, cols2, [
      l.product_name || "—",
      fmtNum(l.assessable_value),
      fmtPercent(l.bcd_percent),
      fmtNum(l.bcd_amount),
      fmtPercent(l.sw_cess_percent),
      fmtNum(l.sw_cess_amount),
      fmtNum(l.total_duty),
      fmtPercent(l.igst_percent),
      fmtNum(l.igst_amount),
      fmtNum(l.total_cost),
      fmtNum(l.cost_per_qty),
      fmtNum(l.cost_per_sqft),
    ]);
  }
  drawTotalsRow(ctx, state, cols2, [
    "TOTAL",
    fmtNum(totalAssessable),
    "",
    fmtNum(totalBcd),
    "",
    fmtNum(totalSwCess),
    fmtNum(totalDuty),
    "",
    fmtNum(totalIgst),
    fmtNum(totalCost),
    "",
    "",
  ]);
  state.y -= 16;

  // ---- Table 3: Apportioned Shipment Costs ----
  sectionHeading(ctx, state, "Apportioned Shipment Costs (per line)");
  const cols3 = apportionmentCols();
  drawTableHeader(ctx, state, cols3);
  for (const l of data.lines) {
    totalFreight += l.apportioned_freight;
    totalInsurance += l.apportioned_insurance;
    totalFreightExWorks += l.apportioned_freight_ex_works;
    totalClearing += l.apportioned_clearing_charges;
    drawTableRow(ctx, state, cols3, [
      l.product_name || "—",
      fmtNum(l.apportioned_freight),
      fmtNum(l.apportioned_insurance),
      fmtNum(l.apportioned_freight_ex_works),
      fmtNum(l.apportioned_clearing_charges),
    ]);
  }
  drawTotalsRow(ctx, state, cols3, ["TOTAL", fmtNum(totalFreight), fmtNum(totalInsurance), fmtNum(totalFreightExWorks), fmtNum(totalClearing)]);
  state.y -= 16;

  // ---- Duty breakdown summary ----
  ensure(ctx, state, 70);
  state.page.drawText("Duty breakdown", { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 14;
  const dutyBits = [
    `Total BCD: Rs. ${fmtNum(totalBcd)}`,
    `Total SW Cess: Rs. ${fmtNum(totalSwCess)}`,
    `Total Duty (BCD + Cess): Rs. ${fmtNum(totalDuty)}`,
    `Total IGST (GST): Rs. ${fmtNum(totalIgst)}`,
  ];
  for (const line of dutyBits) {
    ensure(ctx, state, 12);
    state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  state.y -= 8;

  ensure(ctx, state, 12);
  const blendedCostPerSqft = totalSqft > 0 ? totalCost / totalSqft : 0;
  state.page.drawText(`Blended Cost / Sq.Ft: Rs. ${fmtNum(blendedCostPerSqft)}`, { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 20;

  ensure(ctx, state, 20);
  state.page.drawText(`Grand Total Landed Cost: Rs. ${fmtNum(totalCost)}`, {
    x: MARGIN,
    y: state.y,
    size: size + 1,
    font: bold,
    color: INK,
  });
  state.y -= 20;

  // ---- Notes ----
  if (data.notes) {
    ensure(ctx, state, 30);
    state.page.drawText("Notes:", { x: MARGIN, y: state.y, size, font: bold, color: INK });
    state.y -= 13;
    for (const line of wrapText(font, data.notes, size, contentW)) {
      ensure(ctx, state, 12);
      state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
      state.y -= 12;
    }
    state.y -= 10;
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
