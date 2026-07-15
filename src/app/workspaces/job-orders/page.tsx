import { type JobOrderRow } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { JobOrderWorkspaceClient } from "@/components/workspaces/JobOrderWorkspaceClient";

// Always fetch fresh data from Supabase — this workspace is no longer a static demo.
export const dynamic = "force-dynamic";

// Job Order 7455 — Shark Shopfits Private Limited: the highest-value job
// order in the imported production report that (a) isn't "BASIL" or "CASH
// SALES" (internal/non-customer buckets that show up as the top values in
// the raw data) and (b) has a confident customer_id link, for the fullest
// demo (real relationships graph, not just a bare name).
const DEMO_JOB_ORDER_CODE = "7455";

export default async function JobOrdersWorkspacePage() {
  const supabase = await createServerSupabaseClient();

  const { data: rows, error: jobOrderError } = await supabase
    .from("job_orders")
    .select("*")
    .eq("code", DEMO_JOB_ORDER_CODE)
    .limit(1);

  const jobOrder = rows?.[0] as JobOrderRow | undefined;

  if (jobOrderError || !jobOrder) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-tint p-6 text-sm text-danger">
        Couldn&apos;t load a job order from Supabase. Confirm the job orders workspace schema
        has been run (supabase-job-orders-schema.sql) and imported (import-job-orders.sql), and
        that NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
        {jobOrderError && <pre className="mt-2 whitespace-pre-wrap text-xs">{jobOrderError.message}</pre>}
      </div>
    );
  }

  const [{ data: comments }, { data: approvals }] = await Promise.all([
    supabase
      .from("job_order_comments")
      .select("*")
      .eq("job_order_id", jobOrder.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("job_order_approvals")
      .select("*")
      .eq("job_order_id", jobOrder.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <JobOrderWorkspaceClient
      jobOrder={jobOrder}
      initialComments={comments ?? []}
      initialApproval={approvals?.[0] ?? null}
    />
  );
}
