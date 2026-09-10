// Retries a Supabase Auth call once (after a short pause) when it fails
// with a *transient network* error, instead of surfacing that straight to
// the user as "Failed to fetch".
//
// 10 Sept 2026: Srinivas reported password-reset emails on app.mmdi.in
// "not working" -- live testing (via the browser, not guessing) reproduced
// a real `resetPasswordForEmail` failure with error.message === "Failed to
// fetch" (Chrome console: net::ERR_CONNECTION_CLOSED), identically on both
// app.mmdi.in AND lfgconnect.mmdi.in. Ruled out real causes first: Auth
// Rate Limits (30 emails/h, nowhere near hit), Attack Protection's Captcha
// toggle (off), and the SMTP Settings (Enable custom SMTP on, Resend host/
// port/sender all correct, matching the working Sept 1 config) all checked
// out fine in the Supabase dashboard. A plain `signInWithPassword` call
// (which never touches SMTP) succeeded cleanly on the same page at the
// same time. Retrying the EXACT SAME request moments later succeeded too,
// repeatedly, with no other change -- so this isn't a config bug at all,
// it's an intermittent one: `resetPasswordForEmail` does more work than a
// plain sign-in (it dispatches over SMTP to Resend synchronously), and on
// Supabase's free tier that occasionally times out / drops the connection
// on a cold instance, especially on the first request after the project's
// been idle for a while -- exactly the pattern Srinivas described ("we
// waited enough and still see the error" -- the FIRST attempt after
// opening the page is the one most likely to hit this).
//
// There's no code bug to fix here -- the request and the Supabase config
// are both correct -- but a user who sees "Failed to fetch" once has no
// way to know trying again would almost certainly work, and won't
// necessarily think to retry a password-reset flow at all. So instead of
// only teaching users "click it twice", this makes every login page do
// that automatically: one silent retry, after a short pause, ONLY for a
// network-level failure (never for a real API error like "Invalid login
// credentials" or "User not found" -- those come back as a normal
// `{error}` result, not a network exception, and must surface immediately,
// not retry).
export function isTransientNetworkError(error: { message?: string } | null | undefined): boolean {
  if (!error?.message) return false;
  const m = error.message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("load failed") || // Safari's wording for the same class of error
    m.includes("network error") ||
    m.includes("networkerror") ||
    m.includes("err_connection") ||
    m.includes("err_network")
  );
}

/**
 * Wraps a Supabase Auth call (anything returning `{ data, error }`) with
 * one retry, after `delayMs`, but only when the first attempt's error is a
 * transient network failure per isTransientNetworkError() above. A real
 * API-level error (wrong password, invalid/expired code, etc.) is
 * returned immediately on the first attempt, unretried, exactly as before
 * this helper existed. `fn` is called again from scratch on retry (not
 * resumed), so it must be safe to call twice -- true of every Supabase
 * Auth method this is used with.
 */
export async function withAuthRetry<T extends { error: { message?: string } | null }>(
  fn: () => Promise<T>,
  delayMs = 1200
): Promise<T> {
  const first = await fn();
  if (!isTransientNetworkError(first.error)) return first;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return fn();
}
