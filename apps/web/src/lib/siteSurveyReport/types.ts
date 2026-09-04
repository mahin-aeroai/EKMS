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
  | "viewpoint_a"
  | "viewpoint_b"
  | "viewpoint_c"
  | "viewpoint_d"
  | "other";

export type PhotoSource = "uploaded" | "extracted_from_pdf";

export type StoreLocationType = "mall" | "retail_high_street" | "retail_park" | "other" | "";
export type SiteType = "permanent" | "temporary" | "";

// The survey company that did the inspection -- replaces the old free-text
// "Printer" field (see SiteSurveyFormData's own comment on that field's
// removal) with a closed choice of this business's two actual survey
// companies.
export type SurveyCompany = "mmdi" | "i_and_s" | "";
export const SURVEY_COMPANY_LABEL: Record<Exclude<SurveyCompany, "">, string> = {
  mmdi: "MMDI",
  i_and_s: "I&S",
};

// A simple "which side of the store" marker -- used for both "mark the
// store location" and "indicate position of the Apple program within the
// store" (see storeLocationMarker/appleProgramPositionMarker below), each
// rendered as a row of buttons (PositionMarkerRow in ReportFormFields.tsx)
// rather than free text, since the actual position is always one of these
// five relative to the store's own entrance.
export type PositionMarker = "front" | "back" | "left" | "right" | "center" | "";
export const POSITION_MARKER_LABEL: Record<Exclude<PositionMarker, "">, string> = {
  front: "Front",
  back: "Back",
  left: "Left",
  right: "Right",
  center: "Center",
};

// The Site/Store Information header's "Apple Program" field is locked to
// exactly these four values (see ReportFormFields.tsx's header SelectRow) --
// kept here as the single source of truth for that list rather than
// hardcoded again at each call site. The underlying column
// (SiteSurveyReportRow.program) stays a plain string, not a union of this
// type, since older/legacy rows may still carry a free-text value typed in
// before this lock existed.
export const APPLE_PROGRAM_OPTIONS = ["APP", "APR", "MonoAAR", "Multi AAR"] as const;

// Single-choice "which of these applies" button picker -- replaces four
// separate free-text count fields (Entrances Into the Mall / Into the
// Store, Floors Within the Mall / Within the Store) with ONE radio-style
// choice among exactly those four, per the requirement's own "Radio
// button: 1... 2... 3... 4..." wording.
export type EntranceFloorLocation = "entrances_into_mall" | "entrances_into_store" | "floors_within_mall" | "floors_within_store" | "";
export const ENTRANCE_FLOOR_LOCATION_LABEL: Record<Exclude<EntranceFloorLocation, "">, string> = {
  entrances_into_mall: "Entrances — Into the Mall",
  entrances_into_store: "Entrances — Into the Store",
  floors_within_mall: "Floors — Within the Mall",
  floors_within_store: "Floors — Within the Store",
};

// Locked choice of when deliveries can be made to the store -- replaces the
// old free-text "Delivery timings" field with exactly these three options.
export type DeliveryTiming = "store_open_timings" | "after_business_hours" | "24_7" | "";
export const DELIVERY_TIMING_LABEL: Record<Exclude<DeliveryTiming, "">, string> = {
  store_open_timings: "Store Open timings",
  after_business_hours: "After Business Hours",
  "24_7": "24/7",
};

// Locked choice of installation method for a SiteSurveyMeasurement -- was a
// free-text MasterPickSelect (site_survey_report_installation_types)
// before, replaced with exactly these eight options.
export type InstallationType =
  | "film_application"
  | "non_lit_banner_mounting"
  | "backlit_banner_mounting"
  | "non_lit_fabric_mounting"
  | "backlit_fabric_mounting"
  | "fixtures_installation"
  | "signage_installation"
  | "others"
  | "";
export const INSTALLATION_TYPE_LABEL: Record<Exclude<InstallationType, "">, string> = {
  film_application: "Film Application",
  non_lit_banner_mounting: "Non-lit Banner Mounting",
  backlit_banner_mounting: "Backlit Banner Mounting",
  non_lit_fabric_mounting: "Non-lit Fabric mounting",
  backlit_fabric_mounting: "Backlit Fabric Mounting",
  fixtures_installation: "Fixtures Installation",
  signage_installation: "Signage Installation",
  others: "Others",
};

// The one-off Q&A fields from the reference PDF's On-site personnel/Store
// description/Installing on site/Deliveries/General site information/Site
// details/Safety/Approvals sections -- site_survey_reports.form_data. Every
// key present, empty string/YesNo "" when unanswered (never omitted --
// FIELD_SOURCE_KEYS below needs every key to exist to drive the ✓/⚠/○
// indicators).
//
// Grouped by the reference PDF's own section headers (see the comment above
// each block). A later pass trimmed this back down: Site Suitability,
// Graphics, and Opportunity Information were removed as whole sections
// (Graphics' one kept question, extra lighting for night viewing, moved
// into General Site Information instead of being dropped), and a handful
// of other fields (Printer -> a closed-choice Survey Company field, a
// single free-text Apple Representative split into Name/Mobile/Email,
// several address/notes/"if Other" fields) were removed or restructured
// per that pass's own requirements -- see each field's own comment.
export interface SiteSurveyFormData {
  // -- On-site personnel details -- (surveyorName lives on the report row
  // itself, not here, since it's a top-level identity field -- see
  // SiteSurveyReportRow.surveyor_name)
  storePersonContacted: string;
  // Replaces the old free-text "Printer" field -- a closed MMDI/I&S choice
  // instead (see SurveyCompany above).
  surveyCompany: SurveyCompany;
  // Split from a single free-text "Apple Representative" field into three,
  // so a person picked from LFG Connect's own ASM records (see the "Select
  // ASM" picker in ReportFormFields.tsx, sourced from lfg_sites.asm_name/
  // asm_mobile/asm_email) can fill all three in one go, while still staying
  // individually editable afterward.
  appleRepresentativeName: string;
  appleRepresentativeMobile: string;
  appleRepresentativeEmail: string;
  retailerRepresentative: string;
  storeContactNumber: string;

  // -- Store description --
  storeLocationType: StoreLocationType;
  entranceFloorLocation: EntranceFloorLocation;
  floorApplProgramOn: string;
  storeOpenPlan: YesNo;
  openPlanLayoutDescription: string;
  siliconJoinsCondition: string;
  existingCreative: string;
  creativeRemovable: YesNo;
  // Where the store itself sits (front/back/left/right/center relative to
  // its own entrance) -- a button picker (PositionMarkerRow), not free text.
  storeLocationMarker: PositionMarker;
  // Where the Apple program sits within the store -- same button picker.
  appleProgramPositionMarker: PositionMarker;

  // -- Installing on site --
  openingTimeMon: string;
  openingTimeTue: string;
  openingTimeWed: string;
  openingTimeThu: string;
  openingTimeFri: string;
  openingTimeSat: string;
  openingTimeSun: string;
  installOutsideHours: YesNo;
  installOutsideHoursDetails: string;
  retailerPreferredInstallTime: YesNo;
  retailerPreferredInstallDetails: string;
  installationDateTime: string;
  // "Are work permits required?", from the reference's own "Installing on
  // site" section -- reused as the same question as the original build's
  // "Installation Details" permit fields, just re-homed under this section.
  permitRequired: YesNo;
  permitDetails: string;

  // -- Deliveries to store --
  deliveryTimes: DeliveryTiming;

  // -- General site information --
  weatherAffectsInstall: YesNo;
  weatherAffectsInstallDetails: string;
  // Moved here from Graphics (now removed -- see below) -- the only
  // Graphics question kept.
  extraLightingRequired: YesNo;
  extraLightingDescription: string;

  // -- Site details --
  maxWorkingSpace: string;
  accessEquipmentAvailable: YesNo;
  accessEquipmentDescription: string;
  poweredAccessUsed: YesNo;
  poweredAccessDescription: string;
  accessIssues: YesNo;
  accessIssuesDescription: string;
  siteType: SiteType;
  siteTypeDuration: string;

  // -- Safety --
  siteSafeForInstall: YesNo;
  siteSafeDescription: string;
  safetyConcerns: YesNo;
  safetyConcernsDetails: string;
  safetyEquipmentRequired: YesNo;
  safetyEquipmentDetails: string;

  // -- Approvals --
  specialApprovalsNeeded: YesNo;
  specialApprovalsDetails: string;
  chainCentralApprovalNeeded: YesNo;
  chainCentralApprovalReason: string;
}

export function emptyFormData(): SiteSurveyFormData {
  return {
    storePersonContacted: "",
    surveyCompany: "",
    appleRepresentativeName: "",
    appleRepresentativeMobile: "",
    appleRepresentativeEmail: "",
    retailerRepresentative: "",
    storeContactNumber: "",

    storeLocationType: "",
    entranceFloorLocation: "",
    floorApplProgramOn: "",
    storeOpenPlan: "",
    openPlanLayoutDescription: "",
    siliconJoinsCondition: "",
    existingCreative: "",
    creativeRemovable: "",
    storeLocationMarker: "",
    appleProgramPositionMarker: "",

    openingTimeMon: "",
    openingTimeTue: "",
    openingTimeWed: "",
    openingTimeThu: "",
    openingTimeFri: "",
    openingTimeSat: "",
    openingTimeSun: "",
    installOutsideHours: "",
    installOutsideHoursDetails: "",
    retailerPreferredInstallTime: "",
    retailerPreferredInstallDetails: "",
    installationDateTime: "",
    permitRequired: "",
    permitDetails: "",

    deliveryTimes: "",

    weatherAffectsInstall: "",
    weatherAffectsInstallDetails: "",
    extraLightingRequired: "",
    extraLightingDescription: "",

    maxWorkingSpace: "",
    accessEquipmentAvailable: "",
    accessEquipmentDescription: "",
    poweredAccessUsed: "",
    poweredAccessDescription: "",
    accessIssues: "",
    accessIssuesDescription: "",
    siteType: "",
    siteTypeDuration: "",

    siteSafeForInstall: "",
    siteSafeDescription: "",
    safetyConcerns: "",
    safetyConcernsDetails: "",
    safetyEquipmentRequired: "",
    safetyEquipmentDetails: "",

    specialApprovalsNeeded: "",
    specialApprovalsDetails: "",
    chainCentralApprovalNeeded: "",
    chainCentralApprovalReason: "",
  };
}

// Every SiteSurveyFormData key, for iterating the form / building
// FIELD_SOURCE_KEYS below without repeating the list a third time.
export const FORM_DATA_KEYS = Object.keys(emptyFormData()) as (keyof SiteSurveyFormData)[];

export type AppleStandardsMet = "yes" | "no" | "modifications" | "";

// The reference PDF's "Site Photo and measurement" page -- one block per
// SITE/opportunity. A report can cover more than one opportunity at the
// same store (see site_survey_reports.measurements, a jsonb ARRAY of this
// shape -- apps/web/src/components/siteSurveyReport/MeasurementStep.tsx
// renders one repeatable "Site N" card per array element, and
// pdfBuild.ts's drawSitePages loops the array, each site producing its own
// combined Photo + Facade diagram + Measurements & Material + Apple
// Standards section rather than three separate, non-adjacent pages the way
// the original single-measurement build did.
//
// NOTE: Opportunity Information (name/type/location/etc.) does NOT live
// here -- it briefly lived on SiteSurveyFormData instead (filled once per
// report, shared across every site) and has since been removed as a whole
// section from the tool entirely. Only the genuinely per-site measurement/
// material/installation/Apple-standards fields remain below.
export interface SiteSurveyMeasurement {
  // -- Measurements --
  visualWidthMm: number | null;
  visualHeightMm: number | null;
  visualSizeQuantity: number | null;
  measurementUnit: string;
  materialWidthMm: number | null;
  materialHeightMm: number | null;
  bleedTopMm: number | null;
  bleedRightMm: number | null;
  bleedBottomMm: number | null;
  bleedLeftMm: number | null;

  // -- Material information / Technical opportunity details -- (equipment
  // required/source/installer double as the reference's "Technical
  // opportunity details" answers to "detailed equipment required" / "who is
  // to source the equipment" / "who will carry out the installation" -- same
  // questions, not duplicated as separate fields)
  // Free text with autocomplete suggestions drawn from LFG Connect's own
  // site records (lfg_sites.material -- see useLfgDistinctValues), not a
  // locked enum or a site-survey-report-specific master table -- the real
  // material/product names already on file across every LFG site are the
  // source of truth here, and a genuinely new one can still be typed.
  materialType: string;
  installationType: InstallationType;
  fixingsRequired: string;
  existingVisualObstructions: YesNo;
  existingVisualObstructionsDescription: string;
  equipmentDetail: string;
  equipmentSource: string;
  // Reuses SurveyCompany (MMDI / I&S) -- same two businesses as the
  // report-level Survey Company field, just answering "who installs" rather
  // than "who surveyed."
  installedBy: SurveyCompany;
  measurementNotes: string;

  // -- Apple standards --
  appleStandardsMet: AppleStandardsMet;
  appleStandardsReason: string;
  appleStandardsModification: string;

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
    visualSizeQuantity: null,
    measurementUnit: "mm",
    materialWidthMm: null,
    materialHeightMm: null,
    bleedTopMm: 30,
    bleedRightMm: 30,
    bleedBottomMm: 30,
    bleedLeftMm: 30,

    materialType: "",
    installationType: "",
    fixingsRequired: "",
    existingVisualObstructions: "",
    existingVisualObstructionsDescription: "",
    equipmentDetail: "",
    equipmentSource: "",
    installedBy: "",
    measurementNotes: "",

    appleStandardsMet: "",
    appleStandardsReason: "",
    appleStandardsModification: "",

    measurementPhotoId: null,
  };
}

/**
 * Merges a loaded row's `measurements` (the jsonb array column -- see the
 * measurements-array migration) against emptyMeasurement() per entry, same
 * merge-with-defaults treatment every other loaded field on a report row
 * gets, and guarantees at least one entry so the Measurements step never
 * renders with nothing to show -- covers both a genuinely empty array and
 * a pre-migration/never-saved row Supabase hands back as `undefined`.
 * Shared by every place that loads a report row (the editor, the dashboard's
 * preview/download/duplicate actions) rather than re-implemented per call
 * site.
 */
export function normalizeMeasurements(raw: unknown): SiteSurveyMeasurement[] {
  const arr = Array.isArray(raw) ? raw : [];
  const merged = arr.map((m) => ({ ...emptyMeasurement(), ...(m as Partial<SiteSurveyMeasurement>) }));
  return merged.length > 0 ? merged : [emptyMeasurement()];
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
  // Human-readable explanation for a subset of `flagged` entries -- keyed by
  // the same dot-path, e.g. "header.surveyDate" -> `Original text was "25th
  // September" -- no year stated, so it was left blank rather than guessed.`
  // Only code-derived flags (right now: unparseable survey dates) populate
  // this; model-derived flags have no entry here. Optional/absent on older
  // persisted rows from before this field existed.
  flagMessages?: Record<string, string>;
}

// site_survey_reports -- one row per report.
export interface SiteSurveyReportRow {
  id: string;
  // Nullable FK to lfg_sites -- null for a freestanding draft (started
  // before any site exists, the partner "create a new site from this
  // survey" case), set once the report is attached to a real site. Added
  // by supabase-lfg-site-survey-reports-partner-migration.sql.
  site_id: string | null;
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
  measurements: SiteSurveyMeasurement[];
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

// The single saved-defaults row (site_survey_report_field_defaults --
// always id=true, a Postgres-enforced singleton, see that migration's own
// header comment) driving the "Default Answers" settings page and the
// Complete Details step's "Apply saved defaults" action. `form_data` reuses
// SiteSurveyFormData's own shape (merge with emptyFormData() the same way
// every report row already is -- see SiteSurveyReportEditorClient.tsx's own
// load effect) rather than a separate narrower type, since a saved default
// is just "a form_data value most fields of which are blank".
//
// NOT to be confused with emptyReportDefaults() below, which builds the
// starting values for a brand-new REPORT ROW itself (status, source, etc)
// -- an unrelated, pre-existing concept with a similar-sounding name.
export interface SiteSurveyFieldDefaultsRow {
  id: true;
  form_data: SiteSurveyFormData;
  updated_by: string | null;
  updated_at: string;
}

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
    measurements: [emptyMeasurement()],
    field_sources: {},
    extraction_meta: null,
    generated_at: null,
  };
}

// The installation-area marking on the category="measurement" photo. A
// real installed area is essentially never a perfect axis-aligned
// rectangle once perspective is involved, so this is an arbitrary polygon
// (>=3 points, fractional 0-1 relative to the FULL original image,
// top-left origin) that every corner -- and any point inserted along an
// edge -- can be dragged independently to align with the photo, rather
// than a fixed rectangle. `obstacles` are zero or more separate cut-out
// rectangles inside/near the marked area (a pillar, pipe, or other
// obstruction), each carrying its own free-text note (e.g. "Pillar -- 300
// x 200mm") -- drawn distinctly from the main outline both on screen and
// in the generated PDF.
export interface AnnotationPoint {
  x: number;
  y: number;
}
export interface AnnotationObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
}
export interface SiteSurveyPhotoAnnotation {
  points: AnnotationPoint[];
  obstacles: AnnotationObstacle[];
}
/** The original single-rectangle shape this replaced -- still what's stored on any photo annotated before this change. */
export interface LegacyRectAnnotation {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** What's actually read back from the DB (site_survey_photos.annotation, jsonb, un-migrated) -- either shape, or nothing yet. Always pass this through normalizeAnnotation() before using it; never assume the new shape directly. */
export type SiteSurveyPhotoAnnotationRaw = SiteSurveyPhotoAnnotation | LegacyRectAnnotation | null;

/** Converts whatever's actually stored (new polygon+obstacles shape, the original single-rectangle shape from before this change, or nothing) into the canonical polygon shape. A legacy rectangle becomes its equivalent 4-corner polygon with no obstacles, so every already-marked photo keeps rendering exactly as before until someone re-edits it. */
export function normalizeAnnotation(raw: SiteSurveyPhotoAnnotationRaw): SiteSurveyPhotoAnnotation | null {
  if (!raw) return null;
  if ("points" in raw && Array.isArray(raw.points)) {
    return { points: raw.points, obstacles: Array.isArray(raw.obstacles) ? raw.obstacles : [] };
  }
  const { x, y, w, h } = raw as LegacyRectAnnotation;
  if ([x, y, w, h].some((n) => typeof n !== "number" || Number.isNaN(n))) return null;
  return {
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    obstacles: [],
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
  // Only ever set on the category="measurement" photo -- see
  // SiteSurveyPhotoAnnotationRaw's header comment. Always read via
  // normalizeAnnotation(), never assumed to already be the new shape.
  annotation: SiteSurveyPhotoAnnotationRaw;
  // 0-100, CSS object-position semantics -- which part of the photo stays
  // visible once the cover-fit crop (both here and in the generated PDF's
  // drawPhotoBox) overflows one axis. 50/50 = centred crop (the only
  // behaviour that existed before this pair of columns was added -- see
  // supabase-site-survey-photos-position-migration.sql).
  crop_offset_x: number;
  crop_offset_y: number;
  created_at: string;
}

export const PHOTO_CATEGORY_LABEL: Record<PhotoCategory, string> = {
  main_site: "Main Site Photo",
  orientation_right: "Site Orientation — Right",
  orientation_left: "Site Orientation — Left",
  orientation_opposite: "Site Orientation — Opposite",
  measurement: "Site Measurement",
  // A/B/C/D photo-survey viewpoints, per the reference PDF's own diagram:
  // A = individual window/banner (immediate surrounding area), B = side
  // angle (full shopfront with all windows/banners), C = front view (full
  // shopfront), D = reverse view (back to the shop entrance, what's
  // opposite). Each can hold more than one photo, same as Main Site Photo.
  viewpoint_a: "Photo Survey — A (Individual Window/Banner)",
  viewpoint_b: "Photo Survey — B (Side Angle)",
  viewpoint_c: "Photo Survey — C (Front View)",
  viewpoint_d: "Photo Survey — D (Reverse View)",
  other: "Other",
};

export const STORE_LOCATION_TYPE_LABEL: Record<Exclude<StoreLocationType, "">, string> = {
  mall: "Mall",
  retail_high_street: "Retail High Street",
  retail_park: "Retail Park",
  other: "Other",
};

export const SITE_TYPE_LABEL: Record<Exclude<SiteType, "">, string> = {
  permanent: "Permanent",
  temporary: "Temporary",
};

export const APPLE_STANDARDS_MET_LABEL: Record<Exclude<AppleStandardsMet, "">, string> = {
  yes: "Yes",
  no: "No",
  modifications: "Only With Modifications",
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  extracting: "Extraction in Progress",
  review_required: "Review Required",
  ready: "Ready",
  generated: "Generated",
};
