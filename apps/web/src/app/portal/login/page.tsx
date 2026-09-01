"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { PORTAL_HOST } from "@/lib/portal-host";
import { PortalPolicyFooter } from "@/components/portal/PortalPolicyFooter";

type Mode = "sign-in" | "set-password";

function initialModeFromUrl(): Mode {
  if (typeof window === "undefined") return "sign-in";
  const hash = window.location.hash;
  return hash.includes("type=invite") || hash.includes("type=recovery") ? "set-password" : "sign-in";
}

// Sign-in + set-password only — no "Register" tab. Portal accounts are
// strictly invite-only (see supabase-customer-portal-schema.sql's header
// comment): MMDI creates the account via the staff "Create login" flow,
// which now emails an invite link rather than handing staff a password to
// relay by phone/WhatsApp -- clicking that link (or a "Forgot password"
// reset link) lands back here in set-password mode. Mirrors the same
// invite/recovery handling in src/app/login/page.tsx (the internal login
// page) -- see that file's comments for the fuller reasoning.
export default function PortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <PortalLoginForm />
    </Suspense>
  );
}

function PortalLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode] = useState<Mode>(initialModeFromUrl);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // A second entry point into the same code-entry UI as resetSent below,
  // for someone who has an invite email but whose link already stopped
  // working (see the code comment above handleVerifyCode) -- reachable
  // from a link on the plain sign-in screen instead of via the hash.
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [code, setCode] = useState("");
  // True once a typed code (recovery or invite) has been verified
  // via handleVerifyCode below and a real session established that way,
  // as opposed to via the emailed link's hash tokens (mode === "set-
  // password"). Both paths land on the same set-password form -- see
  // isInvite.
  const [otpVerified, setOtpVerified] = useState(false);
  // Starts false to match SSR (no window there) and corrects on mount --
  // same reasoning as LfgHostContext's default, avoiding a hydration
  // mismatch on the footer links' hrefs.
  const [onPortalHost, setOnPortalHost] = useState(false);
  useEffect(() => {
    // Must start false to match SSR (window isn't available there) and
    // correct once mounted in the browser; setting it during render would
    // mismatch hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnPortalHost(window.location.hostname === PORTAL_HOST);
  }, []);

  // Invite/reset emails land here as
  // /login#access_token=...&type=invite (or type=recovery) -- `mode` above
  // already read that hash once on mount to pick the right form. The
  // Supabase client is *supposed* to auto-detect and establish a session
  // from that hash on its own (detectSessionInUrl), but that doesn't
  // reliably fire inside every in-app browser that might open this link
  // (Mail apps' built-in webview, in particular) -- when it doesn't,
  // updateUser() below fails with "Auth session missing!" even though the
  // token in the hash is perfectly valid. Parse it ourselves and call
  // setSession() explicitly as a fallback; this is a no-op (same tokens)
  // on top of a session the client already auto-established, so it's safe
  // either way.
  useEffect(() => {
    if (mode !== "set-password") return;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
        setInviteEmail(session?.user?.email ?? null);
        window.history.replaceState(null, "", window.location.pathname);
      }
    });

    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hashParams.get("access_token");
    const refresh_token = hashParams.get("refresh_token");
    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ data, error: sessionError }) => {
        if (data.session?.user?.email) setInviteEmail(data.session.user.email);
        if (sessionError) setError(sessionError.message);
      });
    } else {
      // No tokens in the hash (shouldn't happen given `mode` already
      // matched on it) -- fall back to whatever the client may already
      // have established automatically.
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.email) setInviteEmail(data.user.email);
      });
    }

    return () => sub.subscription.unsubscribe();
  }, [mode]);

  function defaultHome() {
    // Bare "/" on the subdomain, "/portal" everywhere else (app.mmdi.in
    // preview access, ekms.vercel.app, any Vercel preview deployment).
    return window.location.hostname === PORTAL_HOST ? "/" : "/portal";
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    const redirectTo = searchParams.get("redirectTo") || defaultHome();
    router.push(redirectTo);
    router.refresh();
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Send the reset link back to wherever this login page is actually
    // being viewed from -- bare "/login" on the subdomain, "/portal/login"
    // elsewhere -- rather than hardcoding one form.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setCode("");
    setResetSent(true);
  }

  // Verifies a code typed in by hand instead of relying on the
  // emailed link's one-time hash tokens. Added 1 Sep 2026: links kept
  // arriving "already used" (Supabase error otp_expired) even right after
  // sending, with no set-password screen ever showing -- something (a mail
  // app's link preview/prefetch, a security scanner, opening the email
  // twice) was silently visiting and burning the single-use link before
  // the real click. A typed code has no clickable URL for anything but a
  // human to consume, so it isn't vulnerable to that. Requires the
  // Reset Password / Invite user email templates in Supabase to actually
  // show `{{ .Token }}` -- see OPERATIONS.md.
  //
  // Handles both the "forgot password" code (resetSent) and the invite
  // code (showInviteCode) -- same UI, different `type` passed to
  // verifyOtp, since that's the only thing Supabase needs to tell them
  // apart.
  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: resetSent ? "recovery" : "invite",
    });

    setLoading(false);

    if (verifyError || !data.session) {
      setError(verifyError?.message ?? "That code didn't work. Double-check it and try again.");
      return;
    }

    setInviteEmail(data.session.user?.email ?? email);
    setOtpVerified(true);
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push(defaultHome());
    router.refresh();
  }

  const isInvite = mode === "set-password" || otpVerified;

  return (
    <div className="flex min-h-screen flex-col bg-surface-sunken">
      <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-brand">
            <Lock size={18} />
          </span>
          <h1 className="text-lg font-semibold text-ink">MMDI Customer Portal</h1>
          <p className="text-sm text-ink-muted">
            {isInvite
              ? inviteEmail
                ? `Set a password for ${inviteEmail}`
                : "Set your password"
              : showForgotPassword
                ? resetSent
                  ? "Enter your code"
                  : "Reset your password"
                : showInviteCode
                  ? "Enter your invite code"
                  : "Sign in to place and track orders"}
          </p>
        </div>

        {isInvite ? (
          <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-ink-secondary">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-ink-secondary">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <Button type="submit" loading={loading} className="mt-2">
              Set password &amp; continue
            </Button>
          </form>
        ) : showForgotPassword ? (
          resetSent ? (
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
              <p className="text-sm text-ink-secondary">
                We sent a code to <span className="font-medium text-ink">{email}</span>. Enter it below —
                it&apos;s more reliable than the link in the same email, which some mail apps can open
                automatically before you ever click it.
              </p>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="resetCode" className="text-sm font-medium text-ink-secondary">
                  Verification code
                </label>
                <input
                  id="resetCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-center text-lg tracking-[0.4em] text-ink focus:border-primary focus:outline-none"
                  placeholder="00000000"
                />
              </div>
              {error && (
                <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
              )}
              <Button type="submit" loading={loading} className="mt-2" disabled={code.length < 6}>
                Verify code
              </Button>
              <button
                type="button"
                onClick={() => {
                  setResetSent(false);
                  setCode("");
                  setError(null);
                }}
                className="text-center text-sm text-ink-muted hover:text-ink"
              >
                Didn&apos;t get it? Send again
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetSent(false);
                  setCode("");
                  setError(null);
                }}
                className="text-center text-sm text-ink-muted hover:text-ink"
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="resetEmail" className="text-sm font-medium text-ink-secondary">
                  Email
                </label>
                <input
                  id="resetEmail"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  placeholder="you@yourcompany.com"
                />
              </div>
              {error && (
                <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
              )}
              <Button type="submit" loading={loading} className="mt-2">
                Send reset code
              </Button>
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setError(null);
                }}
                className="text-center text-sm text-ink-muted hover:text-ink"
              >
                Back to sign in
              </button>
            </form>
          )
        ) : showInviteCode ? (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
            <p className="text-sm text-ink-secondary">
              Enter the email your invite was sent to and the code from that email.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="inviteCodeEmail" className="text-sm font-medium text-ink-secondary">
                Email
              </label>
              <input
                id="inviteCodeEmail"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="you@yourcompany.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="inviteCode" className="text-sm font-medium text-ink-secondary">
                Verification code
              </label>
              <input
                id="inviteCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-center text-lg tracking-[0.4em] text-ink focus:border-primary focus:outline-none"
                placeholder="00000000"
              />
            </div>
            {error && (
              <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
            )}
            <Button type="submit" loading={loading} className="mt-2" disabled={code.length < 6 || !email}>
              Verify code
            </Button>
            <button
              type="button"
              onClick={() => {
                setShowInviteCode(false);
                setCode("");
                setError(null);
              }}
              className="text-center text-sm text-ink-muted hover:text-ink"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignIn} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-ink-secondary">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="you@yourcompany.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="loginPassword" className="text-sm font-medium text-ink-secondary">
                Password
              </label>
              <input
                id="loginPassword"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
            )}

            <Button type="submit" loading={loading} className="mt-2">
              Sign in
            </Button>
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(true);
                setError(null);
              }}
              className="text-center text-sm text-ink-muted hover:text-ink"
            >
              Forgot password?
            </button>
            <button
              type="button"
              onClick={() => {
                setShowInviteCode(true);
                setError(null);
              }}
              className="text-center text-sm text-ink-muted hover:text-ink"
            >
              Have an invite code from your email?
            </button>
          </form>
        )}

        {!isInvite && (
          <p className="mt-6 text-center text-xs text-ink-muted">
            Don&apos;t have login details? Contact MMDI to set up your account.
          </p>
        )}
      </div>
      </div>
      <PortalPolicyFooter onPortalHost={onPortalHost} compact />
    </div>
  );
}
