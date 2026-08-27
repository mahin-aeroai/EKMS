"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ArrowLeft, Plus } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { LFG_PIPELINE_STAGES, lfgPipelineStageOf, type LfgPipelineStageKey } from "@/lib/lfgStatus";

// Programs (seasonal waves: "Spring Refresh 2025", "Fall Refresh 2025/26",
// etc.) -- task #39-49. Distinct from the Format Dashboard, which groups by
// the retail chain/format column (lfg_sites.format) -- a Program here is a
// time-boxed wave a site gets moved into/out of (see lfg_programs and
// lfg_sites.program_id in the schema), tracked through the same pipeline
// stages every other view of lfg_sites uses (LFG_PIPELINE_STAGES).
//
// Create + list, one row per Program with its own site count and per-stage
// breakdown (same flattened-row trick as the Format Dashboard's table, so
// every TableColumn gets a distinct real `keyof` key) -- click a row to
// jump to the Site Master filtered to strictly that Program's sites
// (?program_id=, distinct from the Format Dashboard's ?format=). Moving
// sites INTO a Program is done from the Site Master itself (bulk "Move to
// Program", task #46, admin/editor gated) -- not from this page.

interface ProgramRow {
  id: string;
  name: string;
  active: boolean;
  notes: string | null;
}

interface SiteStageRow {
  program_id: string | null;
  site_status: string;
  creative_received_at: string | null;
}

type StageCounts = Record<LfgPipelineStageKey, number>;

interface ProgramGroup extends ProgramRow {
  total: number;
  counts: StageCounts;
}

// NOT `ProgramGroup & StageCounts` (the Format Dashboard table's pattern) --
// StageCounts already has an "active" key (the pipeline stage) which
// collides with ProgramRow's own "active" (whether the Program itself is
// active/inactive), reducing the intersection to `never`. Renamed to
// `programActive` here instead, kept distinct from the stage count.
interface ProgramTableRow extends StageCounts {
  id: string;
  name: string;
  programActive: boolean;
  total: number;
}

function emptyCounts(): StageCounts {
  return {
    active: 0,
    inactive: 0,
    survey: 0,
    creative_receipt: 0,
    printing: 0,
    shipping: 0,
    delivery: 0,
    schedule: 0,
    installation: 0,
    issues: 0,
  };
}

export default function LfgProgramsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const role = useUserRole();
  const editable = canWrite(role);

  const [programRows, setProgramRows] = useState<ProgramRow[] | null>(null);
  const [siteRows, setSiteRows] = useState<SiteStageRow[] | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadPrograms() {
    const { data } = await supabase.from("lfg_programs").select("*").order("name");
    setProgramRows((data as ProgramRow[]) ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPrograms();
    fetchAllRows<SiteStageRow>((from, to) =>
      supabase.from("lfg_sites").select("program_id, site_status, creative_received_at").range(from, to)
    ).then(setSiteRows);
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      setError("Program name is required.");
      return;
    }
    setCreating(true);
    setError(null);
    const { error: insertError } = await supabase.from("lfg_programs").insert({
      name: newName.trim(),
      notes: newNotes.trim() || null,
    });
    setCreating(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    toast("success", `${newName.trim()} created`);
    setNewName("");
    setNewNotes("");
    setShowNewForm(false);
    loadPrograms();
  }

  function openProgram(programId: string | null, name: string) {
    if (programId === null) return;
    router.push(`/workspaces/lfg?program_id=${encodeURIComponent(programId)}&program_name=${encodeURIComponent(name)}`);
  }

  const loading = programRows === null || siteRows === null;

  const groups: ProgramGroup[] = loading
    ? []
    : programRows!.map((p): ProgramGroup => {
        const counts = emptyCounts();
        let total = 0;
        for (const r of siteRows!) {
          if (r.program_id !== p.id) continue;
          const stage = lfgPipelineStageOf(r.site_status, r.creative_received_at);
          counts[stage] += 1;
          total += 1;
        }
        return { ...p, total, counts };
      });

  const unassignedCount = loading ? 0 : siteRows!.filter((r) => r.program_id === null).length;

  const tableRows: ProgramTableRow[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    programActive: g.active,
    total: g.total,
    ...g.counts,
  }));

  const COLUMNS: TableColumn<ProgramTableRow>[] = [
    {
      key: "name",
      header: "Program",
      sortable: true,
      render: (r) => (
        <span className="flex items-center gap-2">
          {r.name}
          <Badge status={r.programActive ? "success" : "neutral"}>{r.programActive ? "Active" : "Inactive"}</Badge>
        </span>
      ),
    },
    { key: "total", header: "Total", sortable: true },
    ...LFG_PIPELINE_STAGES.map((s) => ({ key: s.key, header: s.label, sortable: true }) as TableColumn<ProgramTableRow>),
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Programs" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <CalendarRange size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Programs</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Seasonal waves (Spring Refresh 2025, Fall Refresh 2025/26, ...) -- create one here, then move sites into
              it from the Site Master.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push("/workspaces/lfg")}>
            <ArrowLeft size={15} className="mr-1.5" /> Site Master
          </Button>
          {editable && (
            <Button onClick={() => setShowNewForm((v) => !v)}>
              <Plus size={15} className="mr-1.5" /> New Program
            </Button>
          )}
        </div>
      </div>

      {showNewForm && (
        <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-2 rounded-md border border-line bg-surface-sunken p-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder='Program name (e.g. "Spring Refresh 2025")'
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <input
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button size="sm" type="submit" loading={creating} className="w-fit">
            Create Program
          </Button>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No Programs yet — create the first one above.</p>
        ) : (
          <>
            {unassignedCount > 0 && (
              <p className="mb-3 text-xs text-ink-muted">
                {unassignedCount} site{unassignedCount === 1 ? "" : "s"} not yet assigned to any Program.
              </p>
            )}
            <div className="overflow-x-auto">
              <Table
                columns={COLUMNS}
                rows={tableRows}
                onRowClick={(r) => openProgram(r.id, r.name)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
