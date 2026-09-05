import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { buildLfgProgramReport } from "@/lib/lfgProgramReport";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// "hitting the email button" -- staff-triggered on-demand send of the
// same "LFG Connect Updates" report the daily cron
// (/api/cron/lfg-daily-report) sends automatically every morning. Same
// report builder, same recipient list (lfg_program_report_recipients),
// same lfg_program_report_sends audit row -- the only difference is
// triggered_by: 'manual' vs 'cron' and that this route runs under the
// calling staff member's own session rather than CRON_SECRET.
//
// POST /api/lfg/programs/[programId]/send-report
// Response: { sent: boolean, recipientCount: number, rowCount: number, recipients: string[] }
export async function POST(request: Request, { params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "not_configured", message: "RESEND_API_KEY must be set as a Vercel environment variable." },
      { status: 503 }
    );
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

  // Confirm the program exists and is visible to this staff member via
  // their own session (lfg_programs_select is open to any authenticated
  // user, but this still guards against a stale/garbage id before the
  // admin client does any real work).
  const { data: program } = await supabase.from("lfg_programs").select("id, name").eq("id", programId).maybeSingle();
  if (!program) {
    return NextResponse.json({ error: "program_not_found" }, { status: 404 });
  }

  const { data: recipientRows, error: recipientsError } = await admin
    .from("lfg_program_report_recipients")
    .select("email")
    .eq("program_id", programId)
    .eq("active", true);
  if (recipientsError) {
    return NextResponse.json({ error: "recipients_lookup_failed", message: recipientsError.message }, { status: 500 });
  }

  const recipients = (recipientRows ?? []).map((r) => r.email);
  if (recipients.length === 0) {
    await admin.from("lfg_program_report_sends").insert({
      program_id: programId,
      recipient_emails: [],
      row_count: 0,
      status: "skipped_no_recipients",
      triggered_by: "manual",
      created_by: user.id,
    });
    return NextResponse.json(
      { error: "no_recipients", message: "This program has no active report recipients configured yet." },
      { status: 400 }
    );
  }

  try {
    const report = await buildLfgProgramReport(admin, programId);
    if (!report) {
      return NextResponse.json({ error: "program_not_found" }, { status: 404 });
    }

    const dateLabel = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const result = await sendEmail({
      to: recipients,
      subject: `LFG Connect Updates -- ${program.name} -- ${dateLabel}`,
      html: `<p>Hi,</p><p>Attached is the latest LFG Connect Updates report for <strong>${program.name}</strong>, covering ${report.rows.length} site${report.rows.length === 1 ? "" : "s"}.</p><p>-- MMDI LFG Connect</p>`,
      attachments: [
        {
          filename: `LFG-Connect-Updates-${program.name.replace(/[^a-z0-9]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`,
          content: report.buffer.toString("base64"),
        },
      ],
    });

    await admin.from("lfg_program_report_sends").insert({
      program_id: programId,
      recipient_emails: recipients,
      row_count: report.rows.length,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
      triggered_by: "manual",
      created_by: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "send_failed", message: result.error }, { status: 502 });
    }

    return NextResponse.json({ sent: true, recipientCount: recipients.length, rowCount: report.rows.length, recipients });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await admin.from("lfg_program_report_sends").insert({
      program_id: programId,
      recipient_emails: recipients,
      row_count: null,
      status: "failed",
      error: message,
      triggered_by: "manual",
      created_by: user.id,
    });
    return NextResponse.json({ error: "report_failed", message }, { status: 500 });
  }
}
