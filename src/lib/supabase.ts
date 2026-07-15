import { createBrowserClient } from "@supabase/ssr";
import type { BadgeStatus } from "@/components/ui/Badge";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars are not set (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). " +
      "Data-backed workspaces will fail to fetch until these are configured."
  );
}

/**
 * Shared browser-safe Supabase client — for Client Components ("use client")
 * only. Built with createBrowserClient from @supabase/ssr so it automatically
 * reads/writes the auth session cookie set by /login and refreshed by
 * middleware.ts. Every read/write from this client runs as the signed-in
 * user, which matters now that RLS policies require
 * `auth.role() = 'authenticated'` instead of being wide open.
 *
 * Server Components must NOT import this — they need a per-request client
 * that can see the incoming request's cookies. Use
 * `createServerSupabaseClient()` from "@/lib/supabase-server" instead (see
 * src/app/workspaces/customer/page.tsx for the pattern).
 */
export const supabase = createBrowserClient(supabaseUrl ?? "", supabaseAnonKey ?? "");

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
  created_at: string;
}

export interface CustomerContactRow {
  id: string;
  customer_id: string;
  name: string;
  role: string | null;
  email: string | null;
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
}

export interface DrawingRow {
  id: string;
  number: string;
  title: string;
  status: BadgeStatus;
  status_label: string | null;
}

export interface SopRow {
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
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
}

export interface ComplianceFindingRow {
  id: string;
  item: string;
  area: string | null;
  status: BadgeStatus;
  status_label: string | null;
}

export interface AccessRequestRow {
  id: string;
  user_label: string;
  requested: string | null;
  status: BadgeStatus;
  status_label: string | null;
}
