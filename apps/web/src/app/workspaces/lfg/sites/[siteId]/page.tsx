import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LfgSiteWorkspaceClient } from "@/components/workspaces/LfgSiteWorkspaceClient";

// Always fetch fresh -- a site's status/financials/audit trail change
// often enough that a cached page would go stale fast.
export const dynamic = "force-dynamic";

// Site 360 -- the single page a Site ID's whole lifecycle lives on (Site
// Information, Status + history, Survey, Production, Shipment,
// Installation, Documents, Financials [Admin Only], Activity/Audit
// Trail), keyed by lfg_sites.id (the uuid, not the human "LFG-000001"
// site_id -- the list page's row links here by id). See
// components/workspaces/LfgSiteWorkspaceClient.tsx for the tab content
// itself; this file is only the server-side data fetch, mirroring
// workspaces/customer/[code]/page.tsx's split.
//
// lfg_site_financials/lfg_installation_costs are fetched here the same as
// every other related table -- RLS is what actually keeps a partner from
// ever getting rows back (zero grant, see the schema's header comment);
// this staff workspace runs as admin/editor/viewer, all of which pass.
// The client component still hides the Financials tab from non-editor
// roles in the UI (see its own comment) -- that's a UX nicety on top of
// the real boundary, not a substitute for it.
//
// lfg_installation_photos is a different case -- unlike the cost tables,
// its RLS grants both staff and the site's own partner select/insert (see
// supabase-lfg-site-management-schema.sql), so this fetch isn't gated to
// any particular role here; the Installation tab just renders whatever
// rows come back.
export default async function LfgSiteDetailPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: site, error: siteError } = await supabase
    .from("lfg_sites")
    .select("*, lfg_partners(id, name)")
    .eq("id", siteId)
    .maybeSingle();

  if (siteError) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-tint p-6 text-sm text-danger">
        Couldn&apos;t load this site from Supabase.
        <pre className="mt-2 whitespace-pre-wrap text-xs">{siteError.message}</pre>
      </div>
    );
  }

  if (!site) {
    notFound();
  }

  const [
    { data: statusHistory },
    { data: financials },
    { data: installationCosts },
    { data: installation },
    { data: installationPhotos },
    { data: production },
    { data: surveys },
    { data: auditLog },
  ] = await Promise.all([
    supabase.from("lfg_site_status_history").select("*").eq("site_id", siteId).order("changed_at", { ascending: false }),
    supabase.from("lfg_site_financials").select("*").eq("site_id", siteId).maybeSingle(),
    supabase.from("lfg_installation_costs").select("*").eq("site_id", siteId).maybeSingle(),
    supabase.from("lfg_installations").select("*").eq("site_id", siteId).maybeSingle(),
    supabase.from("lfg_installation_photos").select("*").eq("site_id", siteId).order("uploaded_at", { ascending: false }),
    supabase.from("lfg_production").select("*").eq("site_id", siteId).maybeSingle(),
    supabase.from("lfg_site_surveys").select("*").eq("site_id", siteId).order("created_at", { ascending: false }),
    supabase.from("lfg_audit_log").select("*").eq("site_id", siteId).order("created_at", { ascending: false }).limit(50),
  ]);

  return (
    <LfgSiteWorkspaceClient
      site={site}
      initialStatusHistory={statusHistory ?? []}
      initialFinancials={financials ?? null}
      initialInstallationCosts={installationCosts ?? null}
      initialInstallation={installation ?? null}
      initialInstallationPhotos={installationPhotos ?? []}
      initialProduction={production ?? null}
      initialSurveys={surveys ?? []}
      initialAuditLog={auditLog ?? []}
    />
  );
}
