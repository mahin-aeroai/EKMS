"use client";

import { useState } from "react";
import { Check, Truck, Inbox, Printer, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { LFG_STATUSES, lfgStatusLabel, type LfgStatus } from "@/lib/lfgStatus";

// The single "what's next" button for a site card's Cards view (see
// LfgSiteCardGrid's renderQuickActions prop) -- despite the filename/
// "Partner" in the name, not partner-only: the LFG partner home page
// (app/lfg/(app)/page.tsx) was its first caller, but the staff Site Master
// (app/workspaces/lfg/page.tsx) wires it in too, gated on `editable`
// (canWrite(role)) there instead of ownership.
//
// Srinivas's own framing of this, twice now: "at any point of time there
// is only one button with update" following Site Survey Completed ->
// Creative Received -> Printed -> Shipped -> Delivered -> Installed, and
// (after the previous fix here narrowed this to Delivered/Installed only,
// so it stopped contradicting the benchmark checklist) "the update button
// is missing some times and status in green color still same" -- a site
// stuck at Survey Completed correctly showed no premature "Mark
// Delivered" any more, but then had NO button at all to move it forward,
// which isn't what he wanted either. This component now covers the whole
// sequence: exactly one step at a time, computed from the same benchmark
// order lfgStatus.ts's own LFG_BENCHMARKS uses, so it's never out of sync
// with the checklist rendered right above it on the same card.
//
// Two different write shapes hide behind "one button" here: Creative
// Received isn't a site_status value at all -- it's the separate
// creative_received_at/by columns (same UPDATE LfgSiteWorkspaceClient's
// Survey tab handleMarkCreativeReceived already does) -- while
// Printed/Shipped/Delivered/Installed are real lfg_change_site_status
// transitions, target status per LFG_BENCHMARKS' own throughStatus
// (in_production/dispatched/delivered/installation_completed -- skipping
// the finer-grained production_pending/ready_for_dispatch/
// installation_planned/installation_in_progress states the benchmark
// checklist already collapses past).
//
// `canAdvanceEarlyStages` gates the first three steps (Creative Received,
// Printed, Shipped) -- Delivered and Installed stay available to
// everyone this is rendered for, same as before. Pass true for staff
// (editable) and a full-lifecycle partner (identity.isFullLifecyclePartner
// -- see lfg-auth.ts), false for a regular partner: that mirrors
// lfg_sites_guard_partner_update() in supabase-lfg-site-management-
// schema.sql exactly, which blocks a regular partner from touching
// creative_received_at/by or setting production_pending/in_production/
// ready_for_dispatch/dispatched/in_transit at all -- a regular partner
// passing false here just means this component politely shows nothing
// until Shipped is already crossed by someone else, instead of a button
// that would fail server-side.
//
// Only ever rendered by the caller for a site the viewer may write to --
// the partner page checks ownership, the staff page checks `editable` --
// this component itself doesn't re-check either, since lfg_sites_update's
// RLS (and the guard trigger above, for a restricted partner) would reject
// a write it isn't allowed to make anyway; the caller-side check just
// avoids showing a button that would visibly fail.
type NextAction =
  | { kind: "creative" }
  | { kind: "status"; target: LfgStatus; label: string };

export function LfgPartnerQuickStatusButtons({
  siteId,
  siteCode,
  outletName,
  status,
  creativeReceivedAt,
  canAdvanceEarlyStages = false,
  onChanged,
  onCreativeReceived,
}: {
  siteId: string;
  siteCode: string;
  outletName: string;
  status: string;
  // Optional -- only needed to decide whether Creative Received is
  // already crossed (see creativeCrossed below). A caller that never
  // passes it just means Creative Received is treated as not-yet-crossed
  // until rank alone gets there (production_pending onward), same as
  // lfgBenchmarkStatus()'s own fallback when it isn't fetched.
  creativeReceivedAt?: string | null;
  canAdvanceEarlyStages?: boolean;
  onChanged: (id: string, newStatus: string) => void;
  // Optional -- only called after a successful "Mark Creative Received";
  // a caller that doesn't pass this just won't update its own row's
  // creative_received_at in place (the card's benchmark strip catches up
  // on the next real fetch instead).
  onCreativeReceived?: (id: string) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  // A tap is a proposal, not the change itself -- confirming (Srinivas's
  // request: "before anyone press the update button there should be a
  // way to go back") is what actually fires the write below. null = no
  // confirmation dialog open.
  const [confirming, setConfirming] = useState<NextAction | null>(null);

  const rank = LFG_STATUSES.indexOf(status as LfgStatus);
  if (rank < 0) return null;

  const productionPendingRank = LFG_STATUSES.indexOf("production_pending");
  const inProductionRank = LFG_STATUSES.indexOf("in_production");
  const dispatchedRank = LFG_STATUSES.indexOf("dispatched");
  const deliveredRank = LFG_STATUSES.indexOf("delivered");
  const installedRank = LFG_STATUSES.indexOf("installation_completed");

  // Same "crossed" definition as lfgBenchmarkStatus() in lfgStatus.ts --
  // Creative Received counts as crossed either from its own timestamp or
  // because rank already passed it (a site bulk-imported straight into
  // production, say, without ever going through the explicit toggle).
  const creativeCrossed = Boolean(creativeReceivedAt) || rank >= productionPendingRank;
  const printedCrossed = rank >= inProductionRank;
  const shippedCrossed = rank >= dispatchedRank;
  const deliveredCrossed = rank >= deliveredRank;
  const installedCrossed = rank >= installedRank;

  let next: NextAction | null = null;
  if (installedCrossed) {
    next = null;
  } else if (deliveredCrossed) {
    next = { kind: "status", target: "installation_completed", label: "Installed" };
  } else if (shippedCrossed) {
    next = { kind: "status", target: "delivered", label: "Delivered" };
  } else if (canAdvanceEarlyStages) {
    if (printedCrossed) {
      next = { kind: "status", target: "dispatched", label: "Shipped" };
    } else if (creativeCrossed) {
      next = { kind: "status", target: "in_production", label: "Printed" };
    } else {
      next = { kind: "creative" };
    }
  }

  if (!next) return null;

  async function handleConfirm() {
    const action = confirming;
    setConfirming(null);
    if (!action) return;
    setSaving(true);
    if (action.kind === "creative") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("lfg_sites")
        .update({ creative_received_at: new Date().toISOString(), creative_received_by: user?.id ?? null })
        .eq("id", siteId);
      setSaving(false);
      if (error) {
        toast("danger", `Couldn't mark ${siteCode} creative received: ${error.message}`);
        return;
      }
      onCreativeReceived?.(siteId);
      toast("success", `${outletName} → Creative Received`);
      return;
    }
    const { error } = await supabase.rpc("lfg_change_site_status", {
      p_site_id: siteId,
      p_new_status: action.target,
      p_remarks: null,
    });
    setSaving(false);
    if (error) {
      toast("danger", `Couldn't update ${siteCode}: ${error.message}`);
      return;
    }
    onChanged(siteId, action.target);
    toast("success", `${outletName} → ${lfgStatusLabel(action.target)}`);
  }

  const icon =
    next.kind === "creative" ? (
      <Inbox size={14} className="mr-1.5" />
    ) : next.target === "in_production" ? (
      <Printer size={14} className="mr-1.5" />
    ) : next.target === "dispatched" ? (
      <PackageCheck size={14} className="mr-1.5" />
    ) : next.target === "installation_completed" ? (
      <Check size={14} className="mr-1.5" />
    ) : (
      <Truck size={14} className="mr-1.5" />
    );
  const buttonLabel = next.kind === "creative" ? "Mark Creative Received" : `Mark ${next.label}`;
  const confirmLabel = next.kind === "creative" ? "Creative Received" : next.label;

  return (
    <div className="flex gap-2">
      <Button
        variant="primary"
        size="sm"
        className="flex-1"
        loading={saving}
        disabled={saving}
        onClick={() => setConfirming(next)}
      >
        {icon}
        {buttonLabel}
      </Button>
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={`Mark as ${confirmLabel}?`}
        onConfirm={handleConfirm}
        confirmLabel="Confirm"
      >
        {outletName} ({siteCode}) will move to {confirmLabel}. This updates the site right away — Cancel here first
        if you&rsquo;re not sure.
      </Dialog>
    </div>
  );
}
