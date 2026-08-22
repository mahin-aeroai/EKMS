"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Mail, MapPin, Check, Clock, Copy, Check as CheckIcon, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { PortalCompanyRow, PortalCompanyStoreRow } from "@mmdi/shared/rows";

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
}

interface InvitedEmail {
  email: string;
  contact_name: string | null;
  invited_at: string;
  consumed_at: string | null;
}

export function CompaniesTab() {
  const [companies, setCompanies] = useState<PortalCompanyRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stores, setStores] = useState<PortalCompanyStoreRow[]>([]);
  const [invites, setInvites] = useState<InvitedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCompany, setShowNewCompany] = useState(false);

  // loadDetail is also called from CompanyDetail's onChanged prop (after
  // adding a store/invite), so it stays a standalone function — only the
  // mount-time effects below need to avoid calling a named async function
  // directly (react-hooks/set-state-in-effect), by inlining the fetch.
  async function loadDetail(companyId: string) {
    const [storesRes, invitesRes] = await Promise.all([
      supabase.from("portal_company_stores").select("*").eq("company_id", companyId).order("store_name"),
      supabase.from("portal_invited_emails").select("*").eq("company_id", companyId).order("invited_at", { ascending: false }),
    ]);
    setStores((storesRes.data ?? []) as PortalCompanyStoreRow[]);
    setInvites((invitesRes.data ?? []) as InvitedEmail[]);
  }

  useEffect(() => {
    supabase
      .from("portal_companies")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setCompanies((data ?? []) as PortalCompanyRow[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    Promise.all([
      supabase.from("portal_company_stores").select("*").eq("company_id", selectedId).order("store_name"),
      supabase.from("portal_invited_emails").select("*").eq("company_id", selectedId).order("invited_at", { ascending: false }),
    ]).then(([storesRes, invitesRes]) => {
      setStores((storesRes.data ?? []) as PortalCompanyStoreRow[]);
      setInvites((invitesRes.data ?? []) as InvitedEmail[]);
    });
  }, [selectedId]);

  const selected = companies.find((c) => c.id === selectedId) ?? null;

  if (loading) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Retail chains ({companies.length})</p>
          <Button size="sm" variant="secondary" onClick={() => setShowNewCompany((v) => !v)}>
            <Plus size={14} /> New company
          </Button>
        </div>

        {showNewCompany && (
          <NewCompanyForm
            onCreated={(company) => {
              setCompanies((prev) => [...prev, company].sort((a, b) => a.name.localeCompare(b.name)));
              setShowNewCompany(false);
              setSelectedId(company.id);
            }}
          />
        )}

        <div className="flex flex-col gap-1.5">
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                selectedId === c.id ? "border-primary bg-primary-tint" : "border-line bg-surface hover:bg-surface-sunken"
              }`}
            >
              <span className="font-medium text-ink">{c.name}</span>
              <Badge status={c.active ? "success" : "neutral"}>{c.active ? "Active" : "Inactive"}</Badge>
            </button>
          ))}
          {companies.length === 0 && <p className="text-sm text-ink-muted">No companies yet — create the first one.</p>}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {!selected ? (
          <p className="text-sm text-ink-muted">Select a company to manage its stores and invites.</p>
        ) : (
          <CompanyDetail company={selected} stores={stores} invites={invites} onChanged={() => loadDetail(selected.id)} />
        )}
      </div>
    </div>
  );
}

function NewCompanyForm({ onCreated }: { onCreated: (company: PortalCompanyRow) => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Company name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("portal_companies")
      .insert({
        name: name.trim(),
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        contact_email: contactEmail || null,
        gstin: gstin || null,
        billing_address: billingAddress || null,
      })
      .select()
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onCreated(data as PortalCompanyRow);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunken p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Company name (e.g. Aptronix)"
        className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Contact name"
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        />
        <input
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="Contact phone"
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        />
      </div>
      <input
        value={contactEmail}
        onChange={(e) => setContactEmail(e.target.value)}
        placeholder="Contact email"
        className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={gstin}
          onChange={(e) => setGstin(e.target.value)}
          placeholder="GSTIN"
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        />
        <input
          value={billingAddress}
          onChange={(e) => setBillingAddress(e.target.value)}
          placeholder="Billing address"
          className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button size="sm" type="submit" loading={saving} className="w-fit">
        Create company
      </Button>
    </form>
  );
}

function CompanyDetail({
  company,
  stores,
  invites,
  onChanged,
}: {
  company: PortalCompanyRow;
  stores: PortalCompanyStoreRow[];
  invites: InvitedEmail[];
  onChanged: () => void;
}) {
  const [storeName, setStoreName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteContactName, setInviteContactName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingLogin, setCreatingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  // The one and only time the plaintext password is ever visible — shown
  // once right after creation, never persisted, never re-fetchable.
  const [newCredential, setNewCredential] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // Tracks which single row is mid-delete, so only that row's button shows
  // a disabled/loading state rather than freezing the whole list.
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);
  const [deletingInviteEmail, setDeletingInviteEmail] = useState<string | null>(null);

  async function handleDeleteStore(store: PortalCompanyStoreRow) {
    if (!window.confirm(`Remove "${store.store_name}"? This can't be undone.`)) return;
    setDeletingStoreId(store.id);
    setError(null);
    const { error: deleteError } = await supabase.from("portal_company_stores").delete().eq("id", store.id);
    setDeletingStoreId(null);
    if (deleteError) {
      // Most likely cause: portal_stores_delete_admin restricts deletes to
      // role='admin' (editors can add/rename stores but not delete them) --
      // surface that plainly rather than a raw RLS error string.
      setError(
        deleteError.message.toLowerCase().includes("row-level security") || deleteError.code === "42501"
          ? "Only an admin account can delete a store (editors can add/rename them)."
          : deleteError.message
      );
      return;
    }
    onChanged();
  }

  async function handleDeleteInvite(inv: InvitedEmail) {
    if (!window.confirm(`Remove the invite for "${inv.email}"? If they haven't signed in yet this just cancels it -- it does not touch an existing account.`)) return;
    setDeletingInviteEmail(inv.email);
    setLoginError(null);
    const { error: deleteError } = await supabase
      .from("portal_invited_emails")
      .delete()
      .eq("email", inv.email)
      .eq("company_id", company.id);
    setDeletingInviteEmail(null);
    if (deleteError) {
      setLoginError(deleteError.message);
      return;
    }
    onChanged();
  }

  async function handleAddStore(e: FormEvent) {
    e.preventDefault();
    if (!storeName.trim()) return;
    setSaving(true);
    const { error: insertError } = await supabase.from("portal_company_stores").insert({
      company_id: company.id,
      store_name: storeName.trim(),
      address: storeAddress || null,
      city: storeCity || null,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setStoreName("");
    setStoreAddress("");
    setStoreCity("");
    onChanged();
  }

  async function handleCreateLogin(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setCreatingLogin(true);
    setLoginError(null);
    setNewCredential(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/portal/companies/${company.id}/create-login`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: inviteEmail.trim(),
          contact_name: inviteContactName.trim() || undefined,
          password: invitePassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data?.message ?? "Could not create the login.");
        return;
      }
      setNewCredential({ email: data.email, password: data.password });
      setInviteEmail("");
      setInviteContactName("");
      setInvitePassword("");
      onChanged();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Could not create the login — check your connection and try again.");
    } finally {
      setCreatingLogin(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-base font-semibold text-ink">{company.name}</p>
        <p className="text-xs text-ink-muted">{company.contact_email ?? "No contact email on file"}</p>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <MapPin size={14} /> Store locations ({stores.length})
        </p>
        <ul className="mb-2 flex flex-col gap-1">
          {stores.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-md bg-surface-sunken px-3 py-1.5 text-sm text-ink-secondary"
            >
              <span>
                {s.store_name} {s.city && <span className="text-ink-muted">— {s.city}</span>}
              </span>
              <button
                type="button"
                onClick={() => handleDeleteStore(s)}
                disabled={deletingStoreId === s.id}
                className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted hover:bg-danger-tint hover:text-danger disabled:opacity-50"
                aria-label={`Remove ${s.store_name}`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
          {stores.length === 0 && <p className="text-sm text-ink-muted">No stores yet.</p>}
        </ul>
        <form onSubmit={handleAddStore} className="flex flex-wrap gap-2">
          <input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Store name"
            className="min-w-[160px] flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <input
            value={storeCity}
            onChange={(e) => setStoreCity(e.target.value)}
            placeholder="City"
            className="w-28 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <input
            value={storeAddress}
            onChange={(e) => setStoreAddress(e.target.value)}
            placeholder="Address (optional)"
            className="min-w-[160px] flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <Button size="sm" type="submit" loading={saving}>
            Add store
          </Button>
        </form>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Mail size={14} /> Portal logins
        </p>
        <ul className="mb-2 flex flex-col gap-1">
          {invites.map((inv) => (
            <li key={inv.email} className="flex items-center justify-between rounded-md bg-surface-sunken px-3 py-1.5 text-sm">
              <span className="text-ink-secondary">
                {inv.email} {inv.contact_name && <span className="text-ink-muted">({inv.contact_name})</span>}
              </span>
              <div className="flex items-center gap-2">
                {inv.consumed_at ? (
                  <Badge status="success" dot>
                    <Check size={10} /> Active
                  </Badge>
                ) : (
                  <Badge status="warning" dot>
                    <Clock size={10} /> Awaiting sign-up
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={() => handleDeleteInvite(inv)}
                  disabled={deletingInviteEmail === inv.email}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted hover:bg-danger-tint hover:text-danger disabled:opacity-50"
                  aria-label={`Remove invite for ${inv.email}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
          {invites.length === 0 && <p className="text-sm text-ink-muted">No logins invited yet.</p>}
        </ul>

        {newCredential && (
          <div className="mb-2 flex flex-col gap-1.5 rounded-md border border-success bg-success-tint px-3 py-2 text-sm">
            <p className="font-medium text-ink">
              Login created for <span className="font-semibold">{newCredential.email}</span> — copy this password now,
              it will not be shown again:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-md bg-surface px-2 py-1 text-sm text-ink">{newCredential.password}</code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(newCredential.password);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <CheckIcon size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewCredential(null)}>
                Dismiss
              </Button>
            </div>
            <p className="text-xs text-ink-muted">
              Share this email and password with the retail chain directly (phone/WhatsApp, not email — the same
              caution as any other credential handoff).
            </p>
          </div>
        )}

        <form onSubmit={handleCreateLogin} className="flex flex-wrap gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Login email"
            type="email"
            className="min-w-[160px] flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <input
            value={inviteContactName}
            onChange={(e) => setInviteContactName(e.target.value)}
            placeholder="Contact name (optional)"
            className="min-w-[140px] flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <input
            value={invitePassword}
            onChange={(e) => setInvitePassword(e.target.value)}
            placeholder="Password (leave blank to auto-generate)"
            type="text"
            className="min-w-[220px] flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <Button size="sm" type="submit" loading={creatingLogin}>
            <Plus size={14} /> Create login
          </Button>
        </form>
        {loginError && <p className="mt-1 text-xs text-danger">{loginError}</p>}
        <p className="mt-2 text-xs text-ink-muted">
          This creates the real sign-in immediately — no separate Supabase dashboard step needed. The password shows
          once, right above, so copy it before doing anything else.
        </p>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
