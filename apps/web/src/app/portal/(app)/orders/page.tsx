import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PortalOrderList } from "@/components/portal/PortalOrderList";
import type { PortalOrderRow, PortalCompanyStoreRow } from "@mmdi/shared/rows";

export const dynamic = "force-dynamic";

export default async function PortalOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: orders, error } = await supabase
    .from("portal_orders")
    .select("id, order_no, status, payment_status, total_amount, created_at, store_id")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-tint p-4 text-sm text-danger">
        Couldn&apos;t load your orders: {error.message}
      </div>
    );
  }

  const storeIds = [...new Set((orders ?? []).map((o) => o.store_id))];
  const { data: stores } = await supabase.from("portal_company_stores").select("id, store_name").in("id", storeIds.length ? storeIds : [""]);
  const storeMap = new Map(((stores ?? []) as Pick<PortalCompanyStoreRow, "id" | "store_name">[]).map((s) => [s.id, s.store_name]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Order history</h1>
        <p className="text-sm text-ink-muted">Every order placed by your account, oldest to newest.</p>
      </div>
      <PortalOrderList orders={(orders ?? []) as PortalOrderRow[]} storeNames={Object.fromEntries(storeMap)} />
    </div>
  );
}
