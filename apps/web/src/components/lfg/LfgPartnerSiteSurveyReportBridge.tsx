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
// previously staff-only) into the LFG Connect flow -- both partner AND
// staff sessions render this same component (see identity.partnerId
// handling in onGenerated below). On a successful Generate:
//  1. If the report has no site_id yet (a freestanding draft), create a
//     new lfg_stores + lfg_sites row from its header fields and attach
//     the report to it -- "site survey creates a new site" (task
//     feedback: surveys created in LFG Connect weren't showing up in the
//     Site Master list -- this auto-create step used to run for
//     partners only). Reuses an existing store by SFO ID first,
//     mirroring workspaces/lfg/new/page.tsx's own match-before-insert
//     logic (lfg_stores has a unique sfo_id index -- a blind insert on a
//     collision would 23505). A staff-created site has no partnerId to
//     scope that reuse-lookup or the new row to -- it's created
//     unassigned (partner_id: null, same as a New Site form submission
//     with no partner picked) and can be assigned one later.
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
      // Staff-via-LFG-Connect sessions have no partnerId (they're not
      // tied to one partner) -- previously that meant this whole
      // auto-create step was skipped entirely for staff, leaving a
      // siteless report with no way to become a real site short of the
      // New Site form (task feedback: "We have created site survey using
      // lfgconnect but those sites are not added to the list"). Both
      // lfg_stores.partner_id and lfg_sites.partner_id are nullable, so a
      // staff-created site/store here is simply unassigned to a partner
      // -- same as one created via the New Site form with no partner
      // picked -- and can be assigned one later from the site's own edit
      // screen. `.is("partner_id", null)` below is deliberate: `.eq(...,
      // null)` would match nothing (SQL NULL isn't `=` to anything),
      // silently creating a duplicate store on every subsequent staff
      // survey for the same SFO ID otherwise.
      const partnerId = identity.partnerId;

      let storeId: string | null = null;
      const sfoId = report.sfo_id?.trim();
      if (sfoId) {
        let existingStoreQuery = supabase.from("lfg_stores").select("id").eq("sfo_id", sfoId);
        existingStoreQuery = partnerId
          ? existingStoreQuery.eq("partner_id", partnerId)
          : existingStoreQuery.is("partner_id", null);
        const { data: existingStore } = await existingStoreQuery.maybeSingle();
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
            partner_id: partnerId,
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
          partner_id: partnerId,
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
    const { error: docError } = await supabase.from("lfg_site_documents").insert({
      site_id: siteId,
      category: "survey",
      file_name: `${report.store_name || "site-survey"}.pdf`,
      file_type: "application/pdf",
      relative_path: uploadData.relative_path,
      uploaded_by: user?.id ?? null,
      uploaded_by_role: identity.partnerId ? "partner" : "staff",
    });
    if (docError) {
      // The PDF is already uploaded to R2 at this point -- only the row
      // linking it to the site's Documents tab failed. Surface this
      // rather than silently continuing into a "saved" toast that isn't
      // true yet; the status advance below still runs, since that's the
      // part that matters most operationally.
      toast("danger", `PDF uploaded, but couldn't attach it to the site's documents: ${docError.message}`);
    }

    const { data: site } = await supabase.from("lfg_sites").select("site_status").eq("id", siteId).single();
    const currentRank = LFG_STATUSES.indexOf(site?.site_status as LfgStatus);
    const targetRank = LFG_STATUSES.indexOf("survey_completed");
    if (currentRank < targetRank) {
      const { error: statusError } = await supabase.rpc("lfg_change_site_status", {
        p_site_id: siteId,
        p_new_status: "survey_completed",
        p_remarks: `Site Survey Report generated by ${identity.partnerId ? "partner" : "staff"}`,
      });
      if (statusError) {
        toast("danger", `Site saved, but its status couldn't be updated: ${statusError.message}`);
        router.push(lfgHref(`/sites/${siteId}`, onLfgHost));
        return;
      }
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
