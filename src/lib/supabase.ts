import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars are not set (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). " +
      "Data-backed workspaces will fail to fetch until these are configured."
  );
}

/**
 * Single shared Supabase client. Safe to use in both Server Components (for
 * initial data fetches) and Client Components (for interactive writes —
 * comments, approvals, etc.) because this project has no auth system yet:
 * every table is protected by permissive RLS policies scoped to the anon key.
 * Tighten the RLS policies (and likely split this into a server-only client
 * using a service role key) once authentication is added.
 */
export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");

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
