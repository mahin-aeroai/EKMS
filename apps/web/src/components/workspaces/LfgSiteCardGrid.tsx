"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { MapPin, FileText, ExternalLink, X } from "lucide-react";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { lfgStatusLabel, lfgStatusBadge, LFG_FORMAT_PRIORITY } from "@/lib/lfgStatus";
import { formatSizeMm } from "@/lib/lfg-units";
import { INSTALLATION_STATUSES } from "./LfgSiteWorkspaceClient";

// Site Cards (task #76) -- a photo-forward, one-card-per-site alternative
// to the Site Master table, for browsing/reviewing a format's sites
// visually rather than scanning a dense grid of columns. Reads the exact
// same, already-filtered `rows` the table view fetched (search/format/
// status/program/store all still apply, since both views share one fetch
// in page.tsx) -- this view only decides how many of those rows to
// actually RENDER as cards (see PAGE_SIZE below) and fetches the extra
// per-site data the table never needed: a signed reference-picture URL,
// the latest shipment's AWB, the saved Site Survey / Installation Report
// documents on file (task #37's bulk-link, or a manual upload), and the
// lfg_installations row's own installation_status.
//
// Deliberately NOT wired into the table's bulk-select/Move-to-Program
// flow -- this is a lighter, read-only browse/review mode; bulk actions
// stay on the table view, where the header "select all shown" checkbox
// (task #69) already lives and already works against the full result
// set. Clicking a card (anywhere except its two document buttons) opens
// Site 360, same destination as clicking a table row.
export interface LfgSiteCardRow {
  id: string;
  site_id: string;
  outlet_name: string;
  format: string | null;
  sfo_id: string | null;
  city: string | null;
  region: string | null;
  store_address: string | null;
  material: string | null;
  width: number | null;
  height: number | null;
  site_status: string;
  site_reference_picture_path: string | null;
  asm_name: string | null;
  lfg_partners: { name: string } | { name: string }[] | null;
}

function partnerName(row: LfgSiteCardRow): string | null {
  const p = Array.isArray(row.lfg_partners) ? row.lfg_partners[0] : row.lfg_partners;
  return p?.name ?? null;
}

// Same BadgeStatus palette the rest of the app already uses (Badge.tsx,
// lfgStatusBadge) -- applied to the one status indicator a card shows
// (the pill over the photo, top right) so it stays in sync with the
// status Badge everywhere else in the app: in_transit/in_production =
// info (blue), delivered = success (green), survey_pending = warning
// (yellow), issue_attention_required = danger (red), etc. -- see
// LFG_STATUS_BADGE in lfgStatus.ts, the single source of truth.
const STATUS_DOT_CLASS: Record<BadgeStatus, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-ink-muted",
};
const STATUS_TEXT_CLASS: Record<BadgeStatus, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-ink-secondary",
};

// Solid, single-tone color per store FORMAT (lfg_sites.format is free
// text carried through from two legacy imports -- see LFG_FORMAT_PRIORITY's
// own comment in lfgStatus.ts, not a controlled vocabulary) -- painted
// behind the reference-picture placeholder when a site has no photo on
// file yet. Flat colors only, never a gradient. The palette itself is the
// second approved brand board's own 12 swatches (icy blue-grey through
// slate to near-black navy/charcoal) -- the first board's palette read as
// too washed-out/samey once on real cards (several were near-white), so
// this one trades that for a genuinely distinct light-to-dark spread.
// Known formats (APR, Mono AAR, Croma, ...) get a fixed color from this
// list in LFG_FORMAT_PRIORITY's own order (8 formats, so each gets its
// own swatch with 4 left over); anything else still gets a real color
// (deterministic per format string, via a simple hash) rather than
// falling back to grey.
const FORMAT_COLOR_PALETTE = [
  "#E4EAEC", // QN.02.82
  "#8A9BA8", // S2.07.58
  "#D9D3C7", // E0.03.72
  "#C9D6D7", // Q5.04.72
  "#5E6D76", // T5.06.44
  "#C6CAD0", // CN.00.70
  "#A7BFB8", // N1.06.61
  "#1B2C60", // T9.26.21
  "#726F76", // YN.02.45
  "#46697E", // S2.13.39
  "#1E252B", // T3.04.12
  "#2A211D", // C9.06.21
];

function formatPlaceholderColor(format: string | null): string {
  if (!format) return "#A7BFB8"; // no format on file -- the palette's own neutral tone
  const f = format.trim().toLowerCase();
  const idx = LFG_FORMAT_PRIORITY.findIndex((keyword) => f.includes(keyword) || keyword.includes(f));
  if (idx !== -1) return FORMAT_COLOR_PALETTE[idx % FORMAT_COLOR_PALETTE.length];
  let hash = 0;
  for (let i = 0; i < format.length; i++) hash = (hash * 31 + format.charCodeAt(i)) >>> 0;
  return FORMAT_COLOR_PALETTE[hash % FORMAT_COLOR_PALETTE.length];
}

// The palette above runs from near-white (QN.02.82) to near-black
// (C9.06.21) -- the placeholder's centered signboard icon is drawn in a
// fixed stroke color, so it needs to flip from dark to white depending on
// how light the chosen swatch is, or it disappears on the paler ones.
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}

// lfg_installations.installation_status vocabulary (INSTALLATION_STATUSES,
// imported from LfgSiteWorkspaceClient.tsx so this can't drift from the
// Installation tab's own form) -- a site with no lfg_installations row yet
// reads as "pending" here, same default the form itself uses.
const INSTALLATION_STATUS_LABEL: Record<(typeof INSTALLATION_STATUSES)[number], string> = {
  pending: "Not Started",
  planned: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  issue: "Issue",
};
const INSTALLATION_STATUS_BADGE: Record<(typeof INSTALLATION_STATUSES)[number], BadgeStatus> = {
  pending: "neutral",
  planned: "info",
  in_progress: "info",
  completed: "success",
  issue: "danger",
};

function installationStatusLabel(status: string): string {
  return INSTALLATION_STATUS_LABEL[status as (typeof INSTALLATION_STATUSES)[number]] ?? "Not Started";
}
function installationStatusBadge(status: string): BadgeStatus {
  return INSTALLATION_STATUS_BADGE[status as (typeof INSTALLATION_STATUSES)[number]] ?? "neutral";
}

// A saved lfg_site_documents row's minimal shape needed to open it -- see
// openDocument() below, mirroring LfgSiteWorkspaceClient's Documents tab
// handleView(): file_type (or, failing that, the file name's extension)
// decides whether it opens in the in-screen preview (PDF/image) or falls
// back to a new tab (anything else the browser can't render inline).
interface DocRef {
  id: string;
  file_name: string;
  file_type: string | null;
}

interface PreviewState {
  name: string;
  url: string;
  kind: "pdf" | "image";
}

// How many cards render at once, and how many more a "Show more" click
// reveals -- `rows` itself is the FULL filtered result (the table view
// has no cap, per this file's sibling page.tsx), but a card carries a
// photo and three extra per-site lookups the table never pays for, so
// rendering all of them at once (potentially hundreds) would mean
// hundreds of image + signed-url requests on every filter change. Cards
// stay a deliberately paged, visual review surface; the table remains the
// way to see/act on the entire filtered set at once.
const PAGE_SIZE = 12;

export function LfgSiteCardGrid({ rows }: { rows: LfgSiteCardRow[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = rows.slice(0, visibleCount);
  const idsKey = visible.map((r) => r.id).join(",");

  const [awbBySite, setAwbBySite] = useState<Record<string, string>>({});
  const [surveyDocBySite, setSurveyDocBySite] = useState<Record<string, DocRef>>({});
  const [installReportDocBySite, setInstallReportDocBySite] = useState<Record<string, DocRef>>({});
  const [installStatusBySite, setInstallStatusBySite] = useState<Record<string, string>>({});

  // In-screen document preview -- same overlay pattern as the Site 360
  // Documents tab (LfgSiteWorkspaceClient.tsx's `preview` state): Site
  // Survey and Installation Report open right here instead of a new tab.
  // Lifted to the grid rather than kept per-card since only one card's
  // document can realistically be open at a time -- one shared overlay is
  // simpler than mounting one in every card.
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPreview(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview]);

  // Resets the page whenever the underlying filtered row set changes (a
  // new search/format/status) -- otherwise a leftover high visibleCount
  // from a previous, larger result set would render every row of a
  // smaller one instead of respecting the paged default.
  useEffect(() => {
    // Resetting pagination is a deliberate reaction to the filtered set
    // changing, not state derived purely from props/state that could be
    // computed inline (visibleCount is deliberately allowed to grow past
    // PAGE_SIZE via "Show more" until the next filter change resets it).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleCount(PAGE_SIZE);
  }, [rows]);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;

    supabase
      .from("lfg_shipments")
      .select("site_id, awb_number, created_at")
      .in("site_id", ids)
      .not("awb_number", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const row of (data as { site_id: string; awb_number: string | null }[]) ?? []) {
          if (row.awb_number && !map[row.site_id]) map[row.site_id] = row.awb_number;
        }
        setAwbBySite(map);
      });

    // One query for both document categories -- survey and installation
    // report -- split into their two per-site maps below, so this stays a
    // single round trip instead of two near-identical ones.
    supabase
      .from("lfg_site_documents")
      .select("id, site_id, category, file_name, file_type, uploaded_at")
      .in("category", ["survey", "installation"])
      .in("site_id", ids)
      .order("uploaded_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const surveyMap: Record<string, DocRef> = {};
        const installMap: Record<string, DocRef> = {};
        for (const row of (data as
          | { id: string; site_id: string; category: string; file_name: string; file_type: string | null }[]
          | null) ?? []) {
          const target = row.category === "survey" ? surveyMap : row.category === "installation" ? installMap : null;
          if (target && !target[row.site_id]) {
            target[row.site_id] = { id: row.id, file_name: row.file_name, file_type: row.file_type };
          }
        }
        setSurveyDocBySite(surveyMap);
        setInstallReportDocBySite(installMap);
      });

    supabase
      .from("lfg_installations")
      .select("site_id, installation_status")
      .in("site_id", ids)
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const row of (data as { site_id: string; installation_status: string }[]) ?? []) {
          map[row.site_id] = row.installation_status;
        }
        setInstallStatusBySite(map);
      });

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">No sites match your search.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((row) => (
          <SiteCard
            key={row.id}
            row={row}
            awb={awbBySite[row.id] ?? null}
            surveyDoc={surveyDocBySite[row.id] ?? null}
            installReportDoc={installReportDocBySite[row.id] ?? null}
            installationStatus={installStatusBySite[row.id] ?? "pending"}
            onPreview={setPreview}
          />
        ))}
      </div>
      {visibleCount < rows.length && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, rows.length - visibleCount)} more ({rows.length - visibleCount} left)
          </Button>
        </div>
      )}
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
                <Button size="sm" variant="ghost" onClick={() => window.open(preview.url, "_blank", "noopener,noreferrer")}>
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

function SiteCard({
  row,
  awb,
  surveyDoc,
  installReportDoc,
  installationStatus,
  onPreview,
}: {
  row: LfgSiteCardRow;
  awb: string | null;
  surveyDoc: DocRef | null;
  installReportDoc: DocRef | null;
  installationStatus: string;
  onPreview: (p: PreviewState) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  // Only fetched when the site actually has a picture on file -- the
  // route 404s otherwise (see its own header comment), so skipping the
  // request entirely for the common "no picture yet" case avoids a wasted
  // round trip per card.
  useEffect(() => {
    if (!row.site_reference_picture_path) return;
    let cancelled = false;
    fetch(`/api/lfg/sites/${row.id}/reference-picture/signed-url`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.url) setPictureUrl(data.url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [row.id, row.site_reference_picture_path]);

  // Shared by both the Site Survey and Installation Report buttons -- both
  // are "view the document already on file", never "create a new one" (a
  // saved installation report is uploaded via the Documents tab like a
  // survey is), so both open the same signed-URL + in-screen-preview path.
  async function openDocument(e: MouseEvent, doc: DocRef) {
    e.stopPropagation();
    setOpeningDocId(doc.id);
    try {
      const res = await fetch(`/api/lfg/sites/${row.id}/documents/${doc.id}/signed-url`);
      const data = await res.json();
      if (!res.ok) {
        toast("danger", data.message || data.error || "Couldn't open this document");
        return;
      }
      const isPdf = doc.file_type === "application/pdf" || /\.pdf$/i.test(doc.file_name);
      const isImage = (doc.file_type?.startsWith("image/") ?? false) || /\.(png|jpe?g|gif|webp)$/i.test(doc.file_name);
      if (isPdf || isImage) {
        onPreview({ name: doc.file_name, url: data.url, kind: isPdf ? "pdf" : "image" });
      } else {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setOpeningDocId(null);
    }
  }

  const statusBadge = lfgStatusBadge(row.site_status);
  const partner = partnerName(row);
  const address = [row.city && row.region ? `${row.city}, ${row.region}` : row.city, row.store_address].filter(Boolean).join(" -- ");
  const placeholderColor = formatPlaceholderColor(row.format);
  const iconStroke = isLightColor(placeholderColor) ? "#1E252B" : "#fff";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/workspaces/lfg/sites/${row.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(`/workspaces/lfg/sites/${row.id}`);
      }}
      className="flex cursor-pointer flex-col rounded-[20px] border border-line bg-surface p-3 shadow-2 transition-shadow hover:shadow-3"
    >
      {/* The photo/placeholder sits inset within the card's own white
          padding, with its own fully rounded corners on every side --
          reads as a framed photo rather than a color block bleeding to
          the card's edges. Flat colors only throughout; no gradients. */}
      <div
        className="relative h-[180px] w-full shrink-0 overflow-hidden rounded-2xl"
        style={!pictureUrl ? { background: placeholderColor } : undefined}
      >
        {pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed R2 URL
          <img src={pictureUrl} alt={row.outlet_name} className="h-full w-full object-cover" />
        ) : (
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-25"
            aria-hidden
          >
            <rect x="8" y="10" width="48" height="28" rx="3" stroke={iconStroke} strokeWidth="2" />
            <line x1="32" y1="38" x2="32" y2="54" stroke={iconStroke} strokeWidth="2" />
            <line x1="20" y1="54" x2="44" y2="54" stroke={iconStroke} strokeWidth="2" />
            <line x1="14" y1="18" x2="50" y2="18" stroke={iconStroke} strokeWidth="1.5" opacity="0.6" />
            <line x1="14" y1="26" x2="42" y2="26" stroke={iconStroke} strokeWidth="1.5" opacity="0.6" />
          </svg>
        )}
        {row.format && (
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur">
            {row.format}
          </span>
        )}
        {/* The site's one status indicator on the card -- deliberately shown
            only here (top right), not repeated lower in the card (Badge
            usage rule: one status badge per record card). */}
        <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[statusBadge]}`} aria-hidden />
          <span className={`text-[11px] font-semibold ${STATUS_TEXT_CLASS[statusBadge]}`}>{lfgStatusLabel(row.site_status)}</span>
        </span>
      </div>

      <div className="flex flex-col px-2 pb-1 pt-4">
        <h3 className="truncate text-[17px] font-bold text-ink">{row.outlet_name}</h3>
        <div className="mt-1.5 flex items-center gap-1.5 overflow-hidden text-[13px] text-ink-secondary">
          <MapPin size={13} className="shrink-0" />
          <span className="truncate">{address || "—"}</span>
        </div>

        <div className="my-4 h-px bg-line" />

        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Field label="SFO ID" value={row.sfo_id} />
          <Field label="Material" value={row.material} />
          <Field label="Size (mm)" value={formatSizeMm(row.width, row.height) === "—" ? null : formatSizeMm(row.width, row.height)} />
          <Field label="Installation by" value={partner} muted={!partner} fallback="Unassigned" />
        </div>

        <div className="my-4 h-px bg-line" />

        <div className="flex gap-2">
          {surveyDoc ? (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              loading={openingDocId === surveyDoc.id}
              onClick={(e) => openDocument(e, surveyDoc)}
            >
              <FileText size={14} className="mr-1.5" />
              Site Survey
            </Button>
          ) : (
            <Button variant="secondary" size="sm" className="flex-1" disabled onClick={(e) => e.stopPropagation()}>
              Survey Not Saved
            </Button>
          )}
          {installReportDoc ? (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              loading={openingDocId === installReportDoc.id}
              onClick={(e) => openDocument(e, installReportDoc)}
            >
              <FileText size={14} className="mr-1.5" />
              Install Report
            </Button>
          ) : (
            <Button variant="secondary" size="sm" className="flex-1" disabled onClick={(e) => e.stopPropagation()}>
              Report Not Saved
            </Button>
          )}
        </div>

        <div className="my-4 h-px bg-line" />

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">AWB</span>
          <span className="text-xs tabular-nums text-ink-muted">{awb ?? "—"}</span>
        </div>

        <div className="mt-3.5 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">Installation</span>
          <Badge status={installationStatusBadge(installationStatus)}>{installationStatusLabel(installationStatus)}</Badge>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, muted, fallback = "—" }: { label: string; value: string | null; muted?: boolean; fallback?: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`truncate text-[13px] font-medium ${muted ? "text-ink-muted" : "text-ink"}`}>{value ?? fallback}</div>
    </div>
  );
}
