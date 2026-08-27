"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search, Plus, LayoutDashboard, Users, Trash2, X, ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole, canDelete } from "@/lib/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { LFG_STATUSES, lfgStatusLabel, lfgStatusBadge } from "@/lib/lfgStatus";

// Site Master list — the entry point to the LFG Connect program's Site 360
// view. Deliberately a client component doing direct supabase.from()
// queries, mirroring workspaces/customer/page.tsx exactly (debounced
// search, .or() ilike across the fields the spec calls out for global
// search: Site ID, Outlet, SFO ID, Program, City, ASM, Partner). Financial
// fields are never selected here -- there'd be nothing to select even if
// this page tried: lfg_site_financials/lfg_installation_costs have zero
// RLS grant to lfg_partner, but this is the STAFF workspace, where admin/
// editor/viewer all pass RLS fine -- the omission here is just this page
// not needing them for a list view, not a security boundary (that
// boundary is the RLS grant itself, see the schema's header comment).
interface LfgSiteListRow {
  id: string;
  site_id: string;
  outlet_name: string;
  program: string | null;
  sfo_id: string | null;
  city: string | null;
  material: string | null;
  site_status: string;
  number_of_sites: number;
  asm_name: string | null;
  partner_id: string | null;
  lfg_partners: { name: string } | { name: string }[] | null;
}

function partnerName(row: LfgSiteListRow): string {
  const p = Array.isArray(row.lfg_partners) ? row.lfg_partners[0] : row.lfg_partners;
  return p?.name ?? "—";
}

export default function LfgSiteListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const role = useUserRole();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [programFilter, setProgramFilter] = useState<string>("");
  const [rows, setRows] = useState<LfgSiteListRow[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LfgSiteListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Quick cleanup for the empty "Store Master" import stubs and other
  // one-off junk records found while browsing/searching (see the dedupe
  // script from task #24 for the bulk version of this same cleanup) --
  // no live related-data check here the way Site 360's delete dialog has
  // one, since checking every visible row would mean N extra queries; an
  // admin who wants that detail opens the site's own page instead. RLS
  // (lfg_sites_delete_staff, admin-only) is the real boundary either way.
  async function handleDeleteSite() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("lfg_sites").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast("danger", `Couldn't delete ${deleteTarget.site_id}: ${error.message}`);
      return;
    }
    toast("success", `${deleteTarget.site_id} deleted`);
    setRows((prev) => prev?.filter((r) => r.id !== deleteTarget.id) ?? prev);
    setTotalCount((prev) => (prev === null ? prev : prev - 1));
    setDeleteTarget(null);
  }

  useEffect(() => {
    supabase
      .from("lfg_sites")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setTotalCount(count ?? 0));
  }, []);

  // Seeds the search box from ?q=... (fuzzy free-text) or the page from
  // ?program=... (the Program Dashboard's row/chart click hands off an
  // EXACT program name this way -- distinct from ?q=, which only ever
  // ilike-matches, so a program click always lands on strictly that
  // program's sites, not a superset that happens to fuzzy-match its name).
  // Read via window.location directly rather than useSearchParams -- this
  // page is fully client-rendered already, so this avoids the
  // Suspense-boundary requirement useSearchParams imposes on
  // statically-generated pages for no benefit here, same as
  // workspaces/ai-copilot/page.tsx. Runs once on mount, then strips the
  // param via replaceState so refreshing doesn't re-seed it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const program = params.get("program");
    if (q || program) {
      window.history.replaceState(null, "", "/workspaces/lfg");
      if (q) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setQuery(q);
      }
      if (program) {
        setProgramFilter(program);
      }
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      let q = supabase
        .from("lfg_sites")
        .select("id, site_id, outlet_name, program, sfo_id, city, material, site_status, number_of_sites, asm_name, partner_id, lfg_partners(name)")
        .order("created_at", { ascending: false })
        // A program-filtered view is meant to show the WHOLE group -- e.g.
        // "active" alone totals 791 sites across all programs, so a single
        // chain can easily hold hundreds -- while the default unfiltered
        // browse still caps at the most recent 100, same as before.
        .limit(programFilter ? 5000 : 100);

      if (statusFilter) q = q.eq("site_status", statusFilter);
      // Exact match, not the fuzzy `.or()` ilike below -- this is what makes
      // a Program Dashboard click land on strictly that program's sites.
      if (programFilter) q = q.eq("program", programFilter);

      const trimmed = query.trim();
      if (trimmed) {
        q = q.or(
          `site_id.ilike.%${trimmed}%,outlet_name.ilike.%${trimmed}%,sfo_id.ilike.%${trimmed}%,program.ilike.%${trimmed}%,city.ilike.%${trimmed}%,asm_name.ilike.%${trimmed}%`
        );
      }

      q.then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load LFG sites from Supabase");
          return;
        }
        setRows((data as unknown as LfgSiteListRow[]) ?? []);
      });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, programFilter]);

  const COLUMNS: TableColumn<LfgSiteListRow>[] = [
    { key: "site_id", header: "Site ID", sortable: true },
    { key: "outlet_name", header: "Outlet", sortable: true },
    { key: "program", header: "Program", sortable: true, render: (r) => r.program ?? "—" },
    { key: "city", header: "City", sortable: true, render: (r) => r.city ?? "—" },
    {
      key: "site_status",
      header: "Status",
      sortable: true,
      render: (r) => <Badge status={lfgStatusBadge(r.site_status)}>{lfgStatusLabel(r.site_status)}</Badge>,
    },
    { key: "number_of_sites", header: "# Sites", sortable: true },
    { key: "asm_name", header: "ASM", sortable: true, render: (r) => r.asm_name ?? "—" },
    { key: "partner_id", header: "Partner", render: (r) => partnerName(r) },
    ...(canDelete(role)
      ? [
          {
            key: "id",
            header: "",
            render: (r) => (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${r.site_id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(r);
                }}
              >
                <Trash2 size={14} className="text-danger" />
              </Button>
            ),
          } satisfies TableColumn<LfgSiteListRow>,
        ]
      : []),
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <MapPin size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">LFG Connect</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Site Master for the Basil (Apple) LFG program — search or browse every site, then open its Site 360
              view.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push("/workspaces/lfg/dashboard")}>
            <LayoutDashboard size={15} className="mr-1.5" /> Dashboard
          </Button>
          <Button variant="secondary" onClick={() => router.push("/workspaces/lfg/partners")}>
            <Users size={15} className="mr-1.5" /> Partners
          </Button>
          <Button onClick={() => router.push("/workspaces/lfg/new")}>
            <Plus size={15} className="mr-1.5" /> New Site
          </Button>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Sites" value={totalCount === null ? "…" : String(totalCount)} trend="flat" trendLabel="Live count" />
        <StatCard
          label="Showing"
          value={rows === null ? "…" : String(rows.length)}
          trend="flat"
          trendLabel={query.trim() || statusFilter || programFilter ? "Filtered" : "Most recent 100"}
        />
        <StatCard
          label="Needs Attention"
          value={rows === null ? "…" : String(rows.filter((r) => r.site_status === "issue_attention_required").length)}
          trend="flat"
          trendLabel="Of rows currently shown"
        />
      </div>

      {programFilter && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Landing here is always a Program Dashboard click-through (see
              the ?program= seeding effect above) -- an explicit way back,
              not just the generic header "Dashboard" button, since that's
              easy to miss when you arrived expecting to land back where
              you came from. */}
          <Button size="sm" variant="secondary" onClick={() => router.push("/workspaces/lfg/dashboard")}>
            <ArrowLeft size={14} className="mr-1.5" /> Back to Dashboard
          </Button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary-tint px-3 py-1 text-xs font-medium text-primary">
            Program: {programFilter}
            <button
              type="button"
              aria-label="Clear program filter"
              onClick={() => setProgramFilter("")}
              className="rounded-full p-0.5 hover:bg-primary/10"
            >
              <X size={12} />
            </button>
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2">
          <Search size={16} className="text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search Site ID, Outlet, SFO ID, Program, City, or ASM — e.g. "Croma" or "LFG-000012"'
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">All statuses</option>
          {LFG_STATUSES.map((s) => (
            <option key={s} value={s}>
              {lfgStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {rows === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading sites…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No sites match your search.</p>
        ) : (
          <Table columns={COLUMNS} rows={rows} onRowClick={(r) => router.push(`/workspaces/lfg/sites/${r.id}`)} />
        )}
      </div>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Delete ${deleteTarget.site_id}?` : "Delete site?"}
        variant="confirm"
        destructive
        onConfirm={handleDeleteSite}
        confirmLabel={deleting ? "Deleting…" : "Delete Permanently"}
      >
        <p className="text-sm text-ink-secondary">
          This permanently deletes <span className="font-medium text-ink">{deleteTarget?.outlet_name}</span> and
          everything logged against it (surveys, shipments, installation, financials, etc.) — this cannot be undone.
          Open the site&apos;s own page first if you want to see what&apos;s on it before deleting.
        </p>
      </Dialog>
    </div>
  );
}
