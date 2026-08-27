import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "./supabase-server";

/**
 * The signed-in LFG partner user's identity + partner org, resolved from
 * lfg_partner_users joined to lfg_partners. Used by every /lfg/* Server
 * Component page -- see src/app/lfg/(app)/layout.tsx, which fetches this
 * once and passes it down via LfgUserContext (src/lib/LfgUserContext.tsx)
 * for Client Components underneath. Direct structural mirror of
 * getPortalIdentity() (portal-auth.ts) -- see that file's comments for
 * the fuller reasoning behind the cache() wrapping (it's what keeps the
 * layout AND the page from each paying their own auth.getUser() +
 * lfg_partner_users round trip).
 *
 * Returns null if there's no session, or the session belongs to someone
 * with no lfg_partner_users row -- including MMDI staff previewing
 * /lfg/* (see supabase-middleware.ts's comment on why staff aren't
 * blocked from this surface, same as /portal/*). Callers should treat
 * null as "render the signed-out / not-a-partner-account state", not
 * throw.
 *
 * SECURITY REMINDER (financial isolation): this deliberately selects only
 * operational lfg_partner_users/lfg_partners columns. Never widen this
 * query -- or any /lfg/* page's query -- to join lfg_site_financials or
 * lfg_installation_costs "for convenience". Those tables have zero RLS
 * grant to the lfg_partner role at all (see
 * supabase-lfg-site-management-schema.sql's header comment) -- a partner
 * session querying them returns no rows today regardless, but this file
 * is exactly the kind of shared, every-page helper where a "just add one
 * more join" change would be easy to make and easy to miss in review, so
 * it's worth saying plainly: don't.
 */
export interface LfgIdentity {
  userId: string;
  email: string;
  fullName: string | null;
  partnerId: string;
  partnerName: string;
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
    .select("id, full_name, partner_id, lfg_partners(name)")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;

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
  };
});
