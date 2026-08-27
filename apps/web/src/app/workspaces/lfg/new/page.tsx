"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";

// New Site intake -- spec section 3's "New Site View" field list, minus
// Site Reference Picture (a site needs to exist before it has an id to
// upload against -- that lands on the Site 360 view once document
// upload, task #21, is built) and every financial field (Site Master
// intake is operational only; Rate/Amount/etc. get entered later on the
// Financials tab, which only admin/editor ever see at all). site_id
// (the human "LFG-000001" code) and site_status (defaults to 'new') are
// both set server-side by the DB -- never entered here.
//
// Direct supabase.from("lfg_sites").insert(...) from this client
// component, not an API route -- same pattern as MastersTab.tsx's Add/
// Edit forms. lfg_sites_insert's RLS already does the real
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

export default function NewLfgSitePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    outlet_name: "",
    program: "",
    sfo_id: "",
    city: "",
    store_address: "",
    material: "",
    number_of_sites: "1",
    width: "",
    height: "",
    sqft: "",
    asm_name: "",
    asm_mobile: "",
    asm_email: "",
    escalation_email: "",
    partner_id: "",
    remarks: "",
  });

  useEffect(() => {
    supabase
      .from("lfg_partners")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setPartners((data as PartnerOption[]) ?? []));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.outlet_name.trim()) {
      setError("Outlet Name is required.");
      return;
    }

    setSaving(true);
    const { data, error: insertError } = await supabase
      .from("lfg_sites")
      .insert({
        outlet_name: form.outlet_name.trim(),
        program: form.program.trim() || null,
        sfo_id: form.sfo_id.trim() || null,
        city: form.city.trim() || null,
        store_address: form.store_address.trim() || null,
        material: form.material.trim() || null,
        number_of_sites: Number(form.number_of_sites) || 1,
        width: form.width ? Number(form.width) : null,
        height: form.height ? Number(form.height) : null,
        sqft: form.sqft ? Number(form.sqft) : null,
        asm_name: form.asm_name.trim() || null,
        asm_mobile: form.asm_mobile.trim() || null,
        asm_email: form.asm_email.trim() || null,
        escalation_email: form.escalation_email.trim() || null,
        partner_id: form.partner_id || null,
        remarks: form.remarks.trim() || null,
      })
      .select("id")
      .single();
    setSaving(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Couldn't create the site.");
      return;
    }

    toast("success", `${form.outlet_name.trim()} created`);
    router.push(`/workspaces/lfg/sites/${data.id}`);
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Basil LFG Sites", href: "/workspaces/lfg" }, { label: "New Site" }]} />

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

      <form onSubmit={handleSubmit} className="mt-6 flex max-w-3xl flex-col gap-6">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClass} htmlFor="outlet_name">
              Outlet Name *
            </label>
            <input id="outlet_name" required className={inputClass} value={form.outlet_name} onChange={(e) => set("outlet_name", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="program">
              Program
            </label>
            <input id="program" className={inputClass} value={form.program} onChange={(e) => set("program", e.target.value)} placeholder="e.g. Croma, Vijay Sales" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="sfo_id">
              SFO ID
            </label>
            <input id="sfo_id" className={inputClass} value={form.sfo_id} onChange={(e) => set("sfo_id", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="city">
              City
            </label>
            <input id="city" className={inputClass} value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="material">
              Material
            </label>
            <input id="material" className={inputClass} value={form.material} onChange={(e) => set("material", e.target.value)} />
          </div>

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

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="width">
              Width
            </label>
            <input id="width" type="number" step="0.01" className={inputClass} value={form.width} onChange={(e) => set("width", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="height">
              Height
            </label>
            <input id="height" type="number" step="0.01" className={inputClass} value={form.height} onChange={(e) => set("height", e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="sqft">
              SQFT
            </label>
            <input id="sqft" type="number" step="0.01" className={inputClass} value={form.sqft} onChange={(e) => set("sqft", e.target.value)} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 border-t border-line pt-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass} htmlFor="asm_name">
              ASM Name
            </label>
            <input id="asm_name" className={inputClass} value={form.asm_name} onChange={(e) => set("asm_name", e.target.value)} />
          </div>

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
