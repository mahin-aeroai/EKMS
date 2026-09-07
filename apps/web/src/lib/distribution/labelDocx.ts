// Builds store-wise packing labels for a Distribution season -- one page
// per store/pool, printed and fixed to each packed box. Ports the one-off
// Fall 2026 label script (docx-js, reverse-engineered from Spring 2026's
// Word mail-merge template, DB_GPF_Store_Label_Spring_2026_01.docx) into a
// reusable in-app module -- Word output confirmed as the right format (not
// PDF), and A4 confirmed as the right page size (the Spring template
// itself is A4, not A5, despite the "A5" mentioned when this was scoped --
// see Srinivas's own "Label page size" answer, Sept 2026).

import { Document, Packer, Paragraph, TextRun, PageBreak, AlignmentType, UnderlineType } from "docx";
import { displayStoreName, type DistributionStoreWithItems } from "./types";

function partsLine(items: DistributionStoreWithItems["items"]): string {
  const byPart = new Map<string, number>();
  for (const it of items) {
    const key = it.part_number ?? "—";
    byPart.set(key, (byPart.get(key) ?? 0) + it.quantity);
  }
  return [...byPart.entries()].map(([part, qty]) => (qty > 1 ? `${part} x${qty}` : part)).join("  .  .  .  .  ");
}

export async function buildDistributionLabelsDocx(stores: DistributionStoreWithItems[]): Promise<Blob> {
  const sorted = [...stores].sort((a, b) => (a.sl_no ?? 0) - (b.sl_no ?? 0));
  const children: (Paragraph)[] = [];

  sorted.forEach((store, i) => {
    const totalUnits = store.items.reduce((n, it) => n + it.quantity, 0);
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `${store.sl_no ?? "—"}@${store.shipping_city ?? ""}`,
            bold: true,
            italics: true,
            underline: { type: UnderlineType.SINGLE },
            size: 18, // 9pt
            font: "Calibri",
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: displayStoreName(store.store_name, store.shipping_city),
            bold: true,
            underline: { type: UnderlineType.SINGLE },
            size: 44, // 22pt
            font: "Calibri",
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "SFO ID: ", size: 44, font: "Calibri" }),
          new TextRun({ text: store.sfo_id, size: 44, font: "Calibri" }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Apple ID: ", size: 44, font: "Calibri" }),
          new TextRun({ text: store.apple_id ?? "—", bold: true, size: 44, font: "Calibri" }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Program: ", size: 44, font: "Calibri" }),
          new TextRun({ text: store.programme ?? "—", bold: true, size: 44, font: "Calibri" }),
        ],
      }),
      new Paragraph({
        spacing: { before: 200 },
        children: [
          new TextRun({ text: "Part #: ", bold: true, size: 36, font: "Calibri" }), // 18pt
          new TextRun({ text: partsLine(store.items), bold: true, size: 36, font: "Calibri" }),
        ],
      }),
      new Paragraph({
        spacing: { before: 200 },
        children: [new TextRun({ text: `Total units in this box: ${totalUnits}`, italics: true, size: 20, font: "Calibri" })], // 10pt
      })
    );
    if (i < sorted.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 in DXA
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1" margins
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
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
