"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardList, Download, FilePlus2, Plus, Settings, Search, Trash2 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { ImageSlot } from "@/components/installationReport/ImageSlot";
import { MasterPickSelect } from "@/components/installationReport/MasterPickSelect";
import {
  buildInstallationReportPdf,
  downloadBlob,
  type ReportData,
  type SiteEntry,
  type StorePictures,
} from "@/lib/installationReport/pdfBuild";

interface StoreMasterRow {
  id: string;
  store_name: string;
  address: string | null;
  sfo_id: string | null;
  program: string | null;
  no_of_sites: number | null;
  default_fixture_type: string | null;
  default_material: string | null;
  default_sign_type: string | null;
}

// One row per physical installation site at a store (installation_report_store_sites)
// — a multi-site store's sites can each carry their own Fixture Type /
// Material / Sign Type / Size instead of sharing one store-wide default.
interface StoreSiteRow {
  id: string;
  site_index: number;
  fixture_type: string | null;
  material: string | null;
  sign_type: string | null;
  width_mm: number | null;
  height_mm: number | null;
}

function sizeLabel(widthMm: number | null, heightMm: number | null): string {
  if (!widthMm || !heightMm) return "";
  const round = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 10) / 10);
  return `${round(widthMm)} x ${round(heightMm)} mm`;
}

function siteFromOption(option: StoreSiteRow | undefined): SiteEntry {
  const site = emptySite();
  if (!option) return site;
  site.fixtureType = option.fixture_type ?? "";
  site.material = option.material ?? "";
  site.signType = option.sign_type ?? "";
  site.size = sizeLabel(option.width_mm, option.height_mm);
  return site;
}

const INSTALLATION_STATUS_OPTIONS = ["Scheduled", "In Progress", "Completed", "Delayed", "Cancelled"];
const OVERALL_STATUS_OPTIONS = ["Pass", "Conditional", "Fail"];
const SITE_CONDITION_OPTIONS = ["Good", "Poor"];
const POOR_CONDITION_REASONS = ["Need replacement of entire fixture", "Need to service the lighting"];
const OTHERS_REASON = "Others";

// Fields that carry over to a newly added site from the previous one —
// these tend to stay the same across most sites in the same report (same
// fixture/material/team etc.), so only the handful of fields that
// genuinely vary per visit (date, permission slot, condition, remarks)
// start blank / at their default each time. See addSite() below.
const CARRY_FORWARD_KEYS: (keyof SiteEntry)[] = [
  "fixtureType",
  "material",
  "signType",
  "size",
  "installedByTeam",
  "installedArtwork",
  "wasSuccessful",
  "fixtureCondition",
  "scaffoldingRequired",
  "overallStatus",
];

function emptySite(): SiteEntry {
  return {
    label: "",
    fixtureType: "",
    material: "",
    signType: "",
    size: "",
    creativeName: "",
    installedByTeam: "MMDI",
    installationStatus: "Completed",
    installedArtwork: "",
    storePermissionSlots: "",
    wasSuccessful: "Yes",
    siteCondition: "Good",
    fixtureCondition: "",
    scaffoldingRequired: "No",
    inspectorRemarks: "",
    overallStatus: "Pass",
    mainSlide: null,
    closeUp: null,
    cornerTL: null,
    cornerTR: null,
    cornerBL: null,
    cornerBR: null,
  };
}

// True if a site has nothing meaningful entered yet — used to decide
// whether picking a store is allowed to auto-create/replace the site blocks
// below. Deliberately does NOT check fixtureType/material/signType/size:
// those are exactly the fields a store pick is about to (re)fill, so if the
// operator picks the wrong store first and then picks the right one right
// after, the second pick still needs to be able to overwrite them. Only
// content a store pick could never have produced — a label, a chosen
// creative, artwork notes, or an attached photo — blocks the auto-fill.
function isSitePristine(s: SiteEntry): boolean {
  return (
    !s.label &&
    !s.creativeName &&
    !s.installedArtwork &&
    !s.mainSlide &&
    !s.closeUp &&
    !s.cornerTL &&
    !s.cornerTR &&
    !s.cornerBL &&
    !s.cornerBR
  );
}

function emptyStorePictures(): StorePictures {
  return {
    storeFullCover: null,
    installationCloseUp: null,
    streetView1: null,
    streetView2: null,
    cornerPic1: null,
    cornerPic2: null,
    cornerPic3: null,
    cornerPic4: null,
  };
}

/**
 * Installation Report tool — a page inside MMDI ONE that does its real work
 * entirely in the browser, in the same spirit as the Cut File Tool. Photos
 * are picked straight from the operator's local drive and never uploaded
 * anywhere. Store details, creative details, and the fixture/material/sign
 * type/team pick-lists all come from small master-data tables (see
 * src/app/workspaces/installation-report/master-data/page.tsx) instead of
 * being retyped on every report — that's the whole point of the Store
 * Master / Creative Master lookups below. The final multi-page PDF is
 * assembled client-side by src/lib/installationReport/pdfBuild.ts.
 */
export default function InstallationReportClient() {
  const { toast } = useToast();

  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState("");
  const [sfoId, setSfoId] = useState("");
  const [program, setProgram] = useState("");

  // Report-level — chosen once, applies to every site in the report.
  const [seasonProgram, setSeasonProgram] = useState("");
  const [installationDate, setInstallationDate] = useState("");

  const [storePictures, setStorePictures] = useState<StorePictures>(emptyStorePictures());
  const [sites, setSites] = useState<SiteEntry[]>([emptySite()]);
  const [exporting, setExporting] = useState(false);

  // Every known site (site_index 1, 2, 3...) for the currently-picked
  // store, from installation_report_store_sites — drives the "Site 1 /
  // Site 2 / Site 3" quick-add buttons below instead of a single blind
  // "+ Add site" button, so it's obvious up front how many sites a store
  // has and which ones are already added.
  const [storeSiteOptions, setStoreSiteOptions] = useState<StoreSiteRow[]>([]);

  // Store Master picker
  const [storeQuery, setStoreQuery] = useState("");
  const [storeResults, setStoreResults] = useState<StoreMasterRow[] | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const storeBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (storeBoxRef.current && !storeBoxRef.current.contains(e.target as Node)) setStoreOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!storeOpen) return;
    const handle = setTimeout(() => {
      const term = storeQuery.trim();
      let q = supabase
        .from("installation_report_stores")
        .select("id, store_name, address, sfo_id, program, no_of_sites, default_fixture_type, default_material, default_sign_type")
        .eq("active", true)
        .order("store_name", { ascending: true })
        .limit(25);
      if (term) q = q.or(`store_name.ilike.%${term}%,sfo_id.ilike.%${term}%`);
      q.then(({ data, error }) => {
        if (!error) setStoreResults((data as StoreMasterRow[]) ?? []);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [storeQuery, storeOpen]);

  async function applyStore(row: StoreMasterRow) {
    setStoreName(row.store_name);
    setAddress(row.address ?? "");
    setSfoId(row.sfo_id ?? "");
    setProgram(row.program ?? "");
    setStoreOpen(false);
    setStoreQuery("");

    // Per-site Fixture Type / Material / Sign Type / Size (each site of a
    // multi-site store can differ) — falls back to a synthesized list from
    // the store-wide default_* columns + no_of_sites if this store hasn't
    // been imported into installation_report_store_sites yet.
    const { data: siteRows, error: siteError } = await supabase
      .from("installation_report_store_sites")
      .select("id, site_index, fixture_type, material, sign_type, width_mm, height_mm")
      .eq("store_id", row.id)
      .eq("active", true)
      .order("site_index", { ascending: true });

    const options: StoreSiteRow[] =
      !siteError && siteRows && siteRows.length > 0
        ? (siteRows as StoreSiteRow[])
        : Array.from({ length: row.no_of_sites && row.no_of_sites > 0 ? row.no_of_sites : 1 }, (_, i) => ({
            id: "",
            site_index: i + 1,
            fixture_type: row.default_fixture_type,
            material: row.default_material,
            sign_type: row.default_sign_type,
            width_mm: null,
            height_mm: null,
          }));
    setStoreSiteOptions(options);

    // Only auto-fill Site 1 into the existing single block when it's still
    // untouched — if the operator has already started filling it in, leave
    // it alone and just fill the store fields + refresh the Site
    // quick-add buttons above.
    let filledSiteOne = false;
    setSites((prev) => {
      if (prev.length !== 1 || !isSitePristine(prev[0])) return prev;
      filledSiteOne = true;
      return [siteFromOption(options.find((o) => o.site_index === 1))];
    });

    if (options.length > 1) {
      toast(
        "success",
        `Store details filled — this store has ${options.length} sites. Use the Site ${options
          .slice(1)
          .map((o) => o.site_index)
          .join(" / Site ")} buttons below to add the rest.`
      );
    } else if (filledSiteOne) {
      toast("success", "Store details filled from Store Master — adjust anything below as needed");
    } else {
      toast("success", "Store details filled from Store Master — pick a Site number below to add its details");
    }
  }

  function updateSite(index: number, patch: Partial<SiteEntry>) {
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  // With no known site number (the generic "+ Add site" fallback, for a
  // site beyond what Store Master knows about): carries forward the
  // previous site's fixture/material/etc, same as before.
  function addSite() {
    setSites((prev) => {
      const next = emptySite();
      const last = prev[prev.length - 1];
      if (last) {
        for (const key of CARRY_FORWARD_KEYS) {
          (next as Record<keyof SiteEntry, unknown>)[key] = last[key];
        }
      }
      return [...prev, next];
    });
  }

  // With a known site number (one of the Site 1 / Site 2 / ... quick-add
  // buttons): pre-fills from that site's own master data instead of
  // carrying forward the previous site's.
  function addKnownSite(siteIndex: number) {
    const option = storeSiteOptions.find((o) => o.site_index === siteIndex);
    setSites((prev) => [...prev, siteFromOption(option)]);
  }

  function removeSite(index: number) {
    setSites((prev) => prev.filter((_, i) => i !== index));
  }

  function startNewReport() {
    setStoreName("");
    setAddress("");
    setSfoId("");
    setProgram("");
    setSeasonProgram("");
    setInstallationDate("");
    setStorePictures(emptyStorePictures());
    setSites([emptySite()]);
    setStoreSiteOptions([]);
    toast("success", "Cleared — ready for the next report");
  }

  async function handleExport() {
    if (!storeName.trim()) {
      toast("warning", "Add a store name before exporting");
      return;
    }
    setExporting(true);
    try {
      const data: ReportData = {
        storeName,
        address,
        sfoId,
        program,
        seasonProgram,
        installationDate,
        storePictures,
        sites,
      };
      const blob = await buildInstallationReportPdf(data);
      const safeName = storeName.replace(/[^\w\-]+/g, "_").slice(0, 60) || "installation_report";
      downloadBlob(blob, `${safeName}_installation_report.pdf`);
      toast("success", "Report exported — download started");
    } catch (err) {
      toast("danger", err instanceof Error ? err.message : "Couldn't build the report PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Operations" }, { label: "Installation Report" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <ClipboardList size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Installation Report</h1>
              <Badge status="info">Runs locally in your browser</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Pick the store and creative from master data, fill in the sites, attach photos from your local drive,
              and export a premium Apple Site Installation Report PDF — photos never leave this device.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/workspaces/installation-report/master-data"
            className="flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-sunken"
          >
            <Settings size={14} /> Manage Master Data
          </Link>
          <Button variant="secondary" onClick={startNewReport}>
            <FilePlus2 size={14} className="mr-1.5" /> New Report
          </Button>
          <Button onClick={handleExport} loading={exporting}>
            <Download size={14} className="mr-1.5" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Store information</h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div ref={storeBoxRef} className="relative flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-ink-secondary">
                Store name
                <span className="ml-1 font-normal text-ink-muted">— search Store Master to autofill, or type a new one</span>
              </label>
              <div className="flex items-center gap-2 rounded-md border border-line-strong bg-surface px-2">
                <Search size={14} className="text-ink-muted" />
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => {
                    setStoreName(e.target.value);
                    setStoreQuery(e.target.value);
                    setStoreOpen(true);
                  }}
                  onFocus={() => setStoreOpen(true)}
                  placeholder="e.g. Aptronix - Malabar Vijayawada"
                  className="h-9 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
                />
              </div>
              {storeOpen && storeResults && storeResults.length > 0 && (
                <div className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface-overlay p-1 shadow-3">
                  {storeResults.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => applyStore(row)}
                      className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-sunken"
                    >
                      <span className="text-ink">{row.store_name}</span>
                      <span className="text-xs text-ink-muted">
                        {row.sfo_id ? `SFO ${row.sfo_id}` : ""} {row.program ? `· ${row.program}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {storeOpen && storeResults && storeResults.length === 0 && (
                <div className="absolute top-full z-20 mt-1 w-full rounded-md border border-line bg-surface-overlay p-3 text-xs text-ink-muted shadow-3">
                  No matches in Store Master. Fill in the fields below and add it via Manage Master Data to reuse it
                  next time.
                </div>
              )}
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
              SFO ID
              <input
                type="text"
                value={sfoId}
                onChange={(e) => setSfoId(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="e.g. 1606231"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
              Store Program
              <input
                type="text"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="e.g. APR, Mono AAR"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary sm:col-span-2">
              Address
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="Store address"
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Program &amp; schedule</h3>
          <p className="mb-3 text-xs text-ink-muted">Chosen once per report — applies to every site below.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MasterPickSelect label="Program" table="installation_report_programs" value={seasonProgram} onChange={setSeasonProgram} />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
              Installation Date
              <input
                type="date"
                value={installationDate}
                onChange={(e) => setInstallationDate(e.target.value)}
                className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Store overview photos</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ImageSlot label="Store Full Cover" value={storePictures.storeFullCover} onChange={(f) => setStorePictures((p) => ({ ...p, storeFullCover: f }))} />
            <ImageSlot label="Installation Close-up" value={storePictures.installationCloseUp} onChange={(f) => setStorePictures((p) => ({ ...p, installationCloseUp: f }))} />
            <ImageSlot label="Street View 1" value={storePictures.streetView1} onChange={(f) => setStorePictures((p) => ({ ...p, streetView1: f }))} />
            <ImageSlot label="Street View 2" value={storePictures.streetView2} onChange={(f) => setStorePictures((p) => ({ ...p, streetView2: f }))} />
            <ImageSlot label="Corner Pic 1" value={storePictures.cornerPic1} onChange={(f) => setStorePictures((p) => ({ ...p, cornerPic1: f }))} />
            <ImageSlot label="Corner Pic 2" value={storePictures.cornerPic2} onChange={(f) => setStorePictures((p) => ({ ...p, cornerPic2: f }))} />
            <ImageSlot label="Corner Pic 3" value={storePictures.cornerPic3} onChange={(f) => setStorePictures((p) => ({ ...p, cornerPic3: f }))} />
            <ImageSlot label="Corner Pic 4" value={storePictures.cornerPic4} onChange={(f) => setStorePictures((p) => ({ ...p, cornerPic4: f }))} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Installation sites</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {storeSiteOptions
                .filter((o) => o.site_index > sites.length)
                .map((o) => (
                  <button
                    key={o.site_index}
                    type="button"
                    onClick={() => addKnownSite(o.site_index)}
                    className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary-tint px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                  >
                    <Plus size={12} /> Site {o.site_index}
                  </button>
                ))}
              <Button variant="secondary" size="sm" onClick={addSite}>
                <Plus size={13} className="mr-1.5" /> Add site
              </Button>
            </div>
          </div>

          {sites.map((site, i) => (
            <div key={i} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-ink">Installation Site {i + 1}</h4>
                {sites.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSite(i)}
                    className="flex items-center gap-1 text-xs text-danger hover:opacity-80"
                  >
                    <Trash2 size={13} /> Remove site
                  </button>
                )}
              </div>

              <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                Site label <span className="font-normal text-ink-muted">(optional)</span>
                <input
                  type="text"
                  value={site.label}
                  onChange={(e) => updateSite(i, { label: e.target.value })}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none sm:max-w-sm"
                  placeholder="e.g. Entrance banner"
                />
              </label>

              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Installation details</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <MasterPickSelect label="Fixture Type" table="installation_report_fixture_types" value={site.fixtureType} onChange={(v) => updateSite(i, { fixtureType: v })} />
                <MasterPickSelect label="Material" table="installation_report_materials" value={site.material} onChange={(v) => updateSite(i, { material: v })} />
                <MasterPickSelect label="Sign Type" table="installation_report_sign_types" value={site.signType} onChange={(v) => updateSite(i, { signType: v })} />
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Size
                  <input
                    type="text"
                    value={site.size}
                    onChange={(e) => updateSite(i, { size: e.target.value })}
                    className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
                <MasterPickSelect
                  label="Creative"
                  table="installation_report_creatives"
                  column="creative_name"
                  value={site.creativeName}
                  onChange={(v) => updateSite(i, { creativeName: v })}
                />
              </div>

              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Installation schedule</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <MasterPickSelect label="Installation Team" table="installation_report_teams" value={site.installedByTeam} onChange={(v) => updateSite(i, { installedByTeam: v })} />
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Installation Status
                  <select
                    value={site.installationStatus}
                    onChange={(e) => updateSite(i, { installationStatus: e.target.value })}
                    className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none"
                  >
                    {INSTALLATION_STATUS_OPTIONS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Store Permission Slot
                  <input
                    type="text"
                    value={site.storePermissionSlots}
                    onChange={(e) => updateSite(i, { storePermissionSlots: e.target.value })}
                    className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
                    placeholder="e.g. Before store hours, 7–9 AM"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary sm:col-span-4">
                  Installed Artwork Details
                  <input
                    type="text"
                    value={site.installedArtwork}
                    onChange={(e) => updateSite(i, { installedArtwork: e.target.value })}
                    className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
              </div>

              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Quality inspection</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Installation Successful
                  <select
                    value={site.wasSuccessful}
                    onChange={(e) => updateSite(i, { wasSuccessful: e.target.value })}
                    className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none"
                  >
                    <option>Yes</option>
                    <option>No</option>
                    <option>Partially</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Scaffolding Required
                  <select
                    value={site.scaffoldingRequired}
                    onChange={(e) => updateSite(i, { scaffoldingRequired: e.target.value })}
                    className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none"
                  >
                    <option>No</option>
                    <option>Yes</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Overall Status
                  <select
                    value={site.overallStatus}
                    onChange={(e) => updateSite(i, { overallStatus: e.target.value })}
                    className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none"
                  >
                    {OVERALL_STATUS_OPTIONS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Site Condition
                  <select
                    value={site.siteCondition}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Clearing the remarks when switching back to Good keeps
                      // a stale "needs replacement" note from silently
                      // lingering on a site that's since been marked fine.
                      updateSite(i, { siteCondition: value, inspectorRemarks: value === "Good" ? "" : site.inspectorRemarks });
                    }}
                    className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none"
                  >
                    {SITE_CONDITION_OPTIONS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary sm:col-span-2">
                  Fixture Condition
                  <input
                    type="text"
                    value={site.fixtureCondition}
                    onChange={(e) => updateSite(i, { fixtureCondition: e.target.value })}
                    className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>

                {site.siteCondition === "Poor" && (
                  <>
                    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                      Condition Remarks
                      <select
                        value={POOR_CONDITION_REASONS.includes(site.inspectorRemarks) ? site.inspectorRemarks : OTHERS_REASON}
                        onChange={(e) =>
                          updateSite(i, { inspectorRemarks: e.target.value === OTHERS_REASON ? "" : e.target.value })
                        }
                        className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none"
                      >
                        {POOR_CONDITION_REASONS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                        <option>{OTHERS_REASON}</option>
                      </select>
                    </label>
                    {!POOR_CONDITION_REASONS.includes(site.inspectorRemarks) && (
                      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary sm:col-span-3">
                        Remarks <span className="font-normal text-ink-muted">— describe the issue</span>
                        <input
                          type="text"
                          value={site.inspectorRemarks}
                          onChange={(e) => updateSite(i, { inspectorRemarks: e.target.value })}
                          className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
                          placeholder="e.g. Bracket bent during shipping, needs a replacement part"
                        />
                      </label>
                    )}
                  </>
                )}
              </div>

              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Photos</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ImageSlot label="Main Slide" value={site.mainSlide} onChange={(f) => updateSite(i, { mainSlide: f })} aspect="wide" size="large" />
                <ImageSlot label="Close-up View" value={site.closeUp} onChange={(f) => updateSite(i, { closeUp: f })} aspect="wide" size="large" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ImageSlot label="Top Left Corner" value={site.cornerTL} onChange={(f) => updateSite(i, { cornerTL: f })} />
                <ImageSlot label="Top Right Corner" value={site.cornerTR} onChange={(f) => updateSite(i, { cornerTR: f })} />
                <ImageSlot label="Bottom Left Corner" value={site.cornerBL} onChange={(f) => updateSite(i, { cornerBL: f })} />
                <ImageSlot label="Bottom Right Corner" value={site.cornerBR} onChange={(f) => updateSite(i, { cornerBR: f })} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
