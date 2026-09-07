// Pure parsing logic for MMDI's own Master Rate Card workbook (Apple's
// contract pricing, re-imported by MMDI whenever it's revised -- not
// season-scoped). The real file's header spans two rows (a group-label row
// -- "2023 - Approved Price" / "2026-Revised Price" / etc. -- above the
// actual per-column labels), so the header row itself has to be located
// rather than assumed to be row 1.

import { normalizeHeader } from "./parseDistributionBrief";

export type RateCardFieldKey =
  | "skuId"
  | "category"
  | "program"
  | "substrate"
  | "unit"
  | "widthMm"
  | "heightMm"
  | "billRate2023"
  | "revisedRate2026"
  | "gsmApprovalName"
  | "remarks";

export interface RateCardFieldDef {
  key: RateCardFieldKey;
  label: string;
  candidates: string[];
  required?: boolean;
}

// "Bill Rate" and "Revised Rate (INR) Each" are each unambiguous single
// columns in the real workbook, even though a couple of other header texts
// (e.g. "GSM Approval Name") repeat under both the 2023 and 2026 sections --
// autoMapRateCardHeaders below takes the first match for those, which is
// fine since the duplicated columns carry the same value either way.
export const RATE_CARD_FIELDS: RateCardFieldDef[] = [
  { key: "skuId", label: "SKU ID", candidates: ["sku id"], required: true },
  { key: "category", label: "Category", candidates: ["category"] },
  { key: "program", label: "Program", candidates: ["program"] },
  { key: "substrate", label: "Substrate", candidates: ["substrate"] },
  { key: "unit", label: "Unit", candidates: ["unit"] },
  { key: "widthMm", label: "Width (mm)", candidates: ["width (mm)"] },
  { key: "heightMm", label: "Height (mm)", candidates: ["height (mm)"] },
  { key: "billRate2023", label: "Bill Rate (2023)", candidates: ["bill rate"], required: true },
  { key: "revisedRate2026", label: "Revised Rate (2026)", candidates: ["revised rate (inr) each"] },
  { key: "gsmApprovalName", label: "GSM Approval Name", candidates: ["gsm approval name"] },
  { key: "remarks", label: "Remarks", candidates: ["remarks"] },
];

export type RateCardColumnMap = Partial<Record<RateCardFieldKey, number>>;

/** Scans the first several rows for the one that looks like a header row
 * (contains "SKU ID") -- the real workbook's true header is row 2, under a
 * group-label row. Returns its 0-based row index within `rows`, or -1. */
export function findRateCardHeaderRow(rows: unknown[][], maxScan = 5): number {
  for (let i = 0; i < Math.min(maxScan, rows.length); i++) {
    if (rows[i].some((c) => normalizeHeader(c) === "sku id")) return i;
  }
  return -1;
}

export function autoMapRateCardHeaders(headerRow: unknown[]): RateCardColumnMap {
  const normalized = headerRow.map(normalizeHeader);
  const map: RateCardColumnMap = {};
  for (const field of RATE_CARD_FIELDS) {
    const idx = normalized.findIndex((h) => field.candidates.includes(h));
    if (idx !== -1) map[field.key] = idx;
  }
  return map;
}

export function missingRequiredRateCardFields(map: RateCardColumnMap): RateCardFieldDef[] {
  return RATE_CARD_FIELDS.filter((f) => f.required && map[f.key] === undefined);
}

export interface RateCardParsedRow {
  skuId: string;
  category: string | null;
  program: string | null;
  substrate: string | null;
  unit: string | null;
  widthMm: number | null;
  heightMm: number | null;
  billRate2023: number | null;
  revisedRate2026: number | null;
  gsmApprovalName: string | null;
  remarks: string | null;
}

function textOf(row: unknown[], map: RateCardColumnMap, key: RateCardFieldKey): string | null {
  const idx = map[key];
  const v = idx === undefined ? undefined : row[idx];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numberOf(row: unknown[], map: RateCardColumnMap, key: RateCardFieldKey): number | null {
  const idx = map[key];
  const v = idx === undefined ? undefined : row[idx];
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function parseRateCardRows(dataRows: unknown[][], map: RateCardColumnMap): { rows: RateCardParsedRow[]; skippedRows: number } {
  const rows: RateCardParsedRow[] = [];
  let skippedRows = 0;
  for (const row of dataRows) {
    if (row.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    const skuId = textOf(row, map, "skuId");
    if (!skuId) {
      skippedRows++;
      continue;
    }
    rows.push({
      skuId,
      category: textOf(row, map, "category"),
      program: textOf(row, map, "program"),
      substrate: textOf(row, map, "substrate"),
      unit: textOf(row, map, "unit"),
      widthMm: numberOf(row, map, "widthMm"),
      heightMm: numberOf(row, map, "heightMm"),
      billRate2023: numberOf(row, map, "billRate2023"),
      revisedRate2026: numberOf(row, map, "revisedRate2026"),
      gsmApprovalName: textOf(row, map, "gsmApprovalName"),
      remarks: textOf(row, map, "remarks"),
    });
  }
  return { rows, skippedRows };
}
