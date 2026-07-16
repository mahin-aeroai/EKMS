"use client";

import { useEffect, useRef, useState } from "react";
import { Settings, ShieldAlert, ChevronDown, Check } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { StatCard, AICard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { TreeView, type TreeNode } from "@/components/ui/TreeView";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole } from "@/lib/UserRoleContext";
import { supabase, type AccessRequestRow, type ProfileRow, type UserRole } from "@/lib/supabase";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/cn";

const COLUMNS: TableColumn<AccessRequestRow>[] = [
  { key: "user_label", header: "User", sortable: true },
  { key: "requested", header: "Access Requested", sortable: true },
  { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status_label}</Badge> },
];

const TREE: TreeNode[] = [
  { id: "root", label: "MMDI ONE Access Roles", children: [
    { id: "exec", label: "Executive", children: [{ id: "e1", label: "Full read, no edit" }] },
    { id: "ops", label: "Operations", children: [{ id: "o1", label: "Line Manager" }, { id: "o2", label: "Maintenance Lead" }] },
    { id: "finance", label: "Finance", children: [{ id: "f1", label: "Approver" }, { id: "f2", label: "Read-only" }] },
  ]},
];

const ROLE_BADGE_STATUS: Record<UserRole, "success" | "info" | "neutral"> = {
  admin: "success",
  editor: "info",
  viewer: "neutral",
};

const ROLE_OPTIONS: UserRole[] = ["admin", "editor", "viewer"];

// The 8 real business-domain sidebar groups a user's module access can be
// restricted to — matches SECTION_GROUP in AppShell.tsx and the group_map
// in supabase-module-access-migration.sql. Executive (Command Center/AI
// Copilot/Analytics) and the design-system showcase sections are never
// restrictable, so they're not listed here.
const GROUP_OPTIONS: { id: string; label: string }[] = [
  { id: "customers", label: "Customers" },
  { id: "operations", label: "Operations" },
  { id: "manufacturing", label: "Manufacturing" },
  { id: "knowledge", label: "Knowledge" },
  { id: "people", label: "People" },
  { id: "finance", label: "Finance" },
  { id: "compliance", label: "Compliance" },
  { id: "administration", label: "Administration" },
];
const GROUP_LABEL: Record<string, string> = Object.fromEntries(GROUP_OPTIONS.map((g) => [g.id, g.label]));

/**
 * Compact multi-select for one profile's allowed_groups. Deliberately local
 * to this page rather than the design system's Dropdown component — that
 * one always renders its own label above the trigger (built for form use),
 * which looks wrong repeated in every table row. An empty selection means
 * "all modules" (allowed_groups = NULL), not "no modules" — see the
 * onChange mapping in the parent.
 */
function GroupAccessSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (groups: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const summary = selected.length === 0 ? "All modules" : selected.map((g) => GROUP_LABEL[g] ?? g).join(", ");

  return (
    <div ref={rootRef} className="relative w-56">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded-md border border-line-strong bg-surface px-2 text-left text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={14} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-line bg-surface-overlay p-1 shadow-3">
          {GROUP_OPTIONS.map((g) => {
            const isSelected = selected.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() =>
                  onChange(isSelected ? selected.filter((s) => s !== g.id) : [...selected, g.id])
                }
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-sunken",
                  isSelected && "text-primary"
                )}
              >
                {g.label}
                {isSelected && <Check size={14} />}
              </button>
            );
          })}
          {selected.length > 0 && (
            <>
              <div className="my-1 border-t border-line" />
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-ink-muted hover:bg-surface-sunken"
              >
                Reset to all modules
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdministrationPage() {
  const { toast } = useToast();
  const userRole = useUserRole();
  const [requests, setRequests] = useState<AccessRequestRow[] | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<{ profile: ProfileRow; newRole: UserRole } | null>(null);

  useEffect(() => {
    supabase
      .from("access_requests")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load access requests from Supabase");
          return;
        }
        setRequests(data ?? []);
      });

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });

    // Row visibility here is enforced by RLS, not this query: admins get
    // every profile back, everyone else only ever gets their own row (see
    // profiles_select_own_or_admin in supabase-role-based-rls-migration.sql)
    // — so a non-admin viewing this page naturally sees just themselves,
    // no client-side filtering needed.
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load user profiles from Supabase");
          return;
        }
        setProfiles((data as ProfileRow[]) ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = requests?.filter((r) => r.status === "warning").length ?? 0;
  const isAdmin = userRole === "admin";

  function requestRoleChange(profile: ProfileRow, newRole: UserRole) {
    if (newRole === profile.role) return;
    // Guard the one genuinely dangerous case: an admin demoting themselves.
    // Nothing stops this at the database level (RLS just checks the CURRENT
    // role at time of write), but if this admin is the only one, doing it
    // by accident locks everyone out of this page until someone runs the
    // promote-back UPDATE directly in the Supabase SQL editor.
    if (profile.id === currentUserId && profile.role === "admin" && newRole !== "admin") {
      setPendingChange({ profile, newRole });
      return;
    }
    applyRoleChange(profile, newRole);
  }

  async function applyRoleChange(profile: ProfileRow, newRole: UserRole) {
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", profile.id);
    if (error) {
      toast("danger", `Couldn't update ${profile.email}'s role: ${error.message}`);
      return;
    }
    setProfiles((prev) => prev?.map((p) => (p.id === profile.id ? { ...p, role: newRole } : p)) ?? prev);
    toast("success", `${profile.email} is now ${newRole}`);
  }

  async function applyGroupChange(profile: ProfileRow, groups: string[]) {
    // Empty selection means "unrestricted" in the UI, which is NULL in the
    // database — not an empty array (an empty array would mean "no module
    // access at all", the opposite of what an empty selection should mean).
    const value = groups.length === 0 ? null : groups;
    const { error } = await supabase.from("profiles").update({ allowed_groups: value }).eq("id", profile.id);
    if (error) {
      toast("danger", `Couldn't update ${profile.email}'s module access: ${error.message}`);
      return;
    }
    setProfiles((prev) => prev?.map((p) => (p.id === profile.id ? { ...p, allowed_groups: value } : p)) ?? prev);
    toast("success", `${profile.email} is now scoped to ${value === null ? "all modules" : value.map((g) => GROUP_LABEL[g] ?? g).join(", ")}`);
  }

  const PROFILE_COLUMNS: TableColumn<ProfileRow>[] = [
    { key: "email", header: "User", sortable: true },
    {
      key: "role",
      header: "Role",
      sortable: true,
      render: (p) =>
        isAdmin ? (
          <select
            value={p.role}
            onChange={(e) => requestRoleChange(p, e.target.value as UserRole)}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        ) : (
          <Badge status={ROLE_BADGE_STATUS[p.role]}>{p.role.charAt(0).toUpperCase() + p.role.slice(1)}</Badge>
        ),
    },
    {
      key: "allowed_groups",
      header: "Module access",
      render: (p) =>
        p.role === "admin" ? (
          <span className="text-sm text-ink-muted">All modules (admin)</span>
        ) : isAdmin ? (
          <GroupAccessSelect selected={p.allowed_groups ?? []} onChange={(groups) => applyGroupChange(p, groups)} />
        ) : (
          <span className="text-sm text-ink-muted">
            {p.allowed_groups === null ? "All modules" : p.allowed_groups.map((g) => GROUP_LABEL[g] ?? g).join(", ")}
          </span>
        ),
    },
    { key: "created_at", header: "Joined", sortable: true, render: (p) => timeAgo(p.created_at) },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Administration" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Settings size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Administration</h1>
              <Badge status="warning">{requests ? `${pending} pending request${pending === 1 ? "" : "s"}` : "Loading…"}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">User access, roles, and platform configuration</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag aiSuggested>Contractor access request needs a defined expiry date</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="User Accounts" value={profiles ? String(profiles.length) : "…"} trend="flat" trendLabel="Admin / Editor / Viewer" />
        <StatCard label="Roles Configured" value="3" trend="flat" trendLabel="Admin, Editor, Viewer" />
        <StatCard label="Pending Access Requests" value={String(pending)} trend="up" trendLabel="+1 this week" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AICard
            variant="recommendation"
            title="Set an expiry date on the contractor's access"
            citation="Access Policy, temporary user guidelines"
            onAccept={() => toast("success", "Expiry date added to request")}
            onDismiss={() => toast("info", "Dismissed")}
          >
            Temporary contractor access should always carry an expiry date per policy — this request is missing one and shouldn&apos;t be granted as-is.
          </AICard>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">Access requests</h3>
            {requests === null ? (
              <p className="py-6 text-center text-sm text-ink-muted">Loading access requests…</p>
            ) : (
              <Table columns={COLUMNS} rows={requests} onRowClick={(r) => toast("info", `Opened request from ${r.user_label}`)} />
            )}
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Users &amp; roles</h3>
              {!isAdmin && userRole && (
                <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <ShieldAlert size={13} />
                  Only admins can view and change other users&apos; roles and module access
                </span>
              )}
            </div>
            {profiles === null ? (
              <p className="py-6 text-center text-sm text-ink-muted">Loading users…</p>
            ) : profiles.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">No profile rows found.</p>
            ) : (
              <Table columns={PROFILE_COLUMNS} rows={profiles} />
            )}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Role hierarchy</h3>
          <TreeView nodes={TREE} />
        </div>
      </div>

      <Dialog
        open={pendingChange !== null}
        onClose={() => setPendingChange(null)}
        title="Remove your own admin access?"
        variant="confirm"
        destructive
        confirmLabel="Remove my admin access"
        onConfirm={() => {
          if (pendingChange) applyRoleChange(pendingChange.profile, pendingChange.newRole);
          setPendingChange(null);
        }}
      >
        You&apos;re about to change your own role from Admin to {pendingChange ? pendingChange.newRole : ""}. If you&apos;re
        the only admin, no one will be able to manage roles from this page afterward — you&apos;d need to run an UPDATE
        directly in the Supabase SQL editor to undo it. Continue?
      </Dialog>
    </div>
  );
}
