import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public")
  );
}

/**
 * Route handlers authenticate themselves via createRouteSupabaseClient, which
 * accepts either a session cookie (browser) or an Authorization: Bearer header
 * (iOS app). Middleware must not touch them.
 *
 * Two reasons. A Bearer request carries no cookie, so this middleware sees no
 * user and 307s to /login -- the mobile client never reaches the handler.
 * And even for the browser, redirecting an API call to an HTML login page is
 * the wrong failure: fetch() follows the redirect and the caller gets 200 plus
 * a page of markup instead of a 401 it can act on.
 *
 * This is not "make /api public" -- every handler still checks auth and
 * returns 401 itself. It moves the check to the layer that can express the
 * right answer.
 */
function isApiPath(pathname: string) {
  return pathname.startsWith("/api");
}

/**
 * Refreshes the Supabase auth session cookie on every request (required by
 * @supabase/ssr so the session doesn't expire mid-visit) and redirects
 * signed-out users to /login for every route except the public ones above.
 * Called from the root middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  // Skip before the getUser() round trip -- no point resolving a cookie
  // session for a request that authenticates by header.
  if (isApiPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // A user can be signed in at the password-only level (aal1) but have a
  // verified authenticator app enrolled on their account, which requires
  // stepping up to aal2 before they're treated as fully authenticated.
  // Without this check, someone who enrolled MFA could just navigate
  // straight to a protected URL right after entering their password,
  // skipping the code prompt entirely and defeating the point of having
  // enrolled — the login page's own MFA step-up (see beginMfaChallenge in
  // src/app/login/page.tsx) only runs if the person actually goes through
  // that page. getAuthenticatorAssuranceLevel reads the current session's
  // JWT claims (no extra network round trip beyond the getUser() above).
  if (user && !isPublicPath(pathname)) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirectTo", pathname);
      loginUrl.searchParams.set("mfa", "1");
      return NextResponse.redirect(loginUrl);
    }
  }

  // Deliberately NOT redirecting already-signed-in users away from /login
  // here. Invite and password-recovery emails link to /login with an
  // access_token in the URL *hash*, which never reaches the server (hashes
  // aren't sent over HTTP) — only client-side JS can read it. If this
  // middleware bounced signed-in requests away from /login server-side,
  // opening someone else's invite/recovery link in a browser that already
  // has an active session (e.g. an admin testing it) would redirect straight
  // into the app as the ALREADY-signed-in user, silently discarding the
  // recovery token. The "skip /login if already signed in" nicety is instead
  // handled client-side in src/app/login/page.tsx, where it can check
  // whether an invite/recovery token is present before deciding to redirect.

  return response;
}
