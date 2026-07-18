"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";

type Mode = "sign-in" | "set-password";

function initialModeFromUrl(): Mode {
  if (typeof window === "undefined") return "sign-in";
  const hash = window.location.hash;
  return hash.includes("type=invite") || hash.includes("type=recovery")
    ? "set-password"
    : "sign-in";
}

interface MfaPending {
  factorId: string;
  challengeId: string;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode] = useState<Mode>(initialModeFromUrl);
  const [authView, setAuthView] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [registerSubmitted, setRegisterSubmitted] = useState(false);

  // Non-null once a password sign-in (or an already-established session
  // caught by the mount check below) needs a TOTP code before it's fully
  // authenticated. While this is set, the code-entry form takes over the
  // whole card regardless of authView/showForgotPassword.
  const [mfaPending, setMfaPending] = useState<MfaPending | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  // True only while the mount-time session/assurance check below is still
  // running, so a signed-in user who needs an MFA step-up never sees a
  // flash of the plain sign-in form first. Starts false outside "sign-in"
  // mode (derived the same way `mode` itself is, so they always agree) —
  // that keeps the early-return branch of the effect below from having to
  // call setState synchronously, which trips the
  // react-hooks/set-state-in-effect lint rule.
  const [checkingSession, setCheckingSession] = useState(() => initialModeFromUrl() === "sign-in");

  // Fetches this account's verified authenticator factor and opens a
  // challenge for it, putting the form into "enter your code" mode. Called
  // both right after a successful password sign-in and, on page load, for
  // anyone who already has a session that never completed this step (see
  // the effect below) — e.g. they refreshed mid-challenge, or navigated
  // straight to a protected URL and got bounced back here by middleware.ts.
  async function beginMfaChallenge() {
    setError(null);
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    const totp = factorsData?.totp.find((f) => f.status === "verified");
    if (factorsError || !totp) {
      setError(
        "This account requires a verification code, but no authenticator app is enrolled on it. Contact your admin."
      );
      return;
    }
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (challengeError || !challenge) {
      setError(challengeError?.message ?? "Couldn't start verification. Try signing in again.");
      return;
    }
    setMfaPending({ factorId: totp.id, challengeId: challenge.id });
  }

  // Invite/reset emails land here as
  // /login#access_token=...&type=invite (or type=recovery). `mode` above
  // already read that hash once on mount to pick the right form; this
  // effect just waits for the Supabase client to finish parsing the hash
  // (it does so automatically) so we can show whose invite this is and wipe
  // the token out of the address bar.
  useEffect(() => {
    if (mode !== "set-password") return;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
        setInviteEmail(session?.user?.email ?? null);
        window.history.replaceState(null, "", "/login");
      }
    });

    // Session may already be established by the time this effect runs.
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setInviteEmail(data.user.email);
    });

    return () => sub.subscription.unsubscribe();
  }, [mode]);

  // Nicety: if someone lands on a plain /login visit (no invite/recovery
  // token) while already signed in, either send them straight to the app
  // or, if their session never completed an MFA step-up (see
  // beginMfaChallenge above), prompt for the code instead of bouncing them
  // in unverified. Skipped entirely in "set-password" mode so it can never
  // race with / discard an invite or recovery token — see the comment in
  // supabase-middleware.ts for why this can't live server-side.
  useEffect(() => {
    if (mode !== "sign-in") return;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setCheckingSession(false);
        return;
      }

      // getAuthenticatorAssuranceLevel compares the CURRENT level of this
      // session (aal1 for a plain password sign-in) against the level the
      // account is capable of reaching (aal2, only once at least one TOTP
      // factor is verified). If they differ, this session authenticated
      // with a password but never completed the second factor.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
        await beginMfaChallenge();
        setCheckingSession(false);
        return;
      }

      router.replace(searchParams.get("redirectTo") || "/");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setLoading(false);

    if (aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
      await beginMfaChallenge();
      return;
    }

    const redirectTo = searchParams.get("redirectTo") || "/";
    router.push(redirectTo);
    router.refresh();
  }

  async function handleRegister(e: FormEvent) {
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
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      // Email confirmation is off for this project — signed in immediately.
      // A brand-new account has no MFA factors yet, so no step-up is possible.
      const redirectTo = searchParams.get("redirectTo") || "/";
      router.push(redirectTo);
      router.refresh();
      return;
    }

    // The common case: Supabase requires confirming the email address
    // before it will issue a session.
    setRegisterSubmitted(true);
  }

  async function handleMfaVerify(e: FormEvent) {
    e.preventDefault();
    if (!mfaPending) return;
    setError(null);
    setLoading(true);

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mfaPending.factorId,
      challengeId: mfaPending.challengeId,
      code: mfaCode,
    });

    setLoading(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    const redirectTo = searchParams.get("redirectTo") || "/";
    router.push(redirectTo);
    router.refresh();
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setResetSent(true);
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

    router.push("/");
    router.refresh();
  }

  const isInvite = mode === "set-password";

  let heading: string;
  if (isInvite) {
    heading = inviteEmail ? `Set a password for ${inviteEmail}` : "Set your password";
  } else if (mfaPending) {
    heading = "Enter your verification code";
  } else if (showForgotPassword) {
    heading = resetSent ? "Check your inbox" : "Reset your password";
  } else if (authView === "register") {
    heading = registerSubmitted ? "Check your inbox" : "Create your account";
  } else {
    heading = "Sign in to your workspace";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-brand">
            {mfaPending ? <ShieldCheck size={18} /> : <Lock size={18} />}
          </span>
          <h1 className="text-lg font-semibold text-ink">MMDI ONE</h1>
          <p className="text-sm text-ink-muted">{heading}</p>
        </div>

        {checkingSession && !isInvite ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
        ) : isInvite ? (
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
              <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="mt-2">
              Set password &amp; continue
            </Button>
          </form>
        ) : mfaPending ? (
          <form onSubmit={handleMfaVerify} className="flex flex-col gap-4">
            <p className="text-sm text-ink-secondary">
              Open your authenticator app and enter the 6-digit code for MMDI ONE.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="mfaCode" className="text-sm font-medium text-ink-secondary">
                Verification code
              </label>
              <input
                id="mfaCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-center text-lg tracking-[0.4em] text-ink focus:border-primary focus:outline-none"
                placeholder="000000"
              />
            </div>

            {error && (
              <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="mt-2" disabled={mfaCode.length !== 6}>
              Verify &amp; continue
            </Button>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                setMfaPending(null);
                setMfaCode("");
                setPassword("");
                setError(null);
              }}
              className="text-center text-sm text-ink-muted hover:text-ink"
            >
              Cancel and sign in as someone else
            </button>
          </form>
        ) : showForgotPassword ? (
          resetSent ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink-secondary">
                If an account exists for <span className="font-medium text-ink">{email}</span>,
                we&apos;ve sent a password reset link to it. Follow that link to set a new
                password.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetSent(false);
                  setError(null);
                }}
              >
                Back to sign in
              </Button>
            </div>
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
                  placeholder="you@mmdi.in"
                />
              </div>

              {error && (
                <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" loading={loading} className="mt-2">
                Send reset link
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
        ) : authView === "register" ? (
          registerSubmitted ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink-secondary">
                If <span className="font-medium text-ink">{email}</span> isn&apos;t already registered, we&apos;ve
                sent a confirmation link to it. Follow that link, then sign in below — new accounts start as
                read-only until an admin grants further access.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setAuthView("sign-in");
                  setRegisterSubmitted(false);
                  setError(null);
                  setPassword("");
                  setConfirmPassword("");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="registerEmail" className="text-sm font-medium text-ink-secondary">
                  Email
                </label>
                <input
                  id="registerEmail"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  placeholder="you@mmdi.in"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="registerPassword" className="text-sm font-medium text-ink-secondary">
                  Password
                </label>
                <input
                  id="registerPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                  placeholder="At least 8 characters"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="registerConfirmPassword" className="text-sm font-medium text-ink-secondary">
                  Confirm password
                </label>
                <input
                  id="registerConfirmPassword"
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
                <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" loading={loading} className="mt-2">
                Create account
              </Button>
              <button
                type="button"
                onClick={() => {
                  setAuthView("sign-in");
                  setError(null);
                }}
                className="text-center text-sm text-ink-muted hover:text-ink"
              >
                Already have an account? Sign in
              </button>
            </form>
          )
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
                placeholder="you@mmdi.in"
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
              <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
                {error}
              </p>
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
                setAuthView("register");
                setError(null);
                setPassword("");
              }}
              className="text-center text-sm text-ink-muted hover:text-ink"
            >
              Don&apos;t have an account? Register
            </button>
          </form>
        )}

        {!isInvite && !mfaPending && !checkingSession && !showForgotPassword && authView === "sign-in" && (
          <p className="mt-6 text-center text-xs text-ink-muted">
            New accounts start as read-only (viewer) until an admin grants further access.
          </p>
        )}
      </div>
    </div>
  );
}
