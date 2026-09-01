"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { LFG_HOST } from "@/lib/lfg-host";
import { APP_HOST } from "@/lib/app-host";

// Mirror of the switcher on the main staff login page (src/app/login/
// page.tsx), which links here the same way -- see that file's own comment
// on why this is hardcoded to production rather than computed from the
// current host.
const APP_LOGIN_URL = `https://${APP_HOST}/login`;

type Mode = "sign-in" | "set-password";

function initialModeFromUrl(): Mode {
  if (typeof window === "undefined") return "sign-in";
  const hash = window.location.hash;
  return hash.includes("type=invite") || hash.includes("type=recovery") ? "set-password" : "sign-in";
}

// Sign-in + set-password only — no "Register" tab. Direct structural
// mirror of src/app/portal/login/page.tsx for lfg_partner accounts
// instead of portal accounts — see that file's comments for the fuller
// reasoning (invite-link-not-password, the setSession() fallback for
// in-app browsers that don't auto-detect the hash, etc.), all unchanged
// here. LFG partner accounts are strictly invite-only too — MMDI creates
// the account via the staff "Create LFG partner login" flow
// (/api/lfg/partners/[partnerId]/create-login), which emails an invite
// link; clicking it (or a "Forgot password" reset link) lands back here
// in set-password mode.
export default function LfgLoginPage() {
  return (
    <Suspense fallback={null}>
      <LfgLoginForm />
    </Suspense>
  );
}

function LfgLoginForm() {
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
  // True once a typed 6-digit code (recovery or invite) has been verified
  // via handleVerifyCode below and a real session established that way,
  // as opposed to via the emailed link's hash tokens (mode === "set-
  // password"). Both paths land on the same set-password form -- see
  // isInvite.
  const [otpVerified, setOtpVerified] = useState(false);

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
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.email) setInviteEmail(data.user.email);
      });
    }

    return () => sub.subscription.unsubscribe();
  }, [mode]);

  function defaultHome() {
    // Bare "/" on the subdomain, "/lfg" everywhere else (app.mmdi.in
    // preview access, ekms.vercel.app, any Vercel preview deployment).
    return window.location.hostname === LFG_HOST ? "/" : "/lfg";
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

  // Verifies a 6-digit code typed in by hand instead of relying on the
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
  // Same reasoning as the mirrored switcher on the main staff login page --
  // hidden mid a deep sub-flow (a set-password/recovery link, the forgot-
  // password form, the code-entry form) so switching audience never risks
  // discarding it.
  const showAudienceSwitcher = !isInvite && !showForgotPassword && !showInviteCode;

  return (
    <div data-theme="lfg" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-sunken px-4">
      {showAudienceSwitcher && (
        <div className="flex items-center gap-1 rounded-full border border-line-strong bg-surface p-1 text-xs font-medium shadow-sm">
          <a
            href={APP_LOGIN_URL}
            className="rounded-full px-4 py-1.5 text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            MMDI Employee
          </a>
          <span className="rounded-full bg-primary px-4 py-1.5 text-on-brand">LFG Connect Partner</span>
        </div>
      )}
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static local asset, same as LfgTopBar */}
          <img src="/brand/lfg-connect-logo.png" alt="LFG Connect" className="h-12 w-12 shrink-0 rounded-md object-cover" />
          <h1 className="text-lg font-semibold text-ink">
            LFG <span className="text-danger">Connect</span>
          </h1>
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
                  : "Sign in to manage your assigned sites"}
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
                We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>. Enter it below —
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
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-center text-lg tracking-[0.4em] text-ink focus:border-primary focus:outline-none"
                  placeholder="000000"
                />
              </div>
              {error && (
                <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
              )}
              <Button type="submit" loading={loading} className="mt-2" disabled={code.length !== 6}>
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
              Enter the email your invite was sent to and the 6-digit code from that email.
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
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-center text-lg tracking-[0.4em] text-ink focus:border-primary focus:outline-none"
                placeholder="000000"
              />
            </div>
            {error && (
              <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
            )}
            <Button type="submit" loading={loading} className="mt-2" disabled={code.length !== 6 || !email}>
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
  );
}
