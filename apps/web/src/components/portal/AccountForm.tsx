"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import type { PortalUserRow } from "@mmdi/shared/rows";

export function AccountForm({
  portalUser,
  userId,
  email,
}: {
  portalUser: PortalUserRow | null;
  userId: string;
  email: string;
}) {
  const [fullName, setFullName] = useState(portalUser?.full_name ?? "");
  const [phone, setPhone] = useState(portalUser?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const { error: updateError } = await supabase.from("portal_users").update({ full_name: fullName, phone }).eq("id", userId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={handleSave} className="rounded-lg border border-line bg-surface p-4">
      <p className="mb-3 text-sm font-semibold text-ink">Your contact details</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="fullName" className="text-xs text-ink-muted">
            Your name
          </label>
          <input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="phone" className="text-xs text-ink-muted">
            Phone
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        <label className="text-xs text-ink-muted">Email (sign-in, fixed)</label>
        <p className="text-sm text-ink-secondary">{email}</p>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {saved && <p className="mt-2 text-xs text-success">Saved.</p>}
      <Button size="sm" type="submit" loading={saving} className="mt-3">
        Save
      </Button>
    </form>
  );
}
