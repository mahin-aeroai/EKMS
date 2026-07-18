"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, Download, FilePlus2, Plus, Search, Trash2 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type ApplelfgSiteSurveyRow } from "@/lib/supabase";
import { ImageSlot } from "@/components/installationReport/ImageSlot";
import {
  buildInstallationReportPdf,
  downloadBlob,
  type ReportData,
  type SiteEntry,
  type StorePictures,
} from "@/lib/installationReport/pdfBuild";

function emptySite(): SiteEntry {
  return {
    label: "",
    fixtureType: "",
    size: "",
    material: "",
    dateOfInstallation: "",
    installedBy: "",
    wasSuccessful: "Yes",
    siteCondition: "",
    scaffoldingRequired: "No",
    storePermissionSlots: "",
    installedArtwork: "",
    mainSlide: null,
    closeUp: null,
    cornerTL: null,
    cornerTR: null,
    cornerBL: null,
    cornerBR: null,
  };
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
 * Installation Report tool — same spirit as the Cut File Tool
 * (src/components/cutfile/CutFileToolClient.tsx): a page inside MMDI ONE
 * that does its real work entirely in the browser. Photos are picked
 * straight from the operator's local drive and never uploaded anywhere;
 * the only network call is the optional Site Surveys lookup below, used to
 * pull Store Name / SFO ID from an existing survey record instead of
 * retyping them. The final multi-page PDF (matching the Apple Site
 * Installation Report format) is assembled client-side by
 * src/lib/installationReport/pdfBuild.ts and downloaded directly.
 */
export default function InstallationReportClient() {
  const { toast } = useToast();

  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState("");
  const [sfoId, setSfoId] = useState("");
  const [program, setProgram] = useState("APR");
  const [programDetails, setProgramDetails] = useState("");
  const [storePictures, setStorePictures] = useState<StorePictures>(emptyStorePictures());
  const [sites, setSites] = useState<SiteEntry[]>([emptySite()]);
  const [exporting, setExporting] = useState(false);

  // Site Surveys lookup — searchable picker over apple_lfg_site_surveys,
  // same query shape as src/app/workspaces/site-surveys/page.tsx.
  const [surveyQuery, setSurveyQuery] = useState("");
  const [surveyResults, setSurveyResults] = useState<ApplelfgSiteSurveyRow[] | null>(null);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const surveyBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (surveyBoxRef.current && !surveyBoxRef.current.contains(e.target as Node)) setSurveyOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!surveyOpen) return;
    const handle = setTimeout(() => {
      const term = surveyQuery.trim();
      let q = supabase
        .from("apple_lfg_site_surveys")
        .select("*")
        .order("store_name", { ascending: true })
        .limit(25);
      if (term) {
        q = q.or(`store_name.ilike.%${term}%,apple_store_id.ilike.%${term}%,chain.ilike.%${term}%`);
      }
      q.then(({ data, error }) => {
        if (!error) setSurveyResults((data as ApplelfgSiteSurveyRow[]) ?? []);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [surveyQuery, surveyOpen]);

  function applySurvey(row: ApplelfgSiteSurveyRow) {
    setStoreName(row.store_name ?? row.file_name);
    if (row.apple_store_id) setSfoId(row.apple_store_id);
    setSurveyOpen(false);
    setSurveyQuery("");
    toast("success", "Store name and SFO ID filled from the site survey — adjust anything below as needed");
  }

  function updateSite(index: number, patch: Partial<SiteEntry>) {
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSite() {
    setSites((prev) => [...prev, emptySite()]);
  }

  function removeSite(index: number) {
    setSites((prev) => prev.filter((_, i) => i !== index));
  }

  function startNewReport() {
    setStoreName("");
    setAddress("");
    setSfoId("");
    setProgram("APR");
    setProgramDetails("");
    setStorePictures(emptyStorePictures());
    setSites([emptySite()]);
    toast("success", "Cleared — ready for the next report");
  }

  async function handleExport() {
    if (!storeName.trim()) {
      toast("warning", "Add a store name before exporting");
      return;
    }
    setExporting(true);
    try {
      const data: ReportData = { storeName, address, sfoId, program, programDetails, storePictures, sites };
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
              Fill in install details, attach photos from your local drive, and export an Apple Site Installation
              Report PDF — photos never leave this device.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Store details</h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div ref={surveyBoxRef} className="relative flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-ink-secondary">
                Store name
                <span className="ml-1 font-normal text-ink-muted">— type, or search your Site Surveys to fill it in</span>
              </label>
              <div className="flex items-center gap-2 rounded-md border border-line-strong bg-surface px-2">
                <Search size={14} className="text-ink-muted" />
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => {
                    setStoreName(e.target.value);
                    setSurveyQuery(e.target.value);
                    setSurveyOpen(true);
                  }}
                  onFocus={() => setSurveyOpen(true)}
                  placeholder="e.g. Aptronix - Malabar Vijayawada"
                  className="h-9 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
                />
              </div>
              {surveyOpen && surveyResults && surveyResults.length > 0 && (
                <div className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface-overlay p-1 shadow-3">
                  {surveyResults.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => applySurvey(row)}
                      className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-sunken"
                    >
                      <span className="text-ink">{row.store_name ?? row.file_name}</span>
                      <span className="text-xs text-ink-muted">
                        {row.chain} {row.apple_store_id ? `· Apple ID ${row.apple_store_id}` : ""}
                      </span>
                    </button>
                  ))}
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
              Apple Program
              <input
                type="text"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="e.g. APR"
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

            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary sm:col-span-2">
              Program details
              <textarea
                value={programDetails}
                onChange={(e) => setProgramDetails(e.target.value)}
                rows={2}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="e.g. Spring Refresh – MacBook & iPhone 17e"
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Store overview photos</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ImageSlot label="Store Full Cover" file={storePictures.storeFullCover} onChange={(f) => setStorePictures((p) => ({ ...p, storeFullCover: f }))} />
            <ImageSlot label="Installation Close-up" file={storePictures.installationCloseUp} onChange={(f) => setStorePictures((p) => ({ ...p, installationCloseUp: f }))} />
            <ImageSlot label="Street View 1" file={storePictures.streetView1} onChange={(f) => setStorePictures((p) => ({ ...p, streetView1: f }))} />
            <ImageSlot label="Street View 2" file={storePictures.streetView2} onChange={(f) => setStorePictures((p) => ({ ...p, streetView2: f }))} />
            <ImageSlot label="Corner Pic 1" file={storePictures.cornerPic1} onChange={(f) => setStorePictures((p) => ({ ...p, cornerPic1: f }))} />
            <ImageSlot label="Corner Pic 2" file={storePictures.cornerPic2} onChange={(f) => setStorePictures((p) => ({ ...p, cornerPic2: f }))} />
            <ImageSlot label="Corner Pic 3" file={storePictures.cornerPic3} onChange={(f) => setStorePictures((p) => ({ ...p, cornerPic3: f }))} />
            <ImageSlot label="Corner Pic 4" file={storePictures.cornerPic4} onChange={(f) => setStorePictures((p) => ({ ...p, cornerPic4: f }))} />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Installation sites</h3>
            <Button variant="secondary" size="sm" onClick={addSite}>
              <Plus size={13} className="mr-1.5" /> Add site
            </Button>
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Site label <span className="font-normal text-ink-muted">(optional)</span>
                  <input
                    type="text"
                    value={site.label}
                    onChange={(e) => updateSite(i, { label: e.target.value })}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                    placeholder="e.g. Entrance banner"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Fixture Type
                  <input
                    type="text"
                    value={site.fixtureType}
                    onChange={(e) => updateSite(i, { fixtureType: e.target.value })}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Size
                  <input
                    type="text"
                    value={site.size}
                    onChange={(e) => updateSite(i, { size: e.target.value })}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Material
                  <input
                    type="text"
                    value={site.material}
                    onChange={(e) => updateSite(i, { material: e.target.value })}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Date of Installation
                  <input
                    type="date"
                    value={site.dateOfInstallation}
                    onChange={(e) => updateSite(i, { dateOfInstallation: e.target.value })}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Installation Carried by
                  <input
                    type="text"
                    value={site.installedBy}
                    onChange={(e) => updateSite(i, { installedBy: e.target.value })}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                  Was the Installation Successful?
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
                  Scaffolding Required?
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
                  Store Permission Slots
                  <input
                    type="text"
                    value={site.storePermissionSlots}
                    onChange={(e) => updateSite(i, { storePermissionSlots: e.target.value })}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                    placeholder="e.g. Before store hours, 7–9 AM"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary sm:col-span-3">
                  Site / Fixture Condition
                  <input
                    type="text"
                    value={site.siteCondition}
                    onChange={(e) => updateSite(i, { siteCondition: e.target.value })}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary sm:col-span-3">
                  Installed Artwork Details
                  <input
                    type="text"
                    value={site.installedArtwork}
                    onChange={(e) => updateSite(i, { installedArtwork: e.target.value })}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <ImageSlot label="Main Slide" file={site.mainSlide} onChange={(f) => updateSite(i, { mainSlide: f })} aspect="wide" />
                <ImageSlot label="Close-up View" file={site.closeUp} onChange={(f) => updateSite(i, { closeUp: f })} aspect="wide" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ImageSlot label="Top Left Corner" file={site.cornerTL} onChange={(f) => updateSite(i, { cornerTL: f })} />
                <ImageSlot label="Top Right Corner" file={site.cornerTR} onChange={(f) => updateSite(i, { cornerTR: f })} />
                <ImageSlot label="Bottom Left Corner" file={site.cornerBL} onChange={(f) => updateSite(i, { cornerBL: f })} />
                <ImageSlot label="Bottom Right Corner" file={site.cornerBR} onChange={(f) => updateSite(i, { cornerBR: f })} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
