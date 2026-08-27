"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Users, ArrowLeft, Plus, Mail, Check, Clock, Trash2, ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";

// LFG Partners -- staff-side management of installation-partner accounts
// (lfg_partners) and their portal logins (lfg_partner_invited_emails/
// lfg_partner_users). Direct mirror of workspaces/customer-portal's
// CompaniesTab -- same invite-link-not-password create-login flow, same
// table shapes (lfg_partners/lfg_partner_invited_emails/lfg_partner_users
// are 1:1 copies of portal_companies/portal_invited_emails/portal_users --
// see supabase-lfg-site-management-schema.sql's STEP 2-5 comments), just
// without a stores sub-list since a partner's "stores" are the lfg_sites
// already browsable from the Site Master list.
//
// This is the answer to "where the user creation and previleges" for LFG
// PARTNER accounts. Staff account roles (admin/editor/viewer) are a
// separate, already-existing page -- see workspaces/administration --
// not duplicated here.

interface PartnerRow {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  active: boolean;
  notes: string | null;
}

interface InvitedEmail {
  email: string;
  contact_name: string | null;
  invited_at: string;
  consumed_at: string | null;
}

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
}

export default function LfgPartnersPage() {
  const router = useRouter();
  const role = useUserRole();
  const editable = canWrite(role);

  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invites, setInvites] = useState<InvitedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPartner, setShowNewPartner] = useState(false);

  async function loadInvites(partnerId: string) {
    const { data } = await supabase
      .from("lfg_partner_invited_emails")
      .select("*")
      .eq("partner_id", partnerId)
      .order("invited_at", { ascending: false });
    setInvites((data ?? []) as InvitedEmail[]);
  }

  useEffect(() => {
    supabase
      .from("lfg_partners")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setPartners((data ?? []) as PartnerRow[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInvites(selectedId);
  }, [selectedId]);

  const selected = partners.find((p) => p.id === selectedId) ?? null;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Partners" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Users size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">LFG Partners</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Installation-partner accounts and their portal logins — invite a partner to sign in and manage the sites
              assigned to them.
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => router.push("/workspaces/lfg")}>
          <ArrowLeft size={15} className="mr-1.5" /> Site Master
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Partners ({partners.length})</p>
            {editable && (
              <Button size="sm" variant="secondary" onClick={() => setShowNewPartner((v) => !v)}>
                <Plus size={14} /> New partner
              </Button>
            )}
          </div>

          {showNewPartner && (
            <NewPartnerForm
              onCreated={(partner) => {
                setPartners((prev) => [...prev, partner].sort((a, b) => a.name.localeCompare(b.name)));
                setShowNewPartner(false);
                setSelectedId(partner.id);
              }}
            />
          )}

          {loading ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {partners.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selectedId === p.id ? "border-primary bg-primary-tint" : "border-line bg-surface hover:bg-surface-sunken"
                  }`}
                >
                  <span className="font-medium text-ink">{p.name}</span>
                  <Badge status={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge>
                </button>
              ))}
              {partners.length === 0 && <p className="text-sm text-ink-muted">No partners yet — create the first one.</p>}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          {!selected ? (
            <p className="text-sm text-ink-muted">Select a partner to manage its login.</p>
          ) : (
            <PartnerDetail partner={selected} invites={invites} editable={editable} onChanged={() => loadInvites(selected.id)} />
          )}
        </div>
      </div>
    </div>
  );
}

function NewPartnerForm({ onCreated }: { onCreated: (partner: PartnerRow) => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Partner name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("lfg_partners")
      .insert({
        name: name.trim(),
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
      })
      .select()
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onCreated(data as PartnerRow);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunken p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Partner name (e.g. XYZ Installations)"
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
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button size="sm" type="submit" loading={saving} className="w-fit">
        Create partner
      </Button>
    </form>
  );
}

function PartnerDetail({
  partner,
  invites,
  editable,
  onChanged,
}: {
  partner: PartnerRow;
  invites: InvitedEmail[];
  editable: boolean;
  onChanged: () => void;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteContactName, setInviteContactName] = useState("");
  const [creatingLogin, setCreatingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  // Set once right after a successful invite -- a confirmation, not a
  // credential (no password is ever generated or shown here; the partner
  // sets their own via the emailed invite link) -- same as CompaniesTab.
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [deletingInviteEmail, setDeletingInviteEmail] = useState<string | null>(null);

  async function handleCreateLogin(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setCreatingLogin(true);
    setLoginError(null);
    setInvitedEmail(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/lfg/partners/${partner.id}/create-login`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: inviteEmail.trim(),
          contact_name: inviteContactName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data?.message ?? "Could not send the invite.");
        return;
      }
      setInvitedEmail(data.email);
      setInviteEmail("");
      setInviteContactName("");
      onChanged();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Could not send the invite — check your connection and try again.");
    } finally {
      setCreatingLogin(false);
    }
  }

  async function handleDeleteInvite(inv: InvitedEmail) {
    if (!window.confirm(`Remove the invite for "${inv.email}"? If they haven't signed in yet this just cancels it -- it does not touch an existing account.`)) return;
    setDeletingInviteEmail(inv.email);
    setLoginError(null);
    const { error: deleteError } = await supabase
      .from("lfg_partner_invited_emails")
      .delete()
      .eq("email", inv.email)
      .eq("partner_id", partner.id);
    setDeletingInviteEmail(null);
    if (deleteError) {
      setLoginError(deleteError.message);
      return;
    }
    onChanged();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="flex items-center gap-2 text-base font-semibold text-ink">
          {partner.name}
          <Badge status={partner.active ? "success" : "neutral"}>{partner.active ? "Active" : "Inactive"}</Badge>
        </p>
        <p className="text-xs text-ink-muted">{partner.contact_email ?? "No contact email on file"}</p>
        {partner.contact_name && (
          <p className="mt-1 text-xs text-ink-secondary">
            {partner.contact_name}
            {partner.contact_phone ? ` · ${partner.contact_phone}` : ""}
          </p>
        )}
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
                {editable && (
                  <button
                    type="button"
                    onClick={() => handleDeleteInvite(inv)}
                    disabled={deletingInviteEmail === inv.email}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted hover:bg-danger-tint hover:text-danger disabled:opacity-50"
                    aria-label={`Remove invite for ${inv.email}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </li>
          ))}
          {invites.length === 0 && <p className="text-sm text-ink-muted">No logins invited yet.</p>}
        </ul>

        {invitedEmail && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-success bg-success-tint px-3 py-2 text-sm">
            <p className="text-ink">
              Invite sent to <span className="font-semibold">{invitedEmail}</span> — they&apos;ll get an email with a
              link to set their own password.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setInvitedEmail(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {editable && (
          <>
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
              <Button size="sm" type="submit" loading={creatingLogin}>
                <Plus size={14} /> Send invite
              </Button>
            </form>
            {loginError && <p className="mt-1 text-xs text-danger">{loginError}</p>}
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
              <ShieldCheck size={13} className="mt-0.5 shrink-0" />
              No password to share — this emails the partner a link to set their own, which also confirms the address
              is real. They&apos;ll then see only the sites assigned to {partner.name}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
