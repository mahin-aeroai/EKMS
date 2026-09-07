import type ExcelJS from "exceljs";

/** Reduces an exceljs cell value to a plain string/number/null regardless of
 * which shape it came in as -- a plain literal, a rich-text run list, a
 * formula cell (only its cached {result} matters here), a Date, or a
 * hyperlink object. Shared by every .xlsx import in this app (Distribution
 * Brief, Rate Card) so a formula-priced column (e.g. the Rate Card's
 * "Revised Rate" column, computed from other cells in the workbook) is
 * read the same way everywhere instead of silently stringifying to
 * "[object Object]". */
export function cellPrimitive(value: ExcelJS.CellValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join("");
    }
    if ("result" in value && value.result !== undefined) return cellPrimitive(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
      return (value as { text: string }).text;
    }
  }
  return String(value);
}
