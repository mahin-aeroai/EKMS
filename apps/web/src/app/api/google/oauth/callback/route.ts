import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  scope: string;
  expires_in: number;
  token_type: string;
}

interface GmailProfile {
  emailAddress?: string;
}

/**
 * Google redirects the browser here as a plain top-level GET after consent
 * (or after the user cancels) -- there is no fetch/XHR involved, so this
 * must work off the session cookie the same way any other page navigation
 * does, and every outcome is a redirect back to /account rather than a JSON
 * body nobody is listening for.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const accountUrl = new URL("/account", request.url);

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");

  if (errorParam) {
    // e.g. the user clicked Cancel on Google's consent screen -- not a bug.
    accountUrl.searchParams.set("gmail_error", "denied");
    return NextResponse.redirect(accountUrl);
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    accountUrl.searchParams.set("gmail_error", "invalid_state");
    return NextResponse.redirect(accountUrl);
  }

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) {
    accountUrl.searchParams.set("gmail_error", "unauthorized");
    return NextResponse.redirect(accountUrl);
  }

  // Must exactly match the redirect_uri oauth/start sent to Google.
  const redirectUri = new URL("/api/google/oauth/callback", request.url).toString();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    accountUrl.searchParams.set("gmail_error", "token_exchange_failed");
    return NextResponse.redirect(accountUrl);
  }

  const tokens = (await tokenRes.json()) as GoogleTokenResponse;

  if (!tokens.refresh_token) {
    // oauth/start always sends prompt=consent specifically so this doesn't
    // happen -- fail loudly rather than store a connection with nothing to
    // refresh with.
    accountUrl.searchParams.set("gmail_error", "no_refresh_token");
    return NextResponse.redirect(accountUrl);
  }

  // gmail.readonly/gmail.compose grant no identity scope (no email, no
  // openid/profile) -- the generic oauth2/v2/userinfo endpoint returns
  // nothing useful for this token and adding userinfo.email would mean a
  // consent-screen change, forcing re-consent for everyone already
  // connected. The Gmail API's own profile endpoint returns the mailbox's
  // address and needs nothing beyond gmail.readonly, which is already
  // granted.
  const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = profileRes.ok ? ((await profileRes.json()) as GmailProfile) : null;
  if (!profile?.emailAddress) {
    accountUrl.searchParams.set("gmail_error", "userinfo_failed");
    return NextResponse.redirect(accountUrl);
  }
  const connectedEmail = profile.emailAddress.toLowerCase();

  // oauth/start's hd=mmdi.in is a chooser hint only -- a client can strip it
  // from the URL, so it enforces nothing by itself. Re-check the actual
  // connected mailbox's domain here, server-side, against the real profile
  // response.
  if (!connectedEmail.endsWith("@mmdi.in")) {
    accountUrl.searchParams.set("gmail_error", "wrong_domain");
    return NextResponse.redirect(accountUrl);
  }

  // Deliberately NOT checking connectedEmail against the signed-in MMDI ONE
  // user's own email. That comparison sounds like an obvious next control
  // (and was briefly added, then removed) but it isn't meaningful here:
  // MMDI ONE logins can be on any domain (e.g. an @icloud.com admin
  // account), while the check just above already forces the connected
  // mailbox to be @mmdi.in. Those two are drawn from different identity
  // systems by design -- there is no domain a legitimate sign-in email and
  // a legitimate connected mailbox are both guaranteed to share, so a
  // string comparison between them would reject real, correct connections
  // (an @icloud.com admin connecting their own @mmdi.in Gmail) rather than
  // catch anything. If someone is tempted to re-add this, they've
  // rediscovered the same dead end.

  const scopes = tokens.scope.split(" ").filter(Boolean);

  const { error: rpcError } = await supabase.rpc("google_tokens_set", {
    p_refresh_token: tokens.refresh_token,
    p_email: profile.emailAddress,
    p_scopes: scopes,
  });
  if (rpcError) {
    accountUrl.searchParams.set("gmail_error", "storage_failed");
    return NextResponse.redirect(accountUrl);
  }

  accountUrl.searchParams.set("gmail_connected", "1");
  return NextResponse.redirect(accountUrl);
}
