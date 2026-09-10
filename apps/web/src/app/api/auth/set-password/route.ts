import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { withAuthRetry } from "@/lib/authRetry";

// Server-side counterpart to the final "set your password" step, for both
// the typed-code flow (verify-code/route.ts) and the emailed-link flow
// (which still establishes its session client-side via setSession() --
// see each login page's mode === "set-password" effect). Either way, by
// the time this runs there's already a session sitting in this request's
// cookies (@supabase/ssr's browser and server clients share the same
// cookie format), so createServerSupabaseClient() picks it up
// automatically -- no tokens need to be passed in here.
export async function POST(req: NextRequest) {
  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await withAuthRetry(() => supabase.auth.updateUser({ password }));

  return NextResponse.json({ error: error?.message ?? null });
}
