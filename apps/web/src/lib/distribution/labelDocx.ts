// Builds store-wise packing labels for a Distribution season -- two labels
// per A4 sheet (stacked, separated by a dashed cut line), printed and cut
// in half to fix to each packed box. Started as a one-off Fall 2026 label
// script (docx-js, reverse-engineered from Spring 2026's Word mail-merge
// template, DB_GPF_Store_Label_Spring_2026_01.docx); A4 confirmed as the
// right page size (the Spring template itself is A4, not A5, despite the
// "A5" mentioned when this was scoped -- see Srinivas's own "Label page
// size" answer, Sept 2026). Reworked (Sept 2026) per his direct feedback on
// the live-app output: no more dot-leader part-number line -- part numbers
// are laid out as a clean two-column grid -- and two labels now share one
// A4 sheet instead of one label per full sheet.

import {
  BorderStyle,
  Document,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  UnderlineType,
} from "docx";
import { isAgencySparesStore } from "./oversList";
import { displayStoreName, type DistributionStoreWithItems } from "./types";

// A4 in DXA, 0.5" margins on every side -- tighter than the old 1" margins
// so two labels comfortably share one sheet.
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
                      size: 20, // 10pt
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

/** One store's label content -- half of an A4 sheet. */
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
          size: 16, // 8pt
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
          size: 32, // 16pt
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "SFO ID: ", size: 22, font: "Calibri" }),
        new TextRun({ text: store.sfo_id, size: 22, font: "Calibri" }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Apple ID: ", size: 22, font: "Calibri" }),
        new TextRun({ text: store.apple_id ?? "—", bold: true, size: 22, font: "Calibri" }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Program: ", size: 22, font: "Calibri" }),
        new TextRun({ text: store.programme ?? "—", bold: true, size: 22, font: "Calibri" }),
      ],
    }),
    new Paragraph({
      spacing: { before: 140, after: 40 },
      children: [new TextRun({ text: "Part #:", bold: true, size: 20, font: "Calibri" })], // 10pt
    }),
    buildPartsTable(store.items),
    new Paragraph({
      spacing: { before: 140 },
      children: [new TextRun({ text: `Total units in this box: ${totalUnits}`, italics: true, size: 16, font: "Calibri" })], // 8pt
    }),
  ];
}

/** Dashed rule between the two labels sharing a sheet -- a cut guide. */
function cutLine(): Paragraph {
  return new Paragraph({
    spacing: { before: 260, after: 260 },
    border: { bottom: { style: BorderStyle.DASHED, size: 6, color: "999999", space: 4 } },
    children: [],
  });
}

export async function buildDistributionLabelsDocx(stores: DistributionStoreWithItems[]): Promise<Blob> {
  const sorted = [...stores].sort((a, b) => (a.sl_no ?? 0) - (b.sl_no ?? 0));

  // Group into pages: two ordinary stores share a sheet (cut in half), but
  // an Agency Spares pseudo-store gets a full page to itself -- its part
  // list runs to 50-75+ line items (it's a bulk hub manifest, not a single
  // box label), so pairing it with a normal store like every other pair
  // would blow past half a page and misalign every pairing after it.
  const pageGroups: DistributionStoreWithItems[][] = [];
  let pendingPair: DistributionStoreWithItems[] = [];
  for (const store of sorted) {
    if (isAgencySparesStore(store)) {
      if (pendingPair.length > 0) {
        pageGroups.push(pendingPair);
        pendingPair = [];
      }
      pageGroups.push([store]);
      continue;
    }
    pendingPair.push(store);
    if (pendingPair.length === 2) {
      pageGroups.push(pendingPair);
      pendingPair = [];
    }
  }
  if (pendingPair.length > 0) pageGroups.push(pendingPair);

  const children: (Paragraph | Table)[] = [];
  pageGroups.forEach((group, i) => {
    children.push(...buildStoreBlock(group[0]));
    if (group[1]) {
      children.push(cutLine());
      children.push(...buildStoreBlock(group[1]));
    }
    if (i < pageGroups.length - 1) {
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
