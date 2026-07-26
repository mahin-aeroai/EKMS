import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

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
