import { notFound } from "next/navigation";
import { type CustomerRow } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CustomerWorkspaceClient } from "@/components/workspaces/CustomerWorkspaceClient";

// Always fetch fresh data from Supabase — this workspace is no longer a static demo.
export const dynamic = "force-dynamic";

// Any real customer's detail view, keyed by their `code` — this used to be
// hardcoded to a single demo customer (C03739, Apple India Pvt Ltd -
// Bangalore) with no way to open any other customer. See
// src/app/workspaces/customer/page.tsx (now a real searchable list) for how
// people get here; that page links to /workspaces/customer/[code] for
// whichever row they click.
export default async function CustomerDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (customerError) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-tint p-6 text-sm text-danger">
        Couldn&apos;t load this customer from Supabase.
        <pre className="mt-2 whitespace-pre-wrap text-xs">{customerError.message}</pre>
      </div>
    );
  }

  if (!customer) {
    notFound();
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
