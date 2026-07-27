import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

/**
 * Revokes at Google FIRST, then deletes the local row (see gmail-plan-v2.md
 * section 9): a row deleted without revocation leaves a live token nobody
 * is tracking, which defeats the entire point of an off switch.
 */
export async function POST(request: Request) {
  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: refreshToken, error: readError } = await supabase.rpc("google_tokens_get_refresh_token");
  if (readError) {
    return NextResponse.json({ error: "read_failed", message: readError.message }, { status: 500 });
  }
  if (!refreshToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 404 });
  }

  const revokeRes = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  });

  if (!revokeRes.ok) {
    // Google didn't confirm revocation. Still remove the local row -- a
    // supervisor who clicks Disconnect expects the app to forget the
    // connection either way, and leaving it in place because Google's
    // endpoint hiccuped just means they can never disconnect at all -- but
    // report this as a partial result rather than silently claiming the
    // token itself was revoked when it may not have been.
    const { error: deleteError } = await supabase.rpc("google_tokens_delete");
    return NextResponse.json(
      {
        disconnected: !deleteError,
        revoked: false,
        message: deleteError
          ? "Couldn't revoke at Google or remove the local record. Try again."
          : "Removed from MMDI ONE, but Google did not confirm the token was revoked.",
      },
      { status: deleteError ? 500 : 207 }
    );
  }

  const { error: deleteError } = await supabase.rpc("google_tokens_delete");
  if (deleteError) {
    return NextResponse.json(
      { error: "delete_failed", message: "Revoked at Google, but couldn't remove the local record: " + deleteError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ disconnected: true, revoked: true });
}
