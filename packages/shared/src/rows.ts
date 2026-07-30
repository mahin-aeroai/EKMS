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

// ---------- Cost Sheet (supabase-cost-sheet-schema.sql) ----------
// New standalone Tools workspace -- BOM + Work Centre cost model, per the
// scoping questions PROJECT_STATUS.md's "Next up" section raised and the
// user's answers to them. Ports the same logic already built and verified
// as an Excel workbook this session into MMDI ONE's own schema.

export type BomLineBasis = "per_sqft" | "per_piece";
export type WorkCentreRateConfidence = "confirmed" | "extrapolated" | "missing";

export interface BomTemplateRow {
  id: string;
  code: string;
  description: string;
  category: string;
  print_mode: string;
  substrate_type: string;
  work_centres: string[];
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
  basis: BomLineBasis;
  consumption_qty: number;
  wastage_pct: number;
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
