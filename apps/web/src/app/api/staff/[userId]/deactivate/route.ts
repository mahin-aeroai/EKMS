import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Deactivates (or reactivates) an internal staff account -- admin only.
// Deliberately a DEACTIVATE, not a delete: it blocks sign-in but keeps the
// profile row and every record tied to that user id (estimates, orders,
// uploads, etc.) intact and attributable, and it's fully reversible.
//
// POST /api/staff/[userId]/deactivate
// Body: { active: boolean }  -- false deactivates, true reactivates
// Response: { id, active }
//
// The real enforcement is auth.admin.updateUserById's ban_duration, not the
// profiles.active column -- see supabase-profiles-active-migration.sql's
// header comment for why a DB flag alone can't block sign-in. Supabase's
// getUser() (as opposed to getSession()) always revalidates against the
// Auth server, and supabase-middleware.ts calls exactly that on every
// request, so a ban takes effect on the deactivated user's very next
// request -- no separate "kill their session" step needed.
export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  let body: { active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "active_required" }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Deactivating your own account has no legitimate use (and if you're the
  // only admin, locks you out with no one able to undo it) -- the
  // Administration page already disables this button on your own row, but
  // enforce it here too since this route can be called directly.
  if (userId === user.id) {
    return NextResponse.json(
      { error: "cannot_deactivate_self", message: "You can't deactivate your own account." },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json(
      { error: "not_configured", message: "SUPABASE_SERVICE_ROLE_KEY must be set as a Vercel environment variable." },
      { status: 503 }
    );
  }

  // Confirm this is a real internal-staff profile before touching
  // auth.users -- the admin client bypasses RLS, so this existence check is
  // repeated explicitly, same pattern as every other admin route.
  const { data: targetProfile, error: profileError } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !targetProfile) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // "none" lifts a ban; there's no true "forever" value in Supabase's Admin
  // API, so 10 years stands in for permanent -- reactivating is always just
  // a second call to this same route, so there's no real downside to the cap.
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: body.active ? "none" : "87600h",
  });
  if (banError) {
    return NextResponse.json({ error: "ban_update_failed", message: banError.message }, { status: 500 });
  }

  const { error: profileUpdateError } = await admin.from("profiles").update({ active: body.active }).eq("id", userId);
  if (profileUpdateError) {
    return NextResponse.json({ error: "profile_update_failed", message: profileUpdateError.message }, { status: 500 });
  }

  return NextResponse.json({ id: userId, active: body.active });
}
