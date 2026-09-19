"use client";

import { useMemo, useState, useEffect } from "react";
import { Truck, Search, Download, FileCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { inchesToMm } from "@/lib/lfg-units";
import { useLfgDistinctValues } from "@/lib/useLfgDistinctValues";
import { LfgConnectHeader } from "@/components/workspaces/LfgConnectHeader";
import { normalizeMeasurements } from "@/lib/siteSurveyReport/types";
import { buildShippingLabelsPdf, downloadBlob, type ShippingLabelSiteInput, type ShippingLabelPhotoInput, type ShippingLabelMeasurement } from "@/lib/shippingLabel/labelPdf";

// 16-19 Sept 2026: task feedback -- "Now do you have the stopre address and
// phone number for all sotes an stores? Lets generate address lable in A4
// portrait size half of the page to Address and bottom half of the page
// measurement page like attached. as shipping lable" (with a Site Survey
// Report reference screenshot). Confirmed scope via follow-up questions:
// (1) a site with no completed Site Survey Report gets a text-only
// Measurements & Material table instead of a photo + Facade diagram --
// never blocks or fabricates a photo; (2) this is a real, reusable LFG
// Connect feature, not a one-off script; (3) it covers every active
// (non-archived) site, selectable individually or in bulk.
//
// The actual PDF drawing lives in lib/shippingLabel/labelPdf.ts, built as
// its own self-contained file rather than by reusing Site Survey Report's
// pdfBuild.ts internals -- see that file's header comment for why (nothing
// useful is exported from pdfBuild.ts besides types, its page geometry is
// A4 landscape vs this label's A4 portrait, and its SF Pro typography
// system is unnecessary complexity for an internal shipping label). This
// page's job is purely: list active sites, work out which ones have a
// usable completed survey (status "ready" or "generated"), fetch that
// survey's first measurement + its measurement photo (same signed-URL
// pattern as SiteSurveyReportEditorClient's own fetchPhotoInputs) when one
// exists, and hand labelPdf.ts a plain data array per selected site.
interface SiteRow {
  id: string;
  site_id: string;
  sfo_id: string | null;
  outlet_name: string;
  city: string | null;
  state: string | null;
  store_address: string | null;
  material: string | null;
  width: number | null; // inches (DB storage unit -- see lfg-units.ts)
  height: number | null; // inches
  bleed: number | null; // raw mm -- see sizes/page.tsx's own comment on why bleed isn't converted
  number_of_sites: number;
  asm_name: string | null;
  asm_mobile: string | null;
  asm_email: string | null;
  escalation_email: string | null;
  program_id: string | null;
  lfg_programs: { name: string } | { name: string }[] | null;
}

interface ProgramOption {
  id: string;
  name: string;
}

interface ReportSummary {
  id: string;
  site_id: string;
  status: string;
  updated_at: string;
}

type SelectableRow = SiteRow & { selected: boolean };

function programName(row: SiteRow): string {
  const p = Array.isArray(row.lfg_programs) ? row.lfg_programs[0] : row.lfg_programs;
  return p?.name ?? "—";
}

const selectClass =
  "shrink-0 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-primary focus:outline-none";

export default function LfgShippingLabelsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<SiteRow[] | null>(null);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [generatingBulk, setGeneratingBulk] = useState(false);

  const [query, setQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [surveyFilter, setSurveyFilter] = useState<"" | "with" | "without">("");
  const cityOptions = useLfgDistinctValues("city");

  useEffect(() => {
    fetchAllRows<SiteRow>((from, to) =>
      supabase
        .from("lfg_sites")
        .select(
          "id, site_id, sfo_id, outlet_name, city, state, store_address, material, width, height, bleed, number_of_sites, asm_name, asm_mobile, asm_email, escalation_email, program_id, lfg_programs(name)"
        )
        .is("archived_at", null)
        .order("outlet_name")
        .range(from, to)
    ).then(setRows);

    fetchAllRows<ReportSummary>((from, to) =>
      supabase
        .from("site_survey_reports")
        .select("id, site_id, status, updated_at")
        .not("site_id", "is", null)
        .range(from, to)
    ).then(setReports);

    supabase
      .from("lfg_programs")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => setPrograms((data as ProgramOption[]) ?? []));
  }, []);

  const loading = rows === null;

  // Which sites have a usable (status "ready" or "generated") completed
  // survey -- other statuses (draft/extracting/review_required) aren't
  // considered "completed" here, so those sites still fall back to the
  // text-only table. Ties (more than one usable report for a site) resolve
  // to the most recently updated one.
  const usableReportsBySite = useMemo(() => {
    const map = new Map<string, ReportSummary>();
    for (const r of reports) {
      if (r.status !== "ready" && r.status !== "generated") continue;
      const existing = map.get(r.site_id);
      if (!existing || r.updated_at > existing.updated_at) map.set(r.site_id, r);
    }
    return map;
  }, [reports]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (programFilter && r.program_id !== programFilter) return false;
      if (cityFilter && r.city !== cityFilter) return false;
      if (surveyFilter === "with" && !usableReportsBySite.has(r.id)) return false;
      if (surveyFilter === "without" && usableReportsBySite.has(r.id)) return false;
      if (!q) return true;
      return (
        r.outlet_name.toLowerCase().includes(q) ||
        (r.sfo_id ?? "").toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q) ||
        r.site_id.toLowerCase().includes(q)
      );
    });
  }, [rows, query, programFilter, cityFilter, surveyFilter, usableReportsBySite]);

  const hasActiveFilter = !!(query.trim() || programFilter || cityFilter || surveyFilter);

  /**
   * Assembles one site's labelPdf.ts input -- the lfg_sites fields always
   * (as the fallback), plus a survey-sourced measurement + photo when this
   * site has a usable completed report. Photo fetch failures are swallowed
   * (drawPhotoBox falls back to its own placeholder box) rather than
   * blocking the whole label -- a missing photo shouldn't stop a shipping
   * label from generating.
   */
  async function buildSiteInput(row: SiteRow): Promise<ShippingLabelSiteInput> {
    const base: ShippingLabelSiteInput = {
      id: row.id,
      outletName: row.outlet_name,
      sfoId: row.sfo_id,
      storeAddress: row.store_address,
      city: row.city,
      state: row.state,
      programName: programName(row) === "—" ? null : programName(row),
      asmName: row.asm_name,
      asmMobile: row.asm_mobile,
      asmEmail: row.asm_email,
      escalationEmail: row.escalation_email,
      widthMm: row.width != null ? inchesToMm(row.width) : null,
      heightMm: row.height != null ? inchesToMm(row.height) : null,
      bleedMm: row.bleed,
      material: row.material,
      numberOfSites: row.number_of_sites,
    };

    const usable = usableReportsBySite.get(row.id);
    if (!usable) return base;

    const { data: reportData } = await supabase.from("site_survey_reports").select("id, measurements").eq("id", usable.id).maybeSingle();
    if (!reportData) return base;

    const measurements = normalizeMeasurements(reportData.measurements);
    const m = measurements[0];
    if (!m) return base;

    const measurement: ShippingLabelMeasurement = {
      visualWidthMm: m.visualWidthMm,
      visualHeightMm: m.visualHeightMm,
      materialWidthMm: m.materialWidthMm,
      materialHeightMm: m.materialHeightMm,
      bleedTopMm: m.bleedTopMm,
      bleedRightMm: m.bleedRightMm,
      bleedBottomMm: m.bleedBottomMm,
      bleedLeftMm: m.bleedLeftMm,
      materialType: m.materialType,
    };

    let photo: ShippingLabelPhotoInput | null = null;
    try {
      const { data: photoRows } = await supabase
        .from("site_survey_photos")
        .select("id, relative_path, annotation, crop_offset_x, crop_offset_y")
        .eq("report_id", usable.id)
        .eq("category", "measurement")
        .order("sort_order", { ascending: true });
      const measurementPhotos = photoRows ?? [];
      const chosen = (m.measurementPhotoId && measurementPhotos.find((p) => p.id === m.measurementPhotoId)) || measurementPhotos[0];
      if (chosen) {
        const signedRes = await fetch(`/api/site-survey-reports/${usable.id}/photos/${chosen.id}/signed-url`);
        const signedData = await signedRes.json();
        if (signedRes.ok && signedData.url) {
          const imgRes = await fetch(signedData.url);
          if (imgRes.ok) {
            const bytes = new Uint8Array(await imgRes.arrayBuffer());
            photo = {
              bytes,
              format: chosen.relative_path.toLowerCase().endsWith(".png") ? "png" : "jpg",
              annotation: chosen.annotation,
              cropOffsetX: chosen.crop_offset_x,
              cropOffsetY: chosen.crop_offset_y,
            };
          }
        }
      }
    } catch {
      // Swallow -- see function comment above.
    }

    return { ...base, measurement, photo };
  }

  async function handleGenerate(ids: string[], bulk: boolean) {
    if (!rows || ids.length === 0) return;
    if (bulk) setGeneratingBulk(true);
    else setGeneratingIds((prev) => new Set([...prev, ...ids]));
    try {
      const inputs: ShippingLabelSiteInput[] = [];
      for (const id of ids) {
        const row = rows.find((r) => r.id === id);
        if (!row) continue;
        inputs.push(await buildSiteInput(row));
      }
      if (inputs.length === 0) {
        toast("danger", "Nothing to generate.");
        return;
      }
      const blob = await buildShippingLabelsPdf(inputs);
      const filename =
        ids.length === 1
          ? `Shipping-Label-${rows.find((r) => r.id === ids[0])?.sfo_id || rows.find((r) => r.id === ids[0])?.site_id || "site"}.pdf`
          : `Shipping-Labels-${ids.length}-sites-${new Date().toISOString().slice(0, 10)}.pdf`;
      downloadBlob(blob, filename);
      toast("success", `Generated ${ids.length} shipping label${ids.length === 1 ? "" : "s"}.`);
      if (bulk) setSelectedIds(new Set());
    } catch (err) {
      toast("danger", err instanceof Error ? err.message : "Failed to generate labels.");
    } finally {
      if (bulk) setGeneratingBulk(false);
      else setGeneratingIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    }
  }

  const COLUMNS: TableColumn<SelectableRow>[] = [
    {
      key: "selected",
      header: "",
      width: "2rem",
      headerRender: () => (
        <input
          type="checkbox"
          checked={filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id))}
          onChange={(e) => setSelectedIds(e.target.checked ? new Set(filteredRows.map((r) => r.id)) : new Set())}
          aria-label="Select all shown"
          className="h-4 w-4 rounded border-line-strong"
        />
      ),
      render: (r) => (
        <input
          type="checkbox"
          checked={r.selected}
          onChange={() => toggleSelected(r.id)}
          aria-label={`Select ${r.site_id}`}
          className="h-4 w-4 rounded border-line-strong"
        />
      ),
    },
    { key: "sfo_id", header: "SFO ID", width: "7rem", sortable: true, render: (r) => r.sfo_id ?? "—" },
    { key: "outlet_name", header: "Store Name", sortable: true },
    { key: "city", header: "City", width: "7rem", sortable: true, render: (r) => r.city ?? "—" },
    { key: "program_id", header: "Program", width: "9.5rem", render: (r) => programName(r) },
    {
      key: "id",
      header: "Survey",
      width: "9rem",
      render: (r) =>
        usableReportsBySite.has(r.id) ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-xs font-medium text-success">
            <FileCheck size={11} /> On file
          </span>
        ) : (
          <span className="text-xs text-ink-muted">No survey</span>
        ),
    },
    { key: "asm_mobile", header: "ASM Mobile", width: "8rem", render: (r) => r.asm_mobile ?? "—" },
    {
      key: "site_id",
      header: "",
      width: "6rem",
      render: (r) => (
        <Button
          variant="secondary"
          size="sm"
          loading={generatingIds.has(r.id)}
          disabled={generatingBulk}
          onClick={() => handleGenerate([r.id], false)}
        >
          <Download size={13} className="mr-1.5" /> Label
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Shipping Labels" }]} />

      <LfgConnectHeader
        icon={Truck}
        section="Shipping Labels"
        subtitle="One A4 shipping label per active site -- top half is the ship-to address, bottom half is the Site Photo & Measurement block from that site's completed Site Survey Report, or a text-only measurements table when no survey is on file yet."
      />

      <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Sites" value={loading ? "…" : String(rows!.length)} trend="flat" trendLabel="Non-archived" />
        <StatCard
          label="With Completed Survey"
          value={loading ? "…" : String(rows!.filter((r) => usableReportsBySite.has(r.id)).length)}
          trend="flat"
          trendLabel="Photo + Facade diagram on the label"
        />
        <StatCard
          label="Selected"
          value={loading ? "…" : String(selectedIds.size)}
          trend="flat"
          trendLabel={selectedIds.size > 0 ? "Ready to generate" : "Select rows to bulk-generate"}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2">
          <Search size={16} className="text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search outlet name, Site ID, SFO ID, or City"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className={selectClass}>
          <option value="">All Programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className={selectClass}>
          <option value="">All cities</option>
          {cityOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={surveyFilter} onChange={(e) => setSurveyFilter(e.target.value as "" | "with" | "without")} className={selectClass}>
          <option value="">Survey: All</option>
          <option value="with">With completed survey</option>
          <option value="without">Without a survey</option>
        </select>
        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setProgramFilter("");
              setCityFilter("");
              setSurveyFilter("");
            }}
            className="text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary bg-primary-tint px-4 py-2.5">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} site{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            <Button size="sm" loading={generatingBulk} onClick={() => handleGenerate([...selectedIds], true)}>
              <Download size={14} className="mr-1.5" /> Generate Labels ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-4">
        {loading ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading sites…</p>
        ) : filteredRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{hasActiveFilter ? "No sites match your filters." : "No sites yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table columns={COLUMNS} rows={filteredRows.map((r): SelectableRow => ({ ...r, selected: selectedIds.has(r.id) }))} />
          </div>
        )}
      </div>
    </div>
  );
}
