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

// The one-off Q&A fields from the reference PDF's On-site personnel/Store
// description/Installing on site/Deliveries/General site information/Site
// suitability/Site details/Safety/Graphics/Approvals sections --
// site_survey_reports.form_data. Every key present, empty string/YesNo ""
// when unanswered (never omitted -- FIELD_SOURCE_KEYS below needs every key
// to exist to drive the ✓/⚠/○ indicators).
//
// Grouped by the reference PDF's own section headers (see the comment above
// each block) -- this interface got a lot bigger in a later pass that added
// the reference's full "On-site personnel details" through "Approvals"
// sections (previously only a handful of fields from each were captured).
// Fields already covered by the ORIGINAL smaller field set are reused
// as-is rather than duplicated where the reference's own wording is the
// same question under a different section heading -- see each block's
// comment for which of the reference's questions map onto an
// already-existing field instead of a new one.
export interface SiteSurveyFormData {
  // -- On-site personnel details -- (surveyorName lives on the report row
  // itself, not here, since it's a top-level identity field -- see
  // SiteSurveyReportRow.surveyor_name)
  storePersonContacted: string;
  printer: string;
  appleRepresentative: string;
  retailerRepresentative: string;
  storeContactNumber: string;

  // -- Store description --
  storeLocationType: StoreLocationType;
  storeLocationOther: string;
  entrancesIntoMall: string;
  entrancesIntoStore: string;
  floorsWithinMall: string;
  floorsWithinStore: string;
  floorApplProgramOn: string;
  storeOpenPlan: YesNo;
  openPlanLayoutDescription: string;
  applProgramPositionEntrance: string;
  siteStoreAddress: string;
  storeContactDetails: string;
  siliconJoinsCondition: string;
  perspexCondition: string;
  lightingDescription: string;
  existingCreative: string;
  creativeRemovable: YesNo;
  additionalStoreNotes: string;

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
  deliveryContactNameNumber: string;
  deliveryAddressSameAsStore: YesNo;
  deliveryAddress: string;
  deliveryTimes: string;
  deliveryOtherComments: string;

  // -- General site information --
  weatherAffectsInstall: YesNo;
  weatherAffectsInstallDetails: string;
  allOpportunitiesSurveyed: YesNo;
  allOpportunitiesSurveyedReason: string;
  generalNotes: string;

  // -- Site suitability / installation details --
  siteVisibility: YesNo;
  siteVisibilityDescription: string;
  premiumLocation: YesNo;
  premiumLocationDescription: string;
  installationTimeFlexible: YesNo;
  installationTimeFlexibleDescription: string;
  potentialIssues: string;

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
  competitorAdvertising: YesNo;
  competitorAdvertisingDescription: string;
  generalInstallInfo: string;

  // -- Safety --
  siteSafeForInstall: YesNo;
  siteSafeDescription: string;
  safetyConcerns: YesNo;
  safetyConcernsDetails: string;
  safetyEquipmentRequired: YesNo;
  safetyEquipmentDetails: string;

  // -- Graphics --
  graffitiRisk: YesNo;
  graffitiRiskDescription: string;
  extraLightingRequired: YesNo;
  extraLightingDescription: string;
  graphicsCutoutRequired: YesNo;
  graphicsCutoutDescription: string;
  graphicsOtherInfo: string;

  // -- Approvals --
  specialApprovalsNeeded: YesNo;
  specialApprovalsDetails: string;
  chainCentralApprovalNeeded: YesNo;
  chainCentralApprovalReason: string;
  approvalsOtherInfo: string;
}

export function emptyFormData(): SiteSurveyFormData {
  return {
    storePersonContacted: "",
    printer: "",
    appleRepresentative: "",
    retailerRepresentative: "",
    storeContactNumber: "",

    storeLocationType: "",
    storeLocationOther: "",
    entrancesIntoMall: "",
    entrancesIntoStore: "",
    floorsWithinMall: "",
    floorsWithinStore: "",
    floorApplProgramOn: "",
    storeOpenPlan: "",
    openPlanLayoutDescription: "",
    applProgramPositionEntrance: "",
    siteStoreAddress: "",
    storeContactDetails: "",
    siliconJoinsCondition: "",
    perspexCondition: "",
    lightingDescription: "",
    existingCreative: "",
    creativeRemovable: "",
    additionalStoreNotes: "",

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

    deliveryContactNameNumber: "",
    deliveryAddressSameAsStore: "",
    deliveryAddress: "",
    deliveryTimes: "",
    deliveryOtherComments: "",

    weatherAffectsInstall: "",
    weatherAffectsInstallDetails: "",
    allOpportunitiesSurveyed: "",
    allOpportunitiesSurveyedReason: "",
    generalNotes: "",

    siteVisibility: "",
    siteVisibilityDescription: "",
    premiumLocation: "",
    premiumLocationDescription: "",
    installationTimeFlexible: "",
    installationTimeFlexibleDescription: "",
    potentialIssues: "",

    maxWorkingSpace: "",
    accessEquipmentAvailable: "",
    accessEquipmentDescription: "",
    poweredAccessUsed: "",
    poweredAccessDescription: "",
    accessIssues: "",
    accessIssuesDescription: "",
    siteType: "",
    siteTypeDuration: "",
    competitorAdvertising: "",
    competitorAdvertisingDescription: "",
    generalInstallInfo: "",

    siteSafeForInstall: "",
    siteSafeDescription: "",
    safetyConcerns: "",
    safetyConcernsDetails: "",
    safetyEquipmentRequired: "",
    safetyEquipmentDetails: "",

    graffitiRisk: "",
    graffitiRiskDescription: "",
    extraLightingRequired: "",
    extraLightingDescription: "",
    graphicsCutoutRequired: "",
    graphicsCutoutDescription: "",
    graphicsOtherInfo: "",

    specialApprovalsNeeded: "",
    specialApprovalsDetails: "",
    chainCentralApprovalNeeded: "",
    chainCentralApprovalReason: "",
    approvalsOtherInfo: "",
  };
}

// Every SiteSurveyFormData key, for iterating the form / building
// FIELD_SOURCE_KEYS below without repeating the list a third time.
export const FORM_DATA_KEYS = Object.keys(emptyFormData()) as (keyof SiteSurveyFormData)[];

export type OpportunityType =
  | "individual_window"
  | "window_vinyl"
  | "banner"
  | "light_box"
  | "glass_facade"
  | "existing_graphic"
  | "other"
  | "";

export type AppleStandardsMet = "yes" | "no" | "modifications" | "";

// The reference PDF's "Site Photo and measurement" page -- one block per
// report (not repeating, unlike Installation Report's per-site array, since
// the reference report this feature was built against only ever surveys
// one primary opportunity in this level of detail -- see
// additionalOpportunityNotes for anything beyond it) --
// site_survey_reports.measurement.
export interface SiteSurveyMeasurement {
  // -- Opportunity information --
  opportunityName: string;
  opportunityType: OpportunityType;
  opportunityTypeOther: string;
  opportunityLocation: string;
  storeFacadeArea: string;
  appleProgramPosition: string;
  opportunityDescription: string;
  // Distinct from `materialType` below -- this is what's *already* on the
  // wall/window before the new install (per the reference's "Determine and
  // record the type material being used if there is an existing banner or
  // graphic in place"), while `materialType` is what's being ordered for
  // the NEW install.
  existingMaterialType: string;
  existingCreativeConditionForOpportunity: string;
  existingCreativeRemovableForOpportunity: YesNo;
  additionalOpportunityNotes: string;
  // Which entrance (of possibly several) carries the main footfall, per the
  // reference's photo-survey diagram instructions ("For multiple entrances
  // indicate which entrance has main footfall").
  mainFootfallEntranceNote: string;

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
  materialType: string;
  installationType: string;
  fixingsRequired: string;
  existingVisualObstructions: YesNo;
  existingVisualObstructionsDescription: string;
  equipmentDetail: string;
  equipmentSource: string;
  installedBy: string;
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
    opportunityName: "",
    opportunityType: "",
    opportunityTypeOther: "",
    opportunityLocation: "",
    storeFacadeArea: "",
    appleProgramPosition: "",
    opportunityDescription: "",
    existingMaterialType: "",
    existingCreativeConditionForOpportunity: "",
    existingCreativeRemovableForOpportunity: "",
    additionalOpportunityNotes: "",
    mainFootfallEntranceNote: "",

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
    measurement: emptyMeasurement(),
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

export const OPPORTUNITY_TYPE_LABEL: Record<Exclude<OpportunityType, "">, string> = {
  individual_window: "Individual Window",
  window_vinyl: "Window Vinyl",
  banner: "Banner",
  light_box: "Light Box",
  glass_facade: "Glass Façade",
  existing_graphic: "Existing Graphic",
  other: "Other",
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
