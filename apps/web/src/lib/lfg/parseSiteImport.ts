// Pure parsing/pivot logic for LFG Connect's bulk Site Master import -- no
// browser or Supabase APIs here, so this can be exercised independently of
// the import UI. See LfgSiteImportClient.tsx for the file-reading caller.
//
// 11 Sept 2026: task feedback -- "i want to add some site in lfg connect
// wat is the best way can i give excel or csv file/" -- clarified via
// AskUserQuestion as a permanent Bulk Import feature, not a one-off. Mirrors
// apps/web/src/lib/distribution/parseDistributionBrief.ts's established
// shape (FieldDef[] with header-matching `candidates`, normalizeHeader,
// autoMapHeaders, missingRequiredFields, ColumnMap, cell/textOf/numberOf
// helpers) so this app has exactly one spreadsheet-import pattern, not two.
//
// Unlike the Distribution Brief (one row per store x part-number), an LFG
// site import sheet is one row per SITE (display) -- new/page.tsx's own
// "New Store" vs "Add Display to Existing Store" two-mode split is what
// this mirrors: rows are grouped by SFO ID, and each group becomes either
// one new lfg_stores row (+ one lfg_sites row per row in the group) or,
// when the SFO ID already matches a store on file, additional lfg_sites
// rows attached to that existing store (store-level fields reused from the
// existing store, exactly like the manual form's Add Display mode). Rows
// with a blank SFO ID can't be grouped -- each becomes its own new store,
// same as leaving SFO ID blank on the manual form.

export interface LfgSiteFieldDef {
  key: LfgSiteFieldKey;
  label: string;
  /** Normalized (see normalizeHeader) header strings this field auto-matches. */
  candidates: string[];
  /** Required for a usable import -- missing this column blocks the confirm step. */
  required?: boolean;
  /** Store-level (lives on lfg_stores, shared by every display at that SFO ID)
   *  vs site-level (lives only on the individual lfg_sites row). Drives which
   *  row's value wins when grouping (first row in a new-store group) vs
   *  which value is asked per-row (site-level fields are read every row). */
  storeLevel?: boolean;
}

export type LfgSiteFieldKey =
  | "outletName"
  | "format"
  | "sfoId"
  | "city"
  | "region"
  | "storeAddress"
  | "partnerName"
  | "asmName"
  | "asmMobile"
  | "asmEmail"
  | "escalationEmail"
  | "programName"
  | "material"
  | "matCode"
  | "numberOfSites"
  | "width"
  | "height"
  | "bleed"
  | "sqft"
  | "remarks";

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Candidate lists mirror new/page.tsx's own field labels, with a few
// plausible alternate spellings for defensiveness -- the import UI's manual
// column-picker covers anything this list doesn't anticipate.
export const LFG_SITE_FIELDS: LfgSiteFieldDef[] = [
  { key: "outletName", label: "Outlet Name", candidates: ["outlet name", "store name", "outlet"], required: true, storeLevel: true },
  { key: "format", label: "Format", candidates: ["format"], storeLevel: true },
  { key: "sfoId", label: "SFO ID", candidates: ["sfo id", "sfo"], storeLevel: true },
  { key: "city", label: "City", candidates: ["city"], storeLevel: true },
  { key: "region", label: "Region", candidates: ["region"], storeLevel: true },
  { key: "storeAddress", label: "Store Address", candidates: ["store address", "address"], storeLevel: true },
  { key: "partnerName", label: "Partner", candidates: ["partner", "partner name"], storeLevel: true },
  { key: "asmName", label: "ASM Name", candidates: ["asm name", "asm"], storeLevel: true },
  { key: "asmMobile", label: "ASM Mobile", candidates: ["asm mobile", "asm phone", "asm contact"], storeLevel: true },
  { key: "asmEmail", label: "ASM Email", candidates: ["asm email"], storeLevel: true },
  { key: "escalationEmail", label: "Escalation Email", candidates: ["escalation email"], storeLevel: true },
  { key: "programName", label: "Program (Season)", candidates: ["program", "program (season)", "season"] },
  { key: "material", label: "Material", candidates: ["material"] },
  { key: "matCode", label: "Mat Code", candidates: ["mat code"] },
  { key: "numberOfSites", label: "Number of Sites", candidates: ["number of sites", "no of sites", "no. of sites"] },
  { key: "width", label: "Width", candidates: ["width"] },
  { key: "height", label: "Height", candidates: ["height"] },
  { key: "bleed", label: "Bleed", candidates: ["bleed"] },
  { key: "sqft", label: "SQFT", candidates: ["sqft", "sq ft", "square feet"] },
  { key: "remarks", label: "Remarks", candidates: ["remarks", "notes"] },
];

export type ColumnMap = Partial<Record<LfgSiteFieldKey, number>>;

/** Auto-matches a raw header row's cells to our field keys by normalized text. */
export function autoMapHeaders(headerRow: unknown[]): ColumnMap {
  const normalized = headerRow.map(normalizeHeader);
  const map: ColumnMap = {};
  for (const field of LFG_SITE_FIELDS) {
    const idx = normalized.findIndex((h) => field.candidates.includes(h));
    if (idx !== -1) map[field.key] = idx;
  }
  return map;
}

export function missingRequiredFields(map: ColumnMap): LfgSiteFieldDef[] {
  return LFG_SITE_FIELDS.filter((f) => f.required && map[f.key] === undefined);
}

function cell(row: unknown[], map: ColumnMap, key: LfgSiteFieldKey): unknown {
  const idx = map[key];
  return idx === undefined ? undefined : row[idx];
}

function textOf(row: unknown[], map: ColumnMap, key: LfgSiteFieldKey): string | null {
  const v = cell(row, map, key);
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function numberOf(row: unknown[], map: ColumnMap, key: LfgSiteFieldKey): number | null {
  const v = cell(row, map, key);
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export interface SiteRow {
  rowIndex: number; // 0-based within dataRows, for error messages
  material: string | null;
  matCode: string | null;
  numberOfSites: number;
  width: number | null;
  height: number | null;
  bleed: number | null;
  sqft: number | null;
  remarks: string | null;
  programName: string | null;
}

export interface StoreGroup {
  groupKey: string;
  sfoId: string | null;
  outletName: string | null;
  format: string | null;
  city: string | null;
  region: string | null;
  storeAddress: string | null;
  partnerName: string | null;
  asmName: string | null;
  asmMobile: string | null;
  asmEmail: string | null;
  escalationEmail: string | null;
  sites: SiteRow[];
}

export interface ParseResult {
  groups: StoreGroup[];
  warnings: string[];
  totalRowsRead: number;
  skippedRows: number;
}

/**
 * Groups raw data rows (no header row) by SFO ID -- rows sharing a
 * non-blank SFO ID become multiple displays at one outlet (store-level
 * fields taken from the FIRST row seen for that SFO ID; which store those
 * end up attached to -- new vs an existing one already on file -- is
 * resolved later in the UI against the live lfg_stores list, since that
 * requires a Supabase read this pure function deliberately doesn't do).
 * Rows with a blank SFO ID can't be grouped and each become their own
 * single-site group, keyed by row index.
 */
export function parseLfgSiteRows(dataRows: unknown[][], map: ColumnMap): ParseResult {
  const warnings: string[] = [];
  const byGroupKey = new Map<string, StoreGroup>();
  let skippedRows = 0;

  dataRows.forEach((row, rowIndex) => {
    if (row.every((c) => c === null || c === undefined || String(c).trim() === "")) return;

    const outletName = textOf(row, map, "outletName");
    const sfoIdRaw = textOf(row, map, "sfoId");
    const sfoId = sfoIdRaw ? sfoIdRaw.trim() : null;

    if (!outletName && !sfoId) {
      // Nothing to identify this row's store by at all -- skip rather than
      // create a nameless store.
      skippedRows++;
      return;
    }

    const groupKey = sfoId ? `sfo:${sfoId.toLowerCase()}` : `row:${rowIndex}`;

    let group = byGroupKey.get(groupKey);
    if (!group) {
      group = {
        groupKey,
        sfoId,
        outletName,
        format: textOf(row, map, "format"),
        city: textOf(row, map, "city"),
        region: textOf(row, map, "region"),
        storeAddress: textOf(row, map, "storeAddress"),
        partnerName: textOf(row, map, "partnerName"),
        asmName: textOf(row, map, "asmName"),
        asmMobile: textOf(row, map, "asmMobile"),
        asmEmail: textOf(row, map, "asmEmail"),
        escalationEmail: textOf(row, map, "escalationEmail"),
        sites: [],
      };
      byGroupKey.set(groupKey, group);
    } else if (!group.outletName && outletName) {
      // First row in the group had a blank name (unusual but not fatal) --
      // adopt the first non-blank one seen instead of staying nameless.
      group.outletName = outletName;
    }

    group.sites.push({
      rowIndex,
      material: textOf(row, map, "material"),
      matCode: textOf(row, map, "matCode"),
      numberOfSites: numberOf(row, map, "numberOfSites") ?? 1,
      width: numberOf(row, map, "width"),
      height: numberOf(row, map, "height"),
      bleed: numberOf(row, map, "bleed"),
      sqft: numberOf(row, map, "sqft"),
      remarks: textOf(row, map, "remarks"),
      programName: textOf(row, map, "programName"),
    });
  });

  if (skippedRows > 0) {
    warnings.push(`${skippedRows} row(s) had no Outlet Name and no SFO ID and were skipped.`);
  }

  const groups = [...byGroupKey.values()].sort((a, b) => (a.outletName ?? "").localeCompare(b.outletName ?? ""));

  return { groups, warnings, totalRowsRead: dataRows.length, skippedRows };
}

/** Minimal CSV parser (quoted fields, embedded commas/newlines/escaped
 *  quotes) -- no CSV dependency exists in this repo (exceljs covers .xlsx
 *  only), and the format is simple enough not to warrant adding one just
 *  for this. Returns rows of raw string cells, header row included. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Trailing field/row (a file with no final newline).
  if (field !== "" || row.length > 0) endRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
