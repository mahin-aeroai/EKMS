import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { withAuthRetry } from "@/lib/authRetry";

// Server-side counterpart to sign-in/route.ts's MFA challenge -- see that
// file's header comment. The challenge started there was issued against a
// session already sitting in this request's cookies (set by that earlier
// response), so this only needs the challenge id and the typed code.
export async function POST(req: NextRequest) {
  let body: { factorId?: unknown; challengeId?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const factorId = typeof body.factorId === "string" ? body.factorId : "";
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!factorId || !challengeId || !code) {
    return NextResponse.json({ error: "Missing verification details." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await withAuthRetry(() => supabase.auth.mfa.verify({ factorId, challengeId, code }));

  return NextResponse.json({ error: error?.message ?? null });
}
