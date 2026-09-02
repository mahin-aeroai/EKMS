import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "./supabase-server";

/**
 * The signed-in LFG Connect user's identity, resolved one of two ways:
 *
 *   1. A real lfg_partner_users row (joined to lfg_partners) -- the
 *      original, still-default case: an external installation-partner
 *      account, scoped to their own partner's sites everywhere.
 *   2. No partner row, but a STAFF profile (role admin/editor/viewer)
 *      with lfg_connect_access = true -- an MMDI staff member an admin
 *      has selectively opted into signing in here too (see
 *      supabase-lfg-site-management-schema.sql's STEP 1b and
 *      Administration's "Users & roles" table for where that flag is
 *      set). This is NOT automatic for every staff account -- unflagged
 *      staff visiting /lfg/* still fall through to null, same as before.
 *
 * `isStaff` tells every caller which of the two this is; `staffRole` is
 * only set for case 2, and is what actually decides write access within
 * this surface (see LfgPartnerSiteClient.tsx's editable/canApprove/
 * canWriteProduction/canDelete derivation) -- it deliberately mirrors
 * what the real lfg_* RLS policies already grant that role (admin/editor:
 * full operational write; viewer: read-only), not a separate UI-level
 * gate that could drift from the database's own answer.
 *
 * Used by every /lfg/* Server Component page -- see
 * src/app/lfg/(app)/layout.tsx, which fetches this once and passes it
 * down via LfgUserContext (src/lib/LfgUserContext.tsx) for Client
 * Components underneath. Direct structural mirror of getPortalIdentity()
 * (portal-auth.ts) -- see that file's comments for the fuller reasoning
 * behind the cache() wrapping (it's what keeps the layout AND the page
 * from each paying their own auth.getUser() + lfg_partner_users round
 * trip).
 *
 * Returns null if there's no session, or the session belongs to someone
 * who is neither a partner nor an lfg_connect_access-flagged staff member
 * -- including ordinary MMDI staff previewing /lfg/* unflagged (see
 * supabase-middleware.ts's comment on why staff aren't blocked from
 * reaching this surface at the routing level, same as /portal/*, even
 * though most of them will land on the "No LFG partner account here"
 * fallback here). Callers should treat null as "render the signed-out /
 * not-authorized state", not throw.
 *
 * SECURITY REMINDER (financial isolation): this deliberately selects only
 * operational lfg_partner_users/lfg_partners/profiles columns. Never
 * widen this query -- or any /lfg/* page's query -- to join
 * lfg_site_financials or lfg_installation_costs "for convenience". Those
 * tables have zero RLS grant to the lfg_partner role at all (see
 * supabase-lfg-site-management-schema.sql's header comment) -- a partner
 * session querying them returns no rows today regardless, and even an
 * lfg_connect_access-flagged staff session should NOT surface financials
 * on this lightweight surface (that stays in the full internal app) --
 * but this file is exactly the kind of shared, every-page helper where a
 * "just add one more join" change would be easy to make and easy to miss
 * in review, so it's worth saying plainly: don't.
 */
export interface LfgIdentity {
  userId: string;
  email: string;
  fullName: string | null;
  // Null when this is a staff sign-in (case 2 above) -- there is no single
  // partner to scope to; pages that would otherwise `.eq("partner_id", ...)`
  // branch on `isStaff` instead. Non-null (a real uuid) for a partner.
  partnerId: string | null;
  partnerName: string;
  isStaff: boolean;
  staffRole: "admin" | "editor" | "viewer" | null;
  // "MMDI" itself is registered as an lfg_partners row (the installation
  // partner on its own sites) but is ALSO the org that runs creative,
  // production, and dispatch for every site as staff -- this flag (set
  // via supabase-lfg-full-lifecycle-partner-migration.sql's closing
  // UPDATE, on lfg_partners.is_full_lifecycle_partner) lets that one
  // partner login do those stages from LFG Connect too, without opening
  // the same access to any other, genuinely external installation
  // partner. Always false for a staff sign-in (case 2 above) -- staff
  // already get everything via isStaff/staffRole, this field is only
  // meaningful on the real-partner branch. See LfgPartnerSiteClient.tsx's
  // canWriteProduction/canMarkCreative and its status-picker filter.
  isFullLifecyclePartner: boolean;
}

export const getLfgIdentity = cache(async function getLfgIdentity(
  supabase?: SupabaseClient
): Promise<LfgIdentity | null> {
  const client = supabase ?? (await createServerSupabaseClient());

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const { data } = await client
    .from("lfg_partner_users")
    .select("id, full_name, partner_id, lfg_partners(name, is_full_lifecycle_partner)")
    .eq("id", user.id)
    .maybeSingle();

  if (data) {
    // PostgREST returns the embedded to-one relationship as an object here
    // (partner_id is not-null per-user), but types it as possibly-array in
    // the generic case -- narrow defensively, same as getPortalIdentity.
    const partner = Array.isArray(data.lfg_partners) ? data.lfg_partners[0] : data.lfg_partners;

    return {
      userId: user.id,
      email: user.email ?? "",
      fullName: (data.full_name as string | null) ?? null,
      partnerId: data.partner_id as string,
      partnerName: (partner as { name?: string } | null)?.name ?? "",
      isStaff: false,
      staffRole: null,
      isFullLifecyclePartner: (partner as { is_full_lifecycle_partner?: boolean } | null)?.is_full_lifecycle_partner ?? false,
    };
  }

  // Not a partner account -- the selective staff opt-in (case 2 above).
  const { data: profile } = await client
    .from("profiles")
    .select("role, lfg_connect_access")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profile?.lfg_connect_access &&
    (profile.role === "admin" || profile.role === "editor" || profile.role === "viewer")
  ) {
    return {
      userId: user.id,
      email: user.email ?? "",
      fullName: null,
      partnerId: null,
      partnerName: "MMDI Staff",
      isStaff: true,
      staffRole: profile.role,
      isFullLifecyclePartner: false,
    };
  }

  return null;
});
