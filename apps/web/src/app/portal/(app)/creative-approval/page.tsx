import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CreativeApprovalClient } from "@/components/portal/CreativeApprovalClient";
import type { PortalOrderRow, PortalOrderFileRow, PortalCompanyStoreRow } from "@mmdi/shared/rows";

export const dynamic = "force-dynamic";

// A cross-order "everything needing a design decision, in one place" view
// -- separate from and additional to the existing per-order proof/approve
// card on /orders/[orderId] (OrderDetailClient), which stays exactly as
// it was. That page is still the full record for one order (bill, items,
// shipping, invoices, full approval history); this page is the fast path
// for the common case -- "what design proofs are waiting on me right
// now, across every order" -- without hunting through the order list one
// at a time. See PortalTopBar.tsx for the new nav entry and the home
// page's "Orders needing your review" card, now pointed here instead of
// at /orders.
//
// 16 Sept 2026: task feedback -- "Lets introduce a fresh tab for creative
// approval and place the designs there and back and forth revisions."
export default async function CreativeApprovalPage() {
  const supabase = await createServerSupabaseClient();

  // Only orders that have had at least one proof uploaded are relevant
  // here -- an order still sitting at "submitted" with no proof yet has
  // nothing for the customer to decide on (that's MMDI's queue, see the
  // staff-side Creative Approval tab in the Customer Portal workspace).
  const { data: orders, error } = await supabase
    .from("portal_orders")
    .select("id, order_no, status, payment_status, store_id, current_revision_number, updated_at")
    .gt("current_revision_number", 0)
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-tint p-4 text-sm text-danger">
        Couldn&apos;t load creative approvals: {error.message}
      </div>
    );
  }

  const rows = (orders ?? []) as Pick<
    PortalOrderRow,
    "id" | "order_no" | "status" | "payment_status" | "store_id" | "current_revision_number" | "updated_at"
  >[];
  const orderIds = rows.map((o) => o.id);

  const [{ data: stores }, { data: proofFiles }] = await Promise.all([
    supabase
      .from("portal_company_stores")
      .select("id, store_name")
      .in("id", [...new Set(rows.map((o) => o.store_id))].length ? [...new Set(rows.map((o) => o.store_id))] : [""]),
    orderIds.length
      ? supabase
          .from("portal_order_files")
          .select("*")
          .in("order_id", orderIds)
          .eq("kind", "proof")
          .order("revision_number", { ascending: false })
      : Promise.resolve({ data: [] as PortalOrderFileRow[] }),
  ]);

  const storeMap = new Map(
    ((stores ?? []) as Pick<PortalCompanyStoreRow, "id" | "store_name">[]).map((s) => [s.id, s.store_name])
  );

  // Reduce to the latest proof file per order (files are already ordered
  // revision_number desc, so the first match per order_id wins).
  const latestProofByOrder = new Map<string, PortalOrderFileRow>();
  for (const file of (proofFiles ?? []) as PortalOrderFileRow[]) {
    if (!latestProofByOrder.has(file.order_id)) latestProofByOrder.set(file.order_id, file);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Creative Approval</h1>
        <p className="text-sm text-ink-muted">Every design proof MMDI has sent you, across all your orders — approve it or ask for changes right here.</p>
      </div>
      <CreativeApprovalClient
        orders={rows}
        storeNames={Object.fromEntries(storeMap)}
        latestProofByOrder={Object.fromEntries(latestProofByOrder)}
      />
    </div>
  );
}
