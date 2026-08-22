"use client";

import { useState } from "react";
import { Pencil, History, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import type { PortalCompanyStoreRow, PortalStoreAddressHistoryRow } from "@mmdi/shared/rows";

// Customer self-service editing of a store's delivery address/city/GSTIN,
// with a full revision history underneath. Address and GSTIN are what
// gate whether a store can be ordered for at all (see NewOrderForm) --
// previously the ONLY way to fix a store missing either was to email
// MMDI; this lets whoever's actually placing orders fix it themselves.
// Applies immediately on save (no MMDI approval step) -- every change,
// from either this form or MMDI's own CompaniesTab, is captured by a
// database trigger (portal_store_address_history_trg), not by this
// component, so the history is complete regardless of which side made
// the edit.
export function StoresPanel({
  stores,
  historyByStore,
}: {
  stores: PortalCompanyStoreRow[];
  historyByStore: Record<string, PortalStoreAddressHistoryRow[]>;
}) {
  if (stores.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4">
        <p className="mb-1 text-sm font-semibold text-ink">Your stores</p>
        <p className="text-sm text-ink-muted">No store locations set up yet — contact MMDI.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="mb-1 text-sm font-semibold text-ink">Your stores</p>
      <p className="mb-3 text-xs text-ink-muted">
        You can update a store&apos;s delivery address and GSTIN yourself — every change is kept below. Orders already
        placed keep the address they were placed with, even after you edit it here.
      </p>
      <div className="flex flex-col gap-3">
        {stores.map((store) => (
          <StoreRow key={store.id} store={store} history={historyByStore[store.id] ?? []} />
        ))}
      </div>
    </div>
  );
}

function StoreRow({ store, history }: { store: PortalCompanyStoreRow; history: PortalStoreAddressHistoryRow[] }) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [address, setAddress] = useState(store.address ?? "");
  const [city, setCity] = useState(store.city ?? "");
  const [gstin, setGstin] = useState(store.gstin ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(store);
  const [entries, setEntries] = useState(history);

  const incomplete = !current.address?.trim() || !current.gstin?.trim();

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("portal_company_stores")
      .update({ address: address.trim() || null, city: city.trim() || null, gstin: gstin.trim() || null })
      .eq("id", store.id)
      .select("*")
      .maybeSingle();
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (data) setCurrent(data as PortalCompanyStoreRow);
    setEditing(false);
    // The trigger already wrote the history row server-side -- re-fetch
    // just this store's history so "View history" reflects the edit
    // without a full page reload.
    const { data: freshHistory } = await supabase
      .from("portal_store_address_history")
      .select("*")
      .eq("store_id", store.id)
      .order("changed_at", { ascending: false });
    if (freshHistory) setEntries(freshHistory as PortalStoreAddressHistoryRow[]);
  }

  return (
    <div className="rounded-md bg-surface-sunken p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-ink">{current.store_name}</p>
          {!editing && (
            <>
              <p className="text-xs text-ink-secondary">{current.address || "No delivery address on file."}</p>
              {current.city && <p className="text-xs text-ink-secondary">{current.city}</p>}
              <p className="text-xs text-ink-muted">GSTIN: {current.gstin || "—"}</p>
              {incomplete && (
                <p className="mt-1 text-xs font-medium text-warning">⚠ Missing address or GSTIN — this store can&apos;t be ordered for yet.</p>
              )}
            </>
          )}
        </div>
        {!editing && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Edit address">
              <Pencil size={13} /> Edit
            </Button>
            {entries.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)} aria-label="View history">
                <History size={13} /> History
              </Button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-muted">Delivery address</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-ink-muted">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-ink-muted">GSTIN</label>
              <input
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} loading={saving}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setAddress(current.address ?? "");
                setCity(current.city ?? "");
                setGstin(current.gstin ?? "");
                setError(null);
                setEditing(false);
              }}
            >
              <X size={13} /> Cancel
            </Button>
          </div>
        </div>
      )}

      {showHistory && !editing && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-2">
          {entries.map((h) => (
            <li key={h.id} className="text-xs text-ink-secondary">
              <span className="font-medium text-ink">{h.changed_by_role === "customer" ? "You" : "MMDI staff"}</span>{" "}
              on {new Date(h.changed_at).toLocaleString("en-IN")}
              {h.old_address !== h.new_address && (
                <p className="mt-0.5">
                  Address: <span className="line-through">{h.old_address || "—"}</span> → {h.new_address || "—"}
                </p>
              )}
              {h.old_city !== h.new_city && (
                <p className="mt-0.5">
                  City: <span className="line-through">{h.old_city || "—"}</span> → {h.new_city || "—"}
                </p>
              )}
              {h.old_gstin !== h.new_gstin && (
                <p className="mt-0.5">
                  GSTIN: <span className="line-through">{h.old_gstin || "—"}</span> → {h.new_gstin || "—"}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
