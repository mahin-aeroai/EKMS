import { type CustomerRow } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CustomerWorkspaceClient } from "@/components/workspaces/CustomerWorkspaceClient";

// Always fetch fresh data from Supabase — this workspace is no longer a static demo.
export const dynamic = "force-dynamic";

const DEMO_CUSTOMER_CODE = "CUST-MU-002104";

export default async function CustomerWorkspacePage() {
  const supabase = await createServerSupabaseClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("code", DEMO_CUSTOMER_CODE)
    .single();

  if (customerError || !customer) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-tint p-6 text-sm text-danger">
        Couldn&apos;t load this customer from Supabase. Confirm the schema has been run (see
        supabase-customer-schema.sql) and that NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
        are set.
        {customerError && <pre className="mt-2 whitespace-pre-wrap text-xs">{customerError.message}</pre>}
      </div>
    );
  }

  const customerId = (customer as CustomerRow).id;

  const [{ data: contacts }, { data: comments }, { data: approvals }] = await Promise.all([
    supabase.from("customer_contacts").select("*").eq("customer_id", customerId),
    supabase.from("customer_comments").select("*").eq("customer_id", customerId).order("created_at", { ascending: true }),
    supabase.from("customer_approvals").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
  ]);

  return (
    <CustomerWorkspaceClient
      customer={customer as CustomerRow}
      contacts={contacts ?? []}
      initialComments={comments ?? []}
      initialApproval={approvals?.[0] ?? null}
    />
  );
}
