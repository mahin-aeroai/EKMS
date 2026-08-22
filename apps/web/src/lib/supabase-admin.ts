import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS entirely. Two legitimate uses
 * in this codebase so far (see OPERATIONS.md section 6):
 * 1. The Razorpay webhook (src/app/api/portal/razorpay-webhook/route.ts) is
 *    called by Razorpay's own servers, not a signed-in browser or the
 *    mobile app, so there is no user session for RLS to evaluate against at
 *    all — something has to be allowed to mark an order paid on Razorpay's
 *    say-so.
 * 2. Staff-created portal logins (src/app/api/portal/companies/[companyId]/
 *    create-login/route.ts) need auth.admin.createUser, which is a Supabase
 *    Admin API with no RLS-governed equivalent at all — it can only ever be
 *    called with the service-role key, by design, regardless of who's
 *    signed in. The route itself still checks the caller is admin/editor
 *    before touching it.
 *
 * DO NOT import this from anywhere else. In particular:
 * - Never import it into a Client Component, or anything that ends up in
 *   the client JS bundle — the key must never leave the server.
 * - Never use it for a request that has a real signed-in user; use
 *   createRouteSupabaseClient (supabase-route.ts) so RLS keeps doing its
 *   job for every ordinary authenticated request.
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY, a Vercel env var Srinivas creates
 * directly from the Supabase dashboard (Project Settings -> API) — same
 * hand-off pattern as every other credential in this project (see
 * OPERATIONS.md section 6). Returns null (never throws) if it isn't set,
 * so the webhook route can degrade to a clear 503 instead of crashing the
 * whole file at import time.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
