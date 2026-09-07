// Builds store-wise packing labels for a Distribution season -- one label
// per A4 page, printed and applied to each packed box. Started as a one-off
// Fall 2026 label script (docx-js, reverse-engineered from Spring 2026's
// Word mail-merge template, DB_GPF_Store_Label_Spring_2026_01.docx); A4
// confirmed as the right page size (the Spring template itself is A4, not
// A5, despite the "A5" mentioned when this was scoped -- see Srinivas's own
// "Label page size" answer, Sept 2026). Reworked (Sept 2026) per his direct
// feedback on the live-app output: no more dot-leader part-number line --
// part numbers are laid out as a clean two-column grid. Two-per-sheet
// pairing was tried and then explicitly reverted per Srinivas, after seeing
// the live-app output: "I need 1 lable per page" -- back to one label per
// full A4 page, keeping the no-dots grid and the big Calibri 22pt/18pt
// fonts from that same round of feedback.

import { Document, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType, UnderlineType, BorderStyle } from "docx";
import { displayStoreName, type DistributionStoreWithItems } from "./types";

// A4 in DXA, 0.5" margins on every side.
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN = 720;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PART_COLUMNS = 2;
const PART_COL_WIDTH = Math.floor(CONTENT_WIDTH / PART_COLUMNS);

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

function partEntries(items: DistributionStoreWithItems["items"]): [string, number][] {
  const byPart = new Map<string, number>();
  for (const it of items) {
    const key = it.part_number ?? "—";
    byPart.set(key, (byPart.get(key) ?? 0) + it.quantity);
  }
  return [...byPart.entries()];
}

/** A borderless, evenly-spaced grid of part numbers -- replaces the old
 * dot-leader single line, which Srinivas asked to remove ("organise the
 * partnumbers nicely"). Quantity > 1 shows as "PART x2" in the same cell,
 * same convention as before. */
function buildPartsTable(items: DistributionStoreWithItems["items"]): Table {
  const entries = partEntries(items);
  const rows: TableRow[] = [];
  for (let i = 0; i < entries.length; i += PART_COLUMNS) {
    const cells: TableCell[] = [];
    for (let c = 0; c < PART_COLUMNS; c++) {
      const entry = entries[i + c];
      cells.push(
        new TableCell({
          width: { size: PART_COL_WIDTH, type: WidthType.DXA },
          margins: { top: 30, bottom: 30, left: 0, right: 120 },
          borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
          children: [
            new Paragraph({
              children: entry
                ? [
                    new TextRun({
                      text: entry[1] > 1 ? `${entry[0]}  x${entry[1]}` : entry[0],
                      bold: true,
                      size: 36, // 18pt -- per Srinivas
                      font: "Calibri",
                    }),
                  ]
                : [],
            }),
          ],
        })
      );
    }
    rows.push(new TableRow({ children: cells }));
  }
  return new Table({
    width: { size: PART_COL_WIDTH * PART_COLUMNS, type: WidthType.DXA },
    columnWidths: Array(PART_COLUMNS).fill(PART_COL_WIDTH),
    borders: {
      top: NO_BORDER,
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
      insideHorizontal: NO_BORDER,
      insideVertical: NO_BORDER,
    },
    rows,
  });
}

/** One store's label content -- a full A4 page. */
function buildStoreBlock(store: DistributionStoreWithItems): (Paragraph | Table)[] {
  const totalUnits = store.items.reduce((n, it) => n + it.quantity, 0);
  return [
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
          size: 44, // 22pt -- big and prominent, per Srinivas
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
      spacing: { before: 140, after: 40 },
      children: [new TextRun({ text: "Part #:", bold: true, size: 36, font: "Calibri" })], // 18pt -- per Srinivas
    }),
    buildPartsTable(store.items),
    new Paragraph({
      spacing: { before: 140 },
      children: [new TextRun({ text: `Total units in this box: ${totalUnits}`, italics: true, size: 20, font: "Calibri" })], // 10pt
    }),
  ];
}

export async function buildDistributionLabelsDocx(stores: DistributionStoreWithItems[]): Promise<Blob> {
  const sorted = [...stores].sort((a, b) => (a.sl_no ?? 0) - (b.sl_no ?? 0));

  // One label per full A4 page -- per Srinivas's direct feedback on the
  // live-app output ("I need 1 lable per page"), reverting the earlier
  // two-per-sheet layout. Every store, Agency Spares pseudo-stores
  // included, gets its own page.
  const children: (Paragraph | Table)[] = [];
  sorted.forEach((store, i) => {
    children.push(...buildStoreBlock(store));
    if (i < sorted.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
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
