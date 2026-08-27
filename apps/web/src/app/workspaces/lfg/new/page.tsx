"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { useLfgDistinctValues } from "@/lib/useLfgDistinctValues";
import { mmToInches, inchesToMm, round2 } from "@/lib/lfg-units";

// New Site intake -- spec section 3's "New Site View" field list, minus
// Site Reference Picture (a site needs to exist before it has an id to
// upload against -- that lands on the Site 360 view once document
// upload, task #21, is built) and every financial field (Site Master
// intake is operational only; Rate/Amount/etc. get entered later on the
// Financials tab, which only admin/editor ever see at all). site_id
// (the human "LFG-000001" code) and site_status (defaults to 'new') are
// both set server-side by the DB -- never entered here.
//
// Store entity (task: "multiple displays placed at one site -- treat
// them as one store, multiple sites"): this form now has two modes --
// "New Store" (the outlet doesn't exist yet -- fill in everything, a new
// lfg_stores row is created alongside the site) and "Add Display to
// Existing Store" (another display at an outlet already on file -- pick
// the store, only the site-specific fields below are asked for; every
// store-level field is copied from the chosen store instead of retyped).
// Either way the new lfg_sites row keeps its own copy of every
// store-level field (outlet_name, format, sfo_id, city, region, address,
// partner_id, ASM contacts, escalation email) -- lfg_stores is additive,
// not a replacement, so every existing query against lfg_sites keeps
// working unchanged. See supabase-lfg-site-management-schema.sql's STEP
// 6c comment for the full rationale.
//
// Direct supabase.from(...).insert(...) from this client component, not
// an API route -- same pattern as MastersTab.tsx's Add/Edit forms.
// lfg_sites_insert/lfg_stores_insert's RLS already does the real
// authorization (admin/editor for any partner; a partner only for their
// own partner_id -- irrelevant here since this page is staff-only, but
// worth noting this form would also work unmodified from the partner
// portal's own "add new site" flow the spec calls for, task #19).
const inputClass =
  "rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none";
const labelClass = "text-sm font-medium text-ink-secondary";

interface PartnerOption {
  id: string;
  name: string;
}

interface ProgramOption {
  id: string;
  name: string;
}

interface StoreOption {
  id: string;
  store_name: string;
  sfo_id: string | null;
  city: string | null;
  format: string | null;
  partner_id: string | null;
}

// Plain text input backed by a <datalist> of existing values -- the
// "dropdown wherever possible" combo pattern (task #66) for fields with
// no dedicated master table. Picking a suggestion fills the field;
// typing anything else still works, since the underlying input never
// restricts to the list.
function ComboField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const listId = `${id}-options`;
  return (
    <div className="flex flex-col gap-1.5">
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        list={listId}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  );
}

export default function NewLfgSitePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"new_store" | "add_display">("new_store");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [sizeUnit, setSizeUnit] = useState<"in" | "mm">("in");

  const formatOptions = useLfgDistinctValues("format");
  const materialOptions = useLfgDistinctValues("material");
  const regionOptions = useLfgDistinctValues("region");
  const matCodeOptions = useLfgDistinctValues("mat_code");
  const cityOptions = useLfgDistinctValues("city");
  const asmNameOptions = useLfgDistinctValues("asm_name");

  const [form, setForm] = useState({
    outlet_name: "",
    format: "",
    sfo_id: "",
    city: "",
    region: "",
    store_address: "",
    material: "",
    mat_code: "",
    number_of_sites: "1",
    width: "",
    height: "",
    bleed: "",
    sqft: "",
    asm_name: "",
    asm_mobile: "",
    asm_email: "",
    escalation_email: "",
    partner_id: "",
    program_id: "",
    remarks: "",
  });

  useEffect(() => {
    supabase
      .from("lfg_partners")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setPartners((data as PartnerOption[]) ?? []));
    // lfg_programs (seasonal waves, e.g. "Spring Refresh 2025") -- task
    // #39-49. Optional at intake, same as Partner -- a site can be created
    // before it's assigned to a wave, and moved/reassigned later via the
    // Site Master's bulk "Move to Program" action (task #46) or here.
    supabase
      .from("lfg_programs")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setPrograms((data as ProgramOption[]) ?? []));
    // Every existing store, for the "Add Display to Existing Store" picker
    // below. lfg_stores is new and modest in size (one row per outlet, not
    // per display) -- fetching the full list client-side and filtering in
    // memory mirrors how Partner/Program are already handled above, and
    // avoids a second debounced-search round trip just for this picker.
    // Paginated via fetchAllRows rather than a plain `.limit(5000)` --
    // PostgREST silently overrides a `.limit()` above its own server-side
    // row cap (1000 by default), same bug fixed on the Site Master (task
    // #69) and Stores page.
    fetchAllRows<StoreOption>((from, to) =>
      supabase.from("lfg_stores").select("id, store_name, sfo_id, city, format, partner_id").order("store_name").range(from, to)
    ).then(setStores);
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSizeUnit(next: "in" | "mm") {
    setSizeUnit((prev) => {
      if (prev === next) return prev;
      const convert = (v: string) => {
        const n = Number(v);
        if (!v.trim() || Number.isNaN(n)) return v;
        return String(next === "mm" ? inchesToMm(n) : mmToInches(n));
      };
      setForm((f) => ({ ...f, width: convert(f.width), height: convert(f.height) }));
      return next;
    });
  }

  const filteredStores = useMemo(() => {
    const q = storeFilter.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) =>
        s.store_name.toLowerCase().includes(q) ||
        (s.sfo_id ?? "").toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q)
    );
  }, [stores, storeFilter]);

  const selectedStore = stores.find((s) => s.id === selectedStoreId) ?? null;

  // In "New Store" mode, if the SFO ID typed in already belongs to an
  // existing store, this is very likely meant to be a second display at
  // that same outlet, not a genuinely new one -- surfaced as a hint
  // rather than a hard block, since duplicate SFO IDs did legitimately
  // happen historically (see the duplicate-records investigation).
  const sfoMatchInNewStoreMode =
    mode === "new_store" && form.sfo_id.trim()
      ? stores.find((s) => (s.sfo_id ?? "").toLowerCase() === form.sfo_id.trim().toLowerCase())
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "add_display" && !selectedStoreId) {
      setError("Pick the existing store this display belongs to.");
      return;
    }
    if (mode === "new_store" && !form.outlet_name.trim()) {
      setError("Outlet Name is required.");
      return;
    }

    const toInches = (v: string): number | null => {
      if (!v.trim()) return null;
      const n = Number(v);
      if (Number.isNaN(n)) return null;
      return sizeUnit === "mm" ? mmToInches(n) : round2(n);
    };

    setSaving(true);

    // Store-level fields either come straight from the picked store
    // (Add Display mode) or from the form itself (New Store mode) -- see
    // header comment. Either way the new lfg_sites row gets its own copy
    // of them, so nothing downstream has to know lfg_stores exists.
    let storeId: string | null = null;
    let storeFields: {
      outlet_name: string;
      format: string | null;
      sfo_id: string | null;
      city: string | null;
      region: string | null;
      store_address: string | null;
      partner_id: string | null;
      asm_name: string | null;
      asm_mobile: string | null;
      asm_email: string | null;
      escalation_email: string | null;
    };

    if (mode === "add_display" && selectedStore) {
      storeId = selectedStore.id;
      storeFields = {
        outlet_name: selectedStore.store_name,
        format: selectedStore.format,
        sfo_id: selectedStore.sfo_id,
        city: selectedStore.city,
        region: form.region.trim() || null,
        store_address: form.store_address.trim() || null,
        partner_id: selectedStore.partner_id,
        asm_name: form.asm_name.trim() || null,
        asm_mobile: form.asm_mobile.trim() || null,
        asm_email: form.asm_email.trim() || null,
        escalation_email: form.escalation_email.trim() || null,
      };
      // Region/address/ASM contact aren't on the compact store picker
      // fetch above, so re-read the full store row rather than silently
      // writing nulls over fields it likely already has.
      const { data: fullStore } = await supabase
        .from("lfg_stores")
        .select("region, store_address, asm_name, asm_mobile, asm_email, escalation_email")
        .eq("id", selectedStore.id)
        .single();
      if (fullStore) {
        storeFields = {
          ...storeFields,
          region: fullStore.region ?? null,
          store_address: fullStore.store_address ?? null,
          asm_name: fullStore.asm_name ?? null,
          asm_mobile: fullStore.asm_mobile ?? null,
          asm_email: fullStore.asm_email ?? null,
          escalation_email: fullStore.escalation_email ?? null,
        };
      }
    } else {
      storeFields = {
        outlet_name: form.outlet_name.trim(),
        format: form.format.trim() || null,
        sfo_id: form.sfo_id.trim() || null,
        city: form.city.trim() || null,
        region: form.region.trim() || null,
        store_address: form.store_address.trim() || null,
        partner_id: form.partner_id || null,
        asm_name: form.asm_name.trim() || null,
        asm_mobile: form.asm_mobile.trim() || null,
        asm_email: form.asm_email.trim() || null,
        escalation_email: form.escalation_email.trim() || null,
      };

      const { data: newStore, error: storeError } = await supabase
        .from("lfg_stores")
        .insert(storeFields)
        .select("id")
        .single();

      if (storeError || !newStore) {
        setSaving(false);
        setError(
          storeError?.code === "23505"
            ? "A store with this SFO ID already exists -- switch to \"Add Display to Existing Store\" instead."
            : storeError?.message ?? "Couldn't create the store."
        );
        return;
      }
      storeId = newStore.id;
    }

    const { data, error: insertError } = await supabase
      .from("lfg_sites")
      .insert({
        ...storeFields,
        store_id: storeId,
        material: form.material.trim() || null,
        mat_code: form.mat_code.trim() || null,
        number_of_sites: Number(form.number_of_sites) || 1,
        width: toInches(form.width),
        height: toInches(form.height),
        bleed: form.bleed ? round2(Number(form.bleed)) : null,
        sqft: form.sqft ? round2(Number(form.sqft)) : null,
        partner_id: storeFields.partner_id,
        program_id: form.program_id || null,
        remarks: form.remarks.trim() || null,
      })
      .select("id")
      .single();

    if (insertError || !data) {
      // The site failed after a brand-new store succeeded -- clean up the
      // now-orphaned store rather than leaving a display-less store
      // behind (best-effort; this client has no real transaction to lean
      // on, same limitation every other multi-table insert in this app
      // already has).
      if (mode === "new_store" && storeId) {
        await supabase.from("lfg_stores").delete().eq("id", storeId);
      }
      setSaving(false);
      setError(insertError?.message ?? "Couldn't create the site.");
      return;
    }

    setSaving(false);
    toast("success", `${storeFields.outlet_name} created`);
    router.push(`/workspaces/lfg/sites/${data.id}`);
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "New Site" }]} />

      <div className="mt-4 flex items-start gap-4 border-b border-line pb-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
          <MapPin size={22} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">New Site</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            A Site ID and status of &quot;New&quot; are assigned automatically. Financials and installation costs are
            entered later on the Site 360 view.
          </p>
        </div>
      </div>

      <div className="mt-6 flex max-w-3xl flex-col gap-1.5">
        <span className={labelClass}>This site is at...</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("new_store")}
            className={`flex-1 rounded-md border px-4 py-3 text-left text-sm transition ${
              mode === "new_store" ? "border-primary bg-primary-tint text-ink" : "border-line-strong bg-surface text-ink-secondary"
            }`}
          >
            <span className="font-medium text-ink">A new store</span>
            <p className="mt-0.5 text-xs text-ink-secondary">This outlet doesn&apos;t have any site on file yet.</p>
          </button>
          <button
            type="button"
            onClick={() => setMode("add_display")}
            className={`flex-1 rounded-md border px-4 py-3 text-left text-sm transition ${
              mode === "add_display" ? "border-primary bg-primary-tint text-ink" : "border-line-strong bg-surface text-ink-secondary"
            }`}
          >
            <span className="font-medium text-ink">An existing store</span>
            <p className="mt-0.5 text-xs text-ink-secondary">Another display at an outlet already on file -- just add the site details.</p>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex max-w-3xl flex-col gap-6">
        {mode === "add_display" ? (
          <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="store_filter">
                Find the store
              </label>
              <input
                id="store_filter"
                className={inputClass}
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                placeholder="Search by store name, SFO ID, or city"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="store_id">
                Store *
              </label>
              <select
                id="store_id"
                required
                className={inputClass}
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
              >
                <option value="">— Select a store —</option>
                {filteredStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.store_name}
                    {s.sfo_id ? ` — ${s.sfo_id}` : ""}
                    {s.city ? ` (${s.city})` : ""}
                  </option>
                ))}
              </select>
            </div>
            {selectedStore && (
              <div className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-secondary">
                Adding a display at <span className="font-medium text-ink">{selectedStore.store_name}</span>
                {selectedStore.sfo_id ? ` · SFO ${selectedStore.sfo_id}` : ""}
                {selectedStore.city ? ` · ${selectedStore.city}` : ""}
                {selectedStore.format ? ` · ${selectedStore.format}` : ""}. Store details are reused automatically.
              </div>
            )}
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className={labelClass} htmlFor="outlet_name">
                Outlet Name *
              </label>
              <input
                id="outlet_name"
                required
                className={inputClass}
                value={form.outlet_name}
                onChange={(e) => set("outlet_name", e.target.value)}
              />
            </div>

            <ComboField id="format" label="Format" value={form.format} onChange={(v) => set("format", v)} options={formatOptions} placeholder="e.g. Croma, Vijay Sales" />

            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="sfo_id">
                SFO ID
              </label>
              <input id="sfo_id" className={inputClass} value={form.sfo_id} onChange={(e) => set("sfo_id", e.target.value)} />
              {sfoMatchInNewStoreMode && (
                <p className="text-xs text-warning">
                  {sfoMatchInNewStoreMode.store_name} already uses this SFO ID.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setMode("add_display");
                      setSelectedStoreId(sfoMatchInNewStoreMode.id);
                    }}
                  >
                    Add a display there instead
                  </button>
                  ?
                </p>
              )}
            </div>

            <ComboField id="city" label="City" value={form.city} onChange={(v) => set("city", v)} options={cityOptions} />
            <ComboField id="region" label="Region" value={form.region} onChange={(v) => set("region", v)} options={regionOptions} />

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className={labelClass} htmlFor="store_address">
                Store Address
              </label>
              <textarea
                id="store_address"
                rows={2}
                className={inputClass}
                value={form.store_address}
                onChange={(e) => set("store_address", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="partner_id">
                Partner
              </label>
              <select id="partner_id" className={inputClass} value={form.partner_id} onChange={(e) => set("partner_id", e.target.value)}>
                <option value="">— Unassigned —</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 gap-4 border-t border-line pt-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="program_id">
              Program (Season)
            </label>
            <select id="program_id" className={inputClass} value={form.program_id} onChange={(e) => set("program_id", e.target.value)}>
              <option value="">— Unassigned —</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <ComboField id="material" label="Material" value={form.material} onChange={(v) => set("material", v)} options={materialOptions} />
          <ComboField id="mat_code" label="Mat Code" value={form.mat_code} onChange={(v) => set("mat_code", v)} options={matCodeOptions} />

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="number_of_sites">
              Number of Sites
            </label>
            <input
              id="number_of_sites"
              type="number"
              min={1}
              className={inputClass}
              value={form.number_of_sites}
              onChange={(e) => set("number_of_sites", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className={labelClass}>Size</span>
              <div className="flex overflow-hidden rounded-md border border-line-strong text-xs">
                <button
                  type="button"
                  onClick={() => toggleSizeUnit("in")}
                  className={`px-2.5 py-1 ${sizeUnit === "in" ? "bg-primary text-on-brand" : "bg-surface text-ink-secondary"}`}
                >
                  Inch
                </button>
                <button
                  type="button"
                  onClick={() => toggleSizeUnit("mm")}
                  className={`px-2.5 py-1 ${sizeUnit === "mm" ? "bg-primary text-on-brand" : "bg-surface text-ink-secondary"}`}
                >
                  MM
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-ink-muted" htmlFor="width">
                  Width ({sizeUnit})
                </label>
                <input id="width" type="number" step="0.01" className={inputClass} value={form.width} onChange={(e) => set("width", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-ink-muted" htmlFor="height">
                  Height ({sizeUnit})
                </label>
                <input id="height" type="number" step="0.01" className={inputClass} value={form.height} onChange={(e) => set("height", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="bleed">
              Bleed
            </label>
            <input id="bleed" type="number" step="0.01" className={inputClass} value={form.bleed} onChange={(e) => set("bleed", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="sqft">
              SQFT
            </label>
            <input id="sqft" type="number" step="0.01" className={inputClass} value={form.sqft} onChange={(e) => set("sqft", e.target.value)} />
          </div>
        </section>

        {mode === "new_store" && (
          <section className="grid grid-cols-1 gap-4 border-t border-line pt-6 sm:grid-cols-2">
            <ComboField id="asm_name" label="ASM Name" value={form.asm_name} onChange={(v) => set("asm_name", v)} options={asmNameOptions} />

            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="asm_mobile">
                ASM Mobile
              </label>
              <input id="asm_mobile" className={inputClass} value={form.asm_mobile} onChange={(e) => set("asm_mobile", e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="asm_email">
                ASM Email
              </label>
              <input id="asm_email" type="email" className={inputClass} value={form.asm_email} onChange={(e) => set("asm_email", e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="escalation_email">
                Escalation Email
              </label>
              <input
                id="escalation_email"
                type="email"
                className={inputClass}
                value={form.escalation_email}
                onChange={(e) => set("escalation_email", e.target.value)}
              />
            </div>
          </section>
        )}

        <div className="flex flex-col gap-1.5 border-t border-line pt-6">
          <label className={labelClass} htmlFor="remarks">
            Remarks
          </label>
          <textarea id="remarks" rows={3} className={inputClass} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
        </div>

        {error && <p className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" loading={saving}>
            Create Site
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/workspaces/lfg")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
