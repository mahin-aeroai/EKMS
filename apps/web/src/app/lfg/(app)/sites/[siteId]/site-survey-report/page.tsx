import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getOnLfgHost } from "@/lib/lfg-host-server";
import { lfgHref } from "@/lib/lfg-links-shared";

// "Launch from an existing site" entry point -- the button on the
// partner Site 360's Survey tab (LfgPartnerSiteClient.tsx) links here.
// Finds (or creates, prefilled from the site's own fields) a
// site_survey_reports row already attached to this site, then redirects
// to its editor at /lfg/(app)/site-survey-reports/[reportId] -- so a
// second visit reuses the same in-progress report instead of creating a
// duplicate every time.
export const dynamic = "force-dynamic";

export default async function LfgSiteSurveyReportLaunchPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const supabase = await createServerSupabaseClient();
  const onLfgHost = await getOnLfgHost();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(lfgHref("/login", onLfgHost));
  }

  const { data: site, error: siteError } = await supabase
    .from("lfg_sites")
    .select("id, outlet_name, store_address, sfo_id, format")
    .eq("id", siteId)
    .maybeSingle();
  if (siteError || !site) {
    notFound();
  }

  // Reuse the most recently touched report already attached to this site,
  // if one exists (RLS already scopes this to a report this caller is
  // allowed to see) -- avoids creating a duplicate on a second visit.
  const { data: existing } = await supabase
    .from("site_survey_reports")
    .select("id")
    .eq("site_id", siteId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    redirect(lfgHref(`/site-survey-reports/${existing.id}`, onLfgHost));
  }

  const { data: created, error: createError } = await supabase
    .from("site_survey_reports")
    .insert({
      source: "manual",
      status: "draft",
      site_id: siteId,
      store_name: site.outlet_name,
      address: site.store_address,
      sfo_id: site.sfo_id,
      program: site.format,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (createError || !created) {
    // Fall back to the reports list rather than a hard error -- the
    // partner can still start a report manually and attach it themselves.
    redirect(lfgHref("/site-survey-reports", onLfgHost));
  }

  redirect(lfgHref(`/site-survey-reports/${created.id}`, onLfgHost));
}
