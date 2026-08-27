import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PORTAL_HOST } from "./portal-host";
import { LFG_HOST } from "./lfg-host";

const PUBLIC_PATHS = ["/login", "/portal/login", "/lfg/login"];

// Business-website policy pages (Shipping/Contact/Pricing/Terms/Privacy/
// Cancellation & Refunds) -- reachable with no session at all, deliberately,
// since Razorpay's own review of portal.mmdi.in as a registered website (and
// any real customer looking them up) needs them to load without an account.
// Physically under /portal/policies/* so the same portalHost rewrite that
// turns portal.mmdi.in/login into /portal/login also turns
// portal.mmdi.in/policies/shipping into /portal/policies/shipping -- see
// that rewrite below and portal-links-shared.ts's portalHref().
const PUBLIC_PATH_PREFIXES = ["/portal/policies"];

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public")
  );
}

/**
 * The customer portal (/portal/*) is a completely separate, invite-only
 * surface from the internal admin/editor/viewer app -- see
 * supabase-customer-portal-schema.sql's header comment for the full
 * reasoning. Same Supabase project/session mechanics (cookie-based auth,
 * same middleware refreshing it), but its own login page and its own
 * post-login home.
 */
function isPortalPath(pathname: string) {
  return pathname.startsWith("/portal");
}

/**
 * The LFG Connect partner portal (/lfg/*) -- same "completely separate,
 * invite-only surface" treatment as the customer portal above, for
 * lfg_partner accounts (external Basil/Apple LFG installation partners)
 * instead of portal_users (customer companies). See
 * supabase-lfg-site-management-schema.sql's header comment for why this
 * exists as its own role/table set rather than reusing 'portal'.
 */
function isLfgPath(pathname: string) {
  return pathname.startsWith("/lfg");
}

// PORTAL_HOST (imported above, from ./portal-host) is the Customer
// Portal's own subdomain. All /portal/* pages are physically unchanged --
// still real files under src/app/portal/... -- but on this hostname
// they're served WITHOUT the /portal prefix ever showing in the address
// bar, via the middleware rewrite below: portal.mmdi.in/login resolves to
// the same page as app.mmdi.in/portal/login, but the browser only ever
// shows "portal.mmdi.in/login". This requires a real DNS CNAME for
// "portal" pointed at Vercel, plus the domain added in Vercel's project
// settings -- see OPERATIONS.md section 8. Cookies need no special
// handling: portal (customer) accounts only ever sign in on this
// subdomain in the first place, so their session cookie is naturally
// scoped here with no cross-domain sharing required. Internal
// Link/router.push targets within the portal pages themselves use this
// same constant (via portal-links.ts's usePortalHost) to build clean,
// host-appropriate URLs -- see that file for why.

// The pre-subdomain production host. Old /portal/* links here now
// redirect to the clean subdomain URL (see the canonicalize step below) --
// scoped to exactly this hostname so ekms.vercel.app and any Vercel
// preview deployment keep serving /portal/* exactly as before, unaffected,
// as a fallback that never depends on the custom subdomain's DNS being
// healthy.
const LEGACY_APP_HOST = "app.mmdi.in";

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

  const hostname = request.nextUrl.hostname;
  const onPortalHost = hostname === PORTAL_HOST;
  const onLfgHost = hostname === LFG_HOST;
  // The exact path this request came in on -- used for anything the user
  // will actually SEE (redirect targets, the ?redirectTo= param). Never
  // reassigned, unlike `pathname` below.
  const incomingPathname = request.nextUrl.pathname;

  // Canonicalize: an old app.mmdi.in/portal/* (or /lfg/*) link now belongs
  // at portal.mmdi.in/* (or lfgconnect.mmdi.in/*) with the prefix dropped.
  // Redirect rather than silently keep serving the old path, so there's
  // exactly one canonical URL going forward. Runs before any auth check --
  // an unauthenticated hit here still lands on the right host before the
  // login redirect below ever has to run.
  if (hostname === LEGACY_APP_HOST && isPortalPath(incomingPathname)) {
    const target = new URL(request.url);
    target.hostname = PORTAL_HOST;
    target.pathname = incomingPathname.slice("/portal".length) || "/";
    return NextResponse.redirect(target, 308);
  }
  if (hostname === LEGACY_APP_HOST && isLfgPath(incomingPathname)) {
    const target = new URL(request.url);
    target.hostname = LFG_HOST;
    target.pathname = incomingPathname.slice("/lfg".length) || "/";
    return NextResponse.redirect(target, 308);
  }

  // portal.mmdi.in / lfgconnect.mmdi.in serve the exact same pages that
  // live under /portal/* / /lfg/* in the app's file tree, just without
  // that prefix showing in the URL. `pathname` becomes the REWRITTEN,
  // prefixed path from here on -- every check below (isPublicPath,
  // isPortalPath/isLfgPath, the profile-role redirect) reasons about this
  // one, so the same logic works unchanged whether the effective path
  // came from app.mmdi.in/portal/x (or /lfg/x) directly, or from the
  // subdomain being rewritten to it.
  let pathname = incomingPathname;
  let rewriteTarget: URL | null = null;
  if (onPortalHost && !isPortalPath(pathname)) {
    pathname = "/portal" + (pathname === "/" ? "" : pathname);
    rewriteTarget = new URL(request.url);
    rewriteTarget.pathname = pathname;
  } else if (onLfgHost && !isLfgPath(pathname)) {
    pathname = "/lfg" + (pathname === "/" ? "" : pathname);
    rewriteTarget = new URL(request.url);
    rewriteTarget.pathname = pathname;
  }

  let response = rewriteTarget ? NextResponse.rewrite(rewriteTarget, { request }) : NextResponse.next({ request });

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
          response = rewriteTarget ? NextResponse.rewrite(rewriteTarget, { request }) : NextResponse.next({ request });
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

  const portalPath = isPortalPath(pathname);
  const lfgPath = isLfgPath(pathname);
  // The clean, host-appropriate login path a redirect should actually send
  // the browser to -- "/login" on the relevant subdomain (rewritten
  // internally to /portal/login or /lfg/login), the /portal- or /lfg-
  // prefixed path everywhere else (app.mmdi.in preview access,
  // ekms.vercel.app, any Vercel preview deployment).
  const loginPath = portalPath
    ? onPortalHost
      ? "/login"
      : "/portal/login"
    : lfgPath
      ? onLfgHost
        ? "/login"
        : "/lfg/login"
      : "/login";

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = loginPath;
    loginUrl.searchParams.set("redirectTo", incomingPathname);
    return NextResponse.redirect(loginUrl);
  }

  // Both checks below used to run as two separate blocks, each doing its
  // own Supabase round trip (MFA assurance level, then profile role) --
  // fetch the profile once here and let it decide which of the two checks
  // actually applies, instead of always paying for both. This isn't just
  // tidiness: stacked on top of getUser() above and everything a portal
  // page's Server Components fetch afterward (see getPortalIdentity's
  // comment in portal-auth.ts), every extra sequential round trip here
  // adds to how long a signed-in request takes to resolve -- long enough,
  // occasionally, to fail outright rather than render.
  if (user && !isPublicPath(pathname)) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

    // Keep the two surfaces apart: a portal (customer) account that somehow
    // navigates to an internal URL gets sent back to their own home instead
    // of rendering an internal page shell with no data (RLS already
    // returns zero rows for them there — this is about not leaking the
    // internal app's structure/UI to an external account, not the actual
    // security boundary). Staff accounts are deliberately NOT blocked from
    // visiting /portal/* — useful for previewing exactly what a customer
    // sees.
    if (profile?.role === "portal") {
      if (!portalPath) {
        const portalHome = request.nextUrl.clone();
        portalHome.pathname = onPortalHost ? "/" : "/portal";
        portalHome.search = "";
        return NextResponse.redirect(portalHome);
      }
      // Portal (customer) accounts are never given an authenticator to
      // enroll (see below) — skip the MFA round trip entirely for them
      // rather than making it and finding out it never applies.
    } else if (profile?.role === "lfg_partner") {
      // Same treatment as the portal branch above, for LFG partner
      // accounts: keep them inside /lfg/* and nowhere else (this also
      // covers a partner wandering onto /portal/* — !lfgPath is true
      // there too, so they bounce back to their own home exactly like a
      // portal account bouncing off an internal URL).
      if (!lfgPath) {
        const lfgHome = request.nextUrl.clone();
        lfgHome.pathname = onLfgHost ? "/" : "/lfg";
        lfgHome.search = "";
        return NextResponse.redirect(lfgHome);
      }
      // LFG partner accounts are never given an authenticator to enroll
      // either — skip the MFA round trip for the same reason as portal.
    } else {
      // A user can be signed in at the password-only level (aal1) but have
      // a verified authenticator app enrolled on their account, which
      // requires stepping up to aal2 before they're treated as fully
      // authenticated. Without this check, someone who enrolled MFA could
      // just navigate straight to a protected URL right after entering
      // their password, skipping the code prompt entirely and defeating
      // the point of having enrolled — the login page's own MFA step-up
      // (see beginMfaChallenge in src/app/login/page.tsx) only runs if the
      // person actually goes through that page.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = loginPath;
        loginUrl.searchParams.set("redirectTo", incomingPathname);
        loginUrl.searchParams.set("mfa", "1");
        return NextResponse.redirect(loginUrl);
      }
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
