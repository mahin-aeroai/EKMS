// Builds store-wise packing labels for a Distribution season -- one page
// per store/pool, printed and fixed to each packed box. Reproduces the same
// field layout as the one-off Fall 2026 `.docx` labels (built with docx-js,
// reverse-engineered from Spring 2026's Word mail-merge template) but via
// pdf-lib client-side, matching every other Tool's document-generation
// convention in this app (Installation Report / Site Survey Report /
// Cut File Tool all build PDFs entirely in the browser -- see
// installationReport/pdfBuild.ts's header comment).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { agencySparesDisplayName, displayStoreName, type DistributionItemRow, type DistributionStoreRow } from "./types";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

// A4 portrait, 1" margins -- matches the reference Word template and the
// one-off Fall 2026 docx build.
const PAGE_WIDTH = mm(210);
const PAGE_HEIGHT = mm(297);
const MARGIN = mm(25.4);

const INK = rgb(0.07, 0.07, 0.09);
const MUTED = rgb(0.4, 0.41, 0.45);

interface LabelStore extends DistributionStoreRow {
  items: DistributionItemRow[];
}

function partsLine(items: DistributionItemRow[]): string {
  // Group by part number in case the same SKU appears on more than one
  // Distribution Brief row for a store (rare, but the source data doesn't
  // guarantee uniqueness) -- same "PART x2" convention as the one-off
  // Fall 2026 labels script for a quantity greater than 1.
  const byPart = new Map<string, number>();
  for (const it of items) {
    const key = it.part_number ?? "—";
    byPart.set(key, (byPart.get(key) ?? 0) + it.quantity);
  }
  return [...byPart.entries()].map(([part, qty]) => (qty > 1 ? `${part} x${qty}` : part)).join("   .   .   .   .   ");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawLabelPage(page: PDFPage, font: PDFFont, bold: PDFFont, italic: PDFFont, store: LabelStore) {
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  let y = PAGE_HEIGHT - MARGIN;

  // Right-aligned "Sl No @ Shipping City", 9pt bold italic underline.
  const slLine = `${store.sl_no ?? "—"}@${store.shipping_city ?? ""}`;
  const slSize = 9;
  const slWidth = bold.widthOfTextAtSize(slLine, slSize);
  const slX = PAGE_WIDTH - MARGIN - slWidth;
  page.drawText(slLine, { x: slX, y, size: slSize, font: bold, color: INK });
  page.drawLine({ start: { x: slX, y: y - 1.5 }, end: { x: slX + slWidth, y: y - 1.5 }, thickness: 0.6, color: INK });
  y -= mm(10);

  // Store name, 22pt bold underline -- wraps if it's long.
  const storeName = displayStoreName(store.store_name, store.shipping_city);
  const nameSize = 22;
  const nameLines = wrapText(storeName, bold, nameSize, contentWidth);
  for (const line of nameLines) {
    page.drawText(line, { x: MARGIN, y, size: nameSize, font: bold, color: INK });
    const w = bold.widthOfTextAtSize(line, nameSize);
    page.drawLine({ start: { x: MARGIN, y: y - 3 }, end: { x: MARGIN + w, y: y - 3 }, thickness: 1, color: INK });
    y -= nameSize * 1.25;
  }
  y -= mm(2);

  const fieldSize = 22;
  function fieldLine(label: string, value: string) {
    page.drawText(label, { x: MARGIN, y, size: fieldSize, font, color: INK });
    const labelWidth = font.widthOfTextAtSize(label, fieldSize);
    page.drawText(value, { x: MARGIN + labelWidth, y, size: fieldSize, font: bold, color: INK });
    y -= fieldSize * 1.25;
  }

  fieldLine("SFO ID: ", store.sfo_id);
  fieldLine("Apple ID: ", store.apple_id ?? "—");
  fieldLine("Program: ", store.programme ?? "—");
  y -= mm(3);

  // Part # list, 18pt bold, dot-leader separated, wraps across lines. The
  // "Part #: " label is drawn as its own first line (simpler and plenty
  // legible than hanging the label into the first wrapped line) followed by
  // the wrapped part list.
  const partsSize = 18;
  page.drawText("Part #:", { x: MARGIN, y, size: partsSize, font: bold, color: INK });
  y -= partsSize * 1.3;
  const partsLines = wrapText(partsLine(store.items), bold, partsSize, contentWidth);
  for (const line of partsLines) {
    page.drawText(line, { x: MARGIN, y, size: partsSize, font: bold, color: INK });
    y -= partsSize * 1.3;
  }
  y -= mm(3);

  const totalUnits = store.items.reduce((n, it) => n + it.quantity, 0);
  page.drawText(`Total units in this box: ${totalUnits}`, { x: MARGIN, y, size: 10, font: italic, color: MUTED });
}

/** One label page per store, in `store.sl_no` order. */
export async function buildDistributionLabelsPdf(stores: LabelStore[]): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const sorted = [...stores].sort((a, b) => (a.sl_no ?? 0) - (b.sl_no ?? 0));
  for (const store of sorted) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawLabelPage(page, font, bold, italic, store);
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

export { agencySparesDisplayName };
