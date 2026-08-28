"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { MapPin, FileText, ExternalLink } from "lucide-react";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { lfgStatusLabel, lfgStatusBadge, lfgTrackingPercent } from "@/lib/lfgStatus";
import { formatSizeMm } from "@/lib/lfg-units";
import { installationReportHref, INSTALLATION_STATUSES } from "./LfgSiteWorkspaceClient";

// Site Cards (task #76) -- a photo-forward, one-card-per-site alternative
// to the Site Master table, for browsing/reviewing a format's sites
// visually rather than scanning a dense grid of columns. Reads the exact
// same, already-filtered `rows` the table view fetched (search/format/
// status/program/store all still apply, since both views share one fetch
// in page.tsx) -- this view only decides how many of those rows to
// actually RENDER as cards (see PAGE_SIZE below) and fetches the extra
// per-site data the table never needed: a signed reference-picture URL,
// the latest shipment's AWB, whether a survey PDF is on file (task #37's
// bulk-link, or a manual upload), and the lfg_installations row's own
// installation_status.
//
// Deliberately NOT wired into the table's bulk-select/Move-to-Program
// flow -- this is a lighter, read-only browse/review mode; bulk actions
// stay on the table view, where the header "select all shown" checkbox
// (task #69) already lives and already works against the full result
// set. Clicking a card (anywhere except its two link buttons) opens Site
// 360, same destination as clicking a table row.
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
// lfgStatusBadge) -- just applied to a few spots Badge itself doesn't
// cover: the translucent status pill over the photo, and the tracking
// bar's fill color.
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
const TRACK_FILL_CLASS: Record<BadgeStatus, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-ink-muted",
};

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
  const [surveyDocBySite, setSurveyDocBySite] = useState<Record<string, string>>({});
  const [installStatusBySite, setInstallStatusBySite] = useState<Record<string, string>>({});

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

    supabase
      .from("lfg_site_documents")
      .select("id, site_id, uploaded_at")
      .eq("category", "survey")
      .in("site_id", ids)
      .order("uploaded_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const row of (data as { id: string; site_id: string }[]) ?? []) {
          if (!map[row.site_id]) map[row.site_id] = row.id;
        }
        setSurveyDocBySite(map);
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((row) => (
          <SiteCard
            key={row.id}
            row={row}
            awb={awbBySite[row.id] ?? null}
            surveyDocId={surveyDocBySite[row.id] ?? null}
            installationStatus={installStatusBySite[row.id] ?? "pending"}
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
    </div>
  );
}

function SiteCard({
  row,
  awb,
  surveyDocId,
  installationStatus,
}: {
  row: LfgSiteCardRow;
  awb: string | null;
  surveyDocId: string | null;
  installationStatus: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [openingSurvey, setOpeningSurvey] = useState(false);

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

  async function openSurvey(e: MouseEvent) {
    e.stopPropagation();
    if (!surveyDocId) return;
    setOpeningSurvey(true);
    try {
      const res = await fetch(`/api/lfg/sites/${row.id}/documents/${surveyDocId}/signed-url`);
      const data = await res.json();
      if (!res.ok) {
        toast("danger", data.message || data.error || "Couldn't open the survey");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningSurvey(false);
    }
  }

  const statusBadge = lfgStatusBadge(row.site_status);
  const trackPercent = lfgTrackingPercent(row.site_status);
  const partner = partnerName(row);
  const address = [row.city && row.region ? `${row.city}, ${row.region}` : row.city, row.store_address].filter(Boolean).join(" -- ");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/workspaces/lfg/sites/${row.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(`/workspaces/lfg/sites/${row.id}`);
      }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[20px] border border-line bg-surface shadow-2 transition-shadow hover:shadow-3"
    >
      <div
        className="relative h-[180px] w-full shrink-0 overflow-hidden"
        style={!pictureUrl ? { background: "linear-gradient(135deg, var(--n-800), var(--n-600))" } : undefined}
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
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-20"
            aria-hidden
          >
            <rect x="8" y="10" width="48" height="28" rx="3" stroke="#fff" strokeWidth="2" />
            <line x1="32" y1="38" x2="32" y2="54" stroke="#fff" strokeWidth="2" />
            <line x1="20" y1="54" x2="44" y2="54" stroke="#fff" strokeWidth="2" />
            <line x1="14" y1="18" x2="50" y2="18" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
            <line x1="14" y1="26" x2="42" y2="26" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
          </svg>
        )}
        {row.format && (
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur">
            {row.format}
          </span>
        )}
        <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[statusBadge]}`} aria-hidden />
          <span className={`text-[11px] font-semibold ${STATUS_TEXT_CLASS[statusBadge]}`}>{lfgStatusLabel(row.site_status)}</span>
        </span>
      </div>

      <div className="flex flex-col p-5">
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
          {surveyDocId ? (
            <Button variant="secondary" size="sm" className="flex-1" loading={openingSurvey} onClick={openSurvey}>
              <FileText size={14} className="mr-1.5" />
              Site Survey
            </Button>
          ) : (
            <Button variant="secondary" size="sm" className="flex-1" disabled onClick={(e) => e.stopPropagation()}>
              Not Yet Saved
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              window.open(installationReportHref(row), "_blank", "noopener,noreferrer");
            }}
          >
            <ExternalLink size={14} className="mr-1.5" />
            Install Report
          </Button>
        </div>

        <div className="my-4 h-px bg-line" />

        <div className="flex items-center justify-between">
          <Badge status={statusBadge}>{lfgStatusLabel(row.site_status)}</Badge>
          <span className="text-xs tabular-nums text-ink-muted">{awb ? `AWB ${awb}` : "AWB —"}</span>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-ink-secondary">{lfgStatusLabel(row.site_status)}</span>
            <span className="text-[11px] font-semibold text-ink-secondary">{trackPercent}%</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-line">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${TRACK_FILL_CLASS[statusBadge]}`}
              style={{ width: `${trackPercent}%` }}
            />
          </div>
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
