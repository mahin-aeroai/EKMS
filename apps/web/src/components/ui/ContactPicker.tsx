"use client";

import { useEffect, useRef, useState } from "react";
import { UserRound, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface PickedContact {
  contactId: string;
  name: string;
  email: string;
  companyName: string | null;
}

interface ContactRow {
  id: string;
  name: string;
  role: string | null;
  email: string;
  customer_id: string;
  // Supabase's embed-typing for a to-one FK relation infers as an array
  // without a generated Database type on hand -- the real response is a
  // plain object (confirmed against the live API), so this accepts both
  // and companyName() below normalises it.
  customers: { name: string } | { name: string }[] | null;
}

function companyName(row: ContactRow): string | null {
  const c = row.customers;
  if (!c) return null;
  return Array.isArray(c) ? (c[0]?.name ?? null) : c.name;
}

/**
 * Recipient picker for the Copilot's draft_email tool (gmail-plan-v2.md
 * section 4). Search by contact name or company, not email -- a person
 * asking to draft something knows who they're writing to ("Jane at Acme"),
 * not their address.
 *
 * Selecting a contact here is the ONLY way a recipient ever reaches
 * draft_email. Whatever this returns via onSelect is sent as
 * `to: { contactId }` on the /api/ai-copilot request body -- a field the
 * model never sees, since it lives outside the `messages` array the model
 * is given. See that route's own comment on `body.to` for the other half of
 * this: it re-validates the id against a real customer_contacts row
 * regardless of what's sent, so even this component being compromised
 * couldn't draft to a contact that doesn't exist.
 */
export function ContactPicker({
  selected,
  onSelect,
}: {
  selected: PickedContact | null;
  onSelect: (contact: PickedContact | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactRow[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    const handle = setTimeout(async () => {
      // Two lookups merged: contacts whose own name matches the term, and
      // contacts belonging to a company whose name matches it -- someone
      // searches "Jane" or "Acme" interchangeably, not just the contact's
      // own name. An empty term matches every contact (ilike '%%'), which
      // is deliberate: opening the picker with nothing typed yet shows a
      // starting list rather than an empty box.
      // is_active = true excludes contacts who've left the organization
      // (soft-deactivated, not deleted -- see the Customer workspace's "Show
      // former contacts" toggle) from ever being suggested as a draft
      // recipient here.
      const [byContactName, matchingCustomers] = await Promise.all([
        supabase
          .from("customer_contacts")
          .select("id, name, role, email, customer_id, customers(name)")
          .eq("is_active", true)
          .ilike("name", `%${term}%`)
          .limit(15),
        term
          ? supabase.from("customers").select("id").ilike("name", `%${term}%`).limit(15)
          : Promise.resolve({ data: [] as { id: string }[] }),
      ]);

      let byCompany: { data: ContactRow[] | null } = { data: [] };
      const customerIds = (matchingCustomers.data ?? []).map((c) => c.id);
      if (customerIds.length > 0) {
        byCompany = await supabase
          .from("customer_contacts")
          .select("id, name, role, email, customer_id, customers(name)")
          .eq("is_active", true)
          .in("customer_id", customerIds)
          .limit(15);
      }

      const merged = new Map<string, ContactRow>();
      for (const row of [...(byContactName.data ?? []), ...(byCompany.data ?? [])] as unknown as ContactRow[]) {
        merged.set(row.id, row);
      }
      setResults([...merged.values()].slice(0, 20));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  function pick(row: ContactRow) {
    onSelect({ contactId: row.id, name: row.name, email: row.email, companyName: companyName(row) });
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={boxRef} className="relative inline-block">
      {selected ? (
        <div className="flex items-center gap-2 rounded-md border border-line bg-surface-sunken px-2.5 py-1.5 text-xs">
          <UserRound size={13} className="text-ink-secondary" />
          <span className="text-ink-secondary">
            Drafting for <span className="font-medium text-ink">{selected.name}</span>
            {selected.companyName ? ` (${selected.companyName})` : ""}
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-1 text-ink-muted hover:text-ink"
            aria-label="Clear recipient"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-surface-sunken"
        >
          <UserRound size={13} /> No recipient selected — pick a contact for drafts
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border border-line bg-surface-overlay p-2 shadow-3">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or company…"
            className="mb-1 w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
          <div className="max-h-56 overflow-y-auto">
            {results === null ? (
              <p className="px-2 py-3 text-center text-xs text-ink-muted">Loading…</p>
            ) : results.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-ink-muted">No contacts match.</p>
            ) : (
              results.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => pick(row)}
                  className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-sunken"
                >
                  <span className="text-ink">{row.name}</span>
                  <span className="text-xs text-ink-muted">
                    {row.role ? `${row.role} · ` : ""}
                    {companyName(row) ?? "Unknown company"} · {row.email}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
