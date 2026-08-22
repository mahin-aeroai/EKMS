import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { PORTAL_HOST } from "@/lib/portal-host";

export const dynamic = "force-dynamic";

// Creates a real, ready-to-use portal login in one step: staff enters an
// email (and optionally a contact name), and this route both records the
// portal_invited_emails allowlist row AND emails the customer a real
// Supabase invite link via the Admin API -- the two steps a staff member
// previously had to do by hand (Add invite here, then Authentication ->
// Users -> Add user in the Supabase dashboard itself).
//
// This deliberately does NOT generate/return a password for staff to relay
// by phone or WhatsApp -- that gave no proof the typed email address was
// real or actually belongs to the customer. inviteUserByEmail() instead
// creates the account unconfirmed and sends Supabase's own "Invite user"
// email with a one-time link; the customer sets their own password by
// clicking it (handled in src/app/portal/login/page.tsx's set-password
// mode). A wrong/fake email just never gets clicked -- no usable account
// exists until it is. The existing handle_new_user() trigger still does
// the role='portal' + portal_users wiring the instant the auth user is
// created, unchanged from before.
//
// Requires two things Srinivas sets up once outside this code (documented
// in OPERATIONS.md section 8):
// 1. A real SMTP provider configured under Supabase -> Authentication ->
//    Emails -> SMTP Settings -- Supabase's own built-in mailer is heavily
//    rate-limited and not meant for real customer-facing invites.
// 2. `https://portal.mmdi.in/login` added to Supabase -> Authentication ->
//    URL Configuration -> Redirect URLs, or Supabase silently ignores the
//    redirectTo below and the invite link lands somewhere unexpected.
//
// POST /api/portal/companies/[companyId]/create-login
// Body: { email: string, contact_name?: string }
// Response: { email, contact_name }

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

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

  // Confirm the company exists and is one this staff member can actually
  // see (mirrors portal_companies' own RLS -- the admin client bypasses
  // RLS, so this check is repeated explicitly here, same pattern as every
  // other R2/admin route in this app).
  const { data: company, error: companyError } = await supabase.from("portal_companies").select("id").eq("id", companyId).maybeSingle();
  if (companyError || !company) {
    return NextResponse.json({ error: "company_not_found" }, { status: 404 });
  }

  // STEP 1 -- record the invite (upsert: re-running this for an email that
  // already has an invite row just refreshes it rather than erroring,
  // since portal_invited_emails.email is the primary key). consumed_at is
  // explicitly reset to null here -- without that, re-inviting an email
  // whose earlier auth user was deleted elsewhere would leave a stale
  // consumed_at on the row, and handle_new_user()'s trigger only wires up
  // role='portal' for an invite it sees as consumed_at IS NULL -- so the
  // new account would silently fall through to a normal 'viewer' profile
  // instead of a portal one.
  const { error: inviteError } = await admin.from("portal_invited_emails").upsert(
    {
      email,
      company_id: companyId,
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
  // the invite link. The on_auth_user_created trigger fires synchronously
  // as part of this call and does the role='portal' + portal_users wiring
  // from the invite row we just wrote.
  const { error: inviteAuthError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `https://${PORTAL_HOST}/login`,
    data: body.contact_name?.trim() ? { full_name: body.contact_name.trim() } : undefined,
  });

  if (inviteAuthError) {
    // Most common case: this email already has a Supabase Auth account
    // (from an earlier manual invite, or a duplicate submission). Don't
    // silently report success -- staff needs to know no new invite was
    // actually sent.
    const alreadyExists = /already registered|already exists/i.test(inviteAuthError.message);
    return NextResponse.json(
      {
        error: alreadyExists ? "user_already_exists" : "invite_failed",
        message: alreadyExists
          ? "An account with this email already exists. If they never finished setting a password, use \"Forgot password\" on the portal login page to send a new link — inviting again won't work."
          : inviteAuthError.message,
      },
      { status: alreadyExists ? 409 : 500 }
    );
  }

  return NextResponse.json({ email, contact_name: body.contact_name?.trim() || null });
}
