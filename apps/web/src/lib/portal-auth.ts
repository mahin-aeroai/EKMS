import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "./supabase-server";

/**
 * The signed-in portal (customer) user's identity + company, resolved from
 * portal_users joined to portal_companies. Used by every /portal/* Server
 * Component page — see src/app/portal/layout.tsx, which fetches this once
 * and passes it down via PortalUserContext (src/lib/PortalUserContext.tsx)
 * for Client Components underneath.
 *
 * Returns null if there's no session, or the session belongs to someone
 * with no portal_users row (an internal staff account previewing /portal/*
 * — see supabase-middleware.ts's comment on why staff aren't blocked from
 * this surface). Callers should treat null as "render the signed-out /
 * not-a-portal-account state", not throw.
 *
 * Wrapped in React's cache() -- both the layout AND the page for every
 * /portal/* route call this independently (App Router gives layouts no way
 * to pass fetched data down into the page it wraps), which used to mean two
 * full round trips (auth.getUser() + a portal_users query, each) for a
 * single request. cache() memoizes per-request by arguments; every real
 * call site below invokes this with no arguments, so the second and third
 * calls in the same request resolve instantly from the first call's result
 * instead of hitting Supabase again. This matters most right after sign-in,
 * where these calls stack on top of the auth checks middleware already ran
 * -- shaving round trips here is what keeps that combined chain from
 * running long enough to fail outright.
 */
export interface PortalIdentity {
  userId: string;
  email: string;
  fullName: string | null;
  companyId: string;
  companyName: string;
}

export const getPortalIdentity = cache(async function getPortalIdentity(
  supabase?: SupabaseClient
): Promise<PortalIdentity | null> {
  const client = supabase ?? (await createServerSupabaseClient());

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const { data } = await client
    .from("portal_users")
    .select("id, full_name, company_id, portal_companies(name)")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;

  // PostgREST returns the embedded to-one relationship as an object here
  // (company_id is not-null + unique-enough per user in practice), but
  // types it as possibly-array in the generic case — narrow defensively.
  const company = Array.isArray(data.portal_companies) ? data.portal_companies[0] : data.portal_companies;

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: (data.full_name as string | null) ?? null,
    companyId: data.company_id as string,
    companyName: (company as { name?: string } | null)?.name ?? "",
  };
});
