"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Eye, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { Timeline, type TimelineEntry } from "@/components/ui/Timeline";
import { useToast } from "@/components/ui/Notifications";
import { useLfgUser } from "@/lib/LfgUserContext";
import { supabase } from "@/lib/supabase";
import {
  type LfgSite,
  type StatusHistoryRow,
  type InstallationRow,
  type PhotoRow,
  type ProductionRow,
  type SurveyRow,
  type ShipmentRow,
  type DocumentRow,
  Field,
  SurveyTab,
  ProductionTab,
  ShipmentTab,
  InstallationTab,
  DocumentsTab,
  partnerOf,
} from "@/components/workspaces/LfgSiteWorkspaceClient";
import { LFG_STATUSES, lfgStatusLabel, lfgStatusBadge } from "@/lib/lfgStatus";

// Partner-facing Site 360 -- reuses the exact same Survey/Production/
// Shipment/Installation/Documents tab components as the staff workspace
// (LfgSiteWorkspaceClient.tsx exports them for this reason -- one
// implementation, not a fork that can drift), just composed differently:
// no Financials tab at all (this component's props have nowhere a
// financial figure could even come from -- see the server page's own
// comment on why those tables are never fetched here), and no Delete Site
// (lfg_sites_delete_staff is admin-only regardless of what a button here
// might show).
//
// `editable` is unconditionally true for a real partner, unlike the staff
// component's `canWrite(role)` gate -- lfg_sites_update /
// lfg_site_surveys_insert / lfg_production_* / lfg_shipments_* /
// lfg_installations_* / lfg_installation_photos_insert /
// lfg_site_documents_insert all grant the site's own partner write access
// for exactly these operational fields (see
// supabase-lfg-site-management-schema.sql) -- RLS is what actually
// enforces "only THIS site, only THESE columns" (via
// lfg_sites_guard_partner_update() for the direct lfg_sites columns);
// this component just doesn't second-guess that with an extra UI gate.
// Photo/document delete is kept off for partners (canDeletePhotos/
// canDeleteDocs={false}) -- simpler than tracking "did I upload this" in
// the UI to match the delete policies' own self-upload carve-out.
//
// A selectively lfg_connect_access-flagged STAFF sign-in (identity.isStaff,
// see lfg-auth.ts) reuses this exact same component -- it's the same
// compact UI, just not scoped to one partner's sites (see the parent
// Server Component page). Its write access follows the account's REAL
// role instead of always being true, mirroring what the underlying RLS
// policies already grant that role: admin/editor get full operational
// write (same shape a partner gets); viewer is read-only everywhere, same
// as the rest of the app. No Financials tab and no Delete Site here
// either way, even for an admin -- this stays the lightweight surface;
// that stuff lives in the full internal app.

export function LfgPartnerSiteClient({
  site,
  initialStatusHistory,
  initialInstallation,
  initialInstallationPhotos,
  initialProduction,
  initialSurveys,
  initialShipments,
  initialDocuments,
}: {
  site: LfgSite;
  initialStatusHistory: StatusHistoryRow[];
  initialInstallation: InstallationRow | null;
  initialInstallationPhotos: PhotoRow[];
  initialProduction: ProductionRow | null;
  initialSurveys: SurveyRow[];
  initialShipments: ShipmentRow[];
  initialDocuments: DocumentRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const identity = useLfgUser();
  const isStaff = identity?.isStaff ?? false;
  const staffRole = identity?.staffRole ?? null;
  // See the header comment above for the RLS mapping behind each of these.
  const editable = isStaff ? staffRole === "admin" || staffRole === "editor" : true;
  const canWriteProduction = isStaff ? editable : false;
  const canApprove = isStaff ? editable : false;
  const canDelete = isStaff && staffRole === "admin";
  // Read-only display for the partner -- moving a site between seasonal
  // Programs is a staff-only bulk operation (task #46, admin/editor
  // gated), so this surface just shows the site's current one.
  const programEntry = Array.isArray(site.lfg_programs) ? site.lfg_programs[0] : site.lfg_programs;
  const programName = programEntry?.name;
  const partner = partnerOf(site);

  const [statusHistory] = useState(initialStatusHistory);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState(site.site_status);
  const [statusRemarks, setStatusRemarks] = useState("");
  const [changingStatus, setChangingStatus] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const pictureInputRef = useRef<HTMLInputElement | null>(null);

  async function handleChangeStatus() {
    setChangingStatus(true);
    const { error } = await supabase.rpc("lfg_change_site_status", {
      p_site_id: site.id,
      p_new_status: newStatus,
      p_remarks: statusRemarks.trim() || null,
    });
    setChangingStatus(false);
    if (error) {
      toast("danger", `Couldn't change status: ${error.message}`);
      return;
    }
    toast("success", `Status changed to ${lfgStatusLabel(newStatus)}`);
    setShowStatusDialog(false);
    setStatusRemarks("");
    router.refresh();
  }

  // Same presign-then-PUT-then-record flow as the staff Site 360's
  // picture upload (see reference-picture/upload-url's header comment for
  // why the RLS check lives there too) -- this is just the partner-side
  // caller of the same two routes.
  async function handleUploadPicture(file: File) {
    setUploadingPicture(true);
    try {
      const uploadRes = await fetch(`/api/lfg/sites/${site.id}/reference-picture/upload-url`, { method: "POST" });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        toast("danger", uploadData.message || uploadData.error || "Couldn't get an upload link");
        return;
      }
      const putRes = await fetch(uploadData.url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: file });
      if (!putRes.ok) {
        toast("danger", "Upload to storage failed");
        return;
      }
      const { error: updateError } = await supabase
        .from("lfg_sites")
        .update({ site_reference_picture_path: uploadData.relative_path })
        .eq("id", site.id);
      if (updateError) {
        toast("danger", `Uploaded, but couldn't save it: ${updateError.message}`);
        return;
      }
      toast("success", "Site picture uploaded");
      router.refresh();
    } finally {
      setUploadingPicture(false);
    }
  }

  async function handleViewPicture() {
    const res = await fetch(`/api/lfg/sites/${site.id}/reference-picture/signed-url`);
    const data = await res.json();
    if (!res.ok) {
      toast("danger", data.message || data.error || "Couldn't open this picture");
      return;
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  const items: TabItem[] = [
    {
      id: "info",
      label: "Site Information",
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Site Picture</h3>
              <p className="mt-0.5 text-xs text-ink-muted">
                {site.site_reference_picture_path ? "A reference picture is on file for this site." : "No picture uploaded yet."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {site.site_reference_picture_path && (
                <Button size="sm" variant="secondary" onClick={handleViewPicture}>
                  <Eye size={14} className="mr-1.5" /> View
                </Button>
              )}
              <input
                ref={pictureInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUploadPicture(file);
                  e.target.value = "";
                }}
              />
              <Button size="sm" variant="secondary" disabled={uploadingPicture} onClick={() => pictureInputRef.current?.click()}>
                <Upload size={14} className="mr-1.5" />
                {uploadingPicture ? "Uploading…" : site.site_reference_picture_path ? "Replace" : "Upload"}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3">
            <Field label="Site ID" value={site.site_id} />
            <Field label="Outlet Name" value={site.outlet_name} />
            <Field label="Format" value={site.format} />
            <Field label="Program (Season)" value={programName} />
            <Field label="SFO ID" value={site.sfo_id} />
            <Field label="City" value={site.city} />
            <Field label="Region" value={site.region} />
            <Field label="Material" value={site.material} />
            <Field label="Mat Code" value={site.mat_code} />
            <Field label="Number of Sites" value={site.number_of_sites} />
            <Field label="Width" value={site.width} />
            <Field label="Height" value={site.height} />
            <Field label="Bleed" value={site.bleed} />
            <Field label="SQFT" value={site.sqft} />
            <Field label="ASM Name" value={site.asm_name} />
            <Field label="ASM Mobile" value={site.asm_mobile} />
            <Field label="ASM Email" value={site.asm_email} />
            <div className="col-span-2 sm:col-span-3">
              <Field label="Store Address" value={site.store_address} />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Field label="Remarks" value={site.remarks} />
            </div>
          </div>
          {/* Status was previously its own tab -- folded in here (task
              #55), mirroring the same change in the staff Site 360. */}
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-muted">Current status</span>
              <Badge status={lfgStatusBadge(site.site_status)}>{lfgStatusLabel(site.site_status)}</Badge>
            </div>
            <Button size="sm" onClick={() => { setNewStatus(site.site_status); setShowStatusDialog(true); }}>
              Change Status
            </Button>
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Status History</h3>
            {statusHistory.length === 0 ? (
              <p className="text-sm text-ink-muted">No status changes recorded yet.</p>
            ) : (
              <Timeline
                entries={statusHistory.map(
                  (h): TimelineEntry => ({
                    id: h.id,
                    date: new Date(h.changed_at).toLocaleString(),
                    title: `${h.previous_status ? lfgStatusLabel(h.previous_status) : "—"} → ${lfgStatusLabel(h.new_status)}`,
                    description: h.remarks ?? undefined,
                  })
                )}
              />
            )}
          </div>
        </div>
      ),
    },
    {
      id: "survey",
      label: "Survey",
      content: (
        <SurveyTab
          siteId={site.id}
          initialSurveys={initialSurveys}
          creativeReceivedAt={site.creative_received_at}
          siteVerifiedAt={site.site_verified_at}
          editable={editable}
          canApprove={canApprove}
          onChanged={() => router.refresh()}
        />
      ),
    },
    {
      id: "production",
      label: "Production",
      // lfg_production_write_staff has no partner clause at all (see the
      // schema comment on that table) -- a real partner gets read-only
      // here, unlike every other tab; a staff sign-in follows canWriteProduction
      // instead (true for admin/editor, same as `editable` there).
      content: <ProductionTab siteId={site.id} initial={initialProduction} editable={canWriteProduction} onChanged={() => router.refresh()} />,
    },
    {
      id: "shipment",
      label: "Shipment",
      content: <ShipmentTab siteId={site.id} initialShipments={initialShipments} editable={editable} onChanged={() => router.refresh()} />,
    },
    {
      id: "installation",
      label: "Installation",
      content: (
        <InstallationTab
          siteId={site.id}
          initial={initialInstallation}
          initialPhotos={initialInstallationPhotos}
          editable={editable}
          canDeletePhotos={canDelete}
          onChanged={() => router.refresh()}
          partnerName={partner?.name}
        />
      ),
    },
    {
      id: "documents",
      label: "Documents",
      content: (
        <DocumentsTab
          siteId={site.id}
          initialDocuments={initialDocuments}
          editable={editable}
          canDeleteDocs={canDelete}
          onChanged={() => router.refresh()}
        />
      ),
    },
  ];

  return (
    <div>
      {/* Landing here is always from the partner "Your Sites" / "All
          Sites" list -- router.back() returns there (task #56). */}
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => router.back()}>
        <ArrowLeft size={14} className="mr-1.5" /> Back
      </Button>

      <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-ink">{site.outlet_name}</h1>
            <Badge status={lfgStatusBadge(site.site_status)}>{lfgStatusLabel(site.site_status)}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-ink-secondary">
            {site.site_id} · {site.format ?? "No format"} · {site.city ?? "No city"}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <Tabs items={items} defaultId="info" />
      </div>

      <Dialog
        open={showStatusDialog}
        onClose={() => setShowStatusDialog(false)}
        title="Change Site Status"
        variant="confirm"
        onConfirm={handleChangeStatus}
        confirmLabel={changingStatus ? "Saving…" : "Save"}
      >
        <div className="flex flex-col gap-3">
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            {LFG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {lfgStatusLabel(s)}
              </option>
            ))}
          </select>
          <textarea
            value={statusRemarks}
            onChange={(e) => setStatusRemarks(e.target.value)}
            placeholder="Remarks (optional)"
            rows={3}
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </div>
      </Dialog>
    </div>
  );
}
