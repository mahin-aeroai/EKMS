"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Plus, Mail, Send, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { LFG_PIPELINE_STAGES, LFG_PIPELINE_STAGE_BADGE, lfgPipelineStageOf, type LfgPipelineStageKey } from "@/lib/lfgStatus";
import { LfgConnectHeader } from "@/components/workspaces/LfgConnectHeader";
import { timeAgo } from "@/lib/timeAgo";

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
}

// Programs (seasonal waves: "Spring Refresh 2025", "Fall Refresh 2025/26",
// etc.) -- task #39-49. Distinct from the Format Dashboard, which groups by
// the retail chain/format column (lfg_sites.format) -- a Program here is a
// time-boxed wave a site gets moved into/out of (see lfg_programs and
// lfg_sites.program_id in the schema), tracked through the same pipeline
// stages every other view of lfg_sites uses (LFG_PIPELINE_STAGES).
//
// Create + a card per Program (task #85 -- a plain table read fine as a
// list, but buried the one thing a returning visitor actually wants:
// "where does the CURRENT wave stand, stage by stage" behind a wall of
// columns). Every card renders at the same size, newest first -- task
// feedback ("check this disparity!" on a screenshot where a
// freshly-created, still-empty "Spring 2026" rendered as a big
// tinted "Current Season" card while "Fall 2026", the one actually
// holding 259 real sites, was demoted to a small card in a "Previous
// Programs" row below it): the size difference read as "this one
// matters, that one doesn't" regardless of which one actually had any
// sites in it. The newest Program still gets a small "Current Season"
// tag next to its name so it's still identifiable at a glance -- just
// not a different card size to notice it by.
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

// "LFG Connect Updates" daily report -- who gets the daily/on-demand
// Excel report for each Program, and the log of every send attempt.
// Configurable per Program (not a fixed list, not derived from
// lfg_partners) per the user's own choice.
interface ReportRecipientRow {
  id: string;
  program_id: string;
  email: string;
  active: boolean;
}

interface ReportSendRow {
  program_id: string;
  sent_at: string;
  status: "sent" | "failed" | "skipped_no_recipients";
  row_count: number | null;
  recipient_emails: string[];
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

  const [recipientRows, setRecipientRows] = useState<ReportRecipientRow[]>([]);
  const [lastSendByProgram, setLastSendByProgram] = useState<Record<string, ReportSendRow>>({});
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);

  async function loadPrograms() {
    // Newest first -- the grid below renders every card the same size, but
    // still tags whichever one is first (index 0) as "Current Season", so
    // this ordering IS that logic.
    const { data } = await supabase.from("lfg_programs").select("*").order("created_at", { ascending: false });
    setProgramRows((data as ProgramRow[]) ?? []);
  }

  async function loadRecipients() {
    const { data } = await supabase
      .from("lfg_program_report_recipients")
      .select("id, program_id, email, active")
      .eq("active", true)
      .order("email", { ascending: true });
    setRecipientRows((data as ReportRecipientRow[]) ?? []);
  }

  async function loadLastSends() {
    // Most recent 200 send attempts across every Program is plenty to
    // reduce down to "the latest send per Program" client-side -- this
    // page doesn't need the full history, just the last-known status
    // shown on each card (Supabase JS has no DISTINCT ON without an RPC).
    const { data } = await supabase
      .from("lfg_program_report_sends")
      .select("program_id, sent_at, status, row_count, recipient_emails")
      .order("sent_at", { ascending: false })
      .limit(200);
    const latest: Record<string, ReportSendRow> = {};
    for (const row of (data as ReportSendRow[]) ?? []) {
      if (!latest[row.program_id]) latest[row.program_id] = row;
    }
    setLastSendByProgram(latest);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPrograms();
    loadRecipients();
    loadLastSends();
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g, i) => (
                <ProgramCard
                  key={g.id}
                  group={g}
                  current={i === 0}
                  onClick={() => openProgram(g.id, g.name)}
                  editable={editable}
                  recipients={recipientRows.filter((r) => r.program_id === g.id)}
                  lastSend={lastSendByProgram[g.id]}
                  expanded={expandedProgramId === g.id}
                  onToggleExpand={() => setExpandedProgramId((id) => (id === g.id ? null : g.id))}
                  onRecipientsChanged={loadRecipients}
                  onSent={loadLastSends}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProgramCard({
  group,
  current,
  onClick,
  editable,
  recipients,
  lastSend,
  expanded,
  onToggleExpand,
  onRecipientsChanged,
  onSent,
}: {
  group: ProgramGroup;
  current: boolean;
  onClick: () => void;
  editable: boolean;
  recipients: ReportRecipientRow[];
  lastSend?: ReportSendRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onRecipientsChanged: () => void;
  onSent: () => void;
}) {
  // Only the stages that actually have sites in them render a pill -- an
  // empty "0 Printing" pill on every card would bury the ones that matter
  // (this is exactly the "some in production, some in transit, some
  // installed" implementation-status view the table's columns buried).
  const stages = CARD_STAGES.filter((s) => group.counts[s.key] > 0);

  // Every card renders the same size/style regardless of `current` (see
  // this file's header comment) -- `current` only adds a small badge next
  // to the name, not a different card size or tint.
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-1 transition-shadow hover:shadow-2">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter") onClick();
        }}
        className="cursor-pointer"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-sm font-semibold text-ink">{group.name}</h3>
            <Badge status={group.active ? "success" : "neutral"}>{group.active ? "Active" : "Inactive"}</Badge>
            {current && <Badge status="info">Current Season</Badge>}
          </div>
          <span className="text-xs text-ink-muted">
            {group.total} site{group.total === 1 ? "" : "s"}
          </span>
        </div>

        {group.notes && <p className="mt-2 text-xs text-ink-secondary">{group.notes}</p>}

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

      <div className="mt-3 border-t border-line pt-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="flex w-full items-center justify-between gap-2 text-xs text-ink-secondary hover:text-ink"
        >
          <span className="inline-flex items-center gap-1.5">
            <Mail size={13} />
            LFG Connect Updates report
            {recipients.length > 0 && (
              <span className="text-ink-muted">
                ({recipients.length} recipient{recipients.length === 1 ? "" : "s"})
              </span>
            )}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {!expanded && lastSend && (
          <p className="mt-1 text-[11px] text-ink-muted">
            Last sent {timeAgo(lastSend.sent_at)}
            {lastSend.status === "failed" && " — failed"}
            {lastSend.status === "skipped_no_recipients" && " — skipped (no recipients)"}
          </p>
        )}

        {expanded && (
          <ProgramReportPanel
            programId={group.id}
            editable={editable}
            recipients={recipients}
            lastSend={lastSend}
            onRecipientsChanged={onRecipientsChanged}
            onSent={onSent}
          />
        )}
      </div>
    </div>
  );
}

function ProgramReportPanel({
  programId,
  editable,
  recipients,
  lastSend,
  onRecipientsChanged,
  onSent,
}: {
  programId: string;
  editable: boolean;
  recipients: ReportRecipientRow[];
  lastSend?: ReportSendRow;
  onRecipientsChanged: () => void;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);
    const { error: insertError } = await supabase
      .from("lfg_program_report_recipients")
      .upsert({ program_id: programId, email, active: true }, { onConflict: "program_id,email" });
    setAdding(false);
    if (insertError) {
      toast("danger", insertError.message);
      return;
    }
    setNewEmail("");
    onRecipientsChanged();
  }

  async function handleRemove(recipientId: string) {
    setRemovingId(recipientId);
    const { error: deleteError } = await supabase.from("lfg_program_report_recipients").delete().eq("id", recipientId);
    setRemovingId(null);
    if (deleteError) {
      toast("danger", deleteError.message);
      return;
    }
    onRecipientsChanged();
  }

  async function handleSendNow(e: MouseEvent) {
    e.stopPropagation();
    if (recipients.length === 0) {
      toast("danger", "Add at least one recipient before sending.");
      return;
    }
    setSending(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/lfg/programs/${programId}/send-report`, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok) {
        toast("danger", data?.message ?? "Couldn't send the report.");
        return;
      }
      toast("success", `Report sent to ${data.recipientCount} recipient${data.recipientCount === 1 ? "" : "s"} (${data.rowCount} sites)`);
      onSent();
    } catch {
      toast("danger", "Couldn't send the report — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="mt-2.5 flex flex-col gap-2 rounded-md border border-line bg-surface-sunken p-2.5">
      {recipients.length === 0 ? (
        <p className="text-xs text-ink-muted">No recipients configured yet — this Program&rsquo;s report won&rsquo;t send until you add one.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {recipients.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-xs text-ink">
              <span className="truncate">{r.email}</span>
              {editable && (
                <Button
                  variant="icon"
                  size="sm"
                  aria-label={`Remove ${r.email}`}
                  onClick={() => handleRemove(r.id)}
                  loading={removingId === r.id}
                  className="h-6 w-6 shrink-0"
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form onSubmit={handleAdd} className="flex items-center gap-1.5">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Add recipient email"
            className="h-7 flex-1 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink focus:border-primary focus:outline-none"
          />
          <Button type="submit" size="sm" loading={adding} className="h-7 px-2 text-[11px]">
            <Plus size={12} />
          </Button>
        </form>
      )}

      {editable && (
        <Button variant="secondary" size="sm" onClick={handleSendNow} loading={sending} className="mt-0.5 w-fit text-[11px]">
          <Send size={12} className="mr-1" /> Send Report Now
        </Button>
      )}

      {lastSend && (
        <p className="text-[11px] text-ink-muted">
          Last sent {timeAgo(lastSend.sent_at)} to {lastSend.recipient_emails.length} recipient{lastSend.recipient_emails.length === 1 ? "" : "s"}
          {lastSend.status === "sent" && lastSend.row_count != null && ` (${lastSend.row_count} sites)`}
          {lastSend.status === "failed" && " — failed"}
          {lastSend.status === "skipped_no_recipients" && " — skipped (no recipients)"}
        </p>
      )}
    </div>
  );
}
