// Fetches Apple's SF Pro Text font (the user's own licensed partner copy,
// never committed to this repo -- see /api/brand-assets/fonts/[weight]/
// signed-url's header comment for why) for embedding into the client-side
// generated report PDFs (Site Survey Report's pdfBuild.ts and Installation
// Report's own pdfBuild.ts), so every Apple-facing report this portal
// produces uses Apple's own typeface rather than Helvetica.
//
// Shared by both tools rather than living in either one's own lib folder,
// since it's a brand asset, not report-specific data -- same reasoning as
// this app's shared UserRoleContext/supabase helpers living outside any
// single tool's folder.
//
// Deliberately resilient: every failure mode (R2 not configured, the font
// object not yet uploaded, a network error, a corrupt/unreadable font
// file) resolves to `null` rather than throwing, so a PDF build never
// fails outright for a missing/broken font -- callers fall back to
// pdf-lib's built-in Helvetica (see each pdfBuild.ts's entry point). This
// mirrors the app's existing R2-optional conventions elsewhere (photo/PDF
// upload routes return a plain 503 rather than crashing when R2 env vars
// are unset).

const CACHE: Partial<Record<FontWeight, Promise<Uint8Array | null>>> = {};

export type FontWeight = "regular" | "semibold" | "italic";

async function fetchOne(weight: FontWeight): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`/api/brand-assets/fonts/${weight}/signed-url`);
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url?: string };
    if (!url) return null;

    const fontRes = await fetch(url);
    if (!fontRes.ok) return null;
    return new Uint8Array(await fontRes.arrayBuffer());
  } catch {
    return null;
  }
}

/** Fetches (and memoizes for the lifetime of the page) the raw bytes of one SF Pro Text weight. Returns null on any failure -- see file header comment. */
function getWeight(weight: FontWeight): Promise<Uint8Array | null> {
  if (!CACHE[weight]) CACHE[weight] = fetchOne(weight);
  return CACHE[weight];
}

export interface SfProTextFontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
  italic?: Uint8Array;
}

/**
 * Fetches SF Pro Text Regular + Semibold (used as this app's "bold" weight
 * -- Apple's own interfaces favour Semibold over true Bold for emphasis,
 * see pdfBuild.ts's MARK comment-adjacent note) and, when requested,
 * Italic. Resolves `null` -- never rejects -- when any requested weight
 * couldn't be loaded, so callers can do
 * `const fonts = await fetchSfProTextFontBytes(); buildXPdf(data, fonts)`
 * and rely on the pdfBuild entry point's own Helvetica fallback.
 */
export async function fetchSfProTextFontBytes(opts: { italic?: boolean } = {}): Promise<SfProTextFontBytes | null> {
  const [regular, bold, italic] = await Promise.all([getWeight("regular"), getWeight("semibold"), opts.italic ? getWeight("italic") : Promise.resolve(undefined)]);
  if (!regular || !bold) return null;
  if (opts.italic && !italic) return null;
  return { regular, bold, italic: italic ?? undefined };
}
