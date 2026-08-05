// Builds the Import Duty / Landing Cost calculation PDF entirely
// client-side — same philosophy as Material Ordering's PDF generator
// (src/lib/materialOrdering/pdf.ts), whose page-setup/table/ensure()
// structure this is modeled on. This document is internal-facing (a
// landed-cost working paper for the shipment, not a customer-facing
// quote), so it skips the custom Caladea font embedding and GST/tax math
// Estimate Builder's PDF needed — plain pdf-lib StandardFonts.Helvetica /
// HelveticaBold, no fontkit registration required.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ImportDutyLine, ImportDutyStatus } from "@mmdi/shared/rows";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

const PAGE_WIDTH = mm(210); // A4
const PAGE_HEIGHT = mm(297);
const MARGIN = mm(20);
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

// e.g. "1.2 m × 0.8 m" for a piece, "2.59 m wide (roll)" for a running-
// length material -- shown alongside the product name since there's no
// room for separate Width/Height/UOM columns in the compact table below.
function describeSize(l: ImportDutyLine): string {
  if (l.size_mode === "roll") {
    return `${fmtNum(l.qty)} ${l.length_uom} x ${fmtNum(l.width)} ${l.uom} wide (roll)`;
  }
  if (l.width > 0 || l.height > 0) {
    return `${fmtNum(l.width)} × ${fmtNum(l.height)} ${l.uom}`;
  }
  return "";
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

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  ref: string;
  pageNumber: number;
  cols: ReturnType<typeof tableCols>;
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

// Widths sum to 170mm = PAGE_WIDTH(210mm) - MARGIN(20mm) * 2. Only the
// figures a reviewer actually needs to sanity-check a line at a glance —
// duty-rate % and the apportioned freight/insurance/clearing breakdown are
// visible on-screen and in the History tab's expanded view, but would make
// this table unreadable, so this stays to the landed-cost chain: invoice
// value -> assessable value -> total duty -> total cost -> cost per unit /
// per sq.ft. The Product cell also carries the line's size (width x height
// or roll width) since there's no room for separate columns.
function tableCols() {
  return [
    { label: "Product", width: mm(34), align: "left" as const },
    { label: "Qty", width: mm(10), align: "right" as const },
    { label: "Sq.Ft", width: mm(13), align: "right" as const },
    { label: "Inv. Value (INR)", width: mm(19), align: "right" as const },
    { label: "Assessable Value (INR)", width: mm(20), align: "right" as const },
    { label: "Duty (INR)", width: mm(17), align: "right" as const },
    { label: "Total Cost (INR)", width: mm(21), align: "right" as const },
    { label: "Cost / Qty (INR)", width: mm(18), align: "right" as const },
    { label: "Cost / Sq.Ft (INR)", width: mm(18), align: "right" as const },
  ];
}

function tableWidth(cols: readonly { width: number }[]) {
  return cols.reduce((s, c) => s + c.width, 0);
}

const ROW_H = mm(8);
const ROW_LINE_H = FONT_SIZE - 1 + 3;
const ROW_V_PAD = 6;

function wrapRowCells(cols: readonly { width: number }[], cells: string[], font: PDFFont, size: number): string[][] {
  return cells.map((text, i) => wrapParagraphs(font, text, size, cols[i].width - 6));
}

function rowHeightFor(wrapped: string[][]): number {
  const maxLines = Math.max(1, ...wrapped.map((l) => l.length));
  return maxLines <= 1 ? ROW_H : maxLines * ROW_LINE_H + ROW_V_PAD * 2;
}

function drawWrappedCells(
  page: PDFPage,
  cols: readonly { width: number; align?: "left" | "right" }[],
  wrapped: string[][],
  rowH: number,
  y: number,
  font: PDFFont,
  size: number
) {
  let x = MARGIN;
  wrapped.forEach((lines, i) => {
    const col = cols[i];
    const cellX = (text: string) =>
      col.align === "right" ? x + col.width - 3 - font.widthOfTextAtSize(text, size) : x + 3;
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

function drawTableRow(ctx: Ctx, state: { page: PDFPage; y: number }, cells: string[]) {
  const size = FONT_SIZE - 1;
  const wrapped = wrapRowCells(ctx.cols, cells, ctx.font, size);
  const rowH = rowHeightFor(wrapped);

  const yBefore = state.y;
  ensure(ctx, state, rowH);
  if (state.y !== yBefore) {
    drawTableHeader(ctx, state);
  }
  const width = tableWidth(ctx.cols);
  drawWrappedCells(state.page, ctx.cols, wrapped, rowH, state.y, ctx.font, size);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, borderColor: BORDER, borderWidth: 0.5 });
  state.y -= rowH;
}

function drawTotalsRow(ctx: Ctx, state: { page: PDFPage; y: number }, cells: string[]) {
  const size = FONT_SIZE - 1;
  const wrapped = wrapRowCells(ctx.cols, cells, ctx.bold, size);
  const rowH = rowHeightFor(wrapped);
  ensure(ctx, state, rowH);
  const width = tableWidth(ctx.cols);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, color: TOTAL_BG });
  drawWrappedCells(state.page, ctx.cols, wrapped, rowH, state.y, ctx.bold, size);
  state.page.drawRectangle({ x: MARGIN, y: state.y - rowH, width, height: rowH, borderColor: BORDER, borderWidth: 0.75 });
  state.y -= rowH;
}

export async function generateImportDutyPdf(data: ImportDutyPdfData): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = { doc, font, bold, ref: data.ref || "—", pageNumber: 0, cols: tableCols() };
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

  const detailLine1 = [
    `Invoice No: ${data.invoice_no || "—"}`,
    `Invoice Date: ${formatLongDate(data.invoice_date)}`,
  ].join("   |   ");
  state.page.drawText(detailLine1, { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 14;

  const detailLine2 = [
    `Bill of Entry No: ${data.bill_of_entry_no || "—"}`,
    `Bill of Entry Date: ${formatLongDate(data.bill_of_entry_date)}`,
  ].join("   |   ");
  state.page.drawText(detailLine2, { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 16;

  // ---- Shipment-level costs (apportioned per line below) ----
  const shipmentBits = [
    `Freight: Rs. ${fmtNum(data.freight)}`,
    `Freight (Ex Works): Rs. ${fmtNum(data.freight_ex_works)}`,
    `Clearing Charges: Rs. ${fmtNum(data.clearing_charges)}`,
    `Insurance: Rs. ${fmtNum(data.insurance)}`,
  ].join("   |   ");
  state.page.drawText(shipmentBits, { x: MARGIN, y: state.y, size: size - 1, font, color: MUTED });
  state.y -= 18;

  // ---- Line items table ----
  drawTableHeader(ctx, state);
  let totalInv = 0;
  let totalSqft = 0;
  let totalAssessable = 0;
  let totalBcd = 0;
  let totalSwCess = 0;
  let totalIgst = 0;
  let totalDuty = 0;
  let totalCost = 0;
  for (const l of data.lines) {
    totalInv += l.inv_value;
    totalSqft += l.sqft_total;
    totalAssessable += l.assessable_value;
    totalBcd += l.bcd_amount;
    totalSwCess += l.sw_cess_amount;
    totalIgst += l.igst_amount;
    totalDuty += l.total_duty;
    totalCost += l.total_cost;
    const size = describeSize(l);
    drawTableRow(ctx, state, [
      size ? `${l.product_name || "—"} (${size})` : l.product_name || "—",
      String(l.qty),
      fmtNum(l.sqft_total),
      fmtNum(l.inv_value),
      fmtNum(l.assessable_value),
      fmtNum(l.total_duty),
      fmtNum(l.total_cost),
      fmtNum(l.cost_per_qty),
      fmtNum(l.cost_per_sqft),
    ]);
  }
  drawTotalsRow(ctx, state, [
    "TOTAL",
    "",
    fmtNum(totalSqft),
    fmtNum(totalInv),
    fmtNum(totalAssessable),
    fmtNum(totalDuty),
    fmtNum(totalCost),
    "",
    "",
  ]);
  state.y -= 16;

  // ---- Duty breakdown ----
  ensure(ctx, state, 60);
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
