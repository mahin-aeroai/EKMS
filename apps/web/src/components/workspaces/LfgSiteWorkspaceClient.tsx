"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, FileText, Lock, Upload, Eye, Trash2, Truck, ArrowLeft, X, ExternalLink } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { Timeline, type TimelineEntry } from "@/components/ui/Timeline";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole, canWrite, canDelete } from "@/lib/UserRoleContext";
import { formatDecimal, round2 } from "@/lib/lfg-units";
import { useLfgDistinctValues } from "@/lib/useLfgDistinctValues";
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

export interface LfgSite {
  id: string;
  site_id: string;
  outlet_name: string;
  // Retail chain/format (APP, APR, Croma, ...) -- was "program" before the
  // seasonal lfg_programs concept (below) took that name; see the schema's
  // lfg_sites.format column comment.
  format: string | null;
  sfo_id: string | null;
  city: string | null;
  region: string | null;
  store_address: string | null;
  material: string | null;
  mat_code: string | null;
  number_of_sites: number;
  width: number | null;
  height: number | null;
  bleed: number | null;
  sqft: number | null;
  asm_name: string | null;
  asm_mobile: string | null;
  asm_email: string | null;
  escalation_email: string | null;
  remarks: string | null;
  site_status: string;
  creative_received_at: string | null;
  site_verified_at: string | null;
  site_reference_picture_path: string | null;
  partner_id: string | null;
  // Store entity (task #62-#71) -- the physical outlet this site belongs
  // to. Nullable: sites created before this feature (and not yet through
  // the STEP 21b backfill) may not have one. Drives the "Other Displays at
  // This Store" panel below (task #70) -- nothing else on this page reads
  // it.
  store_id: string | null;
  // Seasonal wave this site belongs to (Spring Refresh 2025, ...) -- see
  // lfg_programs. Nullable: a site can exist unassigned to any wave yet.
  program_id: string | null;
  lfg_programs: { id: string; name: string } | { id: string; name: string }[] | null;
  lfg_partners: { id: string; name: string } | { id: string; name: string }[] | null;
}

export interface StatusHistoryRow {
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

export interface InstallationRow {
  installation_required: boolean;
  scaffolding_required: boolean;
  scaffolding_size: string | null;
  installation_date: string | null;
  installation_team: string | null;
  installation_status: string;
  installation_remarks: string | null;
}

export interface PhotoRow {
  id: string;
  kind: "before" | "after" | "completion";
  relative_path: string;
  uploaded_at: string;
}

export interface DocumentRow {
  id: string;
  category: "reference" | "survey" | "installation" | "other";
  file_name: string;
  file_type: string | null;
  relative_path: string;
  file_size: number | null;
  version: number;
  uploaded_by: string | null;
  uploaded_by_role: "staff" | "partner" | null;
  uploaded_at: string;
}

export interface ProductionRow {
  status: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

export interface SurveyRow {
  id: string;
  survey_date: string | null;
  measured_width: number | null;
  measured_height: number | null;
  measurements_remarks: string | null;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
}

export interface ShipmentRow {
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

// Exported so LfgPartnerSiteClient (task #58's Installation Team
// auto-fill needs the site's Partner name there too) can reuse the exact
// same array-or-object normalization instead of re-deriving it inline.
export function partnerOf(site: LfgSite) {
  const p = Array.isArray(site.lfg_partners) ? site.lfg_partners[0] : site.lfg_partners;
  return p ?? null;
}

function programOf(site: LfgSite) {
  const p = Array.isArray(site.lfg_programs) ? site.lfg_programs[0] : site.lfg_programs;
  return p ?? null;
}

// Hands this site's identity fields off to the (separate, pre-existing)
// Installation Report tool via query params -- see
// InstallationReportClient.tsx's own prefill effect for the receiving end
// and why only these fields (not seasonProgram/installationDate, which are
// that tool's own concepts with nothing on an LFG site to prefill from).
// Opened in a new tab (task #36) rather than routed to in-place, since
// it's a genuinely separate tool with its own unrelated workflow -- this
// keeps the Site 360 tab where the user came from.
//
// The outgoing param is still named "program" -- that's the Installation
// Report tool's OWN field name (installation_report_stores.program, a
// genuinely different, unrelated concept -- see that file's prefill effect
// header comment), not this app's lfg_sites.format. Only the *source*
// value read here changed (site.format, was site.program) when lfg_sites'
// column was renamed (task #39) -- the receiving param name is untouched.
// Typed as a minimal structural subset of LfgSite (not LfgSite itself) so
// LfgSiteCardGrid.tsx's own, much smaller list-row shape satisfies it too
// without importing the full Site 360 row type -- exported so that card
// grid uses this exact same href, rather than a second copy that could
// drift from it.
interface InstallationReportSource {
  outlet_name: string;
  store_address: string | null;
  sfo_id: string | null;
  format: string | null;
  asm_name: string | null;
  asm_mobile?: string | null;
}

export function installationReportHref(site: InstallationReportSource): string {
  const params = new URLSearchParams();
  if (site.outlet_name) params.set("store", site.outlet_name);
  if (site.store_address) params.set("address", site.store_address);
  if (site.sfo_id) params.set("sfo", site.sfo_id);
  if (site.format) params.set("program", site.format);
  if (site.asm_name) params.set("asm", site.asm_name);
  if (site.asm_mobile) params.set("asmContact", site.asm_mobile);
  return `/workspaces/installation-report?${params.toString()}`;
}

const inputClass =
  "rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";
const labelClass = "text-xs font-medium text-ink-secondary";

export function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="text-sm text-ink">{value === null || value === undefined || value === "" ? "—" : value}</div>
    </div>
  );
}

interface SiblingSiteRow {
  id: string;
  site_id: string;
  outlet_name: string;
  material: string | null;
  site_status: string;
}

// "Other Displays at This Store" (task #70) -- lightweight sibling list
// for a site whose store_id is shared with more than one lfg_sites row
// (see lfg_stores, STEP 6c in the schema). Fetched client-side rather than
// passed down as a server-fetched prop, same reasoning as ShipmentTab's
// per-shipment events: most site visits won't have siblings at all, so
// there's no point making every Site 360 page load pay for a join that's
// usually empty. Exported (like partnerOf/Field above) so
// LfgPartnerSiteClient.tsx renders the identical panel rather than a
// forked copy -- `hrefFor` is the only thing that differs between the two
// hosts (staff vs. the partner portal's /lfg-prefixed or subdomain
// routing), so that's the only thing passed in.
export function OtherDisplaysPanel({ site, hrefFor }: { site: LfgSite; hrefFor: (siteId: string) => string }) {
  const router = useRouter();
  const [siblings, setSiblings] = useState<SiblingSiteRow[] | null>(null);

  useEffect(() => {
    if (!site.store_id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSiblings([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("lfg_sites")
      .select("id, site_id, outlet_name, material, site_status")
      .eq("store_id", site.store_id)
      .neq("id", site.id)
      .order("site_id")
      .then(({ data }) => {
        if (!cancelled) setSiblings((data as SiblingSiteRow[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [site.store_id, site.id]);

  if (!site.store_id || siblings === null || siblings.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">
        Other Displays at This Store <span className="text-ink-muted">({siblings.length})</span>
      </h3>
      <ul className="flex flex-col gap-2">
        {siblings.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => router.push(hrefFor(s.id))}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-surface-sunken"
            >
              <span className="truncate">
                <span className="font-medium text-ink">{s.site_id}</span>
                <span className="ml-2 text-ink-secondary">
                  {s.outlet_name}
                  {s.material ? ` · ${s.material}` : ""}
                </span>
              </span>
              <Badge status={lfgStatusBadge(s.site_status)}>{lfgStatusLabel(s.site_status)}</Badge>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PartnerOption {
  id: string;
  name: string;
}
interface ProgramOption {
  id: string;
  name: string;
}

type SiteInfoForm = {
  outlet_name: string;
  format: string;
  sfo_id: string;
  city: string;
  region: string;
  store_address: string;
  material: string;
  mat_code: string;
  number_of_sites: string;
  width: string;
  height: string;
  bleed: string;
  sqft: string;
  asm_name: string;
  asm_mobile: string;
  asm_email: string;
  escalation_email: string;
  partner_id: string;
  program_id: string;
  remarks: string;
};

function siteToForm(site: LfgSite, partner: { id: string } | null, program: { id: string } | null): SiteInfoForm {
  return {
    outlet_name: site.outlet_name,
    format: site.format ?? "",
    sfo_id: site.sfo_id ?? "",
    city: site.city ?? "",
    region: site.region ?? "",
    store_address: site.store_address ?? "",
    material: site.material ?? "",
    mat_code: site.mat_code ?? "",
    number_of_sites: String(site.number_of_sites),
    width: site.width === null ? "" : String(site.width),
    height: site.height === null ? "" : String(site.height),
    bleed: site.bleed === null ? "" : String(site.bleed),
    sqft: site.sqft === null ? "" : String(site.sqft),
    asm_name: site.asm_name ?? "",
    asm_mobile: site.asm_mobile ?? "",
    asm_email: site.asm_email ?? "",
    escalation_email: site.escalation_email ?? "",
    partner_id: partner?.id ?? "",
    program_id: program?.id ?? "",
    remarks: site.remarks ?? "",
  };
}

// A field with a <datalist> of existing values (see the identical pattern
// on the New Site form) -- free text still works, this is just
// autocomplete over what's already on file.
function ComboEditField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const listId = `edit-${label.replace(/\s+/g, "-").toLowerCase()}-options`;
  return (
    <div className="flex flex-col gap-1.5">
      <label className={labelClass}>{label}</label>
      <input list={listId} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      <datalist id={listId}>
        {options.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  );
}

// Site Information edit mode (staff-only -- gated by the `editable` prop,
// same canWrite(role) check the rest of this page already uses). Before
// this there was no way to correct or fill in a site's own core fields
// after creation short of a direct database edit.
//
// Store-level fields (outlet_name, format, sfo_id, city, region,
// store_address, partner_id, ASM contacts, escalation email) are
// denormalized copies of the site's lfg_stores row where one exists (see
// STEP 6c in the schema) -- saving a change to one of those here pushes
// it to the canonical store row AND every sibling site sharing it, so a
// correction can't leave the store's other displays quietly showing a
// stale outlet name/city/partner/etc. Genuinely site-specific fields
// (material, mat code, size, bleed, sqft, remarks, program) only ever
// touch this one row. A site with no store_id yet (not backfilled) just
// updates itself, same as before the Store entity existed.
function SiteInfoCard({
  site,
  partner,
  program,
  editable,
}: {
  site: LfgSite;
  partner: { id: string; name: string } | null;
  program: { id: string; name: string } | null;
  editable: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [form, setForm] = useState<SiteInfoForm>(() => siteToForm(site, partner, program));

  const formatOptions = useLfgDistinctValues("format");
  const materialOptions = useLfgDistinctValues("material");
  const regionOptions = useLfgDistinctValues("region");
  const matCodeOptions = useLfgDistinctValues("mat_code");
  const cityOptions = useLfgDistinctValues("city");
  const asmNameOptions = useLfgDistinctValues("asm_name");

  useEffect(() => {
    if (!editing) return;
    supabase
      .from("lfg_partners")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setPartners((data as PartnerOption[]) ?? []));
    supabase
      .from("lfg_programs")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setPrograms((data as ProgramOption[]) ?? []));
  }, [editing]);

  function startEditing() {
    setForm(siteToForm(site, partner, program));
    setEditing(true);
  }

  function set<K extends keyof SiteInfoForm>(key: K, value: SiteInfoForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.outlet_name.trim()) {
      toast("danger", "Outlet Name is required.");
      return;
    }
    setSaving(true);

    const storeFields = {
      outlet_name: form.outlet_name.trim(),
      format: form.format.trim() || null,
      sfo_id: form.sfo_id.trim() || null,
      city: form.city.trim() || null,
      region: form.region.trim() || null,
      store_address: form.store_address.trim() || null,
      partner_id: form.partner_id || null,
      asm_name: form.asm_name.trim() || null,
      asm_mobile: form.asm_mobile.trim() || null,
      asm_email: form.asm_email.trim() || null,
      escalation_email: form.escalation_email.trim() || null,
    };
    // lfg_stores' own column is store_name, not outlet_name (that's
    // lfg_sites' column) -- storeFields above stays shaped for lfg_sites
    // (used for the siblings update below, and matches SiteInfoForm), this
    // is the same values renamed to the one column lfg_stores actually
    // has. Without this, the lfg_stores update below fails with "Could
    // not find the 'outlet_name' column of 'lfg_stores'".
    const { outlet_name: storeOutletName, ...storeFieldsForLfgStores } = storeFields;
    const lfgStoresFields = { ...storeFieldsForLfgStores, store_name: storeOutletName };
    const siteOnlyFields = {
      material: form.material.trim() || null,
      mat_code: form.mat_code.trim() || null,
      number_of_sites: Number(form.number_of_sites) || 1,
      width: form.width.trim() ? round2(Number(form.width)) : null,
      height: form.height.trim() ? round2(Number(form.height)) : null,
      bleed: form.bleed.trim() ? round2(Number(form.bleed)) : null,
      sqft: form.sqft.trim() ? round2(Number(form.sqft)) : null,
      program_id: form.program_id || null,
      remarks: form.remarks.trim() || null,
    };

    if (site.store_id) {
      const [{ error: storeError }, { error: siblingsError }] = await Promise.all([
        supabase.from("lfg_stores").update(lfgStoresFields).eq("id", site.store_id),
        supabase.from("lfg_sites").update(storeFields).eq("store_id", site.store_id),
      ]);
      if (storeError || siblingsError) {
        setSaving(false);
        const err = storeError ?? siblingsError;
        // lfg_stores.sfo_id is unique (where set) -- same constraint the
        // New Site "new store" path already gives a friendly message for
        // (new/page.tsx). Surfacing Postgres's raw "duplicate key value
        // violates unique constraint..." here isn't useful on its own: it
        // doesn't say which OTHER store already has this SFO ID, so
        // there's nothing actionable in the message itself -- name the
        // real cause instead.
        toast(
          "danger",
          err?.code === "23505"
            ? `This SFO ID is already used by another store -- check the Stores list for the duplicate before saving.`
            : `Couldn't save: ${err?.message}`
        );
        return;
      }
      const { error: siteError } = await supabase.from("lfg_sites").update(siteOnlyFields).eq("id", site.id);
      if (siteError) {
        setSaving(false);
        toast("danger", `Store saved, but couldn't save this site's own details: ${siteError.message}`);
        return;
      }
    } else {
      const { error } = await supabase
        .from("lfg_sites")
        .update({ ...storeFields, ...siteOnlyFields })
        .eq("id", site.id);
      if (error) {
        setSaving(false);
        toast("danger", `Couldn't save: ${error.message}`);
        return;
      }
    }

    setSaving(false);
    setEditing(false);
    toast("success", "Site details updated");
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Site Details</h3>
          {editable && (
            <Button size="sm" variant="secondary" onClick={startEditing}>
              <Pencil size={14} className="mr-1.5" /> Edit
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Site ID" value={site.site_id} />
          <Field label="Outlet Name" value={site.outlet_name} />
          <Field label="Format" value={site.format} />
          <Field label="Program (Season)" value={program?.name} />
          <Field label="SFO ID" value={site.sfo_id} />
          <Field label="City" value={site.city} />
          <Field label="Region" value={site.region} />
          <Field label="Material" value={site.material} />
          <Field label="Mat Code" value={site.mat_code} />
          <Field label="Number of Sites" value={site.number_of_sites} />
          <Field label="Width" value={formatDecimal(site.width)} />
          <Field label="Height" value={formatDecimal(site.height)} />
          <Field label="Bleed" value={formatDecimal(site.bleed)} />
          <Field label="SQFT" value={formatDecimal(site.sqft)} />
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
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Edit Site Details</h3>
        {site.store_id && (
          <span className="text-xs text-ink-muted">
            Outlet fields (Outlet Name, Format, SFO ID, City, Region, Address, Partner, ASM, Escalation Email) apply to
            every display at this store.
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Outlet Name *</label>
          <input className={inputClass} value={form.outlet_name} onChange={(e) => set("outlet_name", e.target.value)} />
        </div>
        <ComboEditField label="Format" value={form.format} onChange={(v) => set("format", v)} options={formatOptions} />
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Program (Season)</label>
          <select className={inputClass} value={form.program_id} onChange={(e) => set("program_id", e.target.value)}>
            <option value="">— Unassigned —</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>SFO ID</label>
          <input className={inputClass} value={form.sfo_id} onChange={(e) => set("sfo_id", e.target.value)} />
        </div>
        <ComboEditField label="City" value={form.city} onChange={(v) => set("city", v)} options={cityOptions} />
        <ComboEditField label="Region" value={form.region} onChange={(v) => set("region", v)} options={regionOptions} />
        <ComboEditField label="Material" value={form.material} onChange={(v) => set("material", v)} options={materialOptions} />
        <ComboEditField label="Mat Code" value={form.mat_code} onChange={(v) => set("mat_code", v)} options={matCodeOptions} />
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Number of Sites</label>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={form.number_of_sites}
            onChange={(e) => set("number_of_sites", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Width (in)</label>
          <input type="number" step="0.01" className={inputClass} value={form.width} onChange={(e) => set("width", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Height (in)</label>
          <input type="number" step="0.01" className={inputClass} value={form.height} onChange={(e) => set("height", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Bleed</label>
          <input type="number" step="0.01" className={inputClass} value={form.bleed} onChange={(e) => set("bleed", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>SQFT</label>
          <input type="number" step="0.01" className={inputClass} value={form.sqft} onChange={(e) => set("sqft", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Partner</label>
          <select className={inputClass} value={form.partner_id} onChange={(e) => set("partner_id", e.target.value)}>
            <option value="">— Unassigned —</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <ComboEditField label="ASM Name" value={form.asm_name} onChange={(v) => set("asm_name", v)} options={asmNameOptions} />
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>ASM Mobile</label>
          <input className={inputClass} value={form.asm_mobile} onChange={(e) => set("asm_mobile", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>ASM Email</label>
          <input type="email" className={inputClass} value={form.asm_email} onChange={(e) => set("asm_email", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Escalation Email</label>
          <input
            type="email"
            className={inputClass}
            value={form.escalation_email}
            onChange={(e) => set("escalation_email", e.target.value)}
          />
        </div>
        <div className="col-span-1 flex flex-col gap-1.5 sm:col-span-3">
          <label className={labelClass}>Store Address</label>
          <textarea rows={2} className={inputClass} value={form.store_address} onChange={(e) => set("store_address", e.target.value)} />
        </div>
        <div className="col-span-1 flex flex-col gap-1.5 sm:col-span-3">
          <label className={labelClass}>Remarks</label>
          <textarea rows={2} className={inputClass} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button size="sm" loading={saving} onClick={handleSave}>
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
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
  initialDocuments,
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
  initialDocuments: DocumentRow[];
  initialAuditLog: AuditLogRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const role = useUserRole();
  const editable = canWrite(role);
  const partner = partnerOf(site);
  const program = programOf(site);

  const [statusHistory] = useState(initialStatusHistory);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState(site.site_status);
  const [statusRemarks, setStatusRemarks] = useState("");
  const [changingStatus, setChangingStatus] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const pictureInputRef = useRef<HTMLInputElement | null>(null);

  // Site reference picture (task #33) -- one picture per site, stored as an
  // R2 key on lfg_sites.site_reference_picture_path itself (see that
  // column's schema comment), not a child table like installation photos.
  // Presign-then-PUT through the API route, same as every other file
  // upload in this app, but the "record it" step here is a plain `update`
  // on lfg_sites rather than an insert -- lfg_sites_update RLS already
  // covers staff and the site's own partner for this column (see
  // reference-picture/upload-url/route.ts's header comment), so there's no
  // separate table/RLS to satisfy.
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

  async function handleRemovePicture() {
    const { error } = await supabase.from("lfg_sites").update({ site_reference_picture_path: null }).eq("id", site.id);
    if (error) {
      toast("danger", `Couldn't remove picture: ${error.message}`);
      return;
    }
    toast("success", "Site picture removed");
    router.refresh();
  }

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

  // What this specific site actually has on it, from data already fetched
  // for the tabs above -- no extra query needed. Shown in the delete
  // confirmation so an admin can see at a glance whether this is really an
  // empty/duplicate record (like the legacy Store-Master-import stubs --
  // see the dedupe script from task #24) or has real work logged against
  // it, before permanently deleting it. RLS already restricts the delete
  // itself to admin (lfg_sites_delete_staff); this is a UX safeguard on
  // top of that, not the security boundary.
  const relatedDataSummary = [
    { label: "Surveys", count: initialSurveys.length },
    { label: "Production record", count: initialProduction ? 1 : 0 },
    { label: "Shipments", count: initialShipments.length },
    { label: "Installation record", count: initialInstallation ? 1 : 0 },
    { label: "Installation photos", count: initialInstallationPhotos.length },
    { label: "Documents", count: initialDocuments.length },
    { label: "Financials", count: initialFinancials ? 1 : 0 },
    { label: "Installation costs", count: initialInstallationCosts ? 1 : 0 },
    { label: "Audit log entries", count: initialAuditLog.length },
  ].filter((r) => r.count > 0);

  async function handleDeleteSite() {
    setDeleting(true);
    const { error } = await supabase.from("lfg_sites").delete().eq("id", site.id);
    setDeleting(false);
    if (error) {
      toast("danger", `Couldn't delete this site: ${error.message}`);
      return;
    }
    toast("success", `${site.site_id} deleted`);
    router.push("/workspaces/lfg");
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
              {editable && (
                <>
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
                  {site.site_reference_picture_path && (
                    <Button size="sm" variant="ghost" onClick={handleRemovePicture}>
                      <Trash2 size={14} className="text-danger" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          <SiteInfoCard site={site} partner={partner} program={program} editable={editable} />
          <OtherDisplaysPanel site={site} hrefFor={(id) => `/workspaces/lfg/sites/${id}`} />
          {/* Status was previously its own tab -- folded in here (task
              #55) since it was really just one more fact about the site,
              not enough content on its own to earn a whole tab amid an
              already-long tab bar. */}
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
          canDeleteDocs={canDelete(role)}
          onChanged={() => router.refresh()}
        />
      ),
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

      {/* Site 360 can be reached from several places (Site Master, Format
          Dashboard, Programs) -- router.back() returns to whichever one
          actually got you here, rather than a single hardcoded href
          (task #56). */}
      <Button variant="ghost" size="sm" className="mt-3" onClick={() => router.back()}>
        <ArrowLeft size={14} className="mr-1.5" /> Back
      </Button>

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
              {site.site_id} · {site.format ?? "No format"} · {site.city ?? "No city"} {partner ? `· ${partner.name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => window.open(installationReportHref(site), "_blank", "noopener,noreferrer")}>
            <FileText size={15} className="mr-1.5" /> Create Installation Report
          </Button>
          {canDelete(role) && (
            <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 size={15} className="mr-1.5" /> Delete Site
            </Button>
          )}
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

      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title={`Delete ${site.site_id}?`}
        variant="confirm"
        destructive
        onConfirm={handleDeleteSite}
        confirmLabel={deleting ? "Deleting…" : "Delete Permanently"}
      >
        <div className="flex flex-col gap-3 text-sm text-ink-secondary">
          <p>
            This permanently deletes <span className="font-medium text-ink">{site.outlet_name}</span> ({site.site_id}) and
            cannot be undone.
          </p>
          {relatedDataSummary.length === 0 ? (
            <p className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
              No surveys, production, shipments, installation, financials, or photos on file for this site — looks safe
              to remove.
            </p>
          ) : (
            <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-xs text-danger">
              <p className="mb-1 font-medium">This site has real data on it that will be deleted too:</p>
              <ul className="list-inside list-disc">
                {relatedDataSummary.map((r) => (
                  <li key={r.label}>
                    {r.label}: {r.count}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}

export function SurveyTab({
  siteId,
  initialSurveys,
  creativeReceivedAt,
  siteVerifiedAt,
  editable,
  canApprove = editable,
  canMarkCreative = editable,
  onChanged,
}: {
  siteId: string;
  initialSurveys: SurveyRow[];
  creativeReceivedAt: string | null;
  siteVerifiedAt: string | null;
  editable: boolean;
  // Separate from `editable` because lfg_site_surveys' own RLS splits
  // these: lfg_site_surveys_insert (logging a new survey, same as
  // creative-received on lfg_sites via lfg_sites_update) grants the
  // site's own partner too, but lfg_site_surveys_update_staff (approving
  // one) is admin/editor ONLY -- no partner clause at all. Defaults to
  // `editable` so every existing staff call site (where editable already
  // meant admin/editor) is unchanged; LfgPartnerSiteClient passes
  // editable={true}, canApprove={false} to log surveys without exposing
  // an Approve button RLS would just reject.
  canApprove?: boolean;
  // Also separate from `editable` -- Creative Received is an MMDI-only
  // milestone (task: "Creative received has to be updated by the users
  // MMDI"), enforced for real at the DB level too
  // (lfg_sites_guard_partner_update() in the schema now rejects a
  // partner changing creative_received_at/_by, same pattern as the
  // existing outlet-name/format/SFO-ID guard). This just keeps the
  // control from appearing at all for a partner, rather than showing it
  // and letting the write fail. Defaults to `editable` so staff call
  // sites are unchanged; LfgPartnerSiteClient passes
  // canMarkCreative={false}.
  canMarkCreative?: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingCreative, setSavingCreative] = useState(false);
  const [savingVerified, setSavingVerified] = useState(false);
  const [form, setForm] = useState({ survey_date: "", measured_width: "", measured_height: "", measurements_remarks: "" });

  // Site Verified (task #47) -- confirms the physical outlet/site itself
  // has been checked and is good to proceed. A site-level milestone, same
  // pattern as Creative Receipt just below (mark/undo, timestamp + actor
  // on lfg_sites), positioned first since it's the earlier real-world step
  // -- verifying the site normally comes before/alongside the survey visit
  // that measures it for creative/production.
  async function handleMarkSiteVerified() {
    setSavingVerified(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("lfg_sites")
      .update({ site_verified_at: new Date().toISOString(), site_verified_by: user?.id ?? null })
      .eq("id", siteId);
    setSavingVerified(false);
    if (error) {
      toast("danger", `Couldn't mark site verified: ${error.message}`);
      return;
    }
    toast("success", "Site marked verified");
    onChanged();
  }

  async function handleUndoSiteVerified() {
    setSavingVerified(true);
    const { error } = await supabase
      .from("lfg_sites")
      .update({ site_verified_at: null, site_verified_by: null })
      .eq("id", siteId);
    setSavingVerified(false);
    if (error) {
      toast("danger", `Couldn't undo: ${error.message}`);
      return;
    }
    toast("success", "Site verification undone");
    onChanged();
  }

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
          <span className="text-xs text-ink-muted">Site Verified</span>
          <div className="text-sm text-ink">
            {siteVerifiedAt ? `Verified ${new Date(siteVerifiedAt).toLocaleString()}` : "Not yet verified"}
          </div>
        </div>
        {editable &&
          (siteVerifiedAt ? (
            <Button size="sm" variant="secondary" loading={savingVerified} onClick={handleUndoSiteVerified}>
              Undo
            </Button>
          ) : (
            <Button size="sm" loading={savingVerified} onClick={handleMarkSiteVerified}>
              Mark Verified
            </Button>
          ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-4">
        <div>
          <span className="text-xs text-ink-muted">Creative Receipt</span>
          <div className="text-sm text-ink">
            {creativeReceivedAt ? `Received ${new Date(creativeReceivedAt).toLocaleString()}` : "Not yet received"}
          </div>
        </div>
        {/* Was two separate mark/undo buttons -- collapsed into one
            dropdown (task #57), same two underlying handlers either way
            since nothing about the mark/undo logic itself needed to
            change, just how it's triggered. */}
        {canMarkCreative ? (
          <select
            value={creativeReceivedAt ? "received" : "awaiting"}
            disabled={savingCreative}
            onChange={(e) => {
              if (e.target.value === "received" && !creativeReceivedAt) void handleMarkCreativeReceived();
              if (e.target.value === "awaiting" && creativeReceivedAt) void handleUndoCreativeReceived();
            }}
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="awaiting">Awaiting</option>
            <option value="received">Received</option>
          </select>
        ) : (
          editable && <span className="text-xs text-ink-muted">MMDI updates this</span>
        )}
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
                  {formatDecimal(s.measured_width)} × {formatDecimal(s.measured_height)}
                </span>
                {s.measurements_remarks && <p className="mt-0.5 text-xs text-ink-muted">{s.measurements_remarks}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge status={s.status === "approved" ? "success" : s.status === "completed" ? "info" : "neutral"}>{s.status}</Badge>
                {canApprove && s.status === "completed" && (
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

export function ProductionTab({
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
export function ShipmentTab({
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

// Exported so LfgSiteCardGrid.tsx's Installation-status pill uses this
// exact same vocabulary instead of inventing its own.
export const INSTALLATION_STATUSES = ["pending", "planned", "in_progress", "completed", "issue"] as const;
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
export function InstallationTab({
  siteId,
  initial,
  initialPhotos,
  editable,
  canDeletePhotos,
  onChanged,
  partnerName,
}: {
  siteId: string;
  initial: InstallationRow | null;
  initialPhotos: PhotoRow[];
  editable: boolean;
  canDeletePhotos: boolean;
  onChanged: () => void;
  // Site's assigned Partner (lfg_sites.partner_id -> lfg_partners.name) --
  // Installation Team was a free-text field entirely separate from Partner,
  // which the user pointed out are "the same" for how this program
  // actually runs (the partner company IS the installation team). Rather
  // than remove the field, default it to the Partner name so it's
  // pre-filled and still editable for the rare case a site's on-ground
  // installer differs from its assigned Partner (task #58).
  partnerName?: string | null;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    installation_required: initial?.installation_required ?? true,
    scaffolding_required: initial?.scaffolding_required ?? false,
    scaffolding_size: initial?.scaffolding_size ?? "",
    installation_date: initial?.installation_date ?? "",
    installation_team: initial?.installation_team ?? partnerName ?? "",
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
                placeholder={partnerName ?? undefined}
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

const DOCUMENT_CATEGORIES: { key: DocumentRow["category"]; label: string }[] = [
  { key: "reference", label: "Reference" },
  { key: "survey", label: "Survey Reports" },
  { key: "installation", label: "Installation" },
  { key: "other", label: "Other" },
];

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Real Document management (task #21/#34) -- categorized (reference/
// survey/installation/other) upload + view against lfg_site_documents,
// replacing the earlier StubTab placeholder. This is also where survey
// report PDFs mapped in from Cloudflare (task #37's bulk-link script)
// will show up going forward, under category="survey" -- same table, so
// nothing extra is needed here to display those once that script runs.
// Same presign-then-PUT-then-record pattern as InstallationTab's photo
// upload, just with a real file picker (any type) instead of a fixed
// image/jpeg, and grouped by category instead of a flat list.
export function DocumentsTab({
  siteId,
  initialDocuments,
  editable,
  canDeleteDocs,
  onChanged,
}: {
  siteId: string;
  initialDocuments: DocumentRow[];
  editable: boolean;
  canDeleteDocs: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  // In-screen preview -- PDFs (the bulk of what lands here, e.g. the linked
  // site surveys) and images render right in the tab via this overlay
  // instead of forcing a new-tab navigation; anything else (docx, etc.)
  // still falls back to opening the signed URL in a new tab below, since
  // browsers can't render those inline anyway.
  const [preview, setPreview] = useState<{ name: string; url: string; kind: "pdf" | "image" } | null>(null);

  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreview(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview]);

  async function handleUpload(category: DocumentRow["category"], file: File) {
    setUploadingCategory(category);
    try {
      const uploadRes = await fetch(`/api/lfg/sites/${siteId}/documents/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, file_name: file.name, file_type: file.type || undefined }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        toast("danger", uploadData.message || uploadData.error || "Couldn't get an upload link");
        return;
      }

      const putRes = await fetch(uploadData.url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!putRes.ok) {
        toast("danger", "Upload to storage failed");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from("lfg_site_documents").insert({
        site_id: siteId,
        category,
        file_name: file.name,
        file_type: file.type || null,
        relative_path: uploadData.relative_path,
        file_size: file.size,
        uploaded_by: user?.id ?? null,
        uploaded_by_role: uploadData.uploaded_by_role ?? "staff",
      });
      if (insertError) {
        toast("danger", `Uploaded, but couldn't record it: ${insertError.message}`);
        return;
      }

      toast("success", `${file.name} uploaded`);
      onChanged();
    } finally {
      setUploadingCategory(null);
    }
  }

  async function handleView(documentId: string) {
    const doc = initialDocuments.find((d) => d.id === documentId);
    const res = await fetch(`/api/lfg/sites/${siteId}/documents/${documentId}/signed-url`);
    const data = await res.json();
    if (!res.ok) {
      toast("danger", data.message || data.error || "Couldn't open this document");
      return;
    }
    const name = doc?.file_name ?? "Document";
    const isPdf = doc?.file_type === "application/pdf" || /\.pdf$/i.test(name);
    const isImage = (doc?.file_type?.startsWith("image/") ?? false) || /\.(png|jpe?g|gif|webp)$/i.test(name);
    if (isPdf || isImage) {
      setPreview({ name, url: data.url, kind: isPdf ? "pdf" : "image" });
    } else {
      window.open(data.url, "_blank", "noopener,noreferrer");
    }
  }

  async function handleDelete(documentId: string) {
    const { error } = await supabase.from("lfg_site_documents").delete().eq("id", documentId);
    if (error) {
      toast("danger", `Couldn't delete document: ${error.message}`);
      return;
    }
    toast("success", "Document deleted");
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      {DOCUMENT_CATEGORIES.map((cat) => {
        const docs = initialDocuments.filter((d) => d.category === cat.key);
        return (
          <div key={cat.key} className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">{cat.label}</h3>
              {editable && (
                <>
                  <input
                    ref={(el) => {
                      fileInputs.current[cat.key] = el;
                    }}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUpload(cat.key, file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={uploadingCategory === cat.key}
                    onClick={() => fileInputs.current[cat.key]?.click()}
                  >
                    <Upload size={14} className="mr-1.5" />
                    {uploadingCategory === cat.key ? "Uploading…" : "Upload"}
                  </Button>
                </>
              )}
            </div>
            {docs.length === 0 ? (
              <p className="py-3 text-center text-xs text-ink-muted">No {cat.label.toLowerCase()} files yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText size={16} className="shrink-0 text-ink-muted" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{d.file_name}</p>
                        <p className="text-xs text-ink-muted">
                          {new Date(d.uploaded_at).toLocaleDateString()}
                          {d.file_size !== null ? ` · ${formatFileSize(d.file_size)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="ghost" aria-label={`View ${d.file_name}`} onClick={() => handleView(d.id)}>
                        <Eye size={14} />
                      </Button>
                      {canDeleteDocs && (
                        <Button size="sm" variant="ghost" aria-label={`Delete ${d.file_name}`} onClick={() => handleDelete(d.id)}>
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
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onClick={() => setPreview(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex h-full max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-surface-overlay shadow-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold text-ink">{preview.name}</p>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open(preview.url, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink size={14} className="mr-1.5" />
                  Open in new tab
                </Button>
                <button
                  aria-label="Close preview"
                  onClick={() => setPreview(null)}
                  className="rounded p-1 text-ink-muted hover:bg-surface-sunken"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-surface-sunken">
              {preview.kind === "pdf" ? (
                <iframe src={preview.url} title={preview.name} className="h-full w-full" />
              ) : (
                <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL */}
                  <img src={preview.url} alt={preview.name} className="max-h-full max-w-full object-contain" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
