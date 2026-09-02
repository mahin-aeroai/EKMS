"use client";

import { useState } from "react";
import { Check, Truck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { LFG_STATUSES, lfgStatusLabel, type LfgStatus } from "@/lib/lfgStatus";

// One-tap Delivered/Installed buttons for the LFG partner home page's Cards
// view (see LfgSiteCardGrid's renderQuickActions prop). Mirrors
// StatusSwapControl's already-established pattern (workspaces/lfg/status-
// sheet/page.tsx) -- calls lfg_change_site_status directly, no confirm
// dialog, reports back via onChanged for an immediate in-place card update,
// no refetch. Deliberately narrower than StatusSwapControl's full 18-status
// picker: only the two transitions a partner is already allowed to make on
// their own site without MMDI (verified directly against
// lfg_sites_guard_partner_update() in supabase-lfg-site-management-
// schema.sql -- it blocks a partner from touching creative_received_at/by
// or setting production_pending/in_production/ready_for_dispatch/
// dispatched/in_transit, but not 'delivered' or any installation_* status).
// No new RLS/trigger changes needed for these two calls to work.
//
// Only ever rendered by the caller for the viewer's OWN sites (see
// apps/web/src/app/lfg/(app)/page.tsx's renderQuickActions wiring) -- this
// component itself doesn't re-check ownership, since lfg_sites_update's RLS
// (partner_id = lfg_partner_id()) would reject a write to someone else's
// site anyway; the caller-side check just avoids showing a button that
// would visibly fail.
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
