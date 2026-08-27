import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LfgPartnerSiteClient } from "@/components/lfg/LfgPartnerSiteClient";

// Partner-facing Site 360 -- the counterpart to
// workspaces/lfg/sites/[siteId]/page.tsx (staff), scoped down for an
// external installation-partner account. Deliberately does NOT fetch
// lfg_site_financials/lfg_installation_costs at all -- unlike the staff
// page (which fetches them and relies on RLS + a client-side UI gate),
// this page just never asks, so there's no financial data in the payload
// to begin with. See lfg-auth.ts's "SECURITY REMINDER" comment: never
// widen an /lfg/* page's query to join those tables.
//
// lfg_sites_select RLS (staff OR the site's own partner) already scopes
// this to sites owned by the signed-in partner -- a partner requesting
// another partner's site id here gets the same `site: null` -> notFound()
// as a typo'd id, no separate check needed (same pattern as the staff
// page's own siteError handling).
export const dynamic = "force-dynamic";

export default async function LfgPartnerSiteDetailPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: site, error: siteError } = await supabase
    .from("lfg_sites")
    .select(
      "id, site_id, outlet_name, format, sfo_id, city, region, store_address, material, mat_code, number_of_sites, width, height, bleed, sqft, asm_name, asm_mobile, asm_email, escalation_email, remarks, site_status, creative_received_at, site_verified_at, site_reference_picture_path, partner_id, store_id, program_id, lfg_partners(id, name), lfg_programs(id, name)"
    )
    .eq("id", siteId)
    .maybeSingle();

  if (siteError || !site) {
    notFound();
  }

  const [
    { data: statusHistory },
    { data: installation },
    { data: installationPhotos },
    { data: production },
    { data: surveys },
    { data: shipments },
    { data: documents },
  ] = await Promise.all([
    supabase.from("lfg_site_status_history").select("*").eq("site_id", siteId).order("changed_at", { ascending: false }),
    supabase.from("lfg_installations").select("*").eq("site_id", siteId).maybeSingle(),
    supabase.from("lfg_installation_photos").select("*").eq("site_id", siteId).order("uploaded_at", { ascending: false }),
    supabase.from("lfg_production").select("*").eq("site_id", siteId).maybeSingle(),
    supabase.from("lfg_site_surveys").select("*").eq("site_id", siteId).order("created_at", { ascending: false }),
    supabase.from("lfg_shipments").select("*").eq("site_id", siteId).order("created_at", { ascending: false }),
    supabase.from("lfg_site_documents").select("*").eq("site_id", siteId).order("uploaded_at", { ascending: false }),
  ]);

  return (
    <LfgPartnerSiteClient
      site={site}
      initialStatusHistory={statusHistory ?? []}
      initialInstallation={installation ?? null}
      initialInstallationPhotos={installationPhotos ?? []}
      initialProduction={production ?? null}
      initialSurveys={surveys ?? []}
      initialShipments={shipments ?? []}
      initialDocuments={documents ?? []}
    />
  );
}
