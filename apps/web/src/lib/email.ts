/**
 * Minimal Resend HTTP API wrapper -- no SDK dependency, just fetch().
 *
 * MMDI already has a Resend account (used today only for Supabase Auth's
 * own SMTP relay -- smtp.resend.com, see OPERATIONS.md). Programmatic
 * sending from app code needs its own API key, generated in the Resend
 * dashboard and set as RESEND_API_KEY in Vercel -- a separate credential
 * from whatever SMTP password Supabase Auth uses, even though both come
 * from the same Resend account.
 *
 * Used today only by the LFG Connect Updates daily/"Send Now" report
 * email (send-report route + daily cron route). Keep this file
 * server-only -- never import it from a Client Component.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailAttachment {
  filename: string;
  /** Base64-encoded file content, per Resend's API contract. */
  content: string;
}

export interface SendEmailParams {
  to: string[];
  subject: string;
  html: string;
  attachments?: SendEmailAttachment[];
  /** Defaults to RESEND_FROM_EMAIL env var, then a hardcoded fallback. */
  from?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Sends one email via Resend's HTTP API. Throws only on a missing API
 * key (a config error, should never happen once deployed correctly) --
 * an actual send failure (bad address, Resend outage, etc.) is returned
 * as { ok: false, error } so callers (the cron loop especially) can log
 * it per-recipient-list and keep going rather than crashing the whole
 * run.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set as a Vercel environment variable.");
  }

  const from = params.from || process.env.RESEND_FROM_EMAIL || "LFG Connect <lfgconnect@mmdi.in>";

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        attachments: params.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.message || data?.name || `Resend API returned ${res.status}`;
      return { ok: false, error: message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error calling Resend";
    return { ok: false, error: message };
  }
}
