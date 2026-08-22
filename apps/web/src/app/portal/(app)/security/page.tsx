"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { usePortalUser } from "@/lib/PortalUserContext";

export default function PortalSecurityPage() {
  const portalUser = usePortalUser();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Security</h1>
        <p className="text-sm text-ink-muted">Signed in as {portalUser?.email}.</p>
      </div>

      <form onSubmit={handleChangePassword} className="max-w-sm rounded-lg border border-line bg-surface p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck size={16} /> Change password
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="newPassword" className="text-xs text-ink-muted">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
              placeholder="At least 8 characters"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmNewPassword" className="text-xs text-ink-muted">
              Confirm new password
            </label>
            <input
              id="confirmNewPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        {saved && <p className="mt-2 text-xs text-success">Password updated.</p>}
        <Button size="sm" type="submit" loading={saving} className="mt-3">
          Update password
        </Button>
      </form>
    </div>
  );
}
