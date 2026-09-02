"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Notifications";
import { useLfgUser } from "@/lib/LfgUserContext";
import { useLfgHost, lfgHref } from "@/lib/lfg-links";
import { supabase } from "@/lib/supabase";
import { LFG_STATUSES, type LfgStatus } from "@/lib/lfgStatus";
import type { SiteSurveyReportRow } from "@/lib/siteSurveyReport/types";

// Same ssr:false reasoning as SiteSurveyReportEditorPageClient.tsx (the
// staff wrapper): the editor builds PDFs client-side (pdf-lib/pdfjs-dist),
// none of which exist in the Node.js environment Next.js uses to
// prerender pages during `next build`. This is the partner-facing
// equivalent of that wrapper -- deliberately does NOT use
// ToolAccessGuard (that's the staff /workspaces/* tool-access system;
// the real gate for everything under /lfg/(app)/* is getLfgIdentity() in
// this app's own layout.tsx, already applied before this component ever
// renders).
const SiteSurveyReportEditorClient = dynamic(
  () => import("@/components/siteSurveyReport/SiteSurveyReportEditorClient").then((m) => m.SiteSurveyReportEditorClient),
  {
    ssr: false,
    loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading Site Survey Report…</p>,
  }
);

// Bridges the standalone Site Survey Report Creator (site_survey_reports,
// previously staff-only) into the LFG partner flow. On a successful
// Generate:
//  1. If the report has no site_id yet (a freestanding draft), create a
//     new lfg_stores + lfg_sites row from its header fields and attach
//     the report to it -- the partner's "site survey creates a new site"
//     requirement. Reuses an existing store by SFO ID for this partner
//     first, mirroring workspaces/lfg/new/page.tsx's own match-before-
//     insert logic (lfg_stores has a unique sfo_id index -- a blind
//     insert on a collision would 23505).
//  2. Uploads the generated PDF as an lfg_site_documents row
//     (category="survey") via the already partner-aware
//     /api/lfg/sites/[siteId]/documents/upload-url route -- new
//     behavior; the tool's own handleGenerate() only ever downloaded the
//     blob locally before this.
//  3. Advances site_status to "survey_completed" via the same RPC every
//     other status change in this app uses, rank-guarded so an
//     already-further-along site is never regressed.
export function LfgPartnerSiteSurveyReportBridge({ reportId }: { reportId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const identity = useLfgUser();
  const onLfgHost = useLfgHost();

  async function onGenerated({ report, pdfBlob }: { report: SiteSurveyReportRow; pdfBlob: Blob }) {
    if (!identity) return;

    let siteId = report.site_id;

    if (!siteId) {
      if (!identity.partnerId) {
        // A staff-via-lfg-connect session on a still-siteless report --
        // no partner_id to create a site under. The PDF has already
        // downloaded (SiteSurveyReportEditorClient does that before
        // calling onGenerated); just point them at the right place to
        // finish attaching it.
        toast(
          "info",
          "This report has no site yet -- create the site via LFG Connect's New Site form or the internal Site Survey Reports tool, then attach this report to it."
        );
        return;
      }

      let storeId: string | null = null;
      const sfoId = report.sfo_id?.trim();
      if (sfoId) {
        const { data: existingStore } = await supabase
          .from("lfg_stores")
          .select("id")
          .eq("sfo_id", sfoId)
          .eq("partner_id", identity.partnerId)
          .maybeSingle();
        storeId = existingStore?.id ?? null;
      }

      if (!storeId) {
        const { data: newStore, error: storeErr } = await supabase
          .from("lfg_stores")
          .insert({
            store_name: report.store_name || "Untitled store",
            // site_survey_reports.program is the same retail-chain/format
            // concept as lfg_sites.format -- that column was literally
            // named "program" before its own rename (see lfg_sites' STEP
            // 7 comment in supabase-lfg-site-management-schema.sql).
            format: report.program || null,
            sfo_id: sfoId || null,
            store_address: report.address || null,
            partner_id: identity.partnerId,
          })
          .select("id")
          .single();
        if (storeErr || !newStore) {
          toast("danger", `Couldn't create the store record: ${storeErr?.message ?? "unknown error"}`);
          return;
        }
        storeId = newStore.id;
      }

      const { data: newSite, error: siteErr } = await supabase
        .from("lfg_sites")
        .insert({
          outlet_name: report.store_name || "Untitled store",
          format: report.program || null,
          sfo_id: sfoId || null,
          store_address: report.address || null,
          store_id: storeId,
          partner_id: identity.partnerId,
        })
        .select("id")
        .single();
      if (siteErr || !newSite) {
        // Best-effort cleanup, mirrors workspaces/lfg/new/page.tsx's own
        // orphaned-store handling.
        await supabase.from("lfg_stores").delete().eq("id", storeId);
        toast("danger", `Couldn't create the site: ${siteErr?.message ?? "unknown error"}`);
        return;
      }
      siteId = newSite.id;
      await supabase.from("site_survey_reports").update({ site_id: siteId }).eq("id", report.id);
    }

    const uploadRes = await fetch(`/api/lfg/sites/${siteId}/documents/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "survey",
        file_name: `${report.store_name || "site-survey"}.pdf`,
        file_type: "application/pdf",
      }),
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      toast("danger", uploadData?.message || "Couldn't save the report file");
      return;
    }
    await fetch(uploadData.url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: pdfBlob });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("lfg_site_documents").insert({
      site_id: siteId,
      category: "survey",
      file_name: `${report.store_name || "site-survey"}.pdf`,
      file_type: "application/pdf",
      relative_path: uploadData.relative_path,
      uploaded_by: user?.id ?? null,
      uploaded_by_role: "partner",
    });

    const { data: site } = await supabase.from("lfg_sites").select("site_status").eq("id", siteId).single();
    const currentRank = LFG_STATUSES.indexOf(site?.site_status as LfgStatus);
    const targetRank = LFG_STATUSES.indexOf("survey_completed");
    if (currentRank < targetRank) {
      await supabase.rpc("lfg_change_site_status", {
        p_site_id: siteId,
        p_new_status: "survey_completed",
        p_remarks: "Site Survey Report generated by partner",
      });
    }

    toast("success", "Site survey saved — site created/updated");
    router.push(lfgHref(`/sites/${siteId}`, onLfgHost));
  }

  return (
    <SiteSurveyReportEditorClient
      reportId={reportId}
      basePath={lfgHref("/site-survey-reports", onLfgHost)}
      homeHref={lfgHref("/", onLfgHost)}
      hideDefaultsLink
      onGenerated={onGenerated}
    />
  );
}
