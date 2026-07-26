import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Per-request Supabase client for Route Handlers that must serve BOTH the web
 * app and the iOS app.
 *
 * Why this exists: createServerSupabaseClient() in supabase-server.ts resolves
 * the session from request cookies. That works for the browser, where
 * middleware.ts refreshes the auth cookie on every request. A React Native
 * client has no cookie jar scoped to this domain -- it holds the session in
 * expo-secure-store and sends it as `Authorization: Bearer <access_token>`.
 * Without this helper every mobile call to /api/ai-copilot,
 * /api/knowledge-files/signed-url and /api/lfg-surveys/signed-url returns 401.
 *
 * Order matters: check the header first, fall back to cookies. A browser
 * request never sets Authorization, so web behaviour is unchanged.
 *
 * This still uses the ANON key, so every RLS policy applies exactly as before.
 * Do not be tempted to reach for the service-role key here -- these routes are
 * reachable from a device.
 */

const FALLBACK_SUPABASE_URL = "https://placeholder.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "placeholder-anon-key";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

export async function createRouteSupabaseClient(req: Request): Promise<SupabaseClient> {
  const auth = req.headers.get("authorization");

  if (auth?.startsWith("Bearer ")) {
    return createClient(url(), anon(), {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const cookieStore = await cookies();

  return createServerClient(url(), anon(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component render -- middleware already refreshed the cookie.
        }
      },
    },
  });
}

/**
 * Migration -- all three handlers name their argument `request`:
 *
 *   - import { createServerSupabaseClient } from "@/lib/supabase-server";
 *   + import { createRouteSupabaseClient } from "@/lib/supabase-route";
 *
 *   - const supabase = await createServerSupabaseClient();
 *   + const supabase = await createRouteSupabaseClient(request);
 *
 * ai-copilot/route.ts needs a THIRD edit that is easy to miss -- line 267:
 *
 *   - type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;
 *   + type Supabase = Awaited<ReturnType<typeof createRouteSupabaseClient>>;
 *
 * Without it the build fails: the alias references an import that no longer
 * exists. The explicit Promise<SupabaseClient> return type above keeps that
 * alias resolving to a single client type rather than a union of the cookie
 * and bearer branches, which would break the three helpers typed against it.
 *
 * Leave supabase-server.ts alone. Server Components still use it and they
 * genuinely only ever see cookies.
 */

/**
 * Resolve the caller and enforce the MFA step-up that the middleware used to.
 *
 * supabase-middleware.ts checks getAuthenticatorAssuranceLevel() and bounces an
 * aal1 session to /login?mfa=1 -- but it now skips /api entirely (so Bearer
 * requests are not redirected to an HTML page), and no route ever checked aal2
 * itself. Net effect without this: anyone holding a password-only session,
 * browser or device, can call these routes and never be asked for their TOTP
 * code, even though the account has an authenticator enrolled.
 *
 * 403 rather than 401 is deliberate: the credentials are valid, the assurance
 * level is not, so a client should prompt for a code rather than for a
 * password. The mobile app has no TOTP screen yet, so it should surface the
 * message and send the person to the web app to complete the step-up.
 */
export async function requireVerifiedUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "mfa_required", message: "This account has an authenticator enrolled. Complete the code prompt before using the API." },
        { status: 403 }
      ),
    };
  }

  return { user, response: null };
}
