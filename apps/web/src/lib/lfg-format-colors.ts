import { LFG_FORMAT_PRIORITY } from "./lfgStatus";

/**
 * Solid, single-tone color per store FORMAT (lfg_sites.format is free
 * text carried through from two legacy imports -- see
 * LFG_FORMAT_PRIORITY's own comment, not a controlled vocabulary).
 * Shared by the Site Cards reference-picture placeholder
 * (LfgSiteCardGrid.tsx) and the Programs summary card
 * (LfgProgramSummaryCard.tsx) so the same format always paints the same
 * color in both places, one definition instead of two that could drift.
 *
 * Sourced from the two approved brand boards ("Color palette No. 10 --
 * Atmospheric & Curated" and "Winter Mood"), keeping only their more
 * saturated entries -- the near-white and pale/taupe swatches on both
 * boards (Alabaster Grey, Snowdrift, Rose Quartz, Frost, Silver Birch,
 * ...) read as washed-out/muddy once painted behind a whole card, so only
 * the genuinely distinct blue-grey-to-navy/charcoal tones made the cut.
 * Flat colors only -- never a gradient. Known formats (APR, Mono AAR,
 * Croma, ...) get a fixed color from this list in LFG_FORMAT_PRIORITY's
 * own order (8 formats, one swatch each); anything else still gets a real
 * color (deterministic per format string, via a simple hash) rather than
 * falling back to grey.
 */
export const FORMAT_COLOR_PALETTE = [
  "#668196", // Slate Grey (Color palette No. 10)
  "#505B65", // Polar Night (Winter Mood)
  "#A1B4C0", // Icy Lake (Winter Mood)
  "#46697E", // steel blue
  "#1E252B", // near-black charcoal
  "#1B2C60", // deep navy
  "#5E6D76", // slate grey-blue
  "#726F76", // medium grey
];

export function formatPlaceholderColor(format: string | null): string {
  if (!format) return "#726F76"; // no format on file -- the palette's own neutral tone
  const f = format.trim().toLowerCase();
  const idx = LFG_FORMAT_PRIORITY.findIndex((keyword) => f.includes(keyword) || keyword.includes(f));
  if (idx !== -1) return FORMAT_COLOR_PALETTE[idx % FORMAT_COLOR_PALETTE.length];
  let hash = 0;
  for (let i = 0; i < format.length; i++) hash = (hash * 31 + format.charCodeAt(i)) >>> 0;
  return FORMAT_COLOR_PALETTE[hash % FORMAT_COLOR_PALETTE.length];
}

// The palette runs light (Icy Lake) to near-black (charcoal/navy) -- text
// or an icon drawn on top needs to flip between dark and white depending
// on how light the chosen swatch is, or it disappears on the paler ones.
export function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}
