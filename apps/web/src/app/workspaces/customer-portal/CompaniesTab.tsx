"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Mail, MapPin, Check, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { PortalCompanyRow, PortalCompanyStoreRow } from "@mmdi/shared/rows";

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from("portal_invited_emails").insert({
      email: inviteEmail.trim().toLowerCase(),
      company_id: company.id,
      contact_name: inviteContactName || null,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setInviteEmail("");
    setInviteContactName("");
    onChanged();
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
            <li key={s.id} className="rounded-md bg-surface-sunken px-3 py-1.5 text-sm text-ink-secondary">
              {s.store_name} {s.city && <span className="text-ink-muted">— {s.city}</span>}
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
              {inv.consumed_at ? (
                <Badge status="success" dot>
                  <Check size={10} /> Active
                </Badge>
              ) : (
                <Badge status="warning" dot>
                  <Clock size={10} /> Awaiting sign-up
                </Badge>
              )}
            </li>
          ))}
          {invites.length === 0 && <p className="text-sm text-ink-muted">No logins invited yet.</p>}
        </ul>
        <form onSubmit={handleInvite} className="flex flex-wrap gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Email to invite"
            type="email"
            className="min-w-[160px] flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <input
            value={inviteContactName}
            onChange={(e) => setInviteContactName(e.target.value)}
            placeholder="Contact name (optional)"
            className="min-w-[140px] flex-1 rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <Button size="sm" type="submit" loading={saving}>
            <Plus size={14} /> Add invite
          </Button>
        </form>
        <p className="mt-2 text-xs text-ink-muted">
          After adding an invite, create the matching account in the Supabase dashboard (Authentication → Users → Add
          user) with this exact email, then share the credentials with them directly — see OPERATIONS.md.
        </p>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
