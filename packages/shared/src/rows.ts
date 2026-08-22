// packages/shared/src/rows.ts
//
// Row/type shapes for every Supabase table this app reads, plus the small
// shared status-literal types layered on top of them (e.g. BadgeStatus).
// Kept framework-free (no React, no Supabase client) so both apps/web and
// apps/mobile can import these as plain types.

export type BadgeStatus = "success" | "warning" | "danger" | "info" | "neutral";

export interface ApplelfgSiteSurveyRow {
  id: string;
  chain: string;
  relative_path: string;
  file_name: string;
  apple_store_id: string | null;
  store_name: string | null;
  file_size_bytes: number | null;
  uploaded_at: string;
}

export interface PurchaseTransactionRow {
  id: string;
  grn_no: string;
  grn_date: string | null;
  location: string | null;
  po_no: string | null;
  po_date: string | null;
  bill_no: string | null;
  bill_date: string | null;
  supplier_name: string;
  item_name: string;
  item_code: string | null;
  item_type: string | null;
  product_category: string | null;
  raw_material_id: string | null;
  quantity: number | null;
  rate: number | null;
  taxable_value: number;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  net_amount_line: number | null;
  created_at: string;
}

export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  region: string | null;
  tier: string | null;
  payment_terms: string | null;
  account_owner: string | null;
  status: string;
  lifetime_value: number;
  open_orders: number;
  on_time_delivery: number;
  health_score: number;
  tags: string[];
  address: string | null;
  gstin: string | null;
  default_attention_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
}

export interface CustomerContactRow {
  id: string;
  customer_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  deactivated_at: string | null;
}

export interface CustomerCommentRow {
  id: string;
  customer_id: string;
  author: string;
  content: string;
  resolved: boolean;
  created_at: string;
}

export interface CustomerApprovalRow {
  id: string;
  customer_id: string;
  title: string;
  requested_by: string;
  value: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface MachineRow {
  id: string;
  code: string;
  name: string;
  line: string | null;
  status: string;
  maintenance_lead: string | null;
  oee: number;
  mtbf_hours: number;
  mttr_hours: number;
  uptime: number;
  model: string | null;
  clamping_force: string | null;
  shot_weight_max: string | null;
  last_pm: string | null;
  installed_year: number | null;
  vendor: string | null;
  tags: string[];
  created_at: string;
}

export interface MachineCommentRow {
  id: string;
  machine_id: string;
  author: string;
  content: string;
  resolved: boolean;
  created_at: string;
}

export interface MachineApprovalRow {
  id: string;
  machine_id: string;
  title: string;
  requested_by: string;
  value: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface RawMaterialRow {
  id: string;
  code: string;
  name: string;
  category: string | null;
  status: string;
  category_owner: string | null;
  current_stock: number;
  reorder_point: number;
  lead_time_days: number;
  approved_suppliers: number;
  compatible_substrates: string | null;
  unit_cost: number;
  // Added by supabase-cost-sheet-schema.sql / backfilled by
  // supabase-cost-sheet-unit-cost-backfill.sql from the Jan-Jun 2026
  // purchase register -- NULL for the ~1,159 items never purchased in that
  // window (only 399 of ~1,558 raw materials have real purchase history so far).
  unit_cost_recent: number | null;
  unit_cost_recent_date: string | null;
  unit_cost_avg: number | null;
  unit_cost_source: string | null;
  moq: string | null;
  storage_class: string | null;
  tags: string[];
  created_at: string;
}

export interface RawMaterialCommentRow {
  id: string;
  raw_material_id: string;
  author: string;
  content: string;
  resolved: boolean;
  created_at: string;
}

export interface RawMaterialApprovalRow {
  id: string;
  raw_material_id: string;
  title: string;
  requested_by: string;
  value: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  customer: string | null;
  project_manager: string | null;
  status: string;
  completion_pct: number;
  budget_utilization: number;
  schedule_health: string;
  open_risks: number;
  sponsor: string | null;
  kickoff: string | null;
  target_completion: string | null;
  primary_line: string | null;
  budget: number;
  tags: string[];
  created_at: string;
}

export interface ProjectCommentRow {
  id: string;
  project_id: string;
  author: string;
  content: string;
  resolved: boolean;
  created_at: string;
}

export interface ProjectApprovalRow {
  id: string;
  project_id: string;
  title: string;
  requested_by: string;
  value: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

// Job Orders — replaces the "Projects" concept above, which never matched
// how MMDI actually works (job orders, not sponsor/budget/schedule-health
// projects). The projects/* tables and types above are kept for now (see
// PROJECT_STATUS.md) but the workspace itself now points here.
export interface JobOrderRow {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  customer_id: string | null;
  location: string | null;
  sales_person: string | null;
  application: string | null;
  status: string;
  order_date: string | null;
  production_start: string | null;
  production_end: string | null;
  primary_machine: string | null;
  primary_machine_group: string | null;
  line_item_count: number;
  total_qty: number;
  total_sqft: number;
  total_value: number;
  tags: string[];
  created_at: string;
}

export interface JobOrderCommentRow {
  id: string;
  job_order_id: string;
  author: string;
  content: string;
  resolved: boolean;
  created_at: string;
}

export interface JobOrderApprovalRow {
  id: string;
  job_order_id: string;
  title: string;
  requested_by: string;
  value: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface CrmAccountRow {
  id: string;
  name: string;
  region: string | null;
  owner: string | null;
  value: string | null;
  status: BadgeStatus;
}

export interface QuoteRow {
  id: string;
  number: string;
  customer: string | null;
  value: string | null;
  status: BadgeStatus;
  status_label: string | null;
}

export interface ContractRow {
  id: string;
  customer: string;
  type: string | null;
  value: string | null;
  status: BadgeStatus;
  status_label: string | null;
}

// ── Estimate Builder (see supabase-estimate-builder-schema.sql) ──

export interface CustomerSiteRow {
  id: string;
  customer_id: string;
  site_name: string;
  legal_entity_name: string | null;
  address: string;
  gstin: string | null;
  attention_person: string | null;
  created_at: string;
}

export interface IkeaRateCardRow {
  sl_no: number | null;
  scope: string | null;
  material_category: string | null;
  product: string;
  description: string | null;
  uom: string | null;
  revised_rate: number;
  remarks: string | null;
}

export interface AppleRateCardRow {
  sku_id: string;
  sku_description: string | null;
  category: string | null;
  program: string | null;
  substrate: string | null;
  unit: string | null;
  bill_rate: number;
  rate_inr_each: number | null;
  start_date: string | null;
  end_date: string | null;
  sqft: number | null;
}

export type EstimateStatus = "draft" | "sent" | "won" | "lost";

export interface EstimateRow {
  id: string;
  quote_number: string | null;
  job_number: string | null;
  version: number;
  root_estimate_id: string | null;
  customer_id: string;
  contract_id: string | null;
  site_id: string | null;
  status: EstimateStatus;
  gst_percent: number;
  subtotal: number;
  transportation_total: number;
  installation_total: number;
  taxable_total: number;
  gst_amount: number;
  grand_total: number;
  notes: string | null;
  attention_person: string | null;
  quote_subject: string | null;
  customer_address: string | null;
  customer_gstin: string | null;
  job_completion_time: string | null;
  delivery_commitment: string | null;
  payment_terms_days: number | null;
  payment_terms_type: EstimatePaymentTermsType;
  // Snapshotted at save time (same convention as customer_address/
  // customer_gstin/attention_person) so a PDF re-downloaded later still
  // shows exactly what it showed on save -- not a live join to
  // public.employees. Replaces the old hardcoded "Naresh Kumar D" default
  // in the PDF's sign-off block.
  salesperson_name: string | null;
  salesperson_designation: string | null;
  salesperson_phone: string | null;
  salesperson_email: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// "net_days" is the original days-from-supply term (the only kind this
// used to support). "advance" and "against_delivery" are fixed terms with
// no day count attached -- added per the user's request to offer them as
// real options rather than forcing every estimate into a "Net N days"
// shape.
export type EstimatePaymentTermsType = "net_days" | "advance" | "against_delivery";

export type EstimateCalcMode = "nos" | "sqft";

export interface EstimateLineItemRow {
  id: string;
  estimate_id: string;
  sort_order: number;
  is_contract_item: boolean;
  rate_card_source: string | null;
  product_no: string | null;
  product_name: string;
  design_name: string | null;
  description: string | null;
  additional_description: string | null;
  uom: string | null;
  calc_mode: EstimateCalcMode;
  width_cm: number | null;
  height_cm: number | null;
  width_in: number | null;
  height_in: number | null;
  sqft_total: number | null;
  unit_rate: number;
  quantity: number;
  transportation_rate: number;
  installation_rate: number;
  line_subtotal: number;
  line_total: number;
  created_at: string;
}

export interface WorkOrderRow {
  id: string;
  title: string;
  meta: string | null;
  column_id: string;
  ai_suggested_column: string | null;
}

export interface MaintenanceEventRow {
  id: string;
  day: number;
  title: string;
  type: "pm" | "installation" | "personal" | "conflict";
}

export interface InstallationSiteRow {
  id: string;
  site: string;
  customer: string | null;
  status: BadgeStatus;
  status_label: string | null;
}

export interface InventorySkuRow {
  id: string;
  code: string;
  name: string;
  stock: string | null;
  status: BadgeStatus;
  status_label: string | null;
}

export interface PurchaseOrderRow {
  id: string;
  title: string;
  meta: string | null;
  column_id: string;
  ai_suggested_column: string | null;
}

export interface SupplierRow {
  id: string;
  name: string;
  category: string | null;
  on_time: string | null;
  status: BadgeStatus;
  status_label: string | null;
}

export interface DocumentRow {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  superseded: boolean;
  category: string | null;
  file_name: string | null;
  relative_path: string | null;
  source_url: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  content_text: string | null;
  uploaded_at: string | null;
}

export interface DrawingRow {
  id: string;
  number: string;
  title: string;
  status: BadgeStatus;
  status_label: string | null;
  category: string | null;
  file_name: string | null;
  relative_path: string | null;
  source_url: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  content_text: string | null;
  uploaded_at: string | null;
}

export interface SopRow {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  category: string | null;
  file_name: string | null;
  relative_path: string | null;
  source_url: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  content_text: string | null;
  uploaded_at: string | null;
}

export interface LessonLearnedRow {
  id: string;
  type: "Lesson Learned" | "Engineering Note" | "FAQ";
  title: string;
  content: string;
  source: string | null;
}

export interface EmployeeRow {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  status: BadgeStatus;
  status_label: string | null;
  employee_code: string | null;
  location: string | null;
  off_email: string | null;
  off_phone: string | null;
  personal_email: string | null;
  personal_phone: string | null;
  date_of_joining: string | null;
  date_of_birth: string | null;
  gender: string | null;
}

export interface ComplianceFindingRow {
  id: string;
  item: string;
  area: string | null;
  status: BadgeStatus;
  status_label: string | null;
  category: string | null;
  chapter: string | null;
  frequency: string | null;
  baseline_date: string | null;
  due_date: string | null;
  responsible: string | null;
}

export interface AccessRequestRow {
  id: string;
  user_label: string;
  requested: string | null;
  status: BadgeStatus;
  status_label: string | null;
}

export type UserRole = "admin" | "editor" | "viewer";

export interface ProfileRow {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  // NULL = unrestricted (sees every module). See
  // supabase-module-access-migration.sql and
  // apps/web/src/lib/UserGroupsContext.tsx.
  allowed_groups: string[] | null;
  // NULL = unrestricted (sees every Tools-section tool). UI-level only, not
  // RLS-backed -- see supabase-tool-access-migration.sql and
  // apps/web/src/lib/UserToolsContext.tsx.
  allowed_tools: string[] | null;
  // Display flag only -- see supabase-profiles-active-migration.sql. The
  // real block is Supabase Auth's own ban on the auth.users row, applied by
  // /api/staff/[userId]/deactivate.
  active: boolean;
}

// ── Sign Estimator (React rewrite of SignERP_v2.html) ──────────────────────
// See supabase-sign-estimator-schema.sql for the table definitions + RLS.
// Field names mirror the DB columns (snake_case) rather than the original
// tool's camelCase localStorage fields, kept consistent with every other
// row type in this file.

export interface SignProfileRow {
  id: string;
  name: string;
  category: "nonlit" | "seg-indoor" | "seg-outdoor";
  width: number | null;
  depth: number | null;
  stock_len: number;
  usage: string | null;
  cost: number;
  sku: string | null;
  supplier: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignLedModuleRow {
  id: string;
  name: string;
  mod_w: number;
  mod_h: number;
  h_gap: number;
  v_gap: number;
  watt: number;
  ip: string | null;
  usage: string | null;
  cost: number;
  sku: string | null;
  supplier: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignLedBarRow {
  id: string;
  name: string;
  bar_len: number;
  bar_width: number;
  watt: number;
  ip: string | null;
  usage: string | null;
  cost: number;
  sku: string | null;
  supplier: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignLedDriverRow {
  id: string;
  watt: number;
  brand: string | null;
  volt: number;
  cost: number;
  sku: string | null;
  supplier: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignSheetRow {
  id: string;
  name: string;
  width: number;
  height: number;
  thickness: number | null;
  cost_per_sheet: number;
  wastage: number;
  sku: string | null;
  supplier: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignPrintingMediaRow {
  id: string;
  name: string;
  print_types: string[];
  cost_per_sqft: number;
  wastage: number;
  sku: string | null;
  supplier: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignAccessoryRow {
  id: string;
  name: string;
  unit: string;
  mandatory: boolean;
  unit_cost: number;
  sku: string | null;
  supplier: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignEstimateRow {
  id: string;
  ref: string;
  client: string | null;
  category: string | null;
  dim_w: number | null;
  dim_h: number | null;
  dim_unit: string | null;
  width_mm: number;
  height_mm: number;
  qty: number;
  sell: number;
  final_amount: number;
  margin: number;
  calc: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

// ---------- Estimate Pool (supabase-estimate-pool-migration.sql) ----------
// Shared staging area between Sign Estimator, Cost Sheet, and Estimate
// Builder -- see that migration's header for the three explicit design
// choices (explicit "Add to Pool" action, customer-less until pulled into
// an estimate, marked 'used' once pulled in).
export interface EstimatePoolItemRow {
  id: string;
  source: "sign_estimator" | "cost_sheet";
  source_ref_id: string | null;
  label: string;
  sell_amount: number | null;
  cost_amount: number | null;
  summary: Record<string, unknown>;
  status: "available" | "used";
  used_in_estimate_id: string | null;
  created_by: string | null;
  created_at: string;
}

// ---------- Cost Sheet (supabase-cost-sheet-schema.sql) ----------
// New standalone Tools workspace -- BOM + Work Centre cost model, per the
// scoping questions PROJECT_STATUS.md's "Next up" section raised and the
// user's answers to them. Ports the same logic already built and verified
// as an Excel workbook this session into MMDI ONE's own schema.

export type BomLineBasis = "per_sqft" | "per_piece";
// The BOM Master tab lets the user pick a real-world consumption unit per
// line (matching how the material is actually bought/tracked -- Nos,
// SQFT, running feet, metres, kilos, sets) instead of being limited to
// the old per_sqft/per_piece split. Cost-scaling behavior only cares
// about ONE distinction though: does this line's cost scale with the
// job's total SQFT (only "SQFT") or with its Qty (everything else,
// same math the old "per_piece" always used) -- see calc.ts's
// SQFT_SCALED_UNITS. WorkCentreRateRow.rate_basis is intentionally left
// on the older BomLineBasis type above -- the Rate Card tab wasn't part
// of this change.
export type BomMaterialUnit = "SQFT" | "NOS" | "RFT" | "MTR" | "KGS" | "SET" | "KLR";
export type WorkCentreRateConfidence = "confirmed" | "extrapolated" | "missing";

export interface BomTemplateRow {
  id: string;
  code: string;
  description: string;
  category: string;
  print_mode: string;
  substrate_type: string;
  work_centres: string[];
  // Manual display order within `category` -- lower sorts first. Null on
  // any row created before this existed (falls back to sorting by `code`
  // alphabetically, same as the app always did). See
  // supabase-bom-templates-sort-order-migration.sql.
  sort_order: number | null;
  created_at: string;
}

export interface BomTemplateLineRow {
  id: string;
  template_id: string;
  line_no: number;
  material_name: string;
  material_category: string | null;
  // Deliberately nullable -- left unmapped where the BOM's shorthand
  // material name had no confident match in raw_materials (see
  // suggested_codes). Map it in the Cost Sheet workspace's BOM Master tab.
  raw_material_code: string | null;
  suggested_codes: string | null;
  basis: BomMaterialUnit;
  consumption_qty: number;
  wastage_pct: number;
  // Landed-cost markup applied on top of the raw material's purchase price
  // (shipping/handling etc. that Tally's purchase price doesn't carry) --
  // applied after wastage. Same 0-1 fraction convention as wastage_pct.
  markup_pct: number;
  created_at: string;
}

// A BOM line's raw_material_code above is its DEFAULT mapping. A line can
// also have zero or more interchangeable substitutes -- e.g. "RSD Flex
// 340GSM" might be sourced from any of several GSM/finish variants
// depending what's in stock -- listed here as one row per substitute.
// Managed from BOM Master; selectable per job in the Cost Sheet tab
// without changing the line's saved default.
export interface BomTemplateLineAlternativeRow {
  id: string;
  line_id: string;
  raw_material_code: string;
  created_at: string;
}

export interface WorkCentreRateRow {
  id: string;
  work_centre: string;
  print_mode: string; // '-' when the rate doesn't vary by print mode
  substrate: string;
  rate_basis: BomLineBasis;
  rate: number | null; // NULL when confidence = 'missing'
  confidence: WorkCentreRateConfidence;
  note: string | null;
  created_at: string;
}

// ---------- Material Ordering (supabase-material-ordering-schema.sql) ----------
// New standalone Tools workspace -- pick a supplier + a set of production
// programs, get back a computed order list (pack/roll/sheet counts, not raw
// consumption totals) ready to send. See that migration's header for why
// this is its own set of tables rather than reusing Suppliers/Procurement/
// raw_materials (none had real address/pack-size/consumption data behind
// them yet).

export type MaterialUnitType = "roll" | "sheet" | "simple";
export type MaterialOrderMethod = "consumption" | "simple_count";
export type MaterialOrderStatus = "draft" | "sent";

// How a material's consumption is actually computed -- a separate axis
// from MaterialUnitType (which only describes pack shape). See
// supabase-material-ordering-schema.sql's header for the full explanation
// of each value.
export type MaterialConsumptionBasis =
  | "total_required_material"
  | "perimeter_x2"
  | "qty_per_pack_by_sheet_size"
  | "wastage_running_length"
  | "qty_direct_wastage"
  | "sqft_direct_to_rolls"
  | "fixed_pieces_per_roll"
  | "manual";

// pack_options shape depends on unit_type -- see the migration header:
//   roll   -- { label, width_mm?, length_m }
//   sheet  -- { label, width_mm, height_mm }
//   simple -- informational only, same shape as roll, no calc reads it
export interface MaterialPackOption {
  label: string;
  width_mm?: number;
  height_mm?: number;
  length_m?: number;
  gsm?: number;
  weight_kg?: number;
}

export interface MaterialSupplierRow {
  id: string;
  name: string;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
}

export interface MaterialSupplierItemRow {
  id: string;
  supplier_id: string;
  // Matches material_consumption_rows.material_1/2/3 exactly, so the Order
  // Builder can group consumption by this string with no fuzzy matching.
  material_name: string;
  raw_material_code: string | null;
  unit_type: MaterialUnitType;
  order_method: MaterialOrderMethod;
  pack_options: MaterialPackOption[];
  consumption_basis: MaterialConsumptionBasis;
  // Only meaningful when consumption_basis === "fixed_pieces_per_roll".
  pieces_per_pack: number | null;
  created_at: string;
}

// One row per SKU from the imported program-wise consumption sheet. Column
// names mirror the sheet's own headers -- see supabase-material-ordering-
// consumption-import.sql.
export interface MaterialConsumptionRowRow {
  id: string;
  product_name: string | null;
  sku_id: string | null;
  category: string | null;
  sku_description: string | null;
  bill_rate: number | null;
  program: string | null;
  material_1: string | null;
  material_2: string | null;
  material_3: string | null;
  sku: string | null;
  width_mm: number | null;
  height_mm: number | null;
  sqm: number | null;
  order_qty: number | null;
  print_length_mm: number | null;
  material_width_mm: number | null;
  linear_metres: number | null;
  total_required_material: number | null;
  // "Qty can be accomodated withing pack size" in the sheet -- how many
  // finished pieces of this SKU nest onto one pack/sheet/reel, per the
  // user's own layout knowledge. Only some rows have this filled in.
  qty_per_pack: number | null;
  imported_at: string;
}

// One computed line within a saved material_orders.lines snapshot.
export interface MaterialOrderLine {
  material_name: string;
  total_consumption: number;
  consumption_unit: "sqm" | "linear_m" | "count";
  pack_option: MaterialPackOption;
  packs_ordered: number;
  notes?: string;
}

export interface MaterialOrderRow {
  id: string;
  ref: string;
  supplier_id: string | null;
  // Frozen at save time, same convention as EstimateRow.customer_address --
  // a sent order keeps showing exactly what was requested even if the
  // supplier's address/contact details change later.
  supplier_snapshot: {
    name: string;
    address: string | null;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
  };
  programs: string[];
  status: MaterialOrderStatus;
  notes: string | null;
  lines: MaterialOrderLine[];
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
}

// ---------- Import Duty / Landing Cost Calculator ----------
// (supabase-import-duty-schema.sql) -- new standalone Tools workspace,
// ports "Import Duty calculation.xlsx". See that migration's header for
// the full formula. BCD/SW Cess/IGST % are per LINE, not per shipment,
// since real shipments mix HS codes with different duty rates.
//
// Freight, Freight-from-Ex-Works, Clearing Charges and Insurance % are
// SHIPMENT-level (one invoice/shipment is one Bill of Entry, and these 4
// cost components are paid once for the whole shipment, not per product) --
// per the user's own correction after using the first version of this tool,
// which had them as per-line inputs. Each line's share of these totals is
// apportioned pro-rata by that line's share of total invoice value (the
// standard customs practice for apportioning shipment-level costs across
// multiple line items), producing apportioned_freight / apportioned_insurance
// / apportioned_freight_ex_works / apportioned_clearing_charges on each line
// -- see CalculatorTab.tsx's computeAll().

export type ImportDutyStatus = "draft" | "final";

// Unit of measure for width/height. Converted to feet internally to derive
// sqft_total (see UOM_TO_FT in CalculatorTab.tsx).
export type ImportDutyUom = "mm" | "cm" | "inch" | "ft" | "m";

// How Qty/Width/Height combine into a total sq.ft figure for the line --
// per the user's own two real scenarios:
//   'pieces' -- Qty is a piece count; Width x Height is the size of ONE
//         piece (in `uom`). sqft_total = qty * width_ft * height_ft.
//   'roll'   -- Qty is a running length, in `length_uom` (e.g. 715 METRES
//         of fabric off a roll); Width is the roll's width, in `uom` (e.g.
//         2600 MM). Length and width are almost never given in the same
//         real-world unit for a roll (running length in metres, roll width
//         in mm), so these are two SEPARATE unit fields, not one shared
//         `uom` -- forcing a single shared unit was the original bug here
//         (a real 715m x 2600mm roll came out as 715mm x 2600mm = 20 sqft
//         instead of ~20,000 sqft once mm and m got conflated). Height
//         isn't meaningful for a roll and is ignored.
//         sqft_total = toFt(qty, length_uom) * toFt(width, uom).
export type ImportDutySizeMode = "pieces" | "roll";

export interface ImportDutyLine {
  product_name: string;
  qty: number;
  // Price per unit in `currency` -- inv_value = qty * rate * exchange_rate
  // (see schema header for why this isn't rate * exchange_rate alone).
  rate: number;
  // Dropdown: USD | EUR | INR (see CalculatorTab.tsx's CURRENCY_OPTIONS).
  currency: string;
  exchange_rate: number;
  width: number;
  height: number;
  // UOM for width (and, in 'pieces' mode, also height). In 'roll' mode this
  // is the roll-width unit only -- see length_uom for the running length.
  uom: ImportDutyUom;
  // UOM for qty when size_mode = 'roll' (qty is a running length). Not used
  // in 'pieces' mode, where qty is a plain count. See ImportDutySizeMode.
  length_uom: ImportDutyUom;
  size_mode: ImportDutySizeMode;
  bcd_percent: number;
  sw_cess_percent: number;
  igst_percent: number;
  // Computed + frozen at save time (see schema header for the formulas).
  inv_value: number;
  sqft_total: number;
  // This line's pro-rata share (by inv_value) of the shipment-level totals
  // below on ImportDutyCalculationRow.
  apportioned_freight: number;
  apportioned_insurance: number;
  apportioned_freight_ex_works: number;
  apportioned_clearing_charges: number;
  assessable_value: number;
  bcd_amount: number;
  sw_cess_amount: number;
  igst_amount: number;
  total_duty: number;
  total_cost: number;
  cost_per_qty: number;
  cost_per_sqft: number;
}

export interface ImportDutyCalculationRow {
  id: string;
  ref: string;
  status: ImportDutyStatus;
  supplier_name: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  bill_of_entry_no: string | null;
  bill_of_entry_date: string | null;
  notes: string | null;
  // Shipment-level cost components -- apportioned pro-rata across `lines`
  // by each line's share of total invoice value (see ImportDutyLine's
  // apportioned_* fields and CalculatorTab.tsx's computeAll()).
  freight: number;
  freight_ex_works: number;
  clearing_charges: number;
  // Flat INR value, same as freight/freight_ex_works/clearing_charges --
  // typed in directly from the actual insurance invoice/policy. Originally
  // a % of total invoice value (the standard 1.125% notional customs rate),
  // changed to a flat value per the user's own preference.
  insurance: number;
  lines: ImportDutyLine[];
  total_cost: number;
  total_duty: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------
// Customer Portal (/portal/*) -- see supabase-customer-portal-schema.sql.
// Separate, invite-only surface for Apple-format retail chains ordering
// GPX04/GPX05 signage. Deliberately NOT reusing UserRole above -- that
// type backs several `Record<UserRole, ...>` exhaustive maps in the
// internal staff UI (TopNav, Administration) that a 4th 'portal' value
// would break for no reason, since portal accounts never reach those
// components (supabase-middleware.ts keeps the two surfaces apart).
// ---------------------------------------------------------------------

export type PortalOrderStatus =
  | "submitted"
  | "proof_uploaded"
  | "revision_requested"
  | "approved"
  | "in_production"
  | "completed"
  | "cancelled";

export type PortalPaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export interface PortalCompanyRow {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  gstin: string | null;
  billing_address: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface PortalCompanyStoreRow {
  id: string;
  company_id: string;
  store_name: string;
  address: string | null;
  city: string | null;
  gstin: string | null;
  lfg_sfo_id: string | null;
  active: boolean;
}

// One row per customer- or staff-made edit to a store's address/city/GSTIN
// -- written automatically by a database trigger on portal_company_stores
// (see supabase-portal-store-self-service-migration.sql), never inserted
// directly by application code, so it can't be skipped or faked by
// forgetting to call some "log this" helper from one of the two edit paths
// (portal self-service, CompaniesTab staff edit).
export interface PortalStoreAddressHistoryRow {
  id: string;
  store_id: string;
  changed_at: string;
  changed_by: string | null;
  changed_by_role: "customer" | "staff" | null;
  old_address: string | null;
  new_address: string | null;
  old_city: string | null;
  new_city: string | null;
  old_gstin: string | null;
  new_gstin: string | null;
}

export interface PortalUserRow {
  id: string;
  company_id: string;
  full_name: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export interface PortalProductRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit_price: number;
  gst_percent: number;
  preview_image_path: string | null;
  version: number;
  active: boolean;
  updated_at: string;
}

export interface PortalOrderRow {
  id: string;
  order_no: string;
  company_id: string;
  store_id: string;
  created_by: string;
  status: PortalOrderStatus;
  payment_status: PortalPaymentStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  paid_at: string | null;
  // Snapshot of the store's address/city/GSTIN at the moment this order was
  // placed -- deliberately NOT a live join to portal_company_stores. A
  // store's address can be edited later (by the customer or MMDI staff);
  // an already-placed order must keep showing the address it actually
  // shipped against, not whatever the store record says today. Frozen
  // after insert (see the REVOKE UPDATE next to these columns in the
  // schema) -- nothing can change them once the order exists.
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_gstin: string | null;
  notes: string | null;
  admin_notes: string | null;
  current_revision_number: number;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
}

export interface PortalOrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_code: string;
  product_name: string;
  unit_price: number;
  gst_percent: number;
  preview_image_path: string | null;
  quantity: number;
  line_subtotal: number;
  line_gst_amount: number;
  line_total: number;
}

export interface PortalOrderFileRow {
  id: string;
  order_id: string;
  order_item_id: string | null;
  uploaded_by_role: "customer" | "staff";
  uploaded_by: string;
  relative_path: string;
  file_name: string;
  file_size: number | null;
  kind: "reference" | "proof" | "other" | "design";
  revision_number: number | null;
  created_at: string;
}

export interface PortalOrderApprovalRow {
  id: string;
  order_id: string;
  revision_number: number;
  decision: "approved" | "revision_requested";
  comment: string | null;
  decided_by: string;
  decided_at: string;
}
