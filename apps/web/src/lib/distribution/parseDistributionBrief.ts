// Pure parsing/pivot logic for Apple's "Distribution Brief" sheet -- no
// browser or Supabase APIs here, so this can be exercised independently of
// the import UI. See DistributionImportClient.tsx for the exceljs-reading
// caller and supabase-distribution-schema.sql for the DB shape this feeds.
//
// The sheet is one row per (store x part number) -- the same grain as the
// reference DB_List.xlsx MMDI already builds by hand each season. "Club
// according to the distribution sheet store wise" (Srinivas's own words)
// is a group-by on SFO ID within the sheet.

export interface DistributionFieldDef {
  key: DistributionFieldKey;
  label: string;
  /** Normalized (see normalizeHeader) header strings this field auto-matches. */
  candidates: string[];
  /** Required for a usable import -- missing these blocks the confirm step. */
  required?: boolean;
}

export type DistributionFieldKey =
  | "sfoId"
  | "appleId"
  | "fixtureId"
  | "storeName"
  | "resellerName"
  | "programme"
  | "shippingCity"
  | "shippingAddress1"
  | "shippingAddress2"
  | "shippingAddress3"
  | "shippingState"
  | "shippingPostalCode"
  | "shippingCountry"
  | "posAddress1"
  | "posAddress2"
  | "posAddress3"
  | "posCity"
  | "posZip"
  | "partNumber"
  | "masterPartNumber"
  | "loc"
  | "quantity"
  | "itemType"
  | "itemTypeCosts"
  | "deliverableDescription"
  | "unitPrice"
  | "dispatchWave";

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Candidate lists are drawn from the real Apple "Distribution Brief" header
// row (MMDI_Q426_SEPT_IN_Fabric_Hero.xlsx, Fall 2026) -- a couple of
// plausible alternate spellings are included defensively in case Apple
// renames a column slightly next season; the import UI's manual-override
// dropdown covers anything this list doesn't anticipate.
export const DISTRIBUTION_FIELDS: DistributionFieldDef[] = [
  { key: "sfoId", label: "SFO ID", candidates: ["sfo id"], required: true },
  { key: "appleId", label: "Apple ID", candidates: ["apple id"] },
  { key: "fixtureId", label: "Fixture ID", candidates: ["fixture id"] },
  { key: "storeName", label: "Store Name", candidates: ["store name"] },
  { key: "resellerName", label: "Reseller Name", candidates: ["reseller name"] },
  { key: "programme", label: "Programme", candidates: ["programme", "program"] },
  { key: "shippingCity", label: "Shipping City", candidates: ["shipping city"], required: true },
  { key: "shippingAddress1", label: "Shipping Address Line 1", candidates: ["shipping address line 1"] },
  { key: "shippingAddress2", label: "Shipping Address Line 2", candidates: ["shipping address line 2"] },
  { key: "shippingAddress3", label: "Shipping Address Line 3", candidates: ["shipping address line 3"] },
  { key: "shippingState", label: "Shipping State/Province", candidates: ["state/province", "shipping state", "state"] },
  { key: "shippingPostalCode", label: "Shipping Postal Code", candidates: ["shipping postal code"] },
  { key: "shippingCountry", label: "Shipping Country", candidates: ["shipping country"] },
  { key: "posAddress1", label: "POS Address Line 1", candidates: ["pos address line 1"] },
  { key: "posAddress2", label: "POS Address Line 2", candidates: ["pos address line 2"] },
  { key: "posAddress3", label: "POS Address Line 3", candidates: ["pos address line 3"] },
  { key: "posCity", label: "POS City", candidates: ["pos city"] },
  { key: "posZip", label: "POS Zip", candidates: ["pos zip"] },
  { key: "partNumber", label: "Part Number", candidates: ["part number"], required: true },
  { key: "masterPartNumber", label: "Master Part Number", candidates: ["master part number"] },
  { key: "loc", label: "LOC", candidates: ["loc"] },
  { key: "quantity", label: "Quantity", candidates: ["quantity"], required: true },
  { key: "itemType", label: "Item type", candidates: ["item type"] },
  { key: "itemTypeCosts", label: "Item Type (Costs)", candidates: ["item type (costs)"] },
  { key: "deliverableDescription", label: "Deliverable Description", candidates: ["deliverable description"] },
  { key: "unitPrice", label: "Unit Price", candidates: ["unit price"] },
  { key: "dispatchWave", label: "Dispatch Wave", candidates: ["dispatch wave"] },
];

export type ColumnMap = Partial<Record<DistributionFieldKey, number>>;

/** Auto-matches a raw header row's cells to our field keys by normalized text. */
export function autoMapHeaders(headerRow: unknown[]): ColumnMap {
  const normalized = headerRow.map(normalizeHeader);
  const map: ColumnMap = {};
  for (const field of DISTRIBUTION_FIELDS) {
    const idx = normalized.findIndex((h) => field.candidates.includes(h));
    if (idx !== -1) map[field.key] = idx;
  }
  return map;
}

export function missingRequiredFields(map: ColumnMap): DistributionFieldDef[] {
  return DISTRIBUTION_FIELDS.filter((f) => f.required && map[f.key] === undefined);
}

function cell(row: unknown[], map: ColumnMap, key: DistributionFieldKey): unknown {
  const idx = map[key];
  return idx === undefined ? undefined : row[idx];
}

function textOf(row: unknown[], map: ColumnMap, key: DistributionFieldKey): string | null {
  const v = cell(row, map, key);
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numberOf(row: unknown[], map: ColumnMap, key: DistributionFieldKey): number | null {
  const v = cell(row, map, key);
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export interface PivotItem {
  partNumber: string | null;
  masterPartNumber: string | null;
  loc: string | null;
  itemType: string | null;
  itemTypeCosts: string | null;
  deliverableDescription: string | null;
  quantity: number;
  unitPrice: number | null;
  amount: number | null;
}

export interface PivotStore {
  slNo: number;
  sfoId: string;
  appleId: string | null;
  fixtureId: string | null;
  storeName: string | null;
  resellerName: string | null;
  programme: string | null;
  shippingCity: string | null;
  shippingAddress1: string | null;
  shippingAddress2: string | null;
  shippingAddress3: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  posAddress1: string | null;
  posAddress2: string | null;
  posAddress3: string | null;
  posCity: string | null;
  posZip: string | null;
  totalUnits: number;
  items: PivotItem[];
}

export interface ParseResult {
  stores: PivotStore[];
  dispatchWave: string | null;
  warnings: string[];
  totalRowsRead: number;
  skippedRows: number;
}

/**
 * Groups raw data rows (no header row) into one entry per SFO ID, in the
 * order first encountered, then sorts/numbers the result by Shipping City
 * then display store name -- same ordering the one-off Fall 2026 labels
 * script used, so a re-generated label set lines up with what's already
 * been delivered.
 */
export function parseDistributionBriefRows(dataRows: unknown[][], map: ColumnMap): ParseResult {
  const warnings: string[] = [];
  const bySfoId = new Map<string, PivotStore>();
  let dispatchWave: string | null = null;
  let skippedRows = 0;

  for (const row of dataRows) {
    // Skip fully-blank rows (trailing blank rows are common in Excel exports).
    if (row.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;

    const sfoId = textOf(row, map, "sfoId");
    if (!sfoId) {
      skippedRows++;
      continue;
    }

    if (!dispatchWave) {
      const wave = textOf(row, map, "dispatchWave");
      if (wave) dispatchWave = wave;
    }

    let store = bySfoId.get(sfoId);
    if (!store) {
      store = {
        slNo: 0,
        sfoId,
        appleId: textOf(row, map, "appleId"),
        fixtureId: textOf(row, map, "fixtureId"),
        storeName: textOf(row, map, "storeName"),
        resellerName: textOf(row, map, "resellerName"),
        programme: textOf(row, map, "programme"),
        shippingCity: textOf(row, map, "shippingCity"),
        shippingAddress1: textOf(row, map, "shippingAddress1"),
        shippingAddress2: textOf(row, map, "shippingAddress2"),
        shippingAddress3: textOf(row, map, "shippingAddress3"),
        shippingState: textOf(row, map, "shippingState"),
        shippingPostalCode: textOf(row, map, "shippingPostalCode"),
        shippingCountry: textOf(row, map, "shippingCountry"),
        posAddress1: textOf(row, map, "posAddress1"),
        posAddress2: textOf(row, map, "posAddress2"),
        posAddress3: textOf(row, map, "posAddress3"),
        posCity: textOf(row, map, "posCity"),
        posZip: textOf(row, map, "posZip"),
        totalUnits: 0,
        items: [],
      };
      bySfoId.set(sfoId, store);
    }

    const quantity = numberOf(row, map, "quantity") ?? 1;
    const unitPrice = numberOf(row, map, "unitPrice");
    store.items.push({
      partNumber: textOf(row, map, "partNumber"),
      masterPartNumber: textOf(row, map, "masterPartNumber"),
      loc: textOf(row, map, "loc"),
      itemType: textOf(row, map, "itemType"),
      itemTypeCosts: textOf(row, map, "itemTypeCosts"),
      deliverableDescription: textOf(row, map, "deliverableDescription"),
      quantity,
      unitPrice,
      amount: unitPrice !== null ? Math.round(unitPrice * quantity * 100) / 100 : null,
    });
    store.totalUnits += quantity;
  }

  if (skippedRows > 0) {
    warnings.push(`${skippedRows} row(s) had no SFO ID and were skipped.`);
  }

  const stores = [...bySfoId.values()].sort((a, b) => {
    const cityCmp = (a.shippingCity ?? "").localeCompare(b.shippingCity ?? "");
    if (cityCmp !== 0) return cityCmp;
    return (a.storeName ?? "").localeCompare(b.storeName ?? "");
  });
  stores.forEach((s, i) => {
    s.slNo = i + 1;
  });

  return { stores, dispatchWave, warnings, totalRowsRead: dataRows.length, skippedRows };
}
