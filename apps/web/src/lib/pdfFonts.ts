// Fetches Apple's SF Pro Text font (the user's own licensed partner copy,
// never committed to this repo -- see /api/brand-assets/fonts/[weight]/
// signed-url's header comment for why) for embedding into the client-side
// generated report PDFs (Site Survey Report's pdfBuild.ts and Installation
// Report's own pdfBuild.ts), so every Apple-facing report this portal
// produces uses Apple's own typeface rather than Helvetica.
//
// Also fetches Apple SD Gothic Neo (see fetchAppleSdGothicNeoFontBytes
// below) -- Site Survey Report's Inspection Details pages specifically ask
// for this typeface by name, per the partner's own exact type spec.
// Apple's own system font, same "the partner's licensed copy, never
// committed to this repo" reasoning as SF Pro -- see
// /api/brand-assets/fonts/gothic-neo/[weight]/signed-url's header comment.
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
const GOTHIC_CACHE: Partial<Record<GothicWeight, Promise<Uint8Array | null>>> = {};

export type FontWeight = "regular" | "semibold" | "italic";
export type GothicWeight = "regular" | "bold";

async function fetchOne(path: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(path);
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
  if (!CACHE[weight]) CACHE[weight] = fetchOne(`/api/brand-assets/fonts/${weight}/signed-url`);
  return CACHE[weight];
}

/** Fetches (and memoizes for the lifetime of the page) the raw bytes of one Apple SD Gothic Neo weight. Returns null on any failure -- see file header comment. */
function getGothicWeight(weight: GothicWeight): Promise<Uint8Array | null> {
  if (!GOTHIC_CACHE[weight]) GOTHIC_CACHE[weight] = fetchOne(`/api/brand-assets/fonts/gothic-neo/${weight}/signed-url`);
  return GOTHIC_CACHE[weight];
}

export interface SfProTextFontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
  italic?: Uint8Array;
}

export interface AppleSdGothicNeoFontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
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

/**
 * Fetches Apple SD Gothic Neo Regular + true Bold (not Semibold-as-bold --
 * the partner's own spec for the pages that use this font explicitly says
 * "Bold", unlike this app's general SF Pro convention). Resolves `null` --
 * never rejects -- when either weight couldn't be loaded, so callers can
 * pass the result straight through to buildSiteSurveyReportPdf's own
 * `gothicNeoFonts` param and rely on its SF Pro/Helvetica fallback.
 */
export async function fetchAppleSdGothicNeoFontBytes(): Promise<AppleSdGothicNeoFontBytes | null> {
  const [regular, bold] = await Promise.all([getGothicWeight("regular"), getGothicWeight("bold")]);
  if (!regular || !bold) return null;
  return { regular, bold };
}
