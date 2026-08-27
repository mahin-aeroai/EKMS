import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { LFG_HOST } from "@/lib/lfg-host";

export const dynamic = "force-dynamic";

// Direct mirror of /api/portal/companies/[companyId]/create-login/route.ts
// for LFG partner accounts instead of customer-portal accounts -- see that
// file's comments for the fuller reasoning (invite-link-not-password so a
// wrong/fake email just never gets clicked, the consumed_at reset on
// upsert, the two Supabase setup steps this depends on: a real SMTP
// provider, and https://portal.lfg.mmdi.in/login added to Supabase's
// Redirect URLs allowlist) -- all of it applies unchanged here.
//
// The existing handle_new_user() trigger (extended in
// supabase-lfg-site-management-schema.sql) does the role='lfg_partner' +
// lfg_partner_users wiring the instant the auth user is created.
//
// POST /api/lfg/partners/[partnerId]/create-login
// Body: { email: string, contact_name?: string }
// Response: { email, contact_name }

export async function POST(request: Request, { params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;

  let body: { email?: string; contact_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json(
      { error: "not_configured", message: "SUPABASE_SERVICE_ROLE_KEY must be set as a Vercel environment variable." },
      { status: 503 }
    );
  }

  // Confirm the partner exists and is one this staff member can actually
  // see -- via the caller's own session (not the admin client), same
  // pattern as create-login's portal_companies check: the admin client
  // bypasses RLS, so this check is repeated explicitly here.
  const { data: partner, error: partnerError } = await supabase
    .from("lfg_partners")
    .select("id")
    .eq("id", partnerId)
    .maybeSingle();
  if (partnerError || !partner) {
    return NextResponse.json({ error: "partner_not_found" }, { status: 404 });
  }

  // STEP 1 -- record the invite (upsert: re-running this for an email that
  // already has an invite row just refreshes it rather than erroring,
  // since lfg_partner_invited_emails.email is the primary key). consumed_at
  // is explicitly reset to null -- see create-login/route.ts's comment on
  // why this matters for a re-invite after a deleted auth user.
  const { error: inviteError } = await admin.from("lfg_partner_invited_emails").upsert(
    {
      email,
      partner_id: partnerId,
      contact_name: body.contact_name?.trim() || null,
      invited_by: user.id,
      consumed_at: null,
    },
    { onConflict: "email" }
  );
  if (inviteError) {
    return NextResponse.json({ error: "invite_failed", message: inviteError.message }, { status: 500 });
  }

  // STEP 2 -- create the Supabase Auth user (unconfirmed) and email them
  // the invite link. on_auth_user_created fires synchronously as part of
  // this call and does the role='lfg_partner' + lfg_partner_users wiring
  // from the invite row we just wrote.
  const { error: inviteAuthError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `https://${LFG_HOST}/login`,
    data: body.contact_name?.trim() ? { full_name: body.contact_name.trim() } : undefined,
  });

  if (inviteAuthError) {
    const alreadyExists = /already registered|already exists/i.test(inviteAuthError.message);
    return NextResponse.json(
      {
        error: alreadyExists ? "user_already_exists" : "invite_failed",
        message: alreadyExists
          ? 'An account with this email already exists. If they never finished setting a password, use "Forgot password" on the LFG portal login page to send a new link — inviting again won\'t work.'
          : inviteAuthError.message,
      },
      { status: alreadyExists ? 409 : 500 }
    );
  }

  return NextResponse.json({ email, contact_name: body.contact_name?.trim() || null });
}
