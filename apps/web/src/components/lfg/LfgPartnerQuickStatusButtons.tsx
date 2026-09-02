"use client";

import { useState } from "react";
import { Check, Truck } from "lucide-react";
import { Button } from "@/components/ui/Button";
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

  const rank = LFG_STATUSES.indexOf(status as LfgStatus);
  const deliveredRank = LFG_STATUSES.indexOf("delivered");
  const installedRank = LFG_STATUSES.indexOf("installation_completed");
  const showDelivered = rank >= 0 && rank < deliveredRank;
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

  return (
    <div className="flex gap-2">
      {showDelivered && (
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          loading={saving === "delivered"}
          disabled={saving !== null}
          onClick={() => setStatus("delivered")}
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
          onClick={() => setStatus("installation_completed")}
        >
          <Check size={14} className="mr-1.5" />
          Mark Installed
        </Button>
      )}
    </div>
  );
}
