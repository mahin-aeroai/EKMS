"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Plus } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { LFG_PIPELINE_STAGES, LFG_PIPELINE_STAGE_BADGE, lfgPipelineStageOf, type LfgPipelineStageKey } from "@/lib/lfgStatus";
import { LfgConnectHeader } from "@/components/workspaces/LfgConnectHeader";

// Programs (seasonal waves: "Spring Refresh 2025", "Fall Refresh 2025/26",
// etc.) -- task #39-49. Distinct from the Format Dashboard, which groups by
// the retail chain/format column (lfg_sites.format) -- a Program here is a
// time-boxed wave a site gets moved into/out of (see lfg_programs and
// lfg_sites.program_id in the schema), tracked through the same pipeline
// stages every other view of lfg_sites uses (LFG_PIPELINE_STAGES).
//
// Create + a card per Program, sized and grouped by recency (task #85 -- a
// plain table read fine as a list, but buried the one thing a returning
// visitor actually wants: "where does the CURRENT wave stand, stage by
// stage" behind a wall of columns). The most recently created Program is
// the "current" one, rendered big and first; every earlier one groups
// into a smaller "Previous Programs" row below.
//
// Deliberately NOT grouped by lfg_programs.active -- that column defaults
// to true for every row (supabase-lfg-site-management-schema.sql) and
// nothing in this app ever exposes a way to flip it, so in practice every
// Program is "active" and grouping on it never actually produced a
// current-vs-previous split. created_at is real, populated data that
// naturally reflects which wave is newest.
//
// Click a card to jump to the Site Master filtered to strictly that
// Program's sites (?program_id=, distinct from the Format Dashboard's
// ?format=). Moving sites INTO a Program is done from the Site Master
// itself (bulk "Move to Program", task #46, admin/editor gated) -- not
// from this page.

interface ProgramRow {
  id: string;
  name: string;
  active: boolean;
  notes: string | null;
  created_at: string;
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

// The pipeline stages actually worth a pill on a Program card -- "Active"/
// "Inactive" here are a SITE's own activation stage (a completed journey),
// which would read as confusing noise next to the Program's own Active/
// Inactive badge already on the card header; the rest (Survey, Printing,
// Shipping, Delivery, Schedule, Installation, Issues) is the "some in
// production, some in transit, some installed" breakdown that actually
// shows implementation progress.
const CARD_STAGES = LFG_PIPELINE_STAGES.filter((s) => s.key !== "active" && s.key !== "inactive");

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
    // Newest first -- the current/previous split below just takes the
    // first row as "current", so this ordering IS that logic.
    const { data } = await supabase.from("lfg_programs").select("*").order("created_at", { ascending: false });
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

  // `groups` is already newest-first (loadPrograms orders by created_at
  // desc) -- the single newest Program is "current" (the big card); every
  // other one is "previous" (the smaller grid below).
  const currentGroup = groups[0] ?? null;
  const previousGroups = groups.slice(1);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Programs" }]} />

      <LfgConnectHeader
        icon={CalendarRange}
        section="Programs"
        subtitle="Seasonal waves (Spring Refresh 2025, Fall Refresh 2025/26, ...) — create one here, then move sites into it from the Site Master."
        action={
          editable && (
            <Button onClick={() => setShowNewForm((v) => !v)}>
              <Plus size={15} className="mr-1.5" /> New Program
            </Button>
          )
        }
      />

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
              <p className="mb-4 text-xs text-ink-muted">
                {unassignedCount} site{unassignedCount === 1 ? "" : "s"} not yet assigned to any Program.
              </p>
            )}

            {currentGroup && (
              <div className="flex flex-col gap-4">
                <ProgramCard group={currentGroup} size="lg" onClick={() => openProgram(currentGroup.id, currentGroup.name)} />
              </div>
            )}

            {previousGroups.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Previous Programs</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {previousGroups.map((g) => (
                    <ProgramCard key={g.id} group={g} size="sm" onClick={() => openProgram(g.id, g.name)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProgramCard({ group, size, onClick }: { group: ProgramGroup; size: "lg" | "sm"; onClick: () => void }) {
  // Only the stages that actually have sites in them render a pill -- an
  // empty "0 Printing" pill on every card would bury the ones that matter
  // (this is exactly the "some in production, some in transit, some
  // installed" implementation-status view the table's columns buried).
  const stages = CARD_STAGES.filter((s) => group.counts[s.key] > 0);

  // The "lg" card is the one current-season Program -- deliberately not
  // just a bigger version of the same plain card (a font-size difference
  // alone read as barely-there): a tinted, thicker-bordered card with its
  // own "Current Season" eyebrow, so which one is current is obvious at a
  // glance, not something you have to compare sizes to notice.
  if (size === "lg") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter") onClick();
        }}
        className="cursor-pointer rounded-2xl border-2 border-primary bg-primary-tint p-8 shadow-2 transition-shadow hover:shadow-3"
      >
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">Current Season</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-3xl font-extrabold text-ink">{group.name}</h3>
            <Badge status={group.active ? "success" : "neutral"}>{group.active ? "Active" : "Inactive"}</Badge>
          </div>
          <span className="text-base font-semibold text-ink-secondary">
            {group.total} site{group.total === 1 ? "" : "s"}
          </span>
        </div>

        {group.notes && <p className="mt-2 text-sm text-ink-secondary">{group.notes}</p>}

        {stages.length === 0 ? (
          <p className="mt-5 text-sm text-ink-muted">No sites in this Program yet.</p>
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
            {stages.map((s) => (
              <Badge key={s.key} status={LFG_PIPELINE_STAGE_BADGE[s.key]}>
                {group.counts[s.key]} {s.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className="cursor-pointer rounded-xl border border-line bg-surface p-4 shadow-1 transition-shadow hover:shadow-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-ink">{group.name}</h3>
          <Badge status={group.active ? "success" : "neutral"}>{group.active ? "Active" : "Inactive"}</Badge>
        </div>
        <span className="text-xs text-ink-muted">
          {group.total} site{group.total === 1 ? "" : "s"}
        </span>
      </div>

      {stages.length === 0 ? (
        <p className="mt-3 text-xs text-ink-muted">No sites in this Program yet.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {stages.map((s) => (
            <Badge key={s.key} status={LFG_PIPELINE_STAGE_BADGE[s.key]}>
              {group.counts[s.key]} {s.label}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
