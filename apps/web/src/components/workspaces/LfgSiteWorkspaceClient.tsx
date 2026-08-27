"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, ShieldAlert, Lock, Upload, Eye, Trash2, Truck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { Timeline, type TimelineEntry } from "@/components/ui/Timeline";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole, canWrite, canDelete } from "@/lib/UserRoleContext";
import { supabase } from "@/lib/supabase";
import {
  LFG_STATUSES,
  lfgStatusLabel,
  lfgStatusBadge,
  formatInr,
  SHIPMENT_STATUSES,
  shipmentStatusLabel,
  shipmentStatusBadge,
  DELIVERY_STATUSES,
  deliveryStatusLabel,
  deliveryStatusBadge,
} from "@/lib/lfgStatus";

// Site 360 -- the tabbed view every part of the spec (New Site through
// Deactivation) ultimately links back to. Survey, Production, Shipment, and
// Installation are real, working tabs here. Documents is deliberately a
// light stub -- Document management (task #21) replaces it with the real
// thing.
// Financials is gated client-side to admin/editor as a UX nicety on top of
// the REAL boundary, which is that
// lfg_site_financials/lfg_installation_costs simply have no RLS grant to
// lfg_partner at all -- a viewer or partner account would get back empty
// data here regardless of what this component renders. The Installation
// tab (lfg_installations + lfg_installation_photos) is deliberately NOT
// gated the same way -- both tables carry real RLS that already includes
// the site's own partner (see supabase-lfg-site-management-schema.sql),
// so `editable` there follows canWrite(role) same as Survey/Production,
// not the admin/editor-only Financials gate. The Admin-only cost fields
// for installation (installation_rate, scaffolding_rate/amount, total
// installation cost, etc.) live on lfg_installation_costs and stay on the
// Financials tab -- this tab only ever touches the operational columns.

interface LfgSite {
  id: string;
  site_id: string;
  outlet_name: string;
  program: string | null;
  sfo_id: string | null;
  city: string | null;
  store_address: string | null;
  material: string | null;
  number_of_sites: number;
  width: number | null;
  height: number | null;
  sqft: number | null;
  asm_name: string | null;
  asm_mobile: string | null;
  asm_email: string | null;
  escalation_email: string | null;
  remarks: string | null;
  site_status: string;
  creative_received_at: string | null;
  partner_id: string | null;
  lfg_partners: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface StatusHistoryRow {
  id: string;
  changed_at: string;
  previous_status: string | null;
  new_status: string;
  remarks: string | null;
  changed_by: string | null;
}

interface FinancialsRow {
  rate: number | null;
  amount: number | null;
  packing_forwarding: number | null;
  other_charges: number | null;
  total_commercial_value: number | null;
  gst_amount: number | null;
  total_printing_amount: number | null;
  material_cost: number | null;
  production_cost: number | null;
  installation_amount: number | null;
  other_expenses: number | null;
  total_project_cost: number | null;
  margin: number | null;
  commercial_terms: string | null;
  budget_category: string | null;
}

interface InstallationCostsRow {
  installation_rate: number | null;
  installation_amount: number | null;
  scaffolding_rate: number | null;
  scaffolding_amount: number | null;
  installation_travelling: number | null;
  scaffolding_plus_travelling: number | null;
  installation_subtotal: number | null;
  installation_gst_amount: number | null;
  labour_other_expenses: number | null;
  total_installation_cost: number | null;
}

interface InstallationRow {
  installation_required: boolean;
  scaffolding_required: boolean;
  scaffolding_size: string | null;
  installation_date: string | null;
  installation_team: string | null;
  installation_status: string;
  installation_remarks: string | null;
}

interface PhotoRow {
  id: string;
  kind: "before" | "after" | "completion";
  relative_path: string;
  uploaded_at: string;
}

interface ProductionRow {
  status: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

interface SurveyRow {
  id: string;
  survey_date: string | null;
  measured_width: number | null;
  measured_height: number | null;
  measurements_remarks: string | null;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
}

interface ShipmentRow {
  id: string;
  courier: string | null;
  awb_number: string | null;
  dispatch_date: string | null;
  expected_delivery_date: string | null;
  shipment_contents: string | null;
  number_of_packages: number | null;
  package_details: string | null;
  current_status: string;
  delivery_status: string;
  delivery_date: string | null;
  pod_path: string | null;
  courier_remarks: string | null;
  internal_remarks: string | null;
  created_at: string;
}

interface ShipmentEventRow {
  id: string;
  event_status: string;
  event_time: string;
  location: string | null;
  source: "manual" | "api";
}

interface AuditLogRow {
  id: string;
  created_at: string;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
}

function partnerOf(site: LfgSite) {
  const p = Array.isArray(site.lfg_partners) ? site.lfg_partners[0] : site.lfg_partners;
  return p ?? null;
}

const inputClass =
  "rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";
const labelClass = "text-xs font-medium text-ink-secondary";

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-sm text-ink">{value === null || value === undefined || value === "" ? "—" : value}</div>
    </div>
  );
}

export function LfgSiteWorkspaceClient({
  site,
  initialStatusHistory,
  initialFinancials,
  initialInstallationCosts,
  initialInstallation,
  initialInstallationPhotos,
  initialProduction,
  initialSurveys,
  initialShipments,
  initialAuditLog,
}: {
  site: LfgSite;
  initialStatusHistory: StatusHistoryRow[];
  initialFinancials: FinancialsRow | null;
  initialInstallationCosts: InstallationCostsRow | null;
  initialInstallation: InstallationRow | null;
  initialInstallationPhotos: PhotoRow[];
  initialProduction: ProductionRow | null;
  initialSurveys: SurveyRow[];
  initialShipments: ShipmentRow[];
  initialAuditLog: AuditLogRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const role = useUserRole();
  const editable = canWrite(role);
  const partner = partnerOf(site);

  const [statusHistory] = useState(initialStatusHistory);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState(site.site_status);
  const [statusRemarks, setStatusRemarks] = useState("");
  const [changingStatus, setChangingStatus] = useState(false);

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

  const items: TabItem[] = [
    {
      id: "info",
      label: "Site Information",
      content: (
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-3">
          <Field label="Site ID" value={site.site_id} />
          <Field label="Outlet Name" value={site.outlet_name} />
          <Field label="Program" value={site.program} />
          <Field label="SFO ID" value={site.sfo_id} />
          <Field label="City" value={site.city} />
          <Field label="Material" value={site.material} />
          <Field label="Number of Sites" value={site.number_of_sites} />
          <Field label="Width" value={site.width} />
          <Field label="Height" value={site.height} />
          <Field label="SQFT" value={site.sqft} />
          <Field label="Partner" value={partner?.name} />
          <Field label="ASM Name" value={site.asm_name} />
          <Field label="ASM Mobile" value={site.asm_mobile} />
          <Field label="ASM Email" value={site.asm_email} />
          <Field label="Escalation Email" value={site.escalation_email} />
          <div className="col-span-2 sm:col-span-3">
            <Field label="Store Address" value={site.store_address} />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <Field label="Remarks" value={site.remarks} />
          </div>
        </div>
      ),
    },
    {
      id: "status",
      label: "Status",
      content: (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-muted">Current status</span>
              <Badge status={lfgStatusBadge(site.site_status)}>{lfgStatusLabel(site.site_status)}</Badge>
            </div>
            {editable && (
              <Button size="sm" onClick={() => { setNewStatus(site.site_status); setShowStatusDialog(true); }}>
                Change Status
              </Button>
            )}
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">History</h3>
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
          editable={editable}
          onChanged={() => router.refresh()}
        />
      ),
    },
    {
      id: "production",
      label: "Production",
      content: <ProductionTab siteId={site.id} initial={initialProduction} editable={editable} onChanged={() => router.refresh()} />,
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
          canDeletePhotos={canDelete(role)}
          onChanged={() => router.refresh()}
        />
      ),
    },
    {
      id: "documents",
      label: "Documents",
      content: <StubTab message="Document management (Reference/Survey/Installation uploads) is a dedicated module, coming next." />,
    },
    ...(editable
      ? [
          {
            id: "financials",
            label: "Financials",
            content: (
              <FinancialsTab
                siteId={site.id}
                financials={initialFinancials}
                installationCosts={initialInstallationCosts}
                onChanged={() => router.refresh()}
              />
            ),
          } satisfies TabItem,
        ]
      : role
        ? [
            {
              id: "financials",
              label: "Financials",
              content: (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-16 text-center">
                  <Lock size={28} className="text-ink-muted" />
                  <p className="text-sm text-ink-secondary">Only admins and editors can view financial information for this site.</p>
                </div>
              ),
            } satisfies TabItem,
          ]
        : []),
    {
      id: "activity",
      label: "Activity / Audit Trail",
      content:
        initialAuditLog.length === 0 ? (
          <p className="text-sm text-ink-muted">No audit events recorded yet.</p>
        ) : (
          <Timeline
            audit
            entries={initialAuditLog.map(
              (a): TimelineEntry => ({
                id: a.id,
                date: new Date(a.created_at).toLocaleString(),
                title: `${a.action.toUpperCase()} ${a.entity_type}`,
                description: `${a.user_email ?? "system"} · ${a.entity_id}`,
              })
            )}
          />
        ),
    },
  ];

  return (
    <div>
      <Breadcrumbs
        items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: site.site_id }]}
      />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <MapPin size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{site.outlet_name}</h1>
              <Badge status={lfgStatusBadge(site.site_status)}>{lfgStatusLabel(site.site_status)}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              {site.site_id} · {site.program ?? "No program"} · {site.city ?? "No city"} {partner ? `· ${partner.name}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <Tabs items={items} defaultId="info" />
      </div>

      <Dialog
        open={showStatusDialog}
        onClose={() => setShowStatusDialog(false)}
        title="Change Site Status"
        variant="form"
        onConfirm={handleChangeStatus}
        confirmLabel={changingStatus ? "Saving…" : "Save"}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>New status</label>
            <select className={inputClass} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {LFG_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {lfgStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Remarks (optional)</label>
            <textarea rows={3} className={inputClass} value={statusRemarks} onChange={(e) => setStatusRemarks(e.target.value)} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function StubTab({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-16 text-center">
      <ShieldAlert size={28} className="text-ink-muted" />
      <p className="max-w-sm text-sm text-ink-secondary">{message}</p>
    </div>
  );
}

function SurveyTab({
  siteId,
  initialSurveys,
  creativeReceivedAt,
  editable,
  onChanged,
}: {
  siteId: string;
  initialSurveys: SurveyRow[];
  creativeReceivedAt: string | null;
  editable: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingCreative, setSavingCreative] = useState(false);
  const [form, setForm] = useState({ survey_date: "", measured_width: "", measured_height: "", measurements_remarks: "" });

  // Creative receipt (the client's artwork/design file for this site) --
  // a site-level milestone, not per-survey, which is why it lives on
  // lfg_sites itself rather than lfg_site_surveys. Sits here in the Survey
  // tab because it's the next real step after survey approval, before
  // production can start -- see the schema's own comment on the column for
  // why the Program Dashboard (task #20) needs this split out from the
  // new/survey_* statuses rather than folded into them.
  async function handleMarkCreativeReceived() {
    setSavingCreative(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("lfg_sites")
      .update({ creative_received_at: new Date().toISOString(), creative_received_by: user?.id ?? null })
      .eq("id", siteId);
    setSavingCreative(false);
    if (error) {
      toast("danger", `Couldn't mark creative received: ${error.message}`);
      return;
    }
    toast("success", "Creative marked received");
    onChanged();
  }

  async function handleUndoCreativeReceived() {
    setSavingCreative(true);
    const { error } = await supabase
      .from("lfg_sites")
      .update({ creative_received_at: null, creative_received_by: null })
      .eq("id", siteId);
    setSavingCreative(false);
    if (error) {
      toast("danger", `Couldn't undo: ${error.message}`);
      return;
    }
    toast("success", "Creative receipt undone");
    onChanged();
  }

  async function handleLog() {
    setSaving(true);
    const { error } = await supabase.from("lfg_site_surveys").insert({
      site_id: siteId,
      survey_date: form.survey_date || null,
      measured_width: form.measured_width ? Number(form.measured_width) : null,
      measured_height: form.measured_height ? Number(form.measured_height) : null,
      measurements_remarks: form.measurements_remarks.trim() || null,
      status: "completed",
      submitted_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast("danger", `Couldn't log survey: ${error.message}`);
      return;
    }
    toast("success", "Survey logged");
    setShowForm(false);
    onChanged();
  }

  async function handleApprove(surveyId: string) {
    const { error } = await supabase
      .from("lfg_site_surveys")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", surveyId);
    if (error) {
      toast("danger", `Couldn't approve: ${error.message}`);
      return;
    }
    toast("success", "Survey approved");
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
        <div>
          <span className="text-xs text-ink-muted">Creative Receipt</span>
          <div className="text-sm text-ink">
            {creativeReceivedAt ? `Received ${new Date(creativeReceivedAt).toLocaleString()}` : "Not yet received"}
          </div>
        </div>
        {editable &&
          (creativeReceivedAt ? (
            <Button size="sm" variant="secondary" loading={savingCreative} onClick={handleUndoCreativeReceived}>
              Undo
            </Button>
          ) : (
            <Button size="sm" loading={savingCreative} onClick={handleMarkCreativeReceived}>
              Mark Received
            </Button>
          ))}
      </div>

      {editable && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Log Survey"}
          </Button>
        </div>
      )}

      {showForm && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-4">
          <input type="date" className={inputClass} value={form.survey_date} onChange={(e) => setForm((f) => ({ ...f, survey_date: e.target.value }))} />
          <input
            type="number"
            step="0.01"
            placeholder="Measured width"
            className={inputClass}
            value={form.measured_width}
            onChange={(e) => setForm((f) => ({ ...f, measured_width: e.target.value }))}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Measured height"
            className={inputClass}
            value={form.measured_height}
            onChange={(e) => setForm((f) => ({ ...f, measured_height: e.target.value }))}
          />
          <input
            placeholder="Remarks"
            className={inputClass}
            value={form.measurements_remarks}
            onChange={(e) => setForm((f) => ({ ...f, measurements_remarks: e.target.value }))}
          />
          <div className="col-span-2 sm:col-span-4">
            <Button size="sm" loading={saving} onClick={handleLog}>
              Save Survey
            </Button>
          </div>
        </div>
      )}

      {initialSurveys.length === 0 ? (
        <p className="text-sm text-ink-muted">No surveys logged yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {initialSurveys.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-line bg-surface p-3 text-sm">
              <div>
                <span className="font-medium text-ink">{s.survey_date ?? "No date"}</span>
                <span className="ml-2 text-ink-secondary">
                  {s.measured_width ?? "—"} × {s.measured_height ?? "—"}
                </span>
                {s.measurements_remarks && <p className="mt-0.5 text-xs text-ink-muted">{s.measurements_remarks}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge status={s.status === "approved" ? "success" : s.status === "completed" ? "info" : "neutral"}>{s.status}</Badge>
                {editable && s.status === "completed" && (
                  <Button size="sm" variant="secondary" onClick={() => handleApprove(s.id)}>
                    Approve
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductionTab({
  siteId,
  initial,
  editable,
  onChanged,
}: {
  siteId: string;
  initial: ProductionRow | null;
  editable: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const status = initial?.status ?? "pending";

  async function setStatus(next: "in_progress" | "completed") {
    setSaving(true);
    const patch: Record<string, unknown> = { site_id: siteId, status: next, updated_at: new Date().toISOString() };
    if (next === "in_progress") patch.started_at = new Date().toISOString();
    if (next === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("lfg_production").upsert(patch, { onConflict: "site_id" });
    setSaving(false);
    if (error) {
      toast("danger", `Couldn't update production status: ${error.message}`);
      return;
    }
    toast("success", "Production status updated");
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <Badge status={status === "completed" ? "success" : status === "in_progress" ? "info" : "neutral"}>{status}</Badge>
        {editable && (
          <div className="flex gap-2">
            {status === "pending" && (
              <Button size="sm" loading={saving} onClick={() => setStatus("in_progress")}>
                Start Production
              </Button>
            )}
            {status === "in_progress" && (
              <Button size="sm" loading={saving} onClick={() => setStatus("completed")}>
                Mark Completed
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Started" value={initial?.started_at ? new Date(initial.started_at).toLocaleString() : null} />
        <Field label="Completed" value={initial?.completed_at ? new Date(initial.completed_at).toLocaleString() : null} />
      </div>
      <Field label="Notes" value={initial?.notes} />
    </div>
  );
}

// Courier/AWB tracking (task #18). lfg_shipments carries no financial
// fields, so its RLS grants the site's own partner select/write alongside
// admin/editor -- `editable` here is canWrite(role), the same gate
// Survey/Production/Installation use, not the admin/editor-only Financials
// gate. lfg_shipment_events (the per-shipment timeline) is fetched
// client-side per-shipment on expand rather than up front in page.tsx,
// since a site can have many shipments and most won't be open at once.
function ShipmentTab({
  siteId,
  initialShipments,
  editable,
  onChanged,
}: {
  siteId: string;
  initialShipments: ShipmentRow[];
  editable: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    courier: "",
    awb_number: "",
    dispatch_date: "",
    expected_delivery_date: "",
    shipment_contents: "",
    number_of_packages: "",
    package_details: "",
  });

  async function handleCreate() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("lfg_shipments").insert({
      site_id: siteId,
      courier: form.courier.trim() || null,
      awb_number: form.awb_number.trim() || null,
      dispatch_date: form.dispatch_date || null,
      expected_delivery_date: form.expected_delivery_date || null,
      shipment_contents: form.shipment_contents.trim() || null,
      number_of_packages: form.number_of_packages ? Number(form.number_of_packages) : null,
      package_details: form.package_details.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast("danger", `Couldn't create shipment: ${error.message}`);
      return;
    }
    toast("success", "Shipment created");
    setShowForm(false);
    setForm({
      courier: "",
      awb_number: "",
      dispatch_date: "",
      expected_delivery_date: "",
      shipment_contents: "",
      number_of_packages: "",
      package_details: "",
    });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "New Shipment"}
          </Button>
        </div>
      )}

      {showForm && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-4">
          <input
            placeholder="Courier"
            className={inputClass}
            value={form.courier}
            onChange={(e) => setForm((f) => ({ ...f, courier: e.target.value }))}
          />
          <input
            placeholder="AWB Number"
            className={inputClass}
            value={form.awb_number}
            onChange={(e) => setForm((f) => ({ ...f, awb_number: e.target.value }))}
          />
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Dispatch Date</label>
            <input
              type="date"
              className={inputClass}
              value={form.dispatch_date}
              onChange={(e) => setForm((f) => ({ ...f, dispatch_date: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Expected Delivery</label>
            <input
              type="date"
              className={inputClass}
              value={form.expected_delivery_date}
              onChange={(e) => setForm((f) => ({ ...f, expected_delivery_date: e.target.value }))}
            />
          </div>
          <input
            placeholder="Shipment Contents"
            className={inputClass}
            value={form.shipment_contents}
            onChange={(e) => setForm((f) => ({ ...f, shipment_contents: e.target.value }))}
          />
          <input
            type="number"
            placeholder="Number of Packages"
            className={inputClass}
            value={form.number_of_packages}
            onChange={(e) => setForm((f) => ({ ...f, number_of_packages: e.target.value }))}
          />
          <input
            placeholder="Package Details"
            className={`${inputClass} col-span-2`}
            value={form.package_details}
            onChange={(e) => setForm((f) => ({ ...f, package_details: e.target.value }))}
          />
          <div className="col-span-2 sm:col-span-4">
            <Button size="sm" loading={saving} onClick={handleCreate}>
              Save Shipment
            </Button>
          </div>
        </div>
      )}

      {initialShipments.length === 0 ? (
        <p className="text-sm text-ink-muted">No shipments logged yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {initialShipments.map((s) => (
            <ShipmentCard key={s.id} shipment={s} editable={editable} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShipmentCard({
  shipment,
  editable,
  onChanged,
}: {
  shipment: ShipmentRow;
  editable: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    current_status: shipment.current_status,
    delivery_status: shipment.delivery_status,
    delivery_date: shipment.delivery_date ?? "",
    courier_remarks: shipment.courier_remarks ?? "",
    internal_remarks: shipment.internal_remarks ?? "",
  });

  const [events, setEvents] = useState<ShipmentEventRow[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({ event_status: "", location: "" });
  const [loggingEvent, setLoggingEvent] = useState(false);

  const [uploadingPod, setUploadingPod] = useState(false);
  const podInputRef = useRef<HTMLInputElement | null>(null);

  async function loadEvents() {
    setLoadingEvents(true);
    const { data, error } = await supabase
      .from("lfg_shipment_events")
      .select("*")
      .eq("shipment_id", shipment.id)
      .order("event_time", { ascending: false });
    setLoadingEvents(false);
    if (error) {
      toast("danger", `Couldn't load tracking events: ${error.message}`);
      return;
    }
    setEvents(data ?? []);
  }

  function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && events === null) {
      loadEvents();
    }
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("lfg_shipments")
      .update({
        current_status: form.current_status,
        delivery_status: form.delivery_status,
        delivery_date: form.delivery_date || null,
        courier_remarks: form.courier_remarks.trim() || null,
        internal_remarks: form.internal_remarks.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipment.id);
    setSaving(false);
    if (error) {
      toast("danger", `Couldn't update shipment: ${error.message}`);
      return;
    }
    toast("success", "Shipment updated");
    setEditing(false);
    onChanged();
  }

  async function handleLogEvent() {
    if (!eventForm.event_status.trim()) {
      toast("danger", "Event status is required");
      return;
    }
    setLoggingEvent(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("lfg_shipment_events").insert({
      shipment_id: shipment.id,
      event_status: eventForm.event_status.trim(),
      location: eventForm.location.trim() || null,
      source: "manual",
      created_by: user?.id ?? null,
    });
    setLoggingEvent(false);
    if (error) {
      toast("danger", `Couldn't log event: ${error.message}`);
      return;
    }
    toast("success", "Event logged");
    setShowEventForm(false);
    setEventForm({ event_status: "", location: "" });
    loadEvents();
  }

  async function handlePodUpload(file: File) {
    setUploadingPod(true);
    try {
      const contentType = file.type || "application/pdf";
      const uploadRes = await fetch(`/api/lfg/shipments/${shipment.id}/pod/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: contentType }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        toast("danger", uploadData.message || uploadData.error || "Couldn't get an upload link");
        return;
      }

      const putRes = await fetch(uploadData.url, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      if (!putRes.ok) {
        toast("danger", "Upload to storage failed");
        return;
      }

      const { error: updateError } = await supabase
        .from("lfg_shipments")
        .update({ pod_path: uploadData.relative_path, delivery_status: "pod_received", updated_at: new Date().toISOString() })
        .eq("id", shipment.id);
      if (updateError) {
        toast("danger", `Uploaded, but couldn't record it: ${updateError.message}`);
        return;
      }

      toast("success", "POD uploaded");
      onChanged();
    } finally {
      setUploadingPod(false);
    }
  }

  async function handleViewPod() {
    const res = await fetch(`/api/lfg/shipments/${shipment.id}/pod/signed-url`);
    const data = await res.json();
    if (!res.ok) {
      toast("danger", data.message || data.error || "Couldn't open the POD");
      return;
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <button type="button" onClick={handleExpand} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-3">
          <Truck size={18} className="shrink-0 text-ink-muted" />
          <div>
            <div className="text-sm font-medium text-ink">
              {shipment.courier ?? "No courier"} {shipment.awb_number ? `· AWB ${shipment.awb_number}` : ""}
            </div>
            <div className="mt-0.5 text-xs text-ink-secondary">
              Dispatched {shipment.dispatch_date ?? "—"} · Expected {shipment.expected_delivery_date ?? "—"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge status={shipmentStatusBadge(shipment.current_status)}>{shipmentStatusLabel(shipment.current_status)}</Badge>
          <Badge status={deliveryStatusBadge(shipment.delivery_status)}>{deliveryStatusLabel(shipment.delivery_status)}</Badge>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-ink-secondary">Shipment Details</h4>
            {editable && (
              <Button size="sm" variant="secondary" onClick={() => setEditing((e) => !e)}>
                <Pencil size={14} className="mr-1.5" />
                {editing ? "Cancel" : "Edit"}
              </Button>
            )}
          </div>

          {editing ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Status</label>
                <select
                  className={inputClass}
                  value={form.current_status}
                  onChange={(e) => setForm((f) => ({ ...f, current_status: e.target.value }))}
                >
                  {SHIPMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {shipmentStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Delivery Status</label>
                <select
                  className={inputClass}
                  value={form.delivery_status}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_status: e.target.value }))}
                >
                  {DELIVERY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {deliveryStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Delivery Date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={form.delivery_date}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
                <label className={labelClass}>Courier Remarks</label>
                <textarea
                  rows={2}
                  className={inputClass}
                  value={form.courier_remarks}
                  onChange={(e) => setForm((f) => ({ ...f, courier_remarks: e.target.value }))}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
                <label className={labelClass}>Internal Remarks</label>
                <textarea
                  rows={2}
                  className={inputClass}
                  value={form.internal_remarks}
                  onChange={(e) => setForm((f) => ({ ...f, internal_remarks: e.target.value }))}
                />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <Button size="sm" loading={saving} onClick={handleSave}>
                  Save Shipment
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Shipment Contents" value={shipment.shipment_contents} />
              <Field label="Number of Packages" value={shipment.number_of_packages} />
              <Field label="Package Details" value={shipment.package_details} />
              <Field label="Delivery Date" value={shipment.delivery_date} />
              <div className="col-span-2 sm:col-span-3">
                <Field label="Courier Remarks" value={shipment.courier_remarks} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <Field label="Internal Remarks" value={shipment.internal_remarks} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border border-line bg-surface-sunken px-3 py-2">
            <span className="text-xs text-ink-secondary">Proof of Delivery</span>
            <div className="flex items-center gap-2">
              {shipment.pod_path && (
                <Button size="sm" variant="ghost" onClick={handleViewPod}>
                  <Eye size={14} className="mr-1.5" />
                  View
                </Button>
              )}
              {editable && (
                <>
                  <input
                    ref={podInputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePodUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button size="sm" variant="secondary" loading={uploadingPod} onClick={() => podInputRef.current?.click()}>
                    <Upload size={14} className="mr-1.5" />
                    {shipment.pod_path ? "Replace" : "Upload"}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-ink-secondary">Tracking Timeline</h4>
              {editable && (
                <Button size="sm" variant="secondary" onClick={() => setShowEventForm((s) => !s)}>
                  {showEventForm ? "Cancel" : "Log Event"}
                </Button>
              )}
            </div>

            {showEventForm && (
              <div className="mb-3 grid grid-cols-2 gap-2 rounded-md border border-line bg-surface-sunken p-3">
                <input
                  placeholder="Event status (e.g. Out for delivery)"
                  className={inputClass}
                  value={eventForm.event_status}
                  onChange={(e) => setEventForm((f) => ({ ...f, event_status: e.target.value }))}
                />
                <input
                  placeholder="Location (optional)"
                  className={inputClass}
                  value={eventForm.location}
                  onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))}
                />
                <div className="col-span-2">
                  <Button size="sm" loading={loggingEvent} onClick={handleLogEvent}>
                    Save Event
                  </Button>
                </div>
              </div>
            )}

            {loadingEvents ? (
              <p className="text-sm text-ink-muted">Loading…</p>
            ) : !events || events.length === 0 ? (
              <p className="text-sm text-ink-muted">No tracking events logged yet.</p>
            ) : (
              <Timeline
                entries={events.map(
                  (ev): TimelineEntry => ({
                    id: ev.id,
                    date: new Date(ev.event_time).toLocaleString(),
                    title: ev.event_status,
                    description: [ev.location, ev.source === "api" ? "via courier API" : "manual entry"].filter(Boolean).join(" · "),
                  })
                )}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const INSTALLATION_STATUSES = ["pending", "planned", "in_progress", "completed", "issue"] as const;
const PHOTO_KINDS = [
  { key: "before", label: "Before" },
  { key: "after", label: "After" },
  { key: "completion", label: "Completion" },
] as const;

// Operational Installation module -- editable lfg_installations fields
// (installation_required/scaffolding_required/scaffolding_size/
// installation_date/installation_team/installation_status/
// installation_remarks) plus an lfg_installation_photos gallery/upload UI.
// Deliberately separate from FinancialsTab: the Admin-only cost fields
// (installation_rate, scaffolding_rate/amount, total installation cost)
// live on lfg_installation_costs and are edited there, not here -- see
// this file's header comment. `editable` here is canWrite(role), same gate
// Survey/Production use, since lfg_installations/lfg_installation_photos
// RLS already includes the site's own partner alongside admin/editor (this
// staff workspace only ever runs as admin/editor/viewer, so partner access
// itself happens through the separate lfgconnect.mmdi.in portal, not here).
function InstallationTab({
  siteId,
  initial,
  initialPhotos,
  editable,
  canDeletePhotos,
  onChanged,
}: {
  siteId: string;
  initial: InstallationRow | null;
  initialPhotos: PhotoRow[];
  editable: boolean;
  canDeletePhotos: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    installation_required: initial?.installation_required ?? true,
    scaffolding_required: initial?.scaffolding_required ?? false,
    scaffolding_size: initial?.scaffolding_size ?? "",
    installation_date: initial?.installation_date ?? "",
    installation_team: initial?.installation_team ?? "",
    installation_status: initial?.installation_status ?? "pending",
    installation_remarks: initial?.installation_remarks ?? "",
  });
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from("lfg_installations").upsert(
      {
        site_id: siteId,
        installation_required: form.installation_required,
        scaffolding_required: form.scaffolding_required,
        scaffolding_size: form.scaffolding_size.trim() || null,
        installation_date: form.installation_date || null,
        installation_team: form.installation_team.trim() || null,
        installation_status: form.installation_status,
        installation_remarks: form.installation_remarks.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id" }
    );
    setSaving(false);
    if (error) {
      toast("danger", `Couldn't save installation details: ${error.message}`);
      return;
    }
    toast("success", "Installation details saved");
    setEditing(false);
    onChanged();
  }

  async function handleUpload(kind: "before" | "after" | "completion", file: File) {
    setUploadingKind(kind);
    try {
      const uploadRes = await fetch(`/api/lfg/sites/${siteId}/installation-photos/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
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

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from("lfg_installation_photos").insert({
        site_id: siteId,
        kind,
        relative_path: uploadData.relative_path,
        uploaded_by: user?.id ?? null,
      });
      if (insertError) {
        toast("danger", `Uploaded, but couldn't record it: ${insertError.message}`);
        return;
      }

      toast("success", "Photo uploaded");
      onChanged();
    } finally {
      setUploadingKind(null);
    }
  }

  async function handleView(photoId: string) {
    const res = await fetch(`/api/lfg/sites/${siteId}/installation-photos/${photoId}/signed-url`);
    const data = await res.json();
    if (!res.ok) {
      toast("danger", data.message || data.error || "Couldn't open this photo");
      return;
    }
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(photoId: string) {
    const { error } = await supabase.from("lfg_installation_photos").delete().eq("id", photoId);
    if (error) {
      toast("danger", `Couldn't delete photo: ${error.message}`);
      return;
    }
    toast("success", "Photo deleted");
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Installation Details</h3>
          {editable && (
            <Button size="sm" variant="secondary" onClick={() => setEditing((e) => !e)}>
              <Pencil size={14} className="mr-1.5" />
              {editing ? "Cancel" : "Edit"}
            </Button>
          )}
        </div>

        {editing ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.installation_required}
                onChange={(e) => setForm((f) => ({ ...f, installation_required: e.target.checked }))}
              />
              Installation Required
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.scaffolding_required}
                onChange={(e) => setForm((f) => ({ ...f, scaffolding_required: e.target.checked }))}
              />
              Scaffolding Required
            </label>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Scaffolding Size</label>
              <input
                className={inputClass}
                value={form.scaffolding_size}
                onChange={(e) => setForm((f) => ({ ...f, scaffolding_size: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Installation Date</label>
              <input
                type="date"
                className={inputClass}
                value={form.installation_date}
                onChange={(e) => setForm((f) => ({ ...f, installation_date: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Installation Team</label>
              <input
                className={inputClass}
                value={form.installation_team}
                onChange={(e) => setForm((f) => ({ ...f, installation_team: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Status</label>
              <select
                className={inputClass}
                value={form.installation_status}
                onChange={(e) => setForm((f) => ({ ...f, installation_status: e.target.value }))}
              >
                {INSTALLATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1 sm:col-span-3">
              <label className={labelClass}>Remarks</label>
              <textarea
                rows={3}
                className={inputClass}
                value={form.installation_remarks}
                onChange={(e) => setForm((f) => ({ ...f, installation_remarks: e.target.value }))}
              />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Button loading={saving} onClick={handleSave}>
                Save Installation Details
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Installation Required" value={form.installation_required ? "Yes" : "No"} />
            <Field label="Scaffolding Required" value={form.scaffolding_required ? "Yes" : "No"} />
            <Field label="Scaffolding Size" value={form.scaffolding_size} />
            <Field label="Installation Date" value={form.installation_date} />
            <Field label="Installation Team" value={form.installation_team} />
            <Field label="Status" value={form.installation_status.replace("_", " ")} />
            <div className="col-span-2 sm:col-span-3">
              <Field label="Remarks" value={form.installation_remarks} />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Installation Photos</h3>
        <div className="flex flex-col gap-4">
          {PHOTO_KINDS.map(({ key, label }) => {
            const photos = initialPhotos.filter((p) => p.kind === key);
            return (
              <div key={key}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-secondary">{label}</span>
                  {editable && (
                    <>
                      <input
                        ref={(el) => {
                          fileInputs.current[key] = el;
                        }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUpload(key, file);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={uploadingKind === key}
                        onClick={() => fileInputs.current[key]?.click()}
                      >
                        <Upload size={14} className="mr-1.5" />
                        Upload
                      </Button>
                    </>
                  )}
                </div>
                {photos.length === 0 ? (
                  <p className="text-xs text-ink-muted">No {label.toLowerCase()} photos yet.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {photos.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-md border border-line bg-surface-sunken px-3 py-1.5 text-xs">
                        <span className="text-ink-secondary">{new Date(p.uploaded_at).toLocaleString()}</span>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleView(p.id)} aria-label={`View ${label.toLowerCase()} photo`}>
                            <Eye size={14} />
                          </Button>
                          {canDeletePhotos && (
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} aria-label={`Delete ${label.toLowerCase()} photo`}>
                              <Trash2 size={14} className="text-danger" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// commercial_terms/budget_category are the only non-numeric FinancialsRow
// fields, and neither belongs in this numeric-only edit grid (commercial
// terms is free text with no obvious single input here; budget_category
// is carried purely for lossless legacy import fidelity, not day-to-day
// editing) -- excluding both here is what lets formatInr()/the number
// inputs below assume every listed key is numeric.
type FinancialsNumericKey = Exclude<keyof FinancialsRow, "commercial_terms" | "budget_category">;
const FINANCIAL_FIELDS: { key: FinancialsNumericKey; label: string }[] = [
  { key: "rate", label: "Rate" },
  { key: "amount", label: "Amount" },
  { key: "packing_forwarding", label: "Packing & Forwarding" },
  { key: "other_charges", label: "Other Charges" },
  { key: "total_commercial_value", label: "Total Commercial Value" },
  { key: "gst_amount", label: "GST Amount" },
  { key: "total_printing_amount", label: "Total Printing Amount" },
  { key: "material_cost", label: "Material Cost" },
  { key: "production_cost", label: "Production Cost" },
  { key: "installation_amount", label: "Installation Amount" },
  { key: "other_expenses", label: "Other Expenses" },
  { key: "total_project_cost", label: "Total Project Cost" },
  { key: "margin", label: "Margin" },
];

const INSTALLATION_COST_FIELDS: { key: keyof InstallationCostsRow; label: string }[] = [
  { key: "installation_rate", label: "Installation Rate" },
  { key: "installation_amount", label: "Installation Amount" },
  { key: "scaffolding_rate", label: "Scaffolding Rate" },
  { key: "scaffolding_amount", label: "Scaffolding Amount" },
  { key: "installation_travelling", label: "Installation Travelling" },
  { key: "scaffolding_plus_travelling", label: "Scaffolding + Travelling" },
  { key: "installation_subtotal", label: "Installation Subtotal" },
  { key: "installation_gst_amount", label: "Installation GST Amount" },
  { key: "labour_other_expenses", label: "Labour / Other Expenses" },
  { key: "total_installation_cost", label: "Total Installation Cost" },
];

// Admin/editor only -- see the parent component's comment on why this is
// UX-only, not the real security boundary. Direct
// supabase.from("lfg_site_financials"|"lfg_installation_costs").upsert(...)
// from the client -- lfg_site_financials_staff_all/
// lfg_installation_costs_staff_all are blanket `for all` policies for
// admin/editor, so this is consistent with the schema's own model, same
// as MastersTab's direct-insert pattern.
function FinancialsTab({
  siteId,
  financials,
  installationCosts,
  onChanged,
}: {
  siteId: string;
  financials: FinancialsRow | null;
  installationCosts: InstallationCostsRow | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finForm, setFinForm] = useState<Record<string, string>>(
    Object.fromEntries(FINANCIAL_FIELDS.map((f) => [f.key, financials?.[f.key] != null ? String(financials[f.key]) : ""]))
  );
  const [instForm, setInstForm] = useState<Record<string, string>>(
    Object.fromEntries(
      INSTALLATION_COST_FIELDS.map((f) => [f.key, installationCosts?.[f.key] != null ? String(installationCosts[f.key]) : ""])
    )
  );

  async function handleSave() {
    setSaving(true);
    const finPatch: Record<string, unknown> = { site_id: siteId, updated_at: new Date().toISOString() };
    FINANCIAL_FIELDS.forEach((f) => {
      finPatch[f.key] = finForm[f.key] ? Number(finForm[f.key]) : null;
    });
    const instPatch: Record<string, unknown> = { site_id: siteId, updated_at: new Date().toISOString() };
    INSTALLATION_COST_FIELDS.forEach((f) => {
      instPatch[f.key] = instForm[f.key] ? Number(instForm[f.key]) : null;
    });

    const [{ error: finError }, { error: instError }] = await Promise.all([
      supabase.from("lfg_site_financials").upsert(finPatch, { onConflict: "site_id" }),
      supabase.from("lfg_installation_costs").upsert(instPatch, { onConflict: "site_id" }),
    ]);
    setSaving(false);

    if (finError || instError) {
      toast("danger", `Couldn't save financials: ${finError?.message ?? instError?.message}`);
      return;
    }
    toast("success", "Financials saved");
    setEditing(false);
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setEditing((e) => !e)}>
          <Pencil size={14} className="mr-1.5" />
          {editing ? "Cancel" : "Edit"}
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Commercial</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {FINANCIAL_FIELDS.map((f) =>
            editing ? (
              <div key={f.key} className="flex flex-col gap-1">
                <label className={labelClass}>{f.label}</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClass}
                  value={finForm[f.key]}
                  onChange={(e) => setFinForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </div>
            ) : (
              <Field key={f.key} label={f.label} value={formatInr(financials?.[f.key] ?? null)} />
            )
          )}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Installation Cost</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {INSTALLATION_COST_FIELDS.map((f) =>
            editing ? (
              <div key={f.key} className="flex flex-col gap-1">
                <label className={labelClass}>{f.label}</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClass}
                  value={instForm[f.key]}
                  onChange={(e) => setInstForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </div>
            ) : (
              <Field key={f.key} label={f.label} value={formatInr(installationCosts?.[f.key] ?? null)} />
            )
          )}
        </div>
      </div>

      {editing && (
        <Button loading={saving} onClick={handleSave} className="self-start">
          Save Financials
        </Button>
      )}
    </div>
  );
}
