import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuthRetry } from "@/lib/authRetry";

// 10 Sept 2026: a second, DIFFERENT password-reset failure from the
// "Failed to fetch" cold-start issue fixed earlier the same day (see
// authRetry.ts's header comment for that one). A teammate on a Windows
// desktop (Edge) hit a *persistent* "Failed to fetch" on
// resetPasswordForEmail -- DevTools console showed the real cause:
// `net::ERR_QUIC_PROTOCOL_ERROR` on the POST to
// `<project>.supabase.co/auth/v1/recover`, twice in a row, while the same
// login PAGE itself (served from app.mmdi.in) loaded fine. That's the
// signature of Chrome/Edge's QUIC (HTTP/3) transport failing against
// Supabase's Cloudflare-fronted domain specifically -- typically because
// something on the user's network (corporate firewall, antivirus doing
// TLS inspection, certain VPNs) blocks or mangles outbound UDP/443, which
// Chromium tries first and, on some networks, never falls back cleanly
// from. It reproduces the same way regardless of retrying (unlike the
// earlier cold-start bug, a retry over the SAME broken transport just
// fails again), and it's specific to that network path, not a Supabase
// config problem -- Mac users on the same team, and this same Windows
// user's *sign-in* requests (no QUIC involved there in the report),
// worked fine.
//
// The fix: stop having the browser talk to <project>.supabase.co directly
// for this call at all. This route runs the resetPasswordForEmail request
// server-side (Vercel's network, not the user's restricted one) and the
// login pages now POST here (same-origin, app.mmdi.in/lfgconnect.mmdi.in/
// portal.mmdi.in -- which we already know loads fine for this user) instead
// of calling supabase.auth.resetPasswordForEmail() directly from the
// browser. No session/cookies are involved on either side of this call --
// resetPasswordForEmail only ever triggers an email, so a plain anon-key
// client is enough; nothing about the user's existing auth state needs to
// survive the round trip.
//
// If sign-in itself (or invite/OTP verification) is ever reported hitting
// the same ERR_QUIC_PROTOCOL_ERROR, the same pattern applies but is more
// involved -- those calls establish a session that has to land back in the
// browser's cookies, which needs @supabase/ssr's server client wired
// through this route instead of a bare createClient(). Not needed yet.
export async function POST(req: NextRequest) {
  let body: { email?: unknown; redirectTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  // Only ever redirect back into our own app -- never let a caller point
  // this at an arbitrary external URL.
  const redirectTo =
    typeof body.redirectTo === "string" &&
    /^https:\/\/[a-z0-9.-]+\.mmdi\.in\//i.test(body.redirectTo)
      ? body.redirectTo
      : undefined;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { error } = await withAuthRetry(() =>
    supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
  );

  return NextResponse.json({ error: error?.message ?? null });
}
