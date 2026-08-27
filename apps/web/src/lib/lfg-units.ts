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

const MM_PER_INCH = 25.4;

/** Convert an inches measurement to whole millimetres (0 decimals). Null/
 * undefined in, "—" out -- never show "0mm" for a value that's actually
 * just missing. */
export function formatMm(inches: number | null | undefined): string {
  if (inches === null || inches === undefined || Number.isNaN(inches)) return "—";
  return `${Math.round(inches * MM_PER_INCH)}`;
}

/** Combined "WxH" size in the original inches values. "—" if either axis
 * is missing, rather than a misleading "12x—". */
export function formatSizeInches(width: number | null | undefined, height: number | null | undefined): string {
  if (width === null || width === undefined || height === null || height === undefined) return "—";
  return `${width}x${height}`;
}
