"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileClock, RefreshCw, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { timeAgo } from "@/lib/timeAgo";
import { lfgStatusLabel } from "@/lib/lfgStatus";
import { LfgConnectHeader } from "@/components/workspaces/LfgConnectHeader";

// Activity Log -- its own page (task: "the log takes away the beauty of
// the page, place it somewhere it belongs to"), split out of the LFG
// Connect home page where it used to render as a big colored card
// (LfgActivityFeed.tsx, now removed) crowding the Programs summary tiles.
// Linked from the home page's header button row instead ("Activity Log",
// next to Status Sheet).
//
// Visual language deliberately modeled on the attached reference (a
// file-manager "Details" panel: tiny uppercase gray labels, plain dark
// values directly under them, thin hairline dividers between sections, no
// bright fills or badges) rather than the card/pill style the rest of
// this app otherwise uses -- a log reads better as a dense, quiet list
// than as another set of colorful tiles.
//
// "the log can not be like just updated... i want in depth detail" --
// diffFields() below computes the ACTUAL changed field(s) between
// old_value/new_value for every update (Status: Survey Pending → Survey
// Completed, Size: 1200×800 → 1400×900 mm, ...) generically, for every
// entity_type lfg_audit_log logs, rather than a small per-table list of
// hand-written summaries -- so nothing falls through to a vague "updated
// site details" sentence the way the old home-page widget's fallback did.
interface AuditRow {
  id: string;
  user_email: string | null;
  action: "insert" | "update" | "delete";
  entity_type: string;
  entity_id: string;
  site_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
  lfg_sites: { outlet_name: string } | { outlet_name: string }[] | null;
}

const LIMIT = 60;

// Bookkeeping/FK columns that show up in nearly every row's old/new_value
// but mean nothing to a person reading the log -- timestamps already
// covered by the entry's own "when", and foreign keys we have no joined
// label for (a raw partner_id/program_id UUID isn't useful to display).
const IGNORE_DIFF_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "site_id",
  "partner_id",
  "program_id",
  "store_id",
  "uploaded_by",
  "submitted_by",
  "approved_by",
  "resolved_by",
  "raised_by",
  "requested_by",
  "changed_by",
  "uploaded_at",
  "submitted_at",
  "approved_at",
  "resolved_at",
  "request_date",
  "approval_date",
  "relative_path",
  "version",
]);

const KEY_LABEL: Record<string, string> = {
  site_status: "Status",
  sfo_id: "SFO ID",
  asm_name: "ASM",
  mat_code: "Material Code",
  installation_status: "Installation Status",
  current_status: "Shipment Status",
  approval_status: "Approval Status",
  awb_number: "AWB",
  file_name: "File",
  outlet_name: "Outlet Name",
  store_address: "Address",
  number_of_sites: "Site Count",
};

const INSTALL_STATUS_LABEL: Record<string, string> = {
  pending: "Not Started",
  planned: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  issue: "Issue",
};

const DOC_CATEGORY_LABEL: Record<string, string> = {
  survey: "Site Survey",
  installation: "Installation Report",
  reference: "Reference Picture",
  other: "Document",
};

function labelForKey(key: string): string {
  if (KEY_LABEL[key]) return KEY_LABEL[key];
  return key
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function labelForValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "site_status") return lfgStatusLabel(String(value));
  if (key === "installation_status") return INSTALL_STATUS_LABEL[String(value)] ?? String(value);
  if (key === "category") return DOC_CATEGORY_LABEL[String(value)] ?? String(value);
  if (typeof value === "string" && value.includes("_")) {
    return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return String(value);
}

interface FieldDiff {
  label: string;
  from: string;
  to: string;
}

function diffFields(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null): FieldDiff[] {
  if (!oldV || !newV) return [];
  const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)]);
  const out: FieldDiff[] = [];
  for (const k of keys) {
    if (IGNORE_DIFF_KEYS.has(k)) continue;
    if (oldV[k] === newV[k]) continue;
    out.push({ label: labelForKey(k), from: labelForValue(k, oldV[k]), to: labelForValue(k, newV[k]) });
  }
  return out;
}

// For an INSERT (nothing to diff against), pull out whichever fields on
// the new row actually identify what was created -- a document's category
// + file name, a partner's name, and so on. Falls back to nothing shown
// (the entity-type label above the entry already says what kind of record
// this is) rather than dumping the whole row.
const IDENTIFYING_KEYS: Record<string, string[]> = {
  lfg_sites: ["outlet_name", "format", "sfo_id"],
  lfg_site_documents: ["category", "file_name"],
  lfg_partners: ["name", "contact_name"],
  lfg_shipments: ["awb_number", "courier"],
  lfg_issues: ["issue_type", "description"],
  lfg_deactivation_requests: ["reason"],
};

function insertSummary(entityType: string, newV: Record<string, unknown> | null): FieldDiff[] {
  if (!newV) return [];
  const keys = IDENTIFYING_KEYS[entityType] ?? [];
  const out: FieldDiff[] = [];
  for (const k of keys) {
    const v = newV[k];
    if (v === null || v === undefined || v === "") continue;
    out.push({ label: labelForKey(k), from: "", to: labelForValue(k, v) });
  }
  return out;
}

function siteLabel(row: AuditRow): string | null {
  const rel = Array.isArray(row.lfg_sites) ? row.lfg_sites[0] : row.lfg_sites;
  if (rel?.outlet_name) return rel.outlet_name;
  const v = (row.new_value?.outlet_name ?? row.old_value?.outlet_name) as string | undefined;
  return v ?? null;
}

function displayName(email: string | null): string {
  if (!email) return "Someone";
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

function entityLabel(entityType: string): string {
  return entityType
    .replace(/^lfg_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const ENTITY_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "lfg_sites", label: "Site Details" },
  { value: "lfg_site_documents", label: "Documents" },
  { value: "lfg_site_surveys", label: "Surveys" },
  { value: "lfg_installations", label: "Installations" },
  { value: "lfg_shipments", label: "Shipments" },
  { value: "lfg_production", label: "Production" },
  { value: "lfg_issues", label: "Issues" },
  { value: "lfg_partners", label: "Partners" },
];

export default function LfgActivityLogPage() {
  const router = useRouter();
  const role = useUserRole();
  const visible = canWrite(role);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  // Returns the fetch's own promise rather than setting a "loading" flag
  // synchronously before it, so the mount effect below can call this
  // directly without a synchronous setState in the effect body itself --
  // only the setRows() inside .then() runs (react-hooks/set-state-in-effect
  // doesn't flag that).
  const load = useCallback(() => {
    return supabase
      .from("lfg_audit_log")
      .select("id, user_email, action, entity_type, entity_id, site_id, old_value, new_value, created_at, lfg_sites(outlet_name)")
      .order("created_at", { ascending: false })
      .limit(LIMIT)
      .then(({ data }) => {
        setRows((data as unknown as AuditRow[] | null) ?? []);
      });
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
  }, [visible, load]);

  function handleRefresh() {
    setRefreshing(true);
    Promise.resolve(load()).finally(() => setRefreshing(false));
  }

  const filtered = useMemo(() => {
    if (!rows) return [];
    const trimmed = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (entityFilter && row.entity_type !== entityFilter) return false;
      if (!trimmed) return true;
      const site = siteLabel(row) ?? "";
      const who = row.user_email ?? "";
      return site.toLowerCase().includes(trimmed) || who.toLowerCase().includes(trimmed) || entityLabel(row.entity_type).toLowerCase().includes(trimmed);
    });
  }, [rows, query, entityFilter]);

  if (!visible) {
    return (
      <div>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Activity Log" }]} />
        <p className="py-10 text-center text-sm text-ink-muted">
          Activity Log is only visible to admin/editor accounts.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Activity Log" }]} />

      <LfgConnectHeader
        icon={FileClock}
        section="Activity Log"
        subtitle="Who did what, and exactly what changed — every insert, update, and upload logged across LFG Connect."
      />

      <div className="my-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by site or person…"
            className="h-9 w-full rounded-md border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {ENTITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-sunken disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {rows === null ? (
        <p className="py-10 text-center text-sm text-ink-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">No activity matches this filter.</p>
      ) : (
        <div className="rounded-xl border border-line bg-surface">
          {filtered.map((row) => {
            const site = siteLabel(row);
            const diffs = row.action === "insert" ? insertSummary(row.entity_type, row.new_value) : diffFields(row.old_value, row.new_value);
            return (
              <div key={row.id} className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  {/* Tiny uppercase gray label line, same weight/size as
                      the reference "Owner" / "Created" / "Location" labels
                      -- entity type + site, not a colored badge. */}
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                    {entityLabel(row.entity_type)}
                    {site ? ` · ${site}` : ""}
                    {row.action === "delete" ? " · Deleted" : ""}
                  </p>

                  {diffs.length > 0 ? (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {diffs.slice(0, 4).map((d) => (
                        <p key={d.label} className="text-[12px] leading-snug text-ink">
                          <span className="text-ink-muted">{d.label}: </span>
                          {d.from && (
                            <>
                              <span>{d.from}</span> <span className="text-ink-muted">→</span>{" "}
                            </>
                          )}
                          <span className="font-medium">{d.to}</span>
                        </p>
                      ))}
                      {diffs.length > 4 && <p className="text-[11px] text-ink-muted">+{diffs.length - 4} more field{diffs.length - 4 === 1 ? "" : "s"}</p>}
                    </div>
                  ) : (
                    <p className="mt-1 text-[12px] text-ink">
                      {row.action === "insert" ? "Created" : row.action === "delete" ? "Deleted" : "Updated"}
                    </p>
                  )}

                  <p className="mt-1.5 text-[10px] text-ink-muted">
                    {displayName(row.user_email)} · {timeAgo(row.created_at)}
                  </p>
                </div>
                {row.site_id && (
                  <button
                    type="button"
                    title="Open Site 360"
                    onClick={() => router.push(`/workspaces/lfg/sites/${row.site_id}`)}
                    className="shrink-0 rounded p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
                  >
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
