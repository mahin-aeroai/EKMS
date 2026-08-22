import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { OrderDetailClient } from "@/components/portal/OrderDetailClient";
import type {
  PortalOrderRow,
  PortalOrderItemRow,
  PortalOrderFileRow,
  PortalOrderApprovalRow,
  PortalCompanyStoreRow,
} from "@mmdi/shared/rows";

export const dynamic = "force-dynamic";

export default async function PortalOrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: order }, { data: items }, { data: files }, { data: approvals }, { data: profile }] = await Promise.all([
    supabase.from("portal_orders").select("*").eq("id", orderId).maybeSingle(),
    supabase.from("portal_order_items").select("*").eq("order_id", orderId),
    supabase.from("portal_order_files").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
    supabase.from("portal_order_approvals").select("*").eq("order_id", orderId).order("decided_at", { ascending: false }),
    user ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (!order) notFound();

  const { data: store } = await supabase
    .from("portal_company_stores")
    .select("*")
    .eq("id", (order as PortalOrderRow).store_id)
    .maybeSingle();

  const isStaff = profile?.role === "admin" || profile?.role === "editor";

  return (
    <OrderDetailClient
      order={order as PortalOrderRow}
      items={(items ?? []) as PortalOrderItemRow[]}
      files={(files ?? []) as PortalOrderFileRow[]}
      approvals={(approvals ?? []) as PortalOrderApprovalRow[]}
      store={store as PortalCompanyStoreRow | null}
      isStaff={isStaff}
    />
  );
}
