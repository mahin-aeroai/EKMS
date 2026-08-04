"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type { MaterialSupplierRow, MaterialSupplierItemRow } from "@mmdi/shared/rows";

// Suppliers came in from the seed (supabase-material-ordering-suppliers-
// seed.sql) with only a name — address/contact_person/phone/email were
// deliberately left blank for the user to fill in here. Inline-edit-on-
// blur, same pattern as Cost Sheet's Material Pricing tab
// (src/app/workspaces/cost-sheet/MaterialPricingTab.tsx): every field
// saves itself the moment it changes, no separate Edit/Save mode. Each
// supplier's materials (from material_supplier_items) are listed
// read-only underneath — full pack_options editing is a nice-to-have for
// later, not needed yet since the seed already covers all 12 suppliers'
// materials.
export function SuppliersTab() {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<MaterialSupplierRow[] | null>(null);
  const [items, setItems] = useState<MaterialSupplierItemRow[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  function load() {
    fetchAllRows<MaterialSupplierRow>((from, to) => supabase.from("material_suppliers").select("*").order("name").range(from, to)).then(
      setSuppliers
    );
    fetchAllRows<MaterialSupplierItemRow>((from, to) =>
      supabase.from("material_supplier_items").select("*").order("material_name").range(from, to)
    ).then(setItems);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateSupplier(
    s: MaterialSupplierRow,
    patch: Partial<Pick<MaterialSupplierRow, "address" | "contact_person" | "phone" | "email" | "notes">>
  ) {
    setSavingId(s.id);
    const { error } = await supabase.from("material_suppliers").update(patch).eq("id", s.id);
    setSavingId(null);
    if (error) {
      toast("danger", `Couldn't save: ${error.message}`);
      return;
    }
    setSuppliers((prev) => prev?.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) ?? null);
  }

  function itemsFor(supplierId: string) {
    return (items ?? []).filter((i) => i.supplier_id === supplierId);
  }

  function formatPackOptions(item: MaterialSupplierItemRow) {
    return item.pack_options
      .map((p) => p.label)
      .filter(Boolean)
      .join(", ") || "—";
  }

  // See supabase-material-ordering-schema.sql's header for what each basis
  // actually computes -- this is just a readable label for this table.
  function consumptionBasisLabel(basis: MaterialSupplierItemRow["consumption_basis"]) {
    switch (basis) {
      case "total_required_material":
        return "Sheet's own linear metres";
      case "perimeter_x2":
        return "Perimeter (2×W+H) × qty";
      case "qty_per_pack_by_sheet_size":
        return "Nesting per sheet size";
      case "wastage_running_length":
        return "Running length + 40% wastage";
      case "qty_direct_wastage":
        return "Qty is metres + 40% wastage";
      case "sqft_direct_to_rolls":
        return "Sq.ft → rolls (via width)";
      case "fixed_pieces_per_roll":
        return "Fixed pieces/roll";
      case "manual":
        return "Manual — no calculation";
      default:
        return basis;
    }
  }

  if (!suppliers) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;

  return (
    <div>
      <p className="mb-4 text-sm text-ink-secondary">
        {suppliers.length} suppliers. Fill in address/contact details below — every field saves automatically as you type.
      </p>

      <div className="flex flex-col gap-4">
        {suppliers.map((s) => (
          <div key={s.id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">{s.name}</h3>
              {savingId === s.id && <span className="text-xs text-ink-muted">saving…</span>}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary sm:col-span-2">
                Address
                <input
                  defaultValue={s.address ?? ""}
                  onBlur={(e) => e.target.value !== (s.address ?? "") && updateSupplier(s, { address: e.target.value || null })}
                  placeholder="Registered/delivery address"
                  className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
                Contact person
                <input
                  defaultValue={s.contact_person ?? ""}
                  onBlur={(e) =>
                    e.target.value !== (s.contact_person ?? "") && updateSupplier(s, { contact_person: e.target.value || null })
                  }
                  placeholder="Name"
                  className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
                Phone
                <input
                  defaultValue={s.phone ?? ""}
                  onBlur={(e) => e.target.value !== (s.phone ?? "") && updateSupplier(s, { phone: e.target.value || null })}
                  placeholder="Phone number"
                  className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary sm:col-span-2">
                Email
                <input
                  defaultValue={s.email ?? ""}
                  onBlur={(e) => e.target.value !== (s.email ?? "") && updateSupplier(s, { email: e.target.value || null })}
                  placeholder="Email address"
                  className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary sm:col-span-2">
                Notes
                <input
                  defaultValue={s.notes ?? ""}
                  onBlur={(e) => e.target.value !== (s.notes ?? "") && updateSupplier(s, { notes: e.target.value || null })}
                  placeholder="Anything else worth noting"
                  className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
                />
              </label>
            </div>

            <div className="mt-4 overflow-x-auto rounded-md border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-sunken text-left text-ink-secondary">
                    <th className="px-3 py-1.5">Material</th>
                    <th className="px-3 py-1.5">Raw material code</th>
                    <th className="px-3 py-1.5">Unit type</th>
                    <th className="px-3 py-1.5">Order method</th>
                    <th className="px-3 py-1.5">Consumption basis</th>
                    <th className="px-3 py-1.5">Pack sizes</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsFor(s.id).map((item) => (
                    <tr key={item.id} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-1.5 font-medium text-ink">{item.material_name}</td>
                      <td className="px-3 py-1.5 text-ink-secondary">{item.raw_material_code ?? "—"}</td>
                      <td className="px-3 py-1.5 text-ink-secondary capitalize">{item.unit_type}</td>
                      <td className="px-3 py-1.5 text-ink-secondary">
                        {item.order_method === "consumption" ? "By consumption" : "Simple count"}
                      </td>
                      <td className="px-3 py-1.5 text-ink-secondary">
                        {consumptionBasisLabel(item.consumption_basis)}
                        {item.consumption_basis === "fixed_pieces_per_roll" && item.pieces_per_pack
                          ? ` (${item.pieces_per_pack}/roll)`
                          : ""}
                      </td>
                      <td className="px-3 py-1.5 text-ink-secondary">{formatPackOptions(item)}</td>
                    </tr>
                  ))}
                  {itemsFor(s.id).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-3 text-center text-ink-muted">
                        No materials on file for this supplier yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {suppliers.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">No suppliers on file yet.</p>}
      </div>
    </div>
  );
}
