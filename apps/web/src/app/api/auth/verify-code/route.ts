import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { withAuthRetry } from "@/lib/authRetry";

// Server-side counterpart to the typed reset/invite code screen -- see
// reset-password/route.ts's header comment for the underlying
// ERR_QUIC_PROTOCOL_ERROR issue this exists to route around. This is the
// step right after that one: the user typed the code from their email, and
// verifyOtp() both validates it AND establishes their session -- so, same
// as sign-in, this needs the cookie-aware server client (not a bare
// createClient()) so that session lands in the browser via Set-Cookie
// instead of never happening at all.
export async function POST(req: NextRequest) {
  let body: { email?: unknown; code?: unknown; type?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request.", email: null }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const code = typeof body.code === "string" ? body.code : "";
  const type = body.type === "invite" ? "invite" : "recovery";
  if (!email || !code) {
    return NextResponse.json({ error: "Email and code are required.", email: null }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await withAuthRetry(() => supabase.auth.verifyOtp({ email, token: code, type }));

  if (error || !data.session) {
    return NextResponse.json({
      error: error?.message ?? "That code didn't work. Double-check it and try again.",
      email: null,
    });
  }

  return NextResponse.json({ error: null, email: data.session.user?.email ?? email });
}
