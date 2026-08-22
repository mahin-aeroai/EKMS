import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Creates a real, ready-to-use portal login in one step: staff enters an
// email (and optionally a password), and this route both records the
// portal_invited_emails allowlist row AND creates the matching Supabase
// Auth user via the Admin API -- the two steps a staff member previously
// had to do by hand (Add invite here, then Authentication -> Users -> Add
// user in the Supabase dashboard itself). The existing handle_new_user()
// trigger still does the actual role='portal' + portal_users wiring the
// instant the auth user is created -- this route just removes the need to
// ever leave the app to do it.
//
// POST /api/portal/companies/[companyId]/create-login
// Body: { email: string, contact_name?: string, password?: string }
// Response: { email, password, contact_name } -- password is returned
// ONCE in this response and never stored or logged anywhere in plaintext;
// copy it to the customer immediately, there is no way to retrieve it again
// (only a fresh reset link, same as any other account).

function generatePassword() {
  // 12 random bytes -> 16-char base64url string. No characters this
  // excludes (+, /, =) that tend to trip up "read it off the screen and
  // type it in" handoffs, and plenty of entropy for a credential the
  // customer is expected to change or at least won't be brute-forced
  // before anyone notices.
  return randomBytes(12).toString("base64url");
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  let body: { email?: string; contact_name?: string; password?: string };
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

  // STEP 2 -- create the actual Supabase Auth user. The on_auth_user_created
  // trigger fires synchronously as part of this call and does the
  // role='portal' + portal_users wiring from the invite row we just wrote.
  const password = body.password?.trim() || generatePassword();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    // Most common case: this email already has a Supabase Auth account
    // (from an earlier manual invite, or a duplicate submission). Don't
    // silently report success -- staff needs to know no new/updated
    // credential exists to hand out.
    const alreadyExists = /already registered|already exists/i.test(createError.message);
    return NextResponse.json(
      {
        error: alreadyExists ? "user_already_exists" : "create_user_failed",
        message: alreadyExists
          ? "An account with this email already exists. Use Supabase's password-reset flow (or ask the customer to use 'Forgot password' on the portal login page) rather than creating a new one."
          : createError.message,
      },
      { status: alreadyExists ? 409 : 500 }
    );
  }

  return NextResponse.json({ email, password, contact_name: body.contact_name?.trim() || null });
}
