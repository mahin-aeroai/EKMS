// Builds the Material Purchase Request PDF entirely client-side — same
// philosophy as Estimate Builder (src/lib/estimateBuilder/pdf.ts), whose
// page-setup/table/ensure() structure this is modeled on. This document is
// internal-facing (a purchase request sent to a supplier, not a
// customer-facing quote), so it skips the custom Caladea font embedding and
// GST/tax math that file needed — plain pdf-lib StandardFonts.Helvetica /
// HelveticaBold, no fontkit registration required.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { MaterialOrderLine, MaterialOrderStatus } from "@mmdi/shared/rows";

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

// Same MMDI letterhead details as the Estimate Builder PDF (see that
// file's MMDI constant) — this business's own fixed particulars, not user
// input.
const MMDI = {
  legalName: "Macromedia Digital Imaging Private Limited",
  address: "23B & 24, Phase 5, IDA – Cherlapally, Hyderabad – 500051",
  phone: "+91 40 2726 7777 / 8888",
  email: "info@mmdi.in",
  web: "www.mmdi.in",
  signOffLine: "For MACROMEDIA DIGITAL IMAGING PVT. LTD.",
};

export interface MaterialOrderPdfSupplier {
  name: string;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
}

export interface MaterialOrderPdfData {
  ref: string;
  createdAt: string;
  status: MaterialOrderStatus;
  supplier: MaterialOrderPdfSupplier;
  programs: string[];
  notes: string | null;
  lines: MaterialOrderLine[];
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

// Human-readable "how much of this material is needed" figure, shown next
// to the pack size that consumption was converted into.
function consumptionLabel(line: MaterialOrderLine): string {
  if (line.consumption_unit === "linear_m") return `${line.total_consumption.toFixed(1)} m`;
  if (line.consumption_unit === "sqm") return `${line.total_consumption.toFixed(2)} sqm`;
  return "—";
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

// Widths sum to 170mm = PAGE_WIDTH(210mm) - MARGIN(20mm) * 2.
function tableCols() {
  return [
    { label: "Material", width: mm(52), align: "left" as const },
    { label: "Consumption Required", width: mm(35), align: "right" as const },
    { label: "Pack Size", width: mm(38), align: "left" as const },
    { label: "Packs Ordered", width: mm(20), align: "right" as const },
    { label: "Notes", width: mm(25), align: "left" as const },
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

export async function generateMaterialOrderPdf(data: MaterialOrderPdfData): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = { doc, font, bold, ref: data.ref || "—", pageNumber: 0, cols: tableCols() };
  const state = newPage(ctx);
  const contentW = PAGE_WIDTH - MARGIN * 2;
  const size = FONT_SIZE;

  // ---- Title / ref / date / status ----
  state.page.drawText("Material Purchase Request", { x: MARGIN, y: state.y, size: size + 4, font: bold, color: INK });
  state.y -= 22;
  state.page.drawText(`Ref: ${data.ref}`, { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 14;
  state.page.drawText(`Date: ${formatLongDate(data.createdAt)}`, { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 14;
  state.page.drawText(`Status: ${data.status === "sent" ? "Sent" : "Draft"}`, { x: MARGIN, y: state.y, size, font, color: MUTED });
  state.y -= 20;

  // ---- Supplier block ----
  state.page.drawText("To,", { x: MARGIN, y: state.y, size, font, color: INK });
  state.y -= 13;
  state.page.drawText(data.supplier.name, { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 13;
  if (data.supplier.address) {
    for (const line of wrapText(font, data.supplier.address, size, contentW)) {
      state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
      state.y -= 12;
    }
  }
  if (data.supplier.contact_person) {
    state.page.drawText(`Attn: ${data.supplier.contact_person}`, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  const contactBits = [data.supplier.phone ? `Ph: ${data.supplier.phone}` : null, data.supplier.email ? `Email: ${data.supplier.email}` : null]
    .filter(Boolean)
    .join("   |   ");
  if (contactBits) {
    state.page.drawText(contactBits, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  state.y -= 8;

  // ---- Programs included ----
  ensure(ctx, state, 30);
  state.page.drawText("Programs included:", { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 13;
  const programsText = data.programs.length > 0 ? data.programs.join(", ") : "—";
  for (const line of wrapText(font, programsText, size, contentW)) {
    ensure(ctx, state, 12);
    state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  state.y -= 10;

  const intro = "Please arrange to supply the following materials as per the pack sizes and quantities below.";
  for (const line of wrapText(font, intro, size, contentW)) {
    ensure(ctx, state, 12);
    state.page.drawText(line, { x: MARGIN, y: state.y, size, font, color: INK });
    state.y -= 12;
  }
  state.y -= 8;

  // ---- Line items table ----
  drawTableHeader(ctx, state);
  for (const l of data.lines) {
    drawTableRow(ctx, state, [
      l.material_name,
      consumptionLabel(l),
      l.pack_option?.label ?? "—",
      String(l.packs_ordered),
      l.notes ?? "—",
    ]);
  }
  state.y -= 16;

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

  // ---- Signing block ----
  ensure(ctx, state, 40);
  state.page.drawText(MMDI.signOffLine, { x: MARGIN, y: state.y, size, font: bold, color: INK });
  state.y -= 20;

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
