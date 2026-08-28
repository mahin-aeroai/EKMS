// Shared shape for the Site Survey Report Creator, matching
// supabase-site-survey-reports-schema.sql's two tables 1:1. Imported by the
// dashboard, the editor + every step component, the AI extraction route,
// and pdfBuild.ts, so the DB row shape, the extraction schema, and the PDF
// layout can never quietly drift from each other.
//
// Row types (SiteSurveyReportRow/SiteSurveyPhotoRow) use snake_case field
// names matching the DB columns 1:1 -- same convention as every other row
// type in this app (LfgSiteListRow, ProgramRow, etc.) -- rather than a
// camelCase TS shape needing a mapping layer at every query site. The two
// jsonb blobs (form_data, measurement) are free-form JSON, not SQL columns,
// so their OWN internal keys are camelCase for readability -- there's no
// snake_case pressure once you're inside a jsonb value.
//
// A "yes/no" field below is deliberately typed as YesNo ("yes" | "no" | "")
// rather than a boolean -- "" means genuinely unanswered (still needs
// input), which a boolean can't represent without an extra null check at
// every call site. Matches this feature's whole "never guess, leave blank
// if not present" extraction rule (see extraction.ts).

export type ReportStatus = "draft" | "extracting" | "review_required" | "ready" | "generated";
export type ReportSource = "pdf" | "manual";
export type YesNo = "yes" | "no" | "";

export type PhotoCategory =
  | "main_site"
  | "orientation_right"
  | "orientation_left"
  | "orientation_opposite"
  | "measurement"
  | "other";

export type PhotoSource = "uploaded" | "extracted_from_pdf";

// The ~15 one-off Q&A fields from the reference PDF's On-site details/Site
// suitability/Store description/Installation details/Additional details
// sections -- site_survey_reports.form_data. Every key present, empty
// string/YesNo "" when unanswered (never omitted -- FIELD_SOURCE_KEYS below
// needs every key to exist to drive the ✓/⚠/○ indicators).
export interface SiteSurveyFormData {
  storePersonContacted: string;
  printer: string;
  siteVisibility: YesNo;
  premiumLocation: YesNo;
  potentialIssues: string;
  siliconJoinsCondition: string;
  perspexCondition: string;
  lightingDescription: string;
  existingCreative: string;
  creativeRemovable: YesNo;
  additionalStoreNotes: string;
  installationDateTime: string;
  deliveryTimes: string;
  permitRequired: YesNo;
  permitDetails: string;
  generalNotes: string;
}

export function emptyFormData(): SiteSurveyFormData {
  return {
    storePersonContacted: "",
    printer: "",
    siteVisibility: "",
    premiumLocation: "",
    potentialIssues: "",
    siliconJoinsCondition: "",
    perspexCondition: "",
    lightingDescription: "",
    existingCreative: "",
    creativeRemovable: "",
    additionalStoreNotes: "",
    installationDateTime: "",
    deliveryTimes: "",
    permitRequired: "",
    permitDetails: "",
    generalNotes: "",
  };
}

// Every SiteSurveyFormData key, for iterating the form / building
// FIELD_SOURCE_KEYS below without repeating the list a third time.
export const FORM_DATA_KEYS = Object.keys(emptyFormData()) as (keyof SiteSurveyFormData)[];

// The reference PDF's "Site Photo and measurement" page -- one block per
// report (not repeating, unlike Installation Report's per-site array) --
// site_survey_reports.measurement.
export interface SiteSurveyMeasurement {
  visualWidthMm: number | null;
  visualHeightMm: number | null;
  materialWidthMm: number | null;
  materialHeightMm: number | null;
  bleedTopMm: number | null;
  bleedRightMm: number | null;
  bleedBottomMm: number | null;
  bleedLeftMm: number | null;
  materialType: string;
  installationType: string;
  equipmentDetail: string;
  equipmentSource: string;
  installedBy: string;
  measurementNotes: string;
  // FK-ish reference to the site_survey_photos row (category='measurement')
  // this measurement is drawn over -- kept here rather than solely inferred
  // from the photo's category, since a report could (rarely) have more than
  // one 'measurement'-category photo uploaded before settling on one.
  measurementPhotoId: string | null;
}

export function emptyMeasurement(): SiteSurveyMeasurement {
  return {
    visualWidthMm: null,
    visualHeightMm: null,
    materialWidthMm: null,
    materialHeightMm: null,
    bleedTopMm: 30,
    bleedRightMm: 30,
    bleedBottomMm: 30,
    bleedLeftMm: 30,
    materialType: "",
    installationType: "",
    equipmentDetail: "",
    equipmentSource: "",
    installedBy: "",
    measurementNotes: "",
    measurementPhotoId: null,
  };
}

// Every field name that can carry a ✓ auto-extracted / ⚠ needs confirmation
// / ○ blank indicator in the editor -- the header columns (snake_case, same
// as the row) plus every SiteSurveyFormData key (camelCase, same as
// form_data's own keys -- see header comment on the two naming styles).
// Doesn't cover Measurement fields (reviewed together as one block on the
// Measurements step, not field by field) or photos (their own `source`
// column already says uploaded vs extracted_from_pdf).
export const FIELD_SOURCE_KEYS = [
  "store_name",
  "address",
  "sfo_id",
  "program",
  "survey_date",
  "surveyor_name",
  ...FORM_DATA_KEYS,
] as const;

export type FieldSourceKey = (typeof FIELD_SOURCE_KEYS)[number];
export type FieldSource = "ai" | "user" | "";
export type FieldSources = Partial<Record<FieldSourceKey, FieldSource>>;

// One AI extraction run's page-level findings (see
// /api/site-survey-reports/[reportId]/extract) -- which fields it flagged
// for a closer look, and which PDF pages likely hold which category of
// photo. Persisted (site_survey_reports.extraction_meta, added by
// supabase-site-survey-reports-extraction-meta-migration.sql) so the
// Review step's banner and page-picker survive a reload, not just the
// session that ran extraction.
export interface ExtractionMeta {
  flagged: string[];
  pageHints: { page: number; likelyCategory: PhotoCategory; note: string }[];
}

// site_survey_reports -- one row per report.
export interface SiteSurveyReportRow {
  id: string;
  store_name: string;
  address: string;
  sfo_id: string;
  program: string;
  survey_date: string | null; // yyyy-mm-dd
  surveyor_name: string;
  status: ReportStatus;
  source: ReportSource;
  source_pdf_relative_path: string | null;
  form_data: SiteSurveyFormData;
  measurement: SiteSurveyMeasurement;
  field_sources: FieldSources;
  extraction_meta: ExtractionMeta | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  generated_at: string | null;
}

// Fields worth passing on an `insert` -- omits every DB-generated column
// (id, created_at, updated_at, created_by is set server-side by RLS
// context/left to default null and filled in by the caller from the
// signed-in user where needed).
export type NewSiteSurveyReport = Pick<SiteSurveyReportRow, "source"> &
  Partial<Omit<SiteSurveyReportRow, "id" | "created_at" | "updated_at" | "source">>;

export function emptyReportDefaults(source: ReportSource): NewSiteSurveyReport {
  return {
    source,
    store_name: "",
    address: "",
    sfo_id: "",
    program: "",
    survey_date: null,
    surveyor_name: "",
    status: "draft",
    source_pdf_relative_path: null,
    form_data: emptyFormData(),
    measurement: emptyMeasurement(),
    field_sources: {},
    extraction_meta: null,
    generated_at: null,
  };
}

// site_survey_photos -- one row per photo.
export interface SiteSurveyPhotoRow {
  id: string;
  report_id: string;
  category: PhotoCategory;
  relative_path: string;
  caption: string | null;
  sort_order: number;
  source: PhotoSource;
  original_page_number: number | null;
  // Fractional {x,y,w,h}, 0-1 relative to the image, only ever set on the
  // category="measurement" photo.
  annotation: { x: number; y: number; w: number; h: number } | null;
  created_at: string;
}

export const PHOTO_CATEGORY_LABEL: Record<PhotoCategory, string> = {
  main_site: "Main Site Photo",
  orientation_right: "Site Orientation — Right",
  orientation_left: "Site Orientation — Left",
  orientation_opposite: "Site Orientation — Opposite",
  measurement: "Site Measurement",
  other: "Other",
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  extracting: "Extraction in Progress",
  review_required: "Review Required",
  ready: "Ready",
  generated: "Generated",
};
