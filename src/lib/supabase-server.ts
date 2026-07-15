import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Per-request Supabase client for Server Components and Route Handlers.
 * Must be created fresh inside each request (never module-level/singleton)
 * because it reads the current request's cookies to resolve the signed-in
 * user's session — that's what lets RLS policies scoped to
 * `auth.role() = 'authenticated'` pass for server-side fetches.
 *
 * Usage (see src/app/workspaces/customer/page.tsx):
 *   const supabase = await createServerSupabaseClient();
 *   const { data } = await supabase.from("customers").select("*");
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
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
            // Called from a Server Component render — middleware.ts already
            // refreshes the session cookie on every request, so this is safe
            // to ignore here.
          }
        },
      },
    }
  );
}
