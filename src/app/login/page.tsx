"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);

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

    const redirectTo = searchParams.get("redirectTo") || "/";
    router.push(redirectTo);
    router.refresh();
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-brand">
            <Lock size={18} />
          </span>
          <h1 className="text-lg font-semibold text-ink">MMDI ONE</h1>
          <p className="text-sm text-ink-muted">
            {isInvite
              ? inviteEmail
                ? `Set a password for ${inviteEmail}`
                : "Set your password"
              : "Sign in to your workspace"}
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
              <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="mt-2">
              Set password &amp; continue
            </Button>
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
          </form>
        )}

        {!isInvite && (
          <p className="mt-6 text-center text-xs text-ink-muted">
            Accounts are created by an administrator. Contact your MMDI ONE
            admin if you need access.
          </p>
        )}
      </div>
    </div>
  );
}
