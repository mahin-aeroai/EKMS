// Builds the customer-facing Estimate PDF entirely client-side (same
// philosophy as Cut File Tool / Installation Report — see
// src/lib/installationReport/pdfBuild.ts) — no server round-trip.
//
// Layout is modeled directly on two real sample quotes the user shared
// (39_MMDI_IKEA_Worli_Mumbai_Quote... and 107_Quote_MMDI_Apple_Q4_2026...):
// Date / To / Attn / SUB / Quote No. block, a line-items table (Design,
// Product, Width/Height in cm AND inches, Qty, SQFT, Rate, Amount, Tax,
// Grand Total per line), "Prices" notes, Job Completion Time, Delivery
// time, Payment Schedule, a closing paragraph, and a signing block. The
// MMDI address/phone/email/web below and the "Naresh Kumar D" signatory
// name are transcribed straight out of that sample's own footer/signature
// block (word/footer1.xml + the signature image next to it) — these are
// MMDI's own fixed letterhead details, not something the customer/estimate
// varies, so they live here as constants rather than as form fields.
//
// NOTE: the sample doc has an actual scanned signature image sitting next
// to "(Naresh Kumar D)" — deliberately NOT reproduced here (a real
// person's handwritten signature getting auto-stamped onto every generated
// PDF is a different risk than it appearing once in a hand-made Word doc);
// this leaves a blank signature line above the printed name instead. Add
// an embedded signature image later if that's actually wanted.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;

const PAGE_WIDTH = mm(210); // A4
const PAGE_HEIGHT = mm(297);
const MARGIN = mm(20);
const FOOTER_H = mm(14);

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
  signatoryName: "Naresh Kumar D",
  signOffLine: "For MACROMEDIA DIGITAL IMAGING PVT. LTD.",
};

export interface EstimatePdfLine {
  productName: string;
  designName: string | null;
  description: string | null;
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
  createdAt: string;
  customerName: string;
  siteLegalEntityName: string | null;
  siteAddress: string | null;
  siteGstin: string | null;
  attentionPerson: string | null;
  quoteSubject: string | null;
  gstPercent: number;
  jobCompletionTime: string | null;
  deliveryCommitment: string | null;
  paymentTermsDays: number | null;
  notes: string | null;
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

function cmToIn(cm: number): number {
  return cm / 2.54;
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

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  logo: Awaited<ReturnType<PDFDocument["embedJpg"]>> | null;
  quoteNumber: string;
  pageNumber: number;
}

function drawFooter(ctx: Ctx, page: PDFPage) {
  const y = FOOTER_H;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: BORDER });
  const line = `${MMDI.legalName}   |   ${MMDI.address}   |   Ph.: ${MMDI.phone}   |   ${MMDI.email}   |   ${MMDI.web}`;
  const size = 7;
  page.drawText(line, { x: MARGIN, y: y - 12, size, font: ctx.font, color: MUTED });
  const right = `${ctx.quoteNumber}  ·  Page ${ctx.pageNumber}`;
  const rw = ctx.font.widthOfTextAtSize(right, size);
  page.drawText(right, { x: PAGE_WIDTH - MARGIN - rw, y: y - 12, size, font: ctx.font, color: MUTED });
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

// Widths sum to exactly 170mm = PAGE_WIDTH(210mm) - MARGIN(20mm) * 2, so
// the table always lands flush with both margins regardless of column
// count changes — recompute this sum if the column list is edited.
const TABLE_COLS = [
  { key: "product", label: "Design / Product", width: mm(38) },
  { key: "wcm", label: "W (cm)", width: mm(11) },
  { key: "hcm", label: "H (cm)", width: mm(11) },
  { key: "win", label: "W (in)", width: mm(11) },
  { key: "hin", label: "H (in)", width: mm(11) },
  { key: "qty", label: "Qty", width: mm(9) },
  { key: "sqft", label: "SQFT", width: mm(13) },
  { key: "rate", label: "Rate", width: mm(13) },
  { key: "amount", label: "Amount", width: mm(17) },
  { key: "tax", label: "Tax", width: mm(17) },
  { key: "grand", label: "Grand Total", width: mm(19) },
] as const;

function tableWidth() {
  return TABLE_COLS.reduce((s, c) => s + c.width, 0);
}

function drawTableHeader(ctx: Ctx, state: { page: PDFPage; y: number }) {
  const h = mm(9);
  ensure(ctx, state, h);
  let x = MARGIN;
  state.page.drawRectangle({ x: MARGIN, y: state.y - h, width: tableWidth(), height: h, color: HEADER_BG });
  const size = 6.5;
  for (const col of TABLE_COLS) {
    state.page.drawText(col.label, { x: x + 3, y: state.y - h + h / 2 - size / 2, size, font: ctx.bold, color: INK });
    x += col.width;
  }
  state.page.drawRectangle({ x: MARGIN, y: state.y - h, width: tableWidth(), height: h, borderColor: BORDER, borderWidth: 0.75 });
  state.y -= h;
}

function drawTableRow(ctx: Ctx, state: { page: PDFPage; y: number }, cells: string[], opts?: { bold?: boolean }) {
  const h = mm(8);
  ensure(ctx, state, h);
  if (state.y === PAGE_HEIGHT - MARGIN) drawTableHeader(ctx, state); // fresh page mid-table: repeat header first
  let x = MARGIN;
  const size = 6.5;
  const font = opts?.bold ? ctx.bold : ctx.font;
  cells.forEach((text, i) => {
    const col = TABLE_COLS[i];
    const lines = wrapText(font, text, size, col.width - 6);
    state.page.drawText(lines[0] ?? "", { x: x + 3, y: state.y - h / 2 - size / 2 + 1, size, font, color: INK });
    x += col.width;
  });
  state.page.drawRectangle({ x: MARGIN, y: state.y - h, width: tableWidth(), height: h, borderColor: BORDER, borderWidth: 0.5 });
  state.y -= h;
}

export async function generateEstimatePdf(data: EstimatePdfData): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: Awaited<ReturnType<PDFDocument["embedJpg"]>> | null = null;
  try {
    const res = await fetch("/brand/mmdi-logo.jpg");
    if (res.ok) logo = await doc.embedJpg(await res.arrayBuffer());
  } catch {
    // Logo is cosmetic — a missing/blocked fetch shouldn't stop the PDF.
  }

  const ctx: Ctx = { doc, font, bold, logo, quoteNumber: data.quoteNumber || "—", pageNumber: 0 };
  const state = newPage(ctx);
  const contentW = PAGE_WIDTH - MARGIN * 2;

  // ---- Date / To / Attn / SUB / Quote No. ----
  state.page.drawText(`Date: ${formatLongDate(data.createdAt)}`, { x: MARGIN, y: state.y, size: 10, font, color: INK });
  state.y -= 24;

  state.page.drawText("To,", { x: MARGIN, y: state.y, size: 10, font, color: INK });
  state.y -= 14;
  state.page.drawText(data.siteLegalEntityName || data.customerName, { x: MARGIN, y: state.y, size: 10, font: bold, color: INK });
  state.y -= 13;
  if (data.siteAddress) {
    for (const line of wrapText(font, data.siteAddress, 10, contentW)) {
      state.page.drawText(line, { x: MARGIN, y: state.y, size: 10, font, color: INK });
      state.y -= 13;
    }
  }
  if (data.siteGstin) {
    state.page.drawText(`GST: ${data.siteGstin}`, { x: MARGIN, y: state.y, size: 10, font, color: INK });
    state.y -= 13;
  }
  state.y -= 10;

  state.page.drawText("Dear Sir/Madam,", { x: MARGIN, y: state.y, size: 10, font, color: INK });
  state.y -= 20;

  if (data.attentionPerson) {
    state.page.drawText(`Attn: ${data.attentionPerson},`, { x: MARGIN, y: state.y, size: 10, font: bold, color: INK });
    state.y -= 14;
  }
  if (data.quoteSubject) {
    for (const line of wrapText(bold, `SUB: ${data.quoteSubject}`, 10, contentW)) {
      state.page.drawText(line, { x: MARGIN, y: state.y, size: 10, font: bold, color: INK });
      state.y -= 14;
    }
  }
  state.page.drawText(`Quote No.: ${data.quoteNumber}`, { x: MARGIN, y: state.y, size: 10, font: bold, color: INK });
  state.y -= 22;

  const intro =
    "With reference to the above subject requirement, we hereby feel pleasure in submitting our proposal for the supply of the below items as per the given specifications. Please find below quote for your kind approval.";
  for (const line of wrapText(font, intro, 10, contentW)) {
    state.page.drawText(line, { x: MARGIN, y: state.y, size: 10, font, color: INK });
    state.y -= 13;
  }
  state.y -= 8;

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
    drawTableRow(ctx, state, [
      [l.designName, l.productName].filter(Boolean).join(" — ") || l.productName,
      l.calcMode === "sqft" && l.widthCm ? l.widthCm.toFixed(1) : "—",
      l.calcMode === "sqft" && l.heightCm ? l.heightCm.toFixed(1) : "—",
      l.calcMode === "sqft" && l.widthCm ? cmToIn(l.widthCm).toFixed(2) : "—",
      l.calcMode === "sqft" && l.heightCm ? cmToIn(l.heightCm).toFixed(2) : "—",
      `${l.quantity} ${l.uom ?? ""}`.trim(),
      l.calcMode === "sqft" ? (l.sqftTotal ?? 0).toFixed(2) : "—",
      rupee(l.unitRate),
      rupee(amount),
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
    ["", "", "", "", "", "", "", "Totals", rupee(taxableTotal), rupee(gstAmount), rupee(grandTotal)],
    { bold: true }
  );
  state.y -= 16;

  ensure(ctx, state, 20);
  state.page.drawText(`Grand Total (INR): ${rupee(grandTotal)}`, { x: MARGIN, y: state.y, size: 11, font: bold, color: INK });
  state.y -= 26;

  // ---- Prices / Job completion / Delivery / Payment schedule ----
  const hasInstallation = data.lines.some((l) => l.installationRate > 0);
  ensure(ctx, state, 60);
  state.page.drawText("Prices:", { x: MARGIN, y: state.y, size: 10.5, font: bold, color: INK });
  state.y -= 15;
  const priceNotes = [
    "The quoted amount is only for supply in all respects as per details given above.",
    hasInstallation
      ? "Installation charges are included, itemized per line above."
      : "Installation charges are not included unless itemized separately above.",
  ];
  for (const note of priceNotes) {
    for (const line of wrapText(font, `•  ${note}`, 10, contentW)) {
      ensure(ctx, state, 13);
      state.page.drawText(line, { x: MARGIN, y: state.y, size: 10, font, color: INK });
      state.y -= 13;
    }
  }
  state.y -= 10;

  const closingBlocks: { heading: string; body: string }[] = [
    { heading: "JOB Completion Time:", body: data.jobCompletionTime || "To be confirmed on order confirmation." },
    { heading: "Delivery time:", body: data.deliveryCommitment || "To be confirmed on order confirmation." },
    {
      heading: "Payment Schedule:",
      body: data.paymentTermsDays ? `${data.paymentTermsDays} days from the date of supply.` : "To be confirmed.",
    },
  ];
  for (const block of closingBlocks) {
    ensure(ctx, state, 30);
    state.page.drawText(block.heading, { x: MARGIN, y: state.y, size: 10.5, font: bold, color: INK });
    state.y -= 14;
    for (const line of wrapText(font, block.body, 10, contentW)) {
      ensure(ctx, state, 13);
      state.page.drawText(line, { x: MARGIN, y: state.y, size: 10, font, color: INK });
      state.y -= 13;
    }
    state.y -= 8;
  }

  if (data.notes) {
    ensure(ctx, state, 30);
    state.page.drawText("Notes:", { x: MARGIN, y: state.y, size: 10.5, font: bold, color: INK });
    state.y -= 14;
    for (const line of wrapText(font, data.notes, 10, contentW)) {
      ensure(ctx, state, 13);
      state.page.drawText(line, { x: MARGIN, y: state.y, size: 10, font, color: INK });
      state.y -= 13;
    }
    state.y -= 8;
  }

  const closing =
    "We trust our offer is in line with your requirements. Further if you may feel like, contact us for any sort of clarification or assistance required. It shall be our pleasure to fulfill your requirements in the best possible manner always.";
  ensure(ctx, state, 40);
  for (const line of wrapText(font, closing, 10, contentW)) {
    ensure(ctx, state, 13);
    state.page.drawText(line, { x: MARGIN, y: state.y, size: 10, font, color: INK });
    state.y -= 13;
  }
  state.y -= 8;
  ensure(ctx, state, 15);
  state.page.drawText("Thanking and assuring you of our best services at all times.", { x: MARGIN, y: state.y, size: 10, font, color: INK });
  state.y -= 30;

  // ---- Signing block ----
  ensure(ctx, state, 90);
  if (ctx.logo) {
    const logoH = mm(15);
    const logoW = (ctx.logo.width / ctx.logo.height) * logoH;
    state.page.drawImage(ctx.logo, { x: MARGIN, y: state.y - logoH, width: logoW, height: logoH });
    state.y -= logoH + 6;
  }
  state.page.drawText(MMDI.signOffLine, { x: MARGIN, y: state.y, size: 10, font: bold, color: INK });
  state.y -= 40; // blank space for a wet/e-signature above the printed name
  state.page.drawText(`(${MMDI.signatoryName})`, { x: MARGIN, y: state.y, size: 10, font, color: INK });

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
