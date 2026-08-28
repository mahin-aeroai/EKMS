// LFG Connect: width/height unit helpers.
// =========================================
// `lfg_sites.width` / `.height` are stored in inches (unchanged -- every
// existing New Site form, import, and backfill writes inches). The Site
// Master and partner Sites list both display size two ways per task #50:
// a whole-number millimetre value per axis (Width (mm) / Height (mm), 0
// decimals -- installers and print vendors think in mm, not fractional
// inches) and a single combined "Size (in)" column showing the original
// inches figure as `WxH`, since that's still the unit used when talking to
// Apple/format teams. Kept as tiny shared helpers rather than duplicated
// inline math so the rounding rule (0 decimals, always) can't drift
// between the two screens that use it.

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

/** Combined "WxH" size in the original inches values, each rounded to at
 * most 2 decimals (see formatDecimal). "—" if either axis is missing,
 * rather than a misleading "12x—". */
export function formatSizeInches(width: number | null | undefined, height: number | null | undefined): string {
  if (width === null || width === undefined || height === null || height === undefined) return "—";
  return `${Math.round(width * 100) / 100}x${Math.round(height * 100) / 100}`;
}

/** Combined "W × H" size in whole millimetres (see formatMm) -- Site
 * Cards' "Size (mm)" field (task #76). "—" if either axis is missing,
 * same rule as formatSizeInches above. */
export function formatSizeMm(width: number | null | undefined, height: number | null | undefined): string {
  if (width === null || width === undefined || height === null || height === undefined) return "—";
  return `${formatMm(width)} × ${formatMm(height)} mm`;
}
