"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { timeAgo } from "@/lib/timeAgo";
import { lfgStatusLabel } from "@/lib/lfgStatus";

// LFG Connect home page "Activity" feed -- "which user is doing what: he
// adjusted the size for so-and-so store, or uploaded a site survey, or
// updated installation status, uploaded an installation report, etc."
// Reads lfg_audit_log, the generic trigger-driven table already logging
// every insert/update/delete on the tables listed in that table's own
// audited_tables array (supabase-lfg-site-management-schema.sql STEP 17) --
// this component adds no new writes of its own, it's purely a friendlier
// read/rendering of rows the DB was already producing (plus
// supabase-lfg-audit-log-expand-migration.sql, which widens that array to
// also cover lfg_site_documents/lfg_site_surveys -- uploads -- and a few
// other site-scoped tables that weren't being logged at all before).
//
// RLS on lfg_audit_log (lfg_audit_log_select_admin) only grants SELECT to
// admin/editor -- a viewer or partner querying it gets an empty result,
// not an error, which would render as a confusing "no activity yet" for a
// role that can never see any. So this whole component renders nothing for
// a role canWrite() says can't write (same admin/editor gate the RLS
// itself uses) rather than showing an empty/misleading panel.
//
// describe() below turns one raw audit row (entity_type + action +
// old_value/new_value jsonb) into the one-line, human sentence this task
// asked for -- it does NOT attempt to reconstruct every changed field,
// just the one or two a person actually cares about at a glance (status,
// size, which document got uploaded, ...); Site 360's own per-site history
// stays the place for the full before/after detail.
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

const LIMIT = 30;

function str(v: Record<string, unknown> | null | undefined, key: string): string | null {
  const val = v?.[key];
  if (val === null || val === undefined) return null;
  return typeof val === "string" ? val : String(val);
}

function siteLabel(row: AuditRow): string | null {
  const rel = Array.isArray(row.lfg_sites) ? row.lfg_sites[0] : row.lfg_sites;
  return rel?.outlet_name ?? str(row.new_value, "outlet_name") ?? str(row.old_value, "outlet_name");
}

// Local-part-of-email as a short display name -- profiles has no full_name
// column (supabase-role-based-rls-migration.sql: just id/email/role), and
// lfg_audit_log only ever captures user_email, not a name.
function displayName(email: string | null): string {
  if (!email) return "Someone";
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

const SITE_FIELD_LABEL: Record<string, string> = {
  outlet_name: "outlet name",
  format: "format",
  city: "city",
  region: "region",
  material: "material",
  mat_code: "material code",
  store_address: "address",
  asm_name: "ASM",
  partner_id: "installation partner",
  program_id: "program",
  number_of_sites: "site count",
  sfo_id: "SFO ID",
  bleed: "bleed",
};

function siteUpdateSummary(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null): string {
  if (!oldV || !newV) return "updated site details";
  if (oldV.site_status !== newV.site_status && typeof newV.site_status === "string") {
    return `changed status to ${lfgStatusLabel(newV.site_status)}`;
  }
  if (oldV.width !== newV.width || oldV.height !== newV.height) {
    return `adjusted size to ${newV.width ?? "—"} × ${newV.height ?? "—"} mm`;
  }
  const changed = Object.keys(SITE_FIELD_LABEL).filter((k) => oldV[k] !== newV[k]);
  if (changed.length === 0) return "updated site details";
  if (changed.length === 1) return `updated ${SITE_FIELD_LABEL[changed[0]]}`;
  return `updated ${SITE_FIELD_LABEL[changed[0]]} and ${changed.length - 1} other field${changed.length - 1 === 1 ? "" : "s"}`;
}

const DOC_CATEGORY_LABEL: Record<string, string> = {
  survey: "a Site Survey",
  installation: "an Installation Report",
  reference: "a reference picture",
  other: "a document",
};

const INSTALL_STATUS_LABEL: Record<string, string> = {
  pending: "Not Started",
  planned: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  issue: "Issue",
};

function describe(row: AuditRow): string {
  const site = siteLabel(row);
  const forSite = site ? ` for ${site}` : "";
  const verb = row.action === "insert" ? "added" : row.action === "delete" ? "deleted" : "updated";

  switch (row.entity_type) {
    case "lfg_sites":
      if (row.action === "insert") return `added a new site — ${site ?? row.entity_id}`;
      if (row.action === "delete") return `deleted site ${site ?? row.entity_id}`;
      return `${siteUpdateSummary(row.old_value, row.new_value)}${forSite}`;
    case "lfg_site_documents": {
      const category = str(row.new_value ?? row.old_value, "category") ?? "other";
      const fileName = str(row.new_value ?? row.old_value, "file_name");
      const label = DOC_CATEGORY_LABEL[category] ?? "a document";
      const action = row.action === "delete" ? "removed" : "uploaded";
      return `${action} ${label}${fileName ? ` (${fileName})` : ""}${forSite}`;
    }
    case "lfg_site_surveys":
      return row.action === "insert" ? `submitted a site survey${forSite}` : `updated the site survey${forSite}`;
    case "lfg_installations": {
      if (row.action === "insert") return `created an installation record${forSite}`;
      const oldStatus = str(row.old_value, "installation_status");
      const newStatus = str(row.new_value, "installation_status");
      if (newStatus && oldStatus !== newStatus) {
        return `updated installation status to ${INSTALL_STATUS_LABEL[newStatus] ?? newStatus}${forSite}`;
      }
      return `updated installation details${forSite}`;
    }
    case "lfg_installation_photos":
      return `uploaded an installation photo${forSite}`;
    case "lfg_installation_costs":
      return `updated installation costs${forSite}`;
    case "lfg_site_financials":
      return `updated site financials${forSite}`;
    case "lfg_production": {
      const newStatus = str(row.new_value, "status");
      return newStatus ? `updated production status to ${newStatus.replace(/_/g, " ")}${forSite}` : `updated production details${forSite}`;
    }
    case "lfg_shipments": {
      const awb = str(row.new_value ?? row.old_value, "awb_number");
      const awbSuffix = awb ? ` (AWB ${awb})` : "";
      if (row.action === "insert") return `logged a new shipment${awbSuffix}${forSite}`;
      const oldStatus = str(row.old_value, "current_status");
      const newStatus = str(row.new_value, "current_status");
      if (newStatus && oldStatus !== newStatus) return `updated shipment status to ${newStatus.replace(/_/g, " ")}${forSite}`;
      return `updated shipment${awbSuffix}${forSite}`;
    }
    case "lfg_issues": {
      if (row.action === "insert") return `flagged an issue${forSite}`;
      const status = str(row.new_value, "status");
      return status ? `marked an issue ${status.replace(/_/g, " ")}${forSite}` : `updated an issue${forSite}`;
    }
    case "lfg_deactivation_requests": {
      if (row.action === "insert") return `requested deactivation${forSite}`;
      const status = str(row.new_value, "approval_status");
      return status ? `${status} a deactivation request${forSite}` : `updated a deactivation request${forSite}`;
    }
    case "lfg_partners": {
      const name = str(row.new_value ?? row.old_value, "name");
      return `${verb} partner${name ? ` ${name}` : ""}`;
    }
    default:
      return `${verb} ${row.entity_type.replace("lfg_", "").replace(/_/g, " ")}${forSite}`;
  }
}

export function LfgActivityFeed() {
  const router = useRouter();
  const role = useUserRole();
  const visible = canWrite(role);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Returns the fetch's own promise (rather than setting a "loading" flag
  // synchronously before it) so the mount effect below can call this
  // directly without a synchronous setState in the effect body itself --
  // only the setRows() inside .then() runs, which react-hooks/
  // set-state-in-effect doesn't flag (see account/page.tsx's own comment
  // on this exact pattern). The Refresh button's onClick, a plain event
  // handler rather than an effect, is where setRefreshing() is safe to
  // call synchronously.
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
    // load() returns the query builder's own PromiseLike (no .finally) --
    // Promise.resolve() upgrades it to a real Promise for that.
    Promise.resolve(load()).finally(() => setRefreshing(false));
  }

  if (!visible) return null;

  return (
    <div className="mb-6 rounded-2xl bg-surface-sunken p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Activity</h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold text-ink-secondary hover:bg-surface disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {rows === null ? (
        <p className="py-6 text-center text-xs text-ink-muted">Loading activity…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-muted">No activity logged yet.</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto rounded-xl bg-surface">
          {rows.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <div className="min-w-0">
                <p className="text-[13px] leading-snug text-ink">
                  <span className="font-semibold">{displayName(row.user_email)}</span> {describe(row)}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-muted">{timeAgo(row.created_at)}</p>
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
          ))}
        </div>
      )}
    </div>
  );
}
