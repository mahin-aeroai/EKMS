import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// gmail.compose is labelled by Google as "Manage drafts and send emails" --
// the app will only ever create drafts (see gmail-plan-v2.md section 4), but
// the token itself is more capable than that. Section 1 of the plan is
// explicit: treat the token as more capable than the feature.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

export async function GET(request: Request) {
  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  // requireVerifiedUser only blocks a PENDING step-up -- a factor enrolled
  // but not verified this session. It does nothing for an account with NO
  // factor enrolled at all, since aal2 is simply unreachable for them and
  // nextLevel never asks for it. Section 6 requires actually being at aal2
  // to connect Gmail ("whoever connects Gmail should be the first" to
  // enroll), so check the level directly rather than relying on
  // requireVerifiedUser's weaker "no skipped step-up" guarantee.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    const url = new URL("/account", request.url);
    url.searchParams.set("gmail_error", "mfa_required");
    return NextResponse.redirect(url);
  }

  const state = randomBytes(24).toString("base64url");
  const redirectUri = new URL("/api/google/oauth/callback", request.url).toString();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  // Pre-filters Google's account chooser to the Workspace domain -- a UI
  // hint only, not enforcement (a client can strip this param from the
  // URL), so the callback independently re-checks the domain server-side
  // against the profile response rather than trusting this.
  authUrl.searchParams.set("hd", "mmdi.in");
  // Forces Google to reissue a refresh_token even on a repeat connect for an
  // already-granted scope set -- without it a reconnect can come back with
  // no refresh_token at all, and the callback has nothing to store.
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    // Unconditional `secure: true` is silently dropped by the browser on
    // plain-HTTP localhost (no TLS, so a Secure-flagged cookie never gets
    // stored) -- the callback then finds no google_oauth_state cookie at
    // all and fails state validation. Production is always HTTPS, so this
    // only relaxes the flag for local dev.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // 15 minutes, not 10 -- generous enough that a person who gets
    // distracted mid-consent-screen doesn't come back to a mysteriously
    // failed connection attempt.
    maxAge: 900,
    path: "/",
  });
  return res;
}
