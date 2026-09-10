import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { withAuthRetry } from "@/lib/authRetry";

// 10 Sept 2026: same root cause as reset-password/route.ts (see that
// file's header comment) -- Windows/Edge team members confirmed the exact
// same "Failed to fetch" / net::ERR_QUIC_PROTOCOL_ERROR happens on PLAIN
// sign-in too, not just password reset. Since the browser can't reliably
// reach <project>.supabase.co directly on their network at all, this runs
// signInWithPassword (and, if the account needs an MFA step-up, the
// listFactors/challenge that used to follow it) server-side instead.
//
// Uses createServerSupabaseClient() (the same cookie-aware client
// Server Components use) rather than a bare createClient(), because this
// call DOES need to leave a session behind -- @supabase/ssr's cookie
// adapter turns any session change during this request into a Set-Cookie
// header on the response automatically, which is exactly what lets the
// browser end up "signed in" without ever having called Supabase itself.
export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request.", mfa: null }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required.", mfa: null }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await withAuthRetry(() => supabase.auth.signInWithPassword({ email, password }));
  if (error) {
    return NextResponse.json({ error: error.message, mfa: null });
  }

  // Reads the current session's JWT claims locally -- no network call, so
  // safe to do unconditionally right after sign-in.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.nextLevel === aal.currentLevel || aal.nextLevel !== "aal2") {
    return NextResponse.json({ error: null, mfa: null });
  }

  const { data: factorsData, error: factorsError } = await withAuthRetry(() => supabase.auth.mfa.listFactors());
  const totp = factorsData?.totp.find((f) => f.status === "verified");
  if (factorsError || !totp) {
    return NextResponse.json({
      error: "This account requires a verification code, but no authenticator app is enrolled on it. Contact your admin.",
      mfa: null,
    });
  }

  const { data: challenge, error: challengeError } = await withAuthRetry(() =>
    supabase.auth.mfa.challenge({ factorId: totp.id })
  );
  if (challengeError || !challenge) {
    return NextResponse.json({
      error: challengeError?.message ?? "Couldn't start verification. Try signing in again.",
      mfa: null,
    });
  }

  return NextResponse.json({ error: null, mfa: { factorId: totp.id, challengeId: challenge.id } });
}
