"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import type { Factor } from "@supabase/supabase-js";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";

interface PendingEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

interface GoogleConnection {
  email: string;
  connectedAt: string;
}

const GMAIL_ERROR_MESSAGES: Record<string, string> = {
  mfa_required: "Set up an authenticator app below before connecting Gmail.",
  denied: "Gmail connection cancelled.",
  invalid_state: "That connection attempt expired or didn't match this browser — try again.",
  unauthorized: "Your session expired — sign in again and retry.",
  token_exchange_failed: "Google didn't accept the connection request. Try again.",
  no_refresh_token: "Google didn't grant a refresh token — try disconnecting any prior grant in your Google Account and reconnecting.",
  userinfo_failed: "Couldn't read the connected Google account's email.",
  storage_failed: "Couldn't save the connection. Try again.",
  wrong_domain: "That's not an mmdi.in Google Workspace account.",
};

/**
 * Self-service account settings: change your own password, and enroll or
 * remove a TOTP authenticator app (Google Authenticator, Authy, 1Password,
 * etc.) for multi-factor authentication. Reachable from the avatar menu in
 * TopNav — see AppShell.tsx — not from the main sidebar, since it's a
 * per-user page rather than a workspace.
 *
 * MFA here is opt-in: enrolling raises YOUR OWN session to aal2 immediately
 * (Supabase does this as part of a successful mfa.verify call) and means
 * every future sign-in for this account needs the code too — see the
 * step-up flow in src/app/login/page.tsx and the server-side enforcement in
 * src/lib/supabase-middleware.ts. Nothing here affects other users.
 */
export default function AccountPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<PendingEnrollment | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Factor | null>(null);
  const [removing, setRemoving] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // undefined = still loading; null = not connected.
  const [googleConnection, setGoogleConnection] = useState<GoogleConnection | null | undefined>(undefined);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function loadGoogleConnection() {
    const { data, error } = await supabase.from("google_tokens").select("email, connected_at").maybeSingle();
    if (error) {
      toast("danger", "Couldn't load your Gmail connection status");
      setGoogleConnection(null);
      return;
    }
    setGoogleConnection(data ? { email: data.email, connectedAt: data.connected_at } : null);
  }

  // Google redirects back to THIS page after oauth/callback finishes --
  // gmail_connected / gmail_error land as query params on a plain page
  // load, not a fetch response. Read them once on mount (via
  // window.location directly rather than useSearchParams, which would force
  // this whole page into a Suspense boundary just for a one-time read),
  // toast, then strip them from the URL so refreshing doesn't re-toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("gmail_connected");
    const errorCode = params.get("gmail_error");
    if (!connected && !errorCode) return;

    if (connected) {
      toast("success", "Gmail connected.");
    } else if (errorCode) {
      toast("danger", GMAIL_ERROR_MESSAGES[errorCode] ?? "Couldn't connect Gmail.");
    }
    router.replace("/account");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // listFactors()'s per-type arrays (data.totp etc.) only ever contain
  // VERIFIED factors — `data.all` is the one place a just-enrolled,
  // not-yet-verified factor shows up, which startEnroll() below needs in
  // order to clean up an abandoned enrollment before starting a new one.
  function applyFactorsResult(data: { all: Factor[] } | null, error: { message: string } | null) {
    if (error) {
      toast("danger", "Couldn't load your authenticator status");
    } else {
      setFactors((data?.all ?? []).filter((f) => f.factor_type === "totp"));
    }
    setLoadingFactors(false);
  }

  // Used to refresh the list after an event-handler action (enroll/verify/
  // remove) — safe to setState synchronously there, unlike inside an
  // effect (see the mount effect below, which fetches inline instead of
  // calling this, to satisfy react-hooks/set-state-in-effect).
  async function loadFactors() {
    setLoadingFactors(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    applyFactorsResult(data, error);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    supabase.auth.mfa.listFactors().then(({ data, error }) => applyFactorsResult(data, error));
    loadGoogleConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifiedFactor = factors?.find((f) => f.status === "verified") ?? null;

  function connectGoogle() {
    setConnectingGoogle(true);
    // A real top-level navigation, not fetch -- Google's consent screen
    // can't be loaded via XHR, and oauth/start itself redirects there.
    window.location.href = "/api/google/oauth/start";
  }

  async function disconnectGoogle() {
    setDisconnectingGoogle(true);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.revoked) {
        toast("success", "Gmail disconnected and access revoked at Google.");
      } else if (res.ok) {
        toast("warning", json.message ?? "Disconnected, but Google didn't confirm revocation.");
      } else {
        toast("danger", json.message ?? "Couldn't disconnect Gmail.");
      }
    } catch {
      toast("danger", "Couldn't reach the server to disconnect Gmail.");
    } finally {
      setDisconnectingGoogle(false);
      setConfirmDisconnect(false);
      loadGoogleConnection();
    }
  }

  async function startEnroll() {
    setEnrolling(true);
    // Enrolling twice without verifying leaves stray unverified factors
    // behind — clean those up first so this always starts from a known
    // state (Supabase allows only a handful of factors per user).
    const stale = factors?.filter((f) => f.status === "unverified") ?? [];
    for (const f of stale) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setEnrolling(false);
    if (error || !data) {
      toast("danger", error?.message ?? "Couldn't start authenticator setup");
      return;
    }
    setPending({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  }

  async function cancelEnroll() {
    if (pending) {
      await supabase.auth.mfa.unenroll({ factorId: pending.factorId });
    }
    setPending(null);
    setVerifyCode("");
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setVerifying(true);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: pending.factorId,
    });
    if (challengeError || !challenge) {
      setVerifying(false);
      toast("danger", challengeError?.message ?? "Couldn't verify that code");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: pending.factorId,
      challengeId: challenge.id,
      code: verifyCode,
    });
    setVerifying(false);

    if (verifyError) {
      toast("danger", verifyError.message);
      return;
    }

    toast("success", "Authenticator app enabled — you'll be asked for a code the next time you sign in.");
    setPending(null);
    setVerifyCode("");
    loadFactors();
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: removeTarget.id });
    setRemoving(false);
    setRemoveTarget(null);
    if (error) {
      toast("danger", error.message);
      return;
    }
    toast("success", "Authenticator app removed — sign-in no longer requires a code");
    loadFactors();
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      setPasswordError(error.message);
      return;
    }

    setNewPassword("");
    setConfirmNewPassword("");
    toast("success", "Password updated");
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Account & Security" }]} />

      <div className="mt-4 flex items-start gap-4 border-b border-line pb-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <ShieldCheck size={22} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">Account &amp; Security</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">{email ?? "Loading…"}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <KeyRound size={16} className="text-ink-secondary" />
            <h3 className="text-sm font-semibold text-ink">Password</h3>
          </div>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
              New password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="At least 8 characters"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
              Confirm new password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
                placeholder="••••••••"
              />
            </label>
            {passwordError && (
              <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
                {passwordError}
              </p>
            )}
            <Button type="submit" size="sm" loading={savingPassword} className="self-start">
              Update password
            </Button>
          </form>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-ink-secondary" />
              <h3 className="text-sm font-semibold text-ink">Multi-factor authentication</h3>
            </div>
            {!loadingFactors && (
              <Badge status={verifiedFactor ? "success" : "neutral"}>
                {verifiedFactor ? "Enabled" : "Not enabled"}
              </Badge>
            )}
          </div>

          {loadingFactors ? (
            <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
          ) : pending ? (
            <form onSubmit={handleVerify} className="flex flex-col gap-3">
              <p className="text-sm text-ink-secondary">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.), then
                enter the 6-digit code it shows.
              </p>
              <div className="flex justify-center rounded-md border border-line bg-white p-3">
                {/* qr_code from Supabase is raw SVG markup, not a ready-made
                    data: URI — per the SDK's own type comment it must be
                    prefixed with this exact scheme first. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/svg+xml;utf-8,${pending.qrCode}`}
                  alt="Authenticator QR code"
                  className="h-40 w-40"
                />
              </div>
              <p className="text-center text-xs text-ink-muted">
                Can&apos;t scan? Enter this code manually: <span className="font-mono text-ink">{pending.secret}</span>
              </p>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
                Verification code
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="rounded-md border border-line-strong bg-surface px-3 py-2 text-center text-lg tracking-[0.4em] text-ink focus:border-primary focus:outline-none"
                  placeholder="000000"
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={verifying} disabled={verifyCode.length !== 6}>
                  Verify &amp; enable
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={cancelEnroll}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : verifiedFactor ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-secondary">
                An authenticator app is enrolled on this account. You&apos;ll be asked for a code every time you sign
                in.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="self-start text-danger"
                onClick={() => setRemoveTarget(verifiedFactor)}
              >
                <ShieldOff size={13} className="mr-1.5" /> Remove authenticator app
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-secondary">
                Add an extra layer of security — once enabled, sign-in requires a 6-digit code from your
                authenticator app in addition to your password.
              </p>
              <Button size="sm" onClick={startEnroll} loading={enrolling} className="self-start">
                Set up authenticator app
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-ink-secondary" />
              <h3 className="text-sm font-semibold text-ink">Gmail</h3>
            </div>
            {googleConnection !== undefined && (
              <Badge status={googleConnection ? "success" : "neutral"}>
                {googleConnection ? "Connected" : "Not connected"}
              </Badge>
            )}
          </div>

          {googleConnection === undefined ? (
            <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
          ) : googleConnection ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-secondary">
                Connected as <span className="font-medium text-ink">{googleConnection.email}</span> — read and draft
                access only, no send.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="self-start text-danger"
                onClick={() => setConfirmDisconnect(true)}
              >
                Disconnect Gmail
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-secondary">
                Connect your Gmail account for the Copilot to search and draft emails on your behalf — read and draft
                only, it will never send. Requires an authenticator app set up above.
              </p>
              <Button size="sm" onClick={connectGoogle} loading={connectingGoogle} className="self-start">
                Connect Gmail
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title="Remove authenticator app?"
        variant="confirm"
        destructive
        confirmLabel={removing ? "Removing…" : "Remove"}
        onConfirm={confirmRemove}
      >
        Signing in will no longer require a verification code. You can set up a new authenticator app again at any
        time.
      </Dialog>

      <Dialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Gmail?"
        variant="confirm"
        destructive
        confirmLabel={disconnectingGoogle ? "Disconnecting…" : "Disconnect"}
        onConfirm={disconnectGoogle}
      >
        This revokes MMDI ONE&apos;s access at Google and removes the connection. The Copilot will no longer be able
        to search or draft in this mailbox until you reconnect.
      </Dialog>
    </div>
  );
}
