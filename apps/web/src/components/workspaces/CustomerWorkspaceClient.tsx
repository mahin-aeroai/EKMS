"use client";

import { useState } from "react";
import { Building2, Pencil, Archive, UserPlus, Plus, UserX, RotateCcw } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tag } from "@/components/ui/Tag";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Tabs } from "@/components/ui/Tabs";
import { StatCard } from "@/components/ui/Card";
import { GaugeChart } from "@/components/ui/Charts";
import { Comments, type Comment } from "@/components/ui/Comments";
import { ApprovalPanel } from "@/components/ui/ApprovalPanel";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { RelationshipGraph, type GraphNode, type GraphEdge } from "@/components/ui/RelationshipGraph";
import { PromptInput } from "@/components/ui/PromptInput";
import { useRecordCopilot } from "@/lib/useRecordCopilot";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import type { CustomerRow, CustomerContactRow, CustomerCommentRow, CustomerApprovalRow } from "@mmdi/shared/rows";
import { timeAgo } from "@/lib/timeAgo";

function toDisplayComment(row: CustomerCommentRow): Comment {
  return { id: row.id, author: row.author, content: row.content, time: timeAgo(row.created_at), resolved: row.resolved };
}

/**
 * Client half of the Customer Workspace. Receives data already fetched
 * server-side from Supabase (see page.tsx) and handles all interactivity —
 * including writing new comments and approval decisions straight back to
 * the database. Insights, Timeline, and Documents aren't wired to a real
 * data source yet and show an honest empty state instead of sample content.
 */
const emptyContactDraft = { name: "", role: "", phone: "", email: "" };

export function CustomerWorkspaceClient({
  customer,
  initialContacts,
  initialComments,
  initialApproval,
}: {
  customer: CustomerRow;
  initialContacts: CustomerContactRow[];
  initialComments: CustomerCommentRow[];
  initialApproval: CustomerApprovalRow | null;
}) {
  const { toast } = useToast();
  const { ask, answer, loading } = useRecordCopilot();
  const role = useUserRole();
  const [comments, setComments] = useState<Comment[]>(initialComments.map(toDisplayComment));
  const [approval, setApproval] = useState(initialApproval);

  // Contacts — kept as local state (not just the initial server fetch) so
  // add/edit/deactivate all update the UI immediately without a full page
  // reload. Deactivating someone never deletes their row (see
  // supabase-customer-contacts-mobile-active-migration.sql) -- they stay in
  // the historical record, just hidden from "who do I contact today" by
  // default, behind the "Show former contacts" toggle.
  const [contacts, setContacts] = useState<CustomerContactRow[]>(initialContacts);
  const activeContacts = contacts.filter((c) => c.is_active);
  const inactiveContacts = contacts.filter((c) => !c.is_active);
  const [showInactiveContacts, setShowInactiveContacts] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState(emptyContactDraft);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editContactDraft, setEditContactDraft] = useState(emptyContactDraft);

  async function handleAddContact() {
    if (!contactDraft.name.trim()) {
      toast("danger", "Enter a name first");
      return;
    }
    const { data, error } = await supabase
      .from("customer_contacts")
      .insert({
        customer_id: customer.id,
        name: contactDraft.name.trim(),
        role: contactDraft.role.trim() || null,
        phone: contactDraft.phone.trim() || null,
        email: contactDraft.email.trim() || null,
      })
      .select()
      .single();
    if (error) {
      toast("danger", "Couldn't save contact — check your Supabase connection");
      return;
    }
    setContacts((cs) => [...cs, data as CustomerContactRow]);
    setContactDraft(emptyContactDraft);
    setAddingContact(false);
    toast("success", `Added ${(data as CustomerContactRow).name}`);
  }

  function startEditContact(c: CustomerContactRow) {
    setEditingContactId(c.id);
    setEditContactDraft({ name: c.name, role: c.role ?? "", phone: c.phone ?? "", email: c.email ?? "" });
  }

  async function handleSaveContact(id: string) {
    if (!editContactDraft.name.trim()) {
      toast("danger", "Name can't be empty");
      return;
    }
    const patch = {
      name: editContactDraft.name.trim(),
      role: editContactDraft.role.trim() || null,
      phone: editContactDraft.phone.trim() || null,
      email: editContactDraft.email.trim() || null,
    };
    const { error } = await supabase.from("customer_contacts").update(patch).eq("id", id);
    if (error) {
      toast("danger", "Couldn't save changes — check your Supabase connection");
      return;
    }
    setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setEditingContactId(null);
    toast("success", "Contact updated");
  }

  // Soft-deactivate/reactivate -- never a delete, per the user's request to
  // keep former contacts on file rather than lose them outright.
  async function handleToggleContactActive(c: CustomerContactRow) {
    const nextActive = !c.is_active;
    const patch = { is_active: nextActive, deactivated_at: nextActive ? null : new Date().toISOString() };
    const { error } = await supabase.from("customer_contacts").update(patch).eq("id", c.id);
    if (error) {
      toast("danger", "Couldn't update — check your Supabase connection");
      return;
    }
    setContacts((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
    toast(nextActive ? "success" : "warning", nextActive ? `${c.name} reactivated` : `${c.name} marked as no longer with the organization`);
  }
  const nodes: GraphNode[] = [
    { id: "center", label: customer.name, type: "Customer" },
    ...(customer.account_owner ? [{ id: "n4", label: customer.account_owner, type: "Account Owner" }] : []),
  ];
  const edges: GraphEdge[] = [
    ...(customer.account_owner ? [{ from: "center", to: "n4", label: "managed by" }] : []),
  ];
  const [center, setCenter] = useState(nodes[0]);

  async function handleAddComment(text: string) {
    const optimistic: Comment = { id: crypto.randomUUID(), author: "You", content: text, time: "just now" };
    setComments((c) => [...c, optimistic]);

    const { data, error } = await supabase
      .from("customer_comments")
      .insert({ customer_id: customer.id, author: "You", content: text })
      .select()
      .single();

    if (error) {
      toast("danger", "Couldn't save comment — check your Supabase connection");
      return;
    }
    // Replace the optimistic entry with the real row (real id, real timestamp).
    setComments((c) => c.map((item) => (item.id === optimistic.id ? toDisplayComment(data as CustomerCommentRow) : item)));
  }

  async function handleDecision(status: "approved" | "rejected", message: string) {
    if (!approval) return;
    const { error } = await supabase.from("customer_approvals").update({ status }).eq("id", approval.id);
    if (error) {
      toast("danger", "Couldn't update approval — check your Supabase connection");
      return;
    }
    setApproval({ ...approval, status });
    toast(status === "approved" ? "success" : "danger", message);
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Customers", href: "/workspaces/customer" }, { label: customer.name }]} />

      {/* Workspace header — Universal Workspace Pattern, header region */}
      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Building2 size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{customer.name}</h1>
              <Badge status={customer.status === "active" ? "success" : "neutral"}>{customer.status === "active" ? "Active" : customer.status}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Customer — {customer.code} · Account owner: {customer.account_owner ?? "Unassigned"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {customer.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => toast("info", `Opening edit form for ${customer.name}`)}>
            <Pencil size={14} className="mr-1.5" /> Edit
          </Button>
          <ContextMenu
            items={[
              { label: "Assign account owner", icon: <UserPlus size={13} />, onSelect: () => toast("info", "Reassign owner") },
              { label: "Archive customer", icon: <Archive size={13} />, onSelect: () => toast("warning", "Archive requires Manager approval"), destructive: true },
            ]}
          />
        </div>
      </div>

      {/* Stat row — live from Supabase */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Lifetime Value" value={`₹${(customer.lifetime_value / 10000000).toFixed(2)} Cr`} />
        <StatCard label="Open Orders" value={String(customer.open_orders)} />
        <StatCard label="On-Time Delivery" value={`${customer.on_time_delivery}%`} />
        <StatCard label="Account Health" value={`${customer.health_score} / 100`} />
      </div>

      <Tabs
        defaultId="overview"
        items={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <div className="grid grid-cols-1 gap-6 pt-5 lg:grid-cols-3">
                <div className="flex flex-col gap-4 lg:col-span-2">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-ink">Ask about this account</h3>
                    <PromptInput
                      placeholder='e.g. "Summarize open risk on this account"'
                      onSubmit={(v) => ask(`The user is viewing Customer ${customer.code} (${customer.name}) in MMDI ONE, an internal operating platform for MMDI.`, v)}
                      disabled={loading}
                    />
                    {loading && <p className="mt-2 text-xs text-ink-muted">AI Copilot is looking into it…</p>}
                    {answer && (
                      <div className="mt-2 rounded-lg border border-line bg-surface-sunken p-3 text-sm text-ink">
                        <p className="whitespace-pre-line">{answer.content}</p>
                        {answer.citations && answer.citations.length > 0 && (
                          <p className="mt-2 text-xs text-ink-muted">{answer.citations.join(" \u00b7 ")}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-line bg-surface p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink">Key contacts</h3>
                      {canWrite(role) && !addingContact && (
                        <Button variant="ghost" size="sm" onClick={() => setAddingContact(true)}>
                          <Plus size={13} className="mr-1" /> Add
                        </Button>
                      )}
                    </div>

                    {addingContact && (
                      <div className="mb-3 flex flex-col gap-2 rounded-md border border-line-strong bg-surface-sunken p-3">
                        <input
                          autoFocus
                          placeholder="Name"
                          value={contactDraft.name}
                          onChange={(e) => setContactDraft((d) => ({ ...d, name: e.target.value }))}
                          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                        />
                        <input
                          placeholder="Role (e.g. Store Manager)"
                          value={contactDraft.role}
                          onChange={(e) => setContactDraft((d) => ({ ...d, role: e.target.value }))}
                          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                        />
                        <input
                          placeholder="Mobile number"
                          value={contactDraft.phone}
                          onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))}
                          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                        />
                        <input
                          placeholder="Email"
                          value={contactDraft.email}
                          onChange={(e) => setContactDraft((d) => ({ ...d, email: e.target.value }))}
                          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAddingContact(false);
                              setContactDraft(emptyContactDraft);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button variant="primary" size="sm" onClick={handleAddContact}>
                            Save
                          </Button>
                        </div>
                      </div>
                    )}

                    {activeContacts.length === 0 && !addingContact ? (
                      <p className="text-sm text-ink-muted">No contacts on file.</p>
                    ) : (
                      <ul className="flex flex-col gap-3 text-sm">
                        {activeContacts.map((c) =>
                          editingContactId === c.id ? (
                            <li key={c.id} className="flex flex-col gap-2 rounded-md border border-line-strong bg-surface-sunken p-3">
                              <input
                                autoFocus
                                value={editContactDraft.name}
                                onChange={(e) => setEditContactDraft((d) => ({ ...d, name: e.target.value }))}
                                placeholder="Name"
                                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                              />
                              <input
                                value={editContactDraft.role}
                                onChange={(e) => setEditContactDraft((d) => ({ ...d, role: e.target.value }))}
                                placeholder="Role"
                                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                              />
                              <input
                                value={editContactDraft.phone}
                                onChange={(e) => setEditContactDraft((d) => ({ ...d, phone: e.target.value }))}
                                placeholder="Mobile number"
                                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                              />
                              <input
                                value={editContactDraft.email}
                                onChange={(e) => setEditContactDraft((d) => ({ ...d, email: e.target.value }))}
                                placeholder="Email"
                                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                              />
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setEditingContactId(null)}>
                                  Cancel
                                </Button>
                                <Button variant="primary" size="sm" onClick={() => handleSaveContact(c.id)}>
                                  Save
                                </Button>
                              </div>
                            </li>
                          ) : (
                            <li key={c.id} className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-ink">{c.name}</p>
                                <p className="text-xs text-ink-secondary">
                                  {c.role ?? "Contact"}
                                  {c.phone ? ` · ${c.phone}` : ""}
                                  {c.email ? ` · ${c.email}` : ""}
                                </p>
                              </div>
                              {canWrite(role) && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button variant="icon" size="sm" aria-label={`Edit ${c.name}`} onClick={() => startEditContact(c)}>
                                    <Pencil size={13} />
                                  </Button>
                                  <Button
                                    variant="icon"
                                    size="sm"
                                    aria-label={`Mark ${c.name} as left the organization`}
                                    onClick={() => handleToggleContactActive(c)}
                                  >
                                    <UserX size={13} />
                                  </Button>
                                </div>
                              )}
                            </li>
                          )
                        )}
                      </ul>
                    )}

                    {inactiveContacts.length > 0 && (
                      <div className="mt-3 border-t border-line pt-3">
                        <button
                          type="button"
                          onClick={() => setShowInactiveContacts((v) => !v)}
                          className="text-xs font-medium text-ink-muted hover:text-ink-secondary"
                        >
                          {showInactiveContacts ? "Hide" : "Show"} former contacts ({inactiveContacts.length})
                        </button>
                        {showInactiveContacts && (
                          <ul className="mt-2 flex flex-col gap-3 text-sm">
                            {inactiveContacts.map((c) => (
                              <li key={c.id} className="flex items-start justify-between gap-2 opacity-60">
                                <div>
                                  <p className="font-medium text-ink line-through">{c.name}</p>
                                  <p className="text-xs text-ink-secondary">
                                    {c.role ?? "Contact"}
                                    {c.phone ? ` · ${c.phone}` : ""}
                                    {c.email ? ` · ${c.email}` : ""}
                                    {c.deactivated_at ? ` · Left ${timeAgo(c.deactivated_at)}` : ""}
                                  </p>
                                </div>
                                {canWrite(role) && (
                                  <Button
                                    variant="icon"
                                    size="sm"
                                    aria-label={`Reactivate ${c.name}`}
                                    onClick={() => handleToggleContactActive(c)}
                                  >
                                    <RotateCcw size={13} />
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: "insights",
            label: "Insights",
            content: (
              <div className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-surface p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink">Account health</h3>
                  <div className="flex justify-center">
                    <GaugeChart value={customer.health_score} label="Composite health score" />
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="py-6 text-center text-sm text-ink-muted">No order volume trend data connected yet.</p>
                </div>
              </div>
            ),
          },
          {
            id: "timeline",
            label: "Timeline",
            content: (
              <div className="pt-5">
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="py-6 text-center text-sm text-ink-muted">No account activity history connected yet.</p>
                </div>
              </div>
            ),
          },
          {
            id: "documents",
            label: "Documents",
            content: (
              <div className="pt-5">
                <div className="rounded-lg border border-line bg-surface p-4">
                  <p className="py-6 text-center text-sm text-ink-muted">No documents linked to this customer yet.</p>
                </div>
              </div>
            ),
          },
          {
            id: "relationships",
            label: "Relationships",
            content: (
              <div className="pt-5">
                <RelationshipGraph
                  center={center}
                  nodes={nodes}
                  edges={edges}
                  onRecenter={(id) => {
                    const node = nodes.find((n) => n.id === id);
                    if (node) {
                      setCenter(node);
                      toast("ai", `Recentered on ${node.label}`);
                    }
                  }}
                />
              </div>
            ),
          },
          {
            id: "activity",
            label: "Activity",
            content: (
              <div className="flex flex-col gap-6 pt-5">
                {approval && (
                  <ApprovalPanel
                    title={approval.title}
                    requestedBy={approval.requested_by}
                    value={approval.value}
                    stages={[
                      { id: "s1", label: "Submitted", status: "complete", actor: approval.requested_by.split(",")[0], timestamp: timeAgo(approval.created_at) },
                      {
                        id: "s2",
                        label: "Finance Review",
                        status: approval.status === "pending" ? "current" : "complete",
                      },
                      {
                        id: "s3",
                        label: approval.status === "rejected" ? "Rejected" : "Final Sign-off",
                        status: approval.status === "approved" ? "complete" : approval.status === "rejected" ? "escalated" : "upcoming",
                      },
                    ]}
                    onApprove={() => handleDecision("approved", `${approval.title} approved`)}
                    onReject={() => handleDecision("rejected", `${approval.title} rejected`)}
                    onDelegate={() => toast("info", "Delegated to Finance Director")}
                    canDecide={canWrite(role)}
                  />
                )}
                <Comments comments={comments} onAdd={handleAddComment} canWrite={canWrite(role)} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
