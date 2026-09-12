// Tracking Detail Report -- 12 Sept 2026 task (Mahin, verbatim): "New
// Module within distribution name it as Tracking Detail report ... fill
// and share the report of the below columns in excel file named:
// MMDI_Q426_FALL_Tracking_Master.xlsx" (with Frankie_Head_Report.xlsx
// attached as the grouping/SKU-matching requirements).
//
// The Tracking Master is Apple's own template: MMDI's full Distribution
// Brief data (34 columns already familiar from parseDistributionBrief.ts)
// plus ~16 tracking columns Apple wants filled in, plus a handful of
// Apple-template-only columns (Shipment Status, POD Date - Estimate,
// Transit Time - Actual, Counter, Brief Name, ...) that are NOT in
// Mahin's fill list and that this app has no data for at all.
//
// Rather than reconstruct all ~59 columns from the DB (distribution_items
// doesn't even carry several of the "already there" ones -- Vendor, Quote
// Reference, Merchandizing Language, Product, Ship Type, Shipping Contact
// Name/Phone -- since they were never needed for labels/ERP Input/Overs
// List), this works the other way: staff uploads the CURRENT
// MMDI_Q426_FALL_Tracking_Master.xlsx itself each time, this module fills
// in place just the target columns cell-by-cell (matched to the season's
// Group/City tracking data kept in the DB -- see distribution_tracking_entries
// below), and hands back the same workbook with everything else --
// formatting, every other column and value -- byte-for-byte untouched.
// That also sidesteps ever needing the uploaded file's row count to match
// whatever's in distribution_items exactly.
//
// NOTE (verified directly against the real MMDI_Q426_FALL_Tracking_Master.xlsx,
// header row of the "Tracking" sheet, 59 columns A-BG): every one of Mahin's
// 16 fill-in columns already exists as a real header EXCEPT "Estimate
// Number", which has no column at all in Apple's template. Rather than block
// on that, ensureWriteColumns() below adds any missing WRITE_COLUMNS target
// as a brand-new column (with a proper header) the first time it's needed --
// in practice that's just "Estimate Number" today, but it also means the
// module doesn't hard-fail if Apple's template drops/renames another target
// column in a future season.

import type ExcelJS from "exceljs";
import { normalizeHeader } from "./parseDistributionBrief";
import { cellPrimitive } from "./excelCellValue";

export type TrackingMasterColumnKey =
  | "itemTypeCosts"
  | "shippingCity"
  | "quantity"
  | "estimateNumber"
  | "deliveryNote"
  | "projectCode"
  | "courier"
  | "trackingNumber"
  | "dispatchDate"
  | "eta"
  | "podDate"
  | "podName"
  | "deliveryException"
  | "npitShippingCode"
  | "unitsShipped"
  | "unitsDelivered"
  | "transitTimeEstimate"
  | "quoteEstimate"
  | "unitPrice";

// "itemTypeCosts"/"shippingCity"/"quantity" are READ from the file (to
// resolve each row's Group and City); the rest are WRITE targets. Header
// text matched via normalizeHeader (case/whitespace-insensitive), against
// the real MMDI_Q426_FALL_Tracking_Master.xlsx header row -- a couple of
// defensive alternate spellings included in case Apple's template varies.
const HEADER_CANDIDATES: Record<TrackingMasterColumnKey, string[]> = {
  itemTypeCosts: ["item type (costs)"],
  shippingCity: ["shipping city"],
  quantity: ["quantity"],
  estimateNumber: ["estimate number"],
  deliveryNote: ["delivery note/ email contact", "delivery note / email contact", "delivery note/email contact"],
  projectCode: ["project code"],
  courier: ["courier"],
  trackingNumber: ["tracking number"],
  dispatchDate: ["dispatch date"],
  eta: ["eta"],
  podDate: ["pod date"],
  podName: ["pod name"],
  deliveryException: ["delivery exception"],
  npitShippingCode: ["npit shipping code"],
  unitsShipped: ["units shipped"],
  unitsDelivered: ["units delivered"],
  transitTimeEstimate: ["transit time (days) - estimate"],
  quoteEstimate: ["quote estimate"],
  unitPrice: ["unit price"],
};

// The exact header text to write when a WRITE_COLUMNS target isn't found in
// the uploaded file and has to be appended as a brand-new column. Exported
// so the UI can name which column(s) it added in a friendly toast.
export const CANONICAL_HEADER_LABEL: Record<TrackingMasterColumnKey, string> = {
  itemTypeCosts: "Item Type (Costs)",
  shippingCity: "Shipping City",
  quantity: "Quantity",
  estimateNumber: "Estimate Number",
  deliveryNote: "Delivery Note/ Email Contact",
  projectCode: "Project Code",
  courier: "Courier",
  trackingNumber: "Tracking number",
  dispatchDate: "Dispatch date",
  eta: "ETA",
  podDate: "POD Date",
  podName: "POD Name",
  deliveryException: "Delivery Exception",
  npitShippingCode: "NPIT Shipping Code",
  unitsShipped: "Units Shipped",
  unitsDelivered: "Units Delivered",
  transitTimeEstimate: "Transit Time (days) - Estimate",
  quoteEstimate: "Quote Estimate",
  unitPrice: "Unit Price",
};

// Must already exist in the uploaded file -- without these nothing can be
// matched to a Group/City at all, so a missing one blocks the import.
const READ_COLUMNS: TrackingMasterColumnKey[] = ["itemTypeCosts", "shippingCity", "quantity"];

// Fill targets -- if one of these isn't found in the uploaded file,
// ensureWriteColumns() appends it as a new column rather than failing.
const WRITE_COLUMNS: TrackingMasterColumnKey[] = [
  "estimateNumber",
  "deliveryNote",
  "projectCode",
  "courier",
  "trackingNumber",
  "dispatchDate",
  "eta",
  "podDate",
  "podName",
  "deliveryException",
  "npitShippingCode",
  "unitsShipped",
  "unitsDelivered",
  "transitTimeEstimate",
  "quoteEstimate",
  "unitPrice",
];

export type TrackingMasterColumnMap = Partial<Record<TrackingMasterColumnKey, number>>;

export interface TrackingMasterRow {
  rowNumber: number; // 1-based sheet row -- used to write back in place
  itemTypeCosts: string | null;
  shippingCity: string | null;
  quantity: number | null;
}

export interface TrackingMasterParseResult {
  columnMap: TrackingMasterColumnMap;
  missingColumns: TrackingMasterColumnKey[]; // READ_COLUMNS only -- blocks usability
  rows: TrackingMasterRow[];
}

/** Reads the header row (row 1) and every data row's itemTypeCosts/
 * shippingCity/quantity -- the three fields needed to resolve a row's
 * Group and look up its tracking entry. Does not read or care about any
 * of the ~59 columns this module doesn't touch, and does not mutate the
 * workbook -- see ensureWriteColumns() for that. */
export function parseTrackingMasterWorksheet(worksheet: ExcelJS.Worksheet): TrackingMasterParseResult {
  const headerCells = worksheet.getRow(1).values as ExcelJS.CellValue[];
  const normalized = headerCells.map((c) => normalizeHeader(cellPrimitive(c)));

  const columnMap: TrackingMasterColumnMap = {};
  const missingColumns: TrackingMasterColumnKey[] = [];
  const allKeys: TrackingMasterColumnKey[] = [...READ_COLUMNS, ...WRITE_COLUMNS];
  for (const key of allKeys) {
    const idx = normalized.findIndex((h) => HEADER_CANDIDATES[key].includes(h));
    if (idx === -1) {
      if (READ_COLUMNS.includes(key)) missingColumns.push(key);
    } else {
      columnMap[key] = idx;
    }
  }

  const rows: TrackingMasterRow[] = [];
  const lastRow = worksheet.actualRowCount || worksheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = worksheet.getRow(r);
    const itemTypeCostsRaw = columnMap.itemTypeCosts ? cellPrimitive(row.getCell(columnMap.itemTypeCosts).value) : null;
    const shippingCityRaw = columnMap.shippingCity ? cellPrimitive(row.getCell(columnMap.shippingCity).value) : null;
    const quantityRaw = columnMap.quantity ? cellPrimitive(row.getCell(columnMap.quantity).value) : null;
    const itemTypeCosts = itemTypeCostsRaw !== null ? String(itemTypeCostsRaw).trim() : "";
    const shippingCity = shippingCityRaw !== null ? String(shippingCityRaw).trim() : "";
    if (!itemTypeCosts && !shippingCity) continue; // fully blank row (trailing rows) -- skip
    const quantity = typeof quantityRaw === "number" ? quantityRaw : quantityRaw ? Number(quantityRaw) : null;
    rows.push({
      rowNumber: r,
      itemTypeCosts: itemTypeCosts || null,
      shippingCity: shippingCity || null,
      quantity: quantity !== null && Number.isFinite(quantity) ? quantity : null,
    });
  }

  return { columnMap, missingColumns, rows };
}

/** Appends any WRITE_COLUMNS target missing from columnMap as a brand-new
 * column at the end of the sheet (own header cell, own column letter) --
 * mutates the worksheet. Returns the updated column map plus which keys
 * were newly added, so the UI can tell the user "Estimate Number" (etc.)
 * was added to the workbook. Safe to call more than once (a no-op for
 * columns already present). */
export function ensureWriteColumns(
  worksheet: ExcelJS.Worksheet,
  columnMap: TrackingMasterColumnMap
): { columnMap: TrackingMasterColumnMap; addedColumns: TrackingMasterColumnKey[] } {
  const nextColumnMap: TrackingMasterColumnMap = { ...columnMap };
  const addedColumns: TrackingMasterColumnKey[] = [];
  let nextCol = worksheet.columnCount;
  for (const key of WRITE_COLUMNS) {
    if (nextColumnMap[key]) continue;
    nextCol += 1;
    worksheet.getCell(1, nextCol).value = CANONICAL_HEADER_LABEL[key];
    nextColumnMap[key] = nextCol;
    addedColumns.push(key);
  }
  return { columnMap: nextColumnMap, addedColumns };
}

/** One Group x Shipping City's worth of manually-entered tracking facts --
 * see distribution_tracking_entries. Estimate Number is stored here too
 * (repeated across every city under the same Group) even though it's
 * conceptually per-Group only -- the entry UI enforces keeping it in sync
 * across a Group's cities; see TrackingDetailClient.tsx. */
export interface TrackingEntryValues {
  estimateNumber: string | null;
  deliveryNote: string | null;
  courier: string | null;
  trackingNumber: string | null;
  dispatchDate: string | null; // ISO date (yyyy-mm-dd)
  eta: string | null;
  podDate: string | null;
  podName: string | null;
}

export function trackingEntryKey(groupName: string, shippingCity: string): string {
  return `${groupName.trim().toLowerCase()}||${shippingCity.trim().toLowerCase()}`;
}

export interface FillTrackingMasterOptions {
  projectCode: string | null;
  // item_type_costs (trimmed, lowercased) -> group name
  groupByItemTypeCosts: Map<string, string>;
  // trackingEntryKey(group, city) -> the entered tracking facts
  entryByGroupCity: Map<string, TrackingEntryValues>;
  // item_type_costs (trimmed, lowercased) -> resolved per-unit rate (already
  // joined through distribution_deliverable_groups -> distribution_rate_card)
  unitPriceByItemTypeCosts: Map<string, number>;
}

export interface FillTrackingMasterResult {
  rowsFilled: number;
  rowsUnmappedGroup: number; // itemTypeCosts had no Group mapping at all
  rowsNoTrackingEntry: number; // had a Group, but no entry yet for that Group x City
}

function setText(worksheet: ExcelJS.Worksheet, rowNumber: number, col: number | undefined, value: string | null) {
  if (!col) return;
  worksheet.getCell(rowNumber, col).value = value ?? "";
}

function setDate(worksheet: ExcelJS.Worksheet, rowNumber: number, col: number | undefined, iso: string | null) {
  if (!col) return;
  const cell = worksheet.getCell(rowNumber, col);
  if (!iso) {
    cell.value = "";
    return;
  }
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    cell.value = iso;
    return;
  }
  cell.value = d;
  // IMPORTANT: never do `cell.numFmt = ...` here. exceljs cells loaded from
  // an existing workbook commonly share ONE style object across every
  // blank cell with the same formatting (e.g. every untouched "General"
  // cell in a row) -- `cell.numFmt = x` mutates that shared object in
  // place, silently reformatting (and in testing, corrupting the value of)
  // every OTHER cell that happens to share it, including columns this
  // module never touches (verified against the real 8,837-row Tracking
  // Master: it turned column B "Fixture ID" into a #VALUE! date error).
  // Assigning a whole new style object to just this cell avoids mutating
  // the shared one.
  cell.style = { ...cell.style, numFmt: "dd-mmm-yyyy" };
}

/** Fills the 16 target columns in place, row by row, for every row parsed
 * by parseTrackingMasterWorksheet -- every other cell in the workbook
 * (every other column, every other sheet, formatting) is left exactly as
 * uploaded, since this only ever calls worksheet.getCell(...).value = on
 * the specific target columns (plus whatever ensureWriteColumns() appended
 * before this runs). Callers should call ensureWriteColumns() first and
 * pass its returned columnMap in via `parsed`. */
export function fillTrackingMasterWorksheet(
  worksheet: ExcelJS.Worksheet,
  parsed: TrackingMasterParseResult,
  opts: FillTrackingMasterOptions
): FillTrackingMasterResult {
  const { columnMap } = parsed;
  let rowsFilled = 0;
  let rowsUnmappedGroup = 0;
  let rowsNoTrackingEntry = 0;

  for (const row of parsed.rows) {
    const itemKey = row.itemTypeCosts?.trim().toLowerCase() ?? "";
    const groupName = itemKey ? opts.groupByItemTypeCosts.get(itemKey) : undefined;

    // Delivery Exception / NPIT Shipping Code are always "NA" per Mahin's
    // spec, regardless of Group/City mapping status.
    setText(worksheet, row.rowNumber, columnMap.deliveryException, "NA");
    setText(worksheet, row.rowNumber, columnMap.npitShippingCode, "NA");
    // Project Code is a single value for the whole file.
    setText(worksheet, row.rowNumber, columnMap.projectCode, opts.projectCode);

    if (!groupName) {
      rowsUnmappedGroup++;
      continue; // nothing else can be resolved without a Group
    }

    const unitPrice = opts.unitPriceByItemTypeCosts.get(itemKey);
    if (unitPrice !== undefined && columnMap.unitPrice) {
      worksheet.getCell(row.rowNumber, columnMap.unitPrice).value = unitPrice;
      if (row.quantity !== null && columnMap.quoteEstimate) {
        worksheet.getCell(row.rowNumber, columnMap.quoteEstimate).value = Math.round(unitPrice * row.quantity * 100) / 100;
      }
    }

    const cityKey = row.shippingCity ?? "";
    const entry = cityKey ? opts.entryByGroupCity.get(trackingEntryKey(groupName, cityKey)) : undefined;
    if (!entry) {
      rowsNoTrackingEntry++;
      continue;
    }

    setText(worksheet, row.rowNumber, columnMap.estimateNumber, entry.estimateNumber);
    setText(worksheet, row.rowNumber, columnMap.deliveryNote, entry.deliveryNote);
    setText(worksheet, row.rowNumber, columnMap.courier, entry.courier);
    setText(worksheet, row.rowNumber, columnMap.trackingNumber, entry.trackingNumber);
    setDate(worksheet, row.rowNumber, columnMap.dispatchDate, entry.dispatchDate);
    setDate(worksheet, row.rowNumber, columnMap.eta, entry.eta);
    setDate(worksheet, row.rowNumber, columnMap.podDate, entry.podDate);
    setText(worksheet, row.rowNumber, columnMap.podName, entry.podName);

    const hasDeliveryNote = !!entry.deliveryNote?.trim();
    if (hasDeliveryNote && row.quantity !== null) {
      if (columnMap.unitsShipped) worksheet.getCell(row.rowNumber, columnMap.unitsShipped).value = row.quantity;
      if (columnMap.unitsDelivered) worksheet.getCell(row.rowNumber, columnMap.unitsDelivered).value = row.quantity;
    }
    if (entry.dispatchDate && columnMap.transitTimeEstimate) {
      worksheet.getCell(row.rowNumber, columnMap.transitTimeEstimate).value = 2;
    }

    rowsFilled++;
  }

  return { rowsFilled, rowsUnmappedGroup, rowsNoTrackingEntry };
}
