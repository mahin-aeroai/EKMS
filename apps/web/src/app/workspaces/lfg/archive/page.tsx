"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive as ArchiveIcon, Search, RotateCcw } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { LfgConnectHeader } from "@/components/workspaces/LfgConnectHeader";

// 11 Sept 2026: task feedback -- "whatever we marked the sites for Fall
// 2026 keep them as permanent sites and move rest all sites to archive.
// Create archive pool and push them they should never display on cards
// even on total sites cards. only archval area they should show the no
// of sites." This is that archive area -- the one place in LFG Connect
// where an archived site (see supabase-lfg-sites-archive-migration.sql
// and every other list/count query across this module, all now filtered
// with `.is("archived_at", null)`) is visible at all. A site's own
// detail page (Site 360) is unaffected either way -- archiving only
// hides it from lists/dashboards/counts, never blocks direct access.
interface ArchivedSiteRow {
  id: string;
  site_id: string;
  outlet_name: string;
  sfo_id: string | null;
  city: string | null;
  format: string | null;
  program_id: string | null;
  archived_at: string;
}

interface ProgramOption {
  id: string;
  name: string;
}

export default function LfgArchivePage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ArchivedSiteRow[] | null>(null);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    // Paginated past PostgREST's 1000-row cap -- same reasoning as every
    // other list on the Site Master/Stores/Programs pages (task #69);
    // the archive is expected to hold far more than 1000 rows once the
    // bulk-archive migration runs.
    fetchAllRows<ArchivedSiteRow>((from, to) =>
      supabase
        .from("lfg_sites")
        .select("id, site_id, outlet_name, sfo_id, city, format, program_id, archived_at")
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false })
        .range(from, to)
    ).then(setRows);
    supabase
      .from("lfg_programs")
      .select("id, name")
      .then(({ data }) => setPrograms((data as ProgramOption[]) ?? []));
  }, []);

  const programName = useMemo(() => {
    const map = new Map(programs.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "(no program)");
  }, [programs]);

  const loading = rows === null;

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.outlet_name.toLowerCase().includes(q) ||
        (r.sfo_id ?? "").toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q) ||
        r.site_id.toLowerCase().includes(q)
    );
  }, [rows, query]);

  async function handleRestore(row: ArchivedSiteRow) {
    setRestoringId(row.id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("lfg_sites")
      .update({ archived_at: null, archived_by: user?.id ?? null })
      .eq("id", row.id);
    setRestoringId(null);
    if (error) {
      toast("danger", `Couldn't restore ${row.outlet_name}: ${error.message}`);
      return;
    }
    toast("success", `${row.outlet_name} restored -- back on the Site Master.`);
    setRows((prev) => prev?.filter((r) => r.id !== row.id) ?? prev);
  }

  const COLUMNS: TableColumn<ArchivedSiteRow>[] = [
    { key: "outlet_name", header: "Outlet", sortable: true },
    { key: "site_id", header: "Site ID", sortable: true },
    { key: "sfo_id", header: "SFO / Apple ID", sortable: true, render: (r) => r.sfo_id ?? "—" },
    { key: "city", header: "City", sortable: true, render: (r) => r.city ?? "—" },
    { key: "format", header: "Format", sortable: true, render: (r) => r.format ?? "—" },
    { key: "program_id", header: "Program (Season)", render: (r) => programName(r.program_id) },
    {
      key: "archived_at",
      header: "Archived",
      sortable: true,
      render: (r) => new Date(r.archived_at).toLocaleDateString("en-IN"),
    },
    {
      key: "id",
      header: "",
      render: (r) => (
        <Button
          size="sm"
          variant="secondary"
          loading={restoringId === r.id}
          onClick={(e) => {
            e.stopPropagation();
            handleRestore(r);
          }}
        >
          <RotateCcw size={13} className="mr-1.5" /> Restore
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Archive" }]} />

      <LfgConnectHeader
        icon={ArchiveIcon}
        section="Archive"
        subtitle="Sites moved out of the active Site Master. They never appear on any Site Master, Dashboard, Program, Store, or Estimate view or count -- only here. Restore one to bring it back."
      />

      <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Archived Sites" value={loading ? "…" : String(rows!.length)} trend="flat" trendLabel="Excluded everywhere else" />
        <StatCard
          label="Showing"
          value={loading ? "…" : String(filteredRows.length)}
          trend="flat"
          trendLabel={query.trim() ? "Matching your search" : "All archived sites"}
        />
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2">
        <Search size={16} className="text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search outlet name, Site ID, SFO ID, or city"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {loading ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading archive…</p>
        ) : filteredRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {query.trim() ? "No archived sites match your search." : "Nothing archived yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table columns={COLUMNS} rows={filteredRows} />
          </div>
        )}
      </div>
    </div>
  );
}
