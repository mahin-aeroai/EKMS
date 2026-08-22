"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { PORTAL_HOST } from "@/lib/portal-host";

// Sign-in only — no "Register" tab. Portal accounts are strictly
// invite-only (see supabase-customer-portal-schema.sql's header comment):
// MMDI creates the account and shares the credentials directly, there is
// no self-service path here at all, unlike the internal /login page.
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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

    // No ?redirectTo= means someone landed here directly (not bounced by
    // the middleware) -- default to this host's own portal home: bare "/"
    // on the subdomain, "/portal" everywhere else.
    const defaultHome = window.location.hostname === PORTAL_HOST ? "/" : "/portal";
    const redirectTo = searchParams.get("redirectTo") || defaultHome;
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
    setResetSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-brand">
            <Lock size={18} />
          </span>
          <h1 className="text-lg font-semibold text-ink">MMDI Customer Portal</h1>
          <p className="text-sm text-ink-muted">
            {showForgotPassword ? (resetSent ? "Check your inbox" : "Reset your password") : "Sign in to place and track orders"}
          </p>
        </div>

        {showForgotPassword ? (
          resetSent ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink-secondary">
                If an account exists for <span className="font-medium text-ink">{email}</span>, we&apos;ve sent a
                password reset link to it.
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
                  placeholder="you@yourcompany.com"
                />
              </div>
              {error && (
                <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
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
          </form>
        )}

        <p className="mt-6 text-center text-xs text-ink-muted">
          Don&apos;t have login details? Contact MMDI to set up your account.
        </p>
      </div>
    </div>
  );
}
