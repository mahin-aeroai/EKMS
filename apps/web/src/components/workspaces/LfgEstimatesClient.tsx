"use client";

// LFG Connect — Estimates. First deliverable of "Generate estimate for
// submission to customer" (Srinivas): a searchable/filterable list of
// every site's costing (printing, packing, shipping, installation, GST)
// with a "Download Costing Excel" export covering the full breakdown per
// site, plus (per his follow-up decision) real in-app fields to mark,
// for sites currently attributed to MMDI, whether the install stays
// in-house or goes to an outsourced 3rd-party vendor under a PO.
//
// Data model: reads lfg_sites + lfg_site_financials + lfg_installation_costs
// (the last two ADMIN/EDITOR ONLY, see supabase-lfg-estimates-schema.sql's
// header comment) + lfg_partners/lfg_programs for display names and the
// vendor picker. No new "estimate" table -- this reads the live costing
// data directly rather than a snapshot, same as the Financials tab on
// Site 360 does; a true versioned customer-facing estimate document is a
// later phase if wanted.

import { useEffect, useMemo, useState } from "react";
import { Receipt, Search, FileDown, Pencil } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { formatInr } from "@/lib/lfgStatus";
import { LfgConnectHeader } from "@/components/workspaces/LfgConnectHeader";
import {
  buildLfgEstimatesWorkbook,
  downloadBlob,
  INSTALL_EXECUTION_LABEL,
  type LfgEstimateSiteRow,
  type LfgInstallExecution,
} from "@/lib/lfgEstimatesExport";

interface SiteBase {
  id: string;
  site_id: string;
  sfo_id: string | null;
  outlet_name: string;
  format: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  material: string | null;
  sqft: number | null;
  site_status: string;
  partner_id: string | null;
  program_id: string | null;
  lfg_partners: { name: string } | null;
}

interface FinancialsRow {
  site_id: string;
  rate: number | null;
  amount: number | null;
  packing_forwarding: number | null;
  shipping_amount: number | null;
  other_charges: number | null;
  gst_amount: number | null;
  total_printing_amount: number | null;
  material_cost: number | null;
  production_cost: number | null;
  total_commercial_value: number | null;
  total_project_cost: number | null;
  margin: number | null;
}

interface InstallationCostsRow {
  site_id: string;
  installation_rate: number | null;
  installation_amount: number | null;
  scaffolding_amount: number | null;
  installation_travelling: number | null;
  installation_gst_amount: number | null;
  labour_other_expenses: number | null;
  total_installation_cost: number | null;
  install_execution: LfgInstallExecution | null;
  outsourced_vendor_partner_id: string | null;
  po_number: string | null;
  po_date: string | null;
  po_amount: number | null;
  po_notes: string | null;
}

interface PartnerOption {
  id: string;
  name: string;
}

interface ProgramOption {
  id: string;
  name: string;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Same chunking discipline as the Distribution tool's items fetch fix --
// a season/site list can run into the hundreds, and a single .in() call
// with every id in one request risks an oversized URL that fails
// silently if not careful; chunking + throwing on error avoids both.
const SITE_CHUNK = 150;

async function fetchBySiteIds<T>(table: string, siteIds: string[]): Promise<T[]> {
  const all: T[] = [];
  for (const idsChunk of chunkArray(siteIds, SITE_CHUNK)) {
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from(table).select("*").in("site_id", idsChunk).range(from, from + pageSize - 1);
      if (error) throw error;
      all.push(...((data as T[] | null) ?? []));
      if (!data || data.length < pageSize) break;
    }
  }
  return all;
}

const EXECUTION_BADGE: Record<string, BadgeStatus> = {
  mmdi_direct: "info",
  outsourced_vendor: "warning",
  not_set: "neutral",
};

export default function LfgEstimatesClient() {
  const { toast } = useToast();
  const role = useUserRole();
  const editable = canWrite(role);

  const [sites, setSites] = useState<SiteBase[]>([]);
  const [financialsBySite, setFinancialsBySite] = useState<Map<string, FinancialsRow>>(new Map());
  const [installBySite, setInstallBySite] = useState<Map<string, InstallationCostsRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);

  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("");

  const [editingSite, setEditingSite] = useState<SiteBase | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: partnerData }, { data: programData }] = await Promise.all([
        supabase.from("lfg_partners").select("id, name").order("name"),
        supabase.from("lfg_programs").select("id, name").order("name"),
      ]);
      setPartners((partnerData as PartnerOption[]) ?? []);
      setPrograms((programData as ProgramOption[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      (async () => {
        setLoading(true);
        try {
          const pageSize = 1000;
          const allSites: SiteBase[] = [];
          for (let from = 0; ; from += pageSize) {
            let q = supabase
              .from("lfg_sites")
              .select("id, site_id, sfo_id, outlet_name, format, city, state, region, material, sqft, site_status, partner_id, program_id, lfg_partners(name)")
              .order("sfo_id", { ascending: true, nullsFirst: false })
              .range(from, from + pageSize - 1);
            if (programFilter) q = q.eq("program_id", programFilter);
            if (formatFilter) q = q.eq("format", formatFilter);
            if (partnerFilter) q = q.eq("partner_id", partnerFilter);
            const trimmed = search.trim();
            if (trimmed) {
              q = q.or(`site_id.ilike.%${trimmed}%,outlet_name.ilike.%${trimmed}%,sfo_id.ilike.%${trimmed}%,city.ilike.%${trimmed}%`);
            }
            const { data, error } = await q;
            if (error) throw error;
            if (!data || data.length === 0) break;
            allSites.push(...(data as unknown as SiteBase[]));
            if (data.length < pageSize) break;
          }
          setSites(allSites);

          const siteIds = allSites.map((s) => s.id);
          if (siteIds.length === 0) {
            setFinancialsBySite(new Map());
            setInstallBySite(new Map());
            return;
          }
          const [financials, installCosts] = await Promise.all([
            fetchBySiteIds<FinancialsRow>("lfg_site_financials", siteIds),
            fetchBySiteIds<InstallationCostsRow>("lfg_installation_costs", siteIds),
          ]);
          setFinancialsBySite(new Map(financials.map((f) => [f.site_id, f])));
          setInstallBySite(new Map(installCosts.map((i) => [i.site_id, i])));
        } catch (err) {
          toast("danger", `Couldn't load costing data: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          setLoading(false);
        }
      })();
    }, 250);
    return () => clearTimeout(handle);
  }, [search, programFilter, formatFilter, partnerFilter, toast]);

  const partnerNameById = useMemo(() => new Map(partners.map((p) => [p.id, p.name])), [partners]);
  // Vendor picker excludes the "MMDI" partner row itself -- assigning
  // MMDI as its own outsourced vendor makes no sense.
  const vendorOptions = useMemo(() => partners.filter((p) => p.name.trim().toUpperCase() !== "MMDI"), [partners]);
  const formatOptions = useMemo(() => Array.from(new Set(sites.map((s) => s.format).filter((f): f is string => !!f))).sort(), [sites]);

  const estimateRows: LfgEstimateSiteRow[] = useMemo(
    () =>
      sites.map((s) => {
        const fin = financialsBySite.get(s.id);
        const inst = installBySite.get(s.id);
        return {
          id: s.id,
          siteId: s.site_id,
          sfoId: s.sfo_id,
          outletName: s.outlet_name,
          format: s.format,
          programName: programs.find((p) => p.id === s.program_id)?.name ?? null,
          city: s.city,
          state: s.state,
          region: s.region,
          material: s.material,
          sqft: s.sqft,
          siteStatus: s.site_status,
          installedByPartnerName: s.lfg_partners?.name ?? null,
          rate: fin?.rate ?? null,
          amount: fin?.amount ?? null,
          packingForwarding: fin?.packing_forwarding ?? null,
          shippingAmount: fin?.shipping_amount ?? null,
          otherCharges: fin?.other_charges ?? null,
          gstAmount: fin?.gst_amount ?? null,
          totalPrintingAmount: fin?.total_printing_amount ?? null,
          materialCost: fin?.material_cost ?? null,
          productionCost: fin?.production_cost ?? null,
          totalCommercialValue: fin?.total_commercial_value ?? null,
          installationRate: inst?.installation_rate ?? null,
          installationAmount: inst?.installation_amount ?? null,
          scaffoldingAmount: inst?.scaffolding_amount ?? null,
          installationTravelling: inst?.installation_travelling ?? null,
          installationGstAmount: inst?.installation_gst_amount ?? null,
          labourOtherExpenses: inst?.labour_other_expenses ?? null,
          totalInstallationCost: inst?.total_installation_cost ?? null,
          totalProjectCost: fin?.total_project_cost ?? null,
          margin: fin?.margin ?? null,
          installExecution: inst?.install_execution ?? null,
          outsourcedVendorName: inst?.outsourced_vendor_partner_id ? partnerNameById.get(inst.outsourced_vendor_partner_id) ?? null : null,
          poNumber: inst?.po_number ?? null,
          poDate: inst?.po_date ?? null,
          poAmount: inst?.po_amount ?? null,
          poNotes: inst?.po_notes ?? null,
        };
      }),
    [sites, financialsBySite, installBySite, programs, partnerNameById]
  );

  const totals = useMemo(
    () => ({
      count: estimateRows.length,
      totalProjectCost: estimateRows.reduce((n, r) => n + (r.totalProjectCost ?? 0), 0),
      notSetMmdi: estimateRows.filter((r) => r.installedByPartnerName?.trim().toUpperCase() === "MMDI" && !r.installExecution).length,
    }),
    [estimateRows]
  );

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await buildLfgEstimatesWorkbook(estimateRows);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `LFG_Costing_${stamp}.xlsx`);
    } catch (err) {
      toast("danger", `Couldn't build the Excel file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  }

  const COLUMNS: TableColumn<LfgEstimateSiteRow>[] = [
    { key: "sfoId", header: "SFO ID", width: "6rem" },
    { key: "outletName", header: "Outlet / Store" },
    { key: "format", header: "Format", width: "8rem" },
    { key: "programName", header: "Program", width: "8rem" },
    { key: "city", header: "City", width: "7rem" },
    { key: "installedByPartnerName", header: "Installed By", width: "7rem", render: (r) => r.installedByPartnerName ?? "—" },
    { key: "totalPrintingAmount", header: "Printing", width: "8rem", render: (r) => formatInr(r.totalPrintingAmount) },
    { key: "totalInstallationCost", header: "Installation", width: "8rem", render: (r) => formatInr(r.totalInstallationCost) },
    { key: "totalProjectCost", header: "Total Cost", width: "8rem", render: (r) => formatInr(r.totalProjectCost) },
    {
      key: "installExecution",
      header: "Execution",
      width: "9rem",
      render: (r) => (
        <Badge status={EXECUTION_BADGE[r.installExecution ?? "not_set"]}>
          {r.installExecution ? INSTALL_EXECUTION_LABEL[r.installExecution] : "Not set"}
        </Badge>
      ),
    },
    {
      key: "poNumber",
      header: "PO",
      width: "7rem",
      render: (r) => (r.poNumber ? <span className="text-ink">{r.poNumber}</span> : <span className="text-ink-muted">—</span>),
    },
    ...(editable
      ? ([
          {
            key: "id",
            header: "",
            width: "4rem",
            render: (r: LfgEstimateSiteRow) => (
              <Button variant="ghost" size="sm" onClick={() => setEditingSite(sites.find((s) => s.id === r.id) ?? null)}>
                <Pencil size={13} /> Edit
              </Button>
            ),
          },
        ] as TableColumn<LfgEstimateSiteRow>[])
      : []),
  ];

  return (
    <div className="space-y-6 pb-16">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Estimates" }]} />

      <LfgConnectHeader
        icon={Receipt}
        section="Estimates"
        subtitle="Printing, packing, shipping, installation costs and GST for every site — download a costing Excel to mark up and share, or mark installation execution and PO details directly here."
        action={
          <Button onClick={handleDownload} loading={downloading} disabled={estimateRows.length === 0}>
            <FileDown size={14} /> Download Costing Excel
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-xs text-ink-secondary">
        <span>{totals.count} sites</span>
        <span>{formatInr(totals.totalProjectCost)} total project cost</span>
        {totals.notSetMmdi > 0 && (
          <span className="text-warning">{totals.notSetMmdi} MMDI site(s) with execution not yet marked</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <Search size={15} className="text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Site ID, Outlet, SFO ID, or City"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          className="shrink-0 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">All programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value)}
          className="shrink-0 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">All formats</option>
          {formatOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          value={partnerFilter}
          onChange={(e) => setPartnerFilter(e.target.value)}
          className="shrink-0 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">All partners</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-ink-muted">Loading…</p>
      ) : estimateRows.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-muted">No sites match these filters.</p>
      ) : (
        <Table columns={COLUMNS} rows={estimateRows} density="compact" />
      )}

      {editingSite && (
        <EditExecutionDialog
          site={editingSite}
          installRow={installBySite.get(editingSite.id) ?? null}
          vendorOptions={vendorOptions}
          onClose={() => setEditingSite(null)}
          onSaved={(row) => {
            setInstallBySite((prev) => new Map(prev).set(editingSite.id, row));
            setEditingSite(null);
          }}
        />
      )}
    </div>
  );
}

function EditExecutionDialog({
  site,
  installRow,
  vendorOptions,
  onClose,
  onSaved,
}: {
  site: SiteBase;
  installRow: InstallationCostsRow | null;
  vendorOptions: PartnerOption[];
  onClose: () => void;
  onSaved: (row: InstallationCostsRow) => void;
}) {
  const { toast } = useToast();
  const [execution, setExecution] = useState<LfgInstallExecution | "">(installRow?.install_execution ?? "");
  const [vendorId, setVendorId] = useState(installRow?.outsourced_vendor_partner_id ?? "");
  const [poNumber, setPoNumber] = useState(installRow?.po_number ?? "");
  const [poDate, setPoDate] = useState(installRow?.po_date ?? "");
  const [poAmount, setPoAmount] = useState(installRow?.po_amount != null ? String(installRow.po_amount) : "");
  const [poNotes, setPoNotes] = useState(installRow?.po_notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const patch = {
        site_id: site.id,
        install_execution: execution || null,
        outsourced_vendor_partner_id: execution === "outsourced_vendor" ? vendorId || null : null,
        po_number: execution === "outsourced_vendor" ? poNumber.trim() || null : null,
        po_date: execution === "outsourced_vendor" ? poDate || null : null,
        po_amount: execution === "outsourced_vendor" && poAmount.trim() ? Number(poAmount) : null,
        po_notes: execution === "outsourced_vendor" ? poNotes.trim() || null : null,
      };
      const { data, error } = await supabase.from("lfg_installation_costs").upsert(patch, { onConflict: "site_id" }).select().single();
      if (error) {
        toast("danger", `Couldn't save: ${error.message}`);
        return;
      }
      onSaved(data as InstallationCostsRow);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Installation Execution — ${site.outlet_name}`}
      variant="form"
      onConfirm={handleSave}
      confirmLabel={saving ? "Saving…" : "Save"}
    >
      <div className="flex flex-col gap-4">
        {site.lfg_partners?.name?.trim().toUpperCase() !== "MMDI" && (
          <p className="rounded-md bg-warning-tint px-3 py-2 text-xs text-warning">
            This site&apos;s current installation partner is {site.lfg_partners?.name ?? "not set"}, not MMDI — execution
            tracking here is meant for MMDI-attributed sites, but you can still record it if needed.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-ink-secondary">Installed by</label>
          <select
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            value={execution}
            onChange={(e) => setExecution(e.target.value as LfgInstallExecution | "")}
          >
            <option value="">Not set</option>
            <option value="mmdi_direct">{INSTALL_EXECUTION_LABEL.mmdi_direct}</option>
            <option value="outsourced_vendor">{INSTALL_EXECUTION_LABEL.outsourced_vendor}</option>
          </select>
        </div>

        {execution === "outsourced_vendor" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-secondary">Vendor</label>
              <select
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">Select a vendor…</option>
                {vendorOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-ink-secondary">PO Number</label>
                <input
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-ink-secondary">PO Date</label>
                <input
                  type="date"
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-secondary">PO Amount</label>
              <input
                type="number"
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                value={poAmount}
                onChange={(e) => setPoAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-secondary">Notes</label>
              <textarea
                rows={2}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
