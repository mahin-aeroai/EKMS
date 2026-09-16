// LFG Connect: width/height unit helpers.
// =========================================
// `lfg_sites.width` / `.height` are stored in inches internally
// (unchanged -- this was the original design and no data migration has
// ever been run on it). Every USER-FACING surface, though, is mm-only as
// of 16 Sept 2026 (task feedback: "admin site lfg sites sizes are in
// inches convert them into mm make all mm only no more inches") -- the
// Site 360 Edit form, the New Site form, and Bulk Import all now collect
// millimetres and convert to inches only at the moment they write to
// lfg_sites (mmToInches, right before the Supabase insert/update); every
// read path (Site Master, Site Cards, the Status Sheet, both Site 360
// views) converts the other way for display (formatMm/formatSizeMm).
// There used to also be an Inch/MM toggle on the New Site and Import
// forms, and a "Size (in)" combined column on the LFG partner home page's
// site table (formatSizeInches) -- all removed by that same task, so
// there's no surface left in the app where a real person ever sees or
// types an inches figure. Kept as tiny shared helpers rather than
// duplicated inline math so the rounding rule (0 decimals for display,
// 2 for values still being edited) can't drift between screens.

export const MM_PER_INCH = 25.4;

/** Convert an inches measurement to whole millimetres (0 decimals). Null/
 * undefined in, "—" out -- never show "0mm" for a value that's actually
 * just missing. */
export function formatMm(inches: number | null | undefined): string {
  if (inches === null || inches === undefined || Number.isNaN(inches)) return "—";
  return `${Math.round(inches * MM_PER_INCH)}`;
}

/** Round a raw number to at most 2 decimals -- the numeric counterpart of
 * formatDecimal() below, for values that stay numbers (form state, DB
 * writes) rather than becoming display strings. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** New Site form UOM toggle (task: "size give UOM mm / Inch") -- lfg_sites
 * .width/.height are always stored in inches regardless of which unit the
 * user entered in, so these convert at the form boundary only: mm ->
 * inches right before submit, inches -> mm (and back) when the toggle
 * itself is switched, so the physical size stays constant across a unit
 * switch rather than being reinterpreted. */
export function mmToInches(mm: number): number {
  return round2(mm / MM_PER_INCH);
}
export function inchesToMm(inches: number): number {
  return round2(inches * MM_PER_INCH);
}

/** Round any numeric field to at most 2 decimal places for display --
 * every raw measurement/quantity column (width, height, bleed, sqft,
 * measured survey dimensions, etc.) can come in from imports with long
 * floating-point tails (12.5000000001), and nothing past 2 decimals is
 * ever meaningful here. Never pads with trailing zeros (12 stays "12",
 * not "12.00") -- that's formatInr()'s job for money, this is for plain
 * quantities. Null/undefined -> "—".*/
export function formatDecimal(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return String(Math.round(n * 100) / 100);
}

/** Combined "W × H" size in whole millimetres (see formatMm) -- Site
 * Cards' "Size (mm)" field (task #76). "—" if either axis is missing. */
export function formatSizeMm(width: number | null | undefined, height: number | null | undefined): string {
  if (width === null || width === undefined || height === null || height === undefined) return "—";
  return `${formatMm(width)} × ${formatMm(height)} mm`;
}
