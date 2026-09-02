"use client";

import { useState } from "react";
import { Check, Truck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { LFG_STATUSES, lfgStatusLabel, type LfgStatus } from "@/lib/lfgStatus";

// One-tap Delivered/Installed buttons for a site card's Cards view (see
// LfgSiteCardGrid's renderQuickActions prop) -- despite the filename/
// "Partner" in the name, not partner-only: the LFG partner home page
// (app/lfg/(app)/page.tsx) was its first caller, but the staff Site Master
// (app/workspaces/lfg/page.tsx) wires it in too, gated on `editable`
// (canWrite(role)) there instead of ownership. Mirrors StatusSwapControl's
// already-established pattern (workspaces/lfg/status-sheet/page.tsx) --
// calls lfg_change_site_status directly, reports back via onChanged for an
// immediate in-place card update, no refetch. Deliberately narrower than
// StatusSwapControl's full 18-status picker: only the two transitions
// closest to "done" (Delivered, then Installed) -- everything earlier
// (creative receipt, production, dispatch) is staff/full-lifecycle-partner
// territory handled via the site's own Change Status dropdown, not a card
// shortcut. showDelivered is gated on the Shipped benchmark already being
// crossed (rank >= "dispatched") specifically so this button never jumps
// ahead of the benchmark checklist shown right above it on the same card.
// For a REGULAR (non-full-lifecycle) partner this also happens to line up
// with lfg_sites_guard_partner_update() in supabase-lfg-site-management-
// schema.sql, which blocks that account from setting production_pending/
// in_production/ready_for_dispatch/dispatched/in_transit anyway -- but for
// staff and full-lifecycle-partner callers the gating here is a UI choice
// (keep this one button "last-mile only"), not something the trigger
// itself would reject if it did offer earlier transitions.
//
// Only ever rendered by the caller for a site the viewer may write to --
// the partner page checks ownership, the staff page checks `editable` --
// this component itself doesn't re-check either, since lfg_sites_update's
// RLS (and the guard trigger above, for a restricted partner) would reject
// a write it isn't allowed to make anyway; the caller-side check just
// avoids showing a button that would visibly fail.
export function LfgPartnerQuickStatusButtons({
  siteId,
  siteCode,
  outletName,
  status,
  onChanged,
}: {
  siteId: string;
  siteCode: string;
  outletName: string;
  status: string;
  onChanged: (id: string, newStatus: string) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState<LfgStatus | null>(null);
  // A tap is a proposal, not the change itself -- confirming (Srinivas's
  // request: "before anyone press the update button there should be a
  // way to go back") is what actually fires setStatus() below. null =
  // no confirmation dialog open.
  const [confirming, setConfirming] = useState<LfgStatus | null>(null);

  const rank = LFG_STATUSES.indexOf(status as LfgStatus);
  // Bug fixed here (Srinivas, screenshot of "iPlanet @ ByPass" etc.: "the
  // green updates are showing as site survey completed so next step
  // supose to be creative receipt but instead the update button shows as
  // delivery update"): this used to be `rank < deliveredRank`, which is
  // true for EVERY status before Delivered -- Survey Completed included --
  // so "Mark Delivered" showed as the very first action on a brand new
  // site, skipping Creative Received/Printed/Shipped entirely. Those three
  // steps aren't this component's business (creative receipt is a toggle
  // on the Survey tab; Printed/Shipped are site_status transitions a
  // regular partner is blocked from setting at all -- see
  // LFG_PARTNER_RESTRICTED_STATUSES -- and a full-lifecycle partner sets
  // via the site's own Change Status dropdown, which already lists every
  // status). "Mark Delivered" only belongs here once Shipped is the last
  // benchmark actually crossed -- i.e. rank has reached "dispatched" (the
  // Shipped benchmark's own throughStatus in lfgStatus.ts) -- matching the
  // same benchmark checklist already shown on the card, so the one quick
  // button here never contradicts it.
  const shippedRank = LFG_STATUSES.indexOf("dispatched");
  const deliveredRank = LFG_STATUSES.indexOf("delivered");
  const installedRank = LFG_STATUSES.indexOf("installation_completed");
  const showDelivered = rank >= shippedRank && rank < deliveredRank;
  const showInstalled = rank >= deliveredRank && rank < installedRank;

  if (!showDelivered && !showInstalled) return null;

  async function setStatus(target: LfgStatus) {
    setSaving(target);
    const { error } = await supabase.rpc("lfg_change_site_status", {
      p_site_id: siteId,
      p_new_status: target,
      p_remarks: null,
    });
    setSaving(null);
    if (error) {
      toast("danger", `Couldn't update ${siteCode}: ${error.message}`);
      return;
    }
    onChanged(siteId, target);
    toast("success", `${outletName} → ${lfgStatusLabel(target)}`);
  }

  function handleConfirm() {
    const target = confirming;
    setConfirming(null);
    if (target) void setStatus(target);
  }

  return (
    <div className="flex gap-2">
      {showDelivered && (
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          loading={saving === "delivered"}
          disabled={saving !== null}
          onClick={() => setConfirming("delivered")}
        >
          <Truck size={14} className="mr-1.5" />
          Mark Delivered
        </Button>
      )}
      {showInstalled && (
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          loading={saving === "installation_completed"}
          disabled={saving !== null}
          onClick={() => setConfirming("installation_completed")}
        >
          <Check size={14} className="mr-1.5" />
          Mark Installed
        </Button>
      )}
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming ? `Mark as ${lfgStatusLabel(confirming)}?` : ""}
        onConfirm={handleConfirm}
        confirmLabel="Confirm"
      >
        {outletName} ({siteCode}) will move to {confirming ? lfgStatusLabel(confirming) : ""}. This updates the site
        right away — Cancel here first if you&rsquo;re not sure.
      </Dialog>
    </div>
  );
}
