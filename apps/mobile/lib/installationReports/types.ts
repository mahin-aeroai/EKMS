/**
 * Local draft shape for the installation-report mobile capture flow.
 *
 * Mirrors the DB schema in supabase-installation-reports-schema.sql, not the
 * web tool's SiteEntry/StorePictures (apps/web/src/lib/installationReport/pdfBuild.ts) --
 * that shape carries extra PDF-only fields (label, creativeName, installedByTeam,
 * installationStatus, quality-inspection fields) that have no column on
 * installation_report_site_entries. The mobile form only captures what the DB
 * can actually persist: fixture/material/sign type, size, remarks, and photos.
 * See plan section 4 step 6.
 *
 * PHOTO_KINDS is the single source of truth for the ten values
 * installation_report_photos.kind's CHECK constraint allows -- copied from
 * apps/web/src/app/api/installation-photos/upload-url/route.ts's own
 * STORE_LEVEL_KINDS/SITE_LEVEL_KINDS, which was itself checked against
 * pdfBuild.ts's StorePictures/SiteEntry keys. Every place that sends a `kind`
 * to the server imports this instead of retyping the list, so the three
 * copies (schema, web route, mobile) can't quietly drift.
 */

import * as Crypto from "expo-crypto";

export const STORE_LEVEL_KINDS = [
  "storeFullCover",
  "installationCloseUp",
  "streetView1",
  "streetView2",
] as const;

export const SITE_LEVEL_KINDS = [
  "mainSlide",
  "closeUp",
  "cornerTL",
  "cornerTR",
  "cornerBL",
  "cornerBR",
] as const;

export type StoreLevelKind = (typeof STORE_LEVEL_KINDS)[number];
export type SiteLevelKind = (typeof SITE_LEVEL_KINDS)[number];
export type PhotoKind = StoreLevelKind | SiteLevelKind;

export const ALL_PHOTO_KINDS: readonly PhotoKind[] = [...STORE_LEVEL_KINDS, ...SITE_LEVEL_KINDS];

export function isPhotoKind(value: string): value is PhotoKind {
  return (ALL_PHOTO_KINDS as readonly string[]).includes(value);
}

/** Upload/row-insert progress for one photo -- see submit.ts for how this drives idempotent retry. */
export type PhotoUploadStatus = "local" | "uploaded" | "done";

export interface DraftPhoto {
  /** Stable client-generated id -- becomes installation_report_photos.id (upsert key on submit). */
  id: string;
  kind: PhotoKind;
  /** file:// URI on native (under Paths.document); data: URI on web (see draftStore.ts). */
  uri: string;
  status: PhotoUploadStatus;
  /** Set once the PUT to R2 succeeds -- installation_report_photos.relative_path. */
  relativePath: string | null;
  capturedAt: string;
}

export interface DraftSite {
  /** Stable client-generated id -- becomes installation_report_site_entries.id. */
  id: string;
  siteIndex: number;
  fixtureType: string;
  material: string;
  signType: string;
  widthMm: number | null;
  heightMm: number | null;
  remarks: string;
  photos: Partial<Record<SiteLevelKind, DraftPhoto>>;
}

export interface DraftReport {
  /** Stable client-generated id -- becomes installation_reports.id. Also the draft's filename. */
  id: string;
  createdAt: string;
  updatedAt: string;

  storeId: string | null;
  storeName: string;
  address: string;
  sfoId: string;
  program: string;
  asmName: string;
  asmContact: string;

  seasonProgram: string;
  installationDate: string;
  teamId: string | null;
  teamName: string;

  storePhotos: Partial<Record<StoreLevelKind, DraftPhoto>>;
  sites: DraftSite[];

  /** "submitting" is a durable marker so a crash mid-submit resumes instead of restarting from scratch. */
  submitState: "editing" | "submitting" | "submitted";
}

export function emptyDraftSite(siteIndex: number): DraftSite {
  return {
    id: Crypto.randomUUID(),
    siteIndex,
    fixtureType: "",
    material: "",
    signType: "",
    widthMm: null,
    heightMm: null,
    remarks: "",
    photos: {},
  };
}

export function emptyDraftReport(id: string): DraftReport {
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    storeId: null,
    storeName: "",
    address: "",
    sfoId: "",
    program: "",
    asmName: "",
    asmContact: "",
    seasonProgram: "",
    installationDate: "",
    teamId: null,
    teamName: "",
    storePhotos: {},
    sites: [emptyDraftSite(1)],
    submitState: "editing",
  };
}

// ── Master-data row shapes (installation_report_* tables) ──────────────────

export interface InstallationStoreRow {
  id: string;
  store_name: string;
  address: string | null;
  sfo_id: string | null;
  program: string | null;
  no_of_sites: number | null;
  default_fixture_type: string | null;
  default_material: string | null;
  default_sign_type: string | null;
  asm_name: string | null;
  asm_contact: string | null;
}

export interface InstallationStoreSiteRow {
  id: string;
  site_index: number;
  fixture_type: string | null;
  material: string | null;
  sign_type: string | null;
  width_mm: number | null;
  height_mm: number | null;
}

export interface NamedMasterRow {
  id: string;
  name: string;
}
