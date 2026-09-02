import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LfgPartnerInstallationReportBridge } from "@/components/lfg/LfgPartnerInstallationReportBridge";

// Thin server component, same convention as every other dynamic-route
// page in this app -- fetches just the fields LockedInstallationSite
// needs, then hands off to the Client Component bridge (which itself
// dynamic-imports the ssr:false editor). lfg_sites_select RLS already
// scopes this to a site the signed-in caller (staff or the owning
// partner) is allowed to see -- a mismatched siteId comes back `site:
// null` -> notFound(), same pattern as
// sites/[siteId]/page.tsx's own siteError handling.
export const dynamic = "force-dynamic";

export default async function LfgInstallationReportLaunchPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: site, error } = await supabase
    .from("lfg_sites")
    .select("id, outlet_name, store_address, sfo_id, format, asm_name, asm_mobile, site_status")
    .eq("id", siteId)
    .maybeSingle();

  if (error || !site) {
    notFound();
  }

  return (
    <LfgPartnerInstallationReportBridge
      site={{
        id: site.id,
        outletName: site.outlet_name,
        address: site.store_address,
        sfoId: site.sfo_id,
        format: site.format,
        asmName: site.asm_name,
        asmMobile: site.asm_mobile,
        site_status: site.site_status,
      }}
    />
  );
}
