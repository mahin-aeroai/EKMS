import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { buildLfgProgramReport } from "@/lib/lfgProgramReport";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "Everyday Morning, we will send a report to the customer / partner who
// manages the LFG program" -- Vercel Cron hits this route once a day
// (see apps/web/vercel.json's "crons" entry) with no user session at
// all, so it authenticates via the CRON_SECRET header Vercel itself
// attaches (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)
// rather than a Supabase login, and reads/writes via the service-role
// client the same way the Razorpay webhook does (see
// supabase-admin.ts's own header comment for why that's the right call
// here: there is no signed-in user for RLS to evaluate against).
//
// Loops every active lfg_programs row that has at least one active
// report recipient, builds and sends that program's report, and logs
// one lfg_program_report_sends row per program regardless of outcome --
// a failure on one program (bad recipient address, a Resend hiccup)
// never stops the others from sending.
//
// GET /api/cron/lfg-daily-report
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "not_configured", message: "CRON_SECRET must be set as a Vercel environment variable." }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "not_configured", message: "RESEND_API_KEY must be set as a Vercel environment variable." }, { status: 503 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json(
      { error: "not_configured", message: "SUPABASE_SERVICE_ROLE_KEY must be set as a Vercel environment variable." },
      { status: 503 }
    );
  }

  const { data: programs, error: programsError } = await admin.from("lfg_programs").select("id, name").eq("active", true);
  if (programsError) {
    return NextResponse.json({ error: "programs_lookup_failed", message: programsError.message }, { status: 500 });
  }

  const { data: recipientRows, error: recipientsError } = await admin
    .from("lfg_program_report_recipients")
    .select("program_id, email")
    .eq("active", true);
  if (recipientsError) {
    return NextResponse.json({ error: "recipients_lookup_failed", message: recipientsError.message }, { status: 500 });
  }

  const recipientsByProgram = new Map<string, string[]>();
  for (const row of recipientRows ?? []) {
    const list = recipientsByProgram.get(row.program_id) ?? [];
    list.push(row.email);
    recipientsByProgram.set(row.program_id, list);
  }

  const results: { programId: string; programName: string; status: string; recipientCount: number; rowCount?: number; error?: string }[] = [];

  for (const program of programs ?? []) {
    const recipients = recipientsByProgram.get(program.id) ?? [];
    if (recipients.length === 0) {
      // No staff has configured recipients for this program yet -- not an
      // error, just nothing to do. Not logged to lfg_program_report_sends
      // either, so that log stays a record of real send attempts rather
      // than filling up with "nobody's set this up" noise for every
      // program that has no recipients configured.
      results.push({ programId: program.id, programName: program.name, status: "skipped_no_recipients", recipientCount: 0 });
      continue;
    }

    try {
      const report = await buildLfgProgramReport(admin, program.id);
      if (!report) {
        results.push({ programId: program.id, programName: program.name, status: "failed", recipientCount: recipients.length, error: "program_not_found" });
        continue;
      }

      const dateLabel = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const sendResult = await sendEmail({
        to: recipients,
        subject: `LFG Connect Updates -- ${program.name} -- ${dateLabel}`,
        html: `<p>Hi,</p><p>Attached is today's LFG Connect Updates report for <strong>${program.name}</strong>, covering ${report.rows.length} site${report.rows.length === 1 ? "" : "s"}.</p><p>-- MMDI LFG Connect</p>`,
        attachments: [
          {
            filename: `LFG-Connect-Updates-${program.name.replace(/[^a-z0-9]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`,
            content: report.buffer.toString("base64"),
          },
        ],
      });

      await admin.from("lfg_program_report_sends").insert({
        program_id: program.id,
        recipient_emails: recipients,
        row_count: report.rows.length,
        status: sendResult.ok ? "sent" : "failed",
        error: sendResult.ok ? null : sendResult.error,
        triggered_by: "cron",
      });

      results.push({
        programId: program.id,
        programName: program.name,
        status: sendResult.ok ? "sent" : "failed",
        recipientCount: recipients.length,
        rowCount: report.rows.length,
        error: sendResult.ok ? undefined : sendResult.error,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await admin.from("lfg_program_report_sends").insert({
        program_id: program.id,
        recipient_emails: recipients,
        row_count: null,
        status: "failed",
        error: message,
        triggered_by: "cron",
      });
      results.push({ programId: program.id, programName: program.name, status: "failed", recipientCount: recipients.length, error: message });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), results });
}
