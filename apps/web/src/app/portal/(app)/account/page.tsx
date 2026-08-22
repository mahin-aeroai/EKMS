import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getPortalIdentity } from "@/lib/portal-auth";
import { AccountForm } from "@/components/portal/AccountForm";
import { StoresPanel } from "@/components/portal/StoresPanel";
import type {
  PortalCompanyRow,
  PortalCompanyStoreRow,
  PortalStoreAddressHistoryRow,
  PortalUserRow,
} from "@mmdi/shared/rows";

export const dynamic = "force-dynamic";

export default async function PortalAccountPage() {
  const identity = await getPortalIdentity();
  if (!identity) return null;

  const supabase = await createServerSupabaseClient();
  const [{ data: company }, { data: stores }, { data: portalUser }] = await Promise.all([
    supabase.from("portal_companies").select("*").eq("id", identity.companyId).maybeSingle(),
    supabase.from("portal_company_stores").select("*").eq("company_id", identity.companyId).eq("active", true).order("store_name"),
    supabase.from("portal_users").select("*").eq("id", identity.userId).maybeSingle(),
  ]);

  const storeIds = (stores ?? []).map((s) => s.id);
  const { data: history } =
    storeIds.length > 0
      ? await supabase
          .from("portal_store_address_history")
          .select("*")
          .in("store_id", storeIds)
          .order("changed_at", { ascending: false })
      : { data: [] as PortalStoreAddressHistoryRow[] };
  const historyByStore: Record<string, PortalStoreAddressHistoryRow[]> = {};
  for (const h of (history ?? []) as PortalStoreAddressHistoryRow[]) {
    (historyByStore[h.store_id] ??= []).push(h);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Account</h1>
        <p className="text-sm text-ink-muted">Your company profile and stores, as set up by MMDI.</p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="mb-3 text-sm font-semibold text-ink">Company (managed by MMDI)</p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-muted">Company name</dt>
            <dd className="text-ink">{(company as PortalCompanyRow | null)?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">GSTIN</dt>
            <dd className="text-ink">{(company as PortalCompanyRow | null)?.gstin ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-ink-muted">Billing address</dt>
            <dd className="text-ink">{(company as PortalCompanyRow | null)?.billing_address ?? "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">To change these details, contact MMDI directly.</p>
      </div>

      <AccountForm portalUser={portalUser as PortalUserRow | null} userId={identity.userId} email={identity.email} />

      <StoresPanel stores={(stores ?? []) as PortalCompanyStoreRow[]} historyByStore={historyByStore} />
    </div>
  );
}
