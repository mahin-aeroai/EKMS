"use client";

import { useMemo, useState, useEffect } from "react";
import { Ruler, Search, RotateCcw, Undo2, Save } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { mmToInches, inchesToMm } from "@/lib/lfg-units";
import { useLfgDistinctValues } from "@/lib/useLfgDistinctValues";
import { LfgConnectHeader } from "@/components/workspaces/LfgConnectHeader";

// 16 Sept 2026: task feedback -- "give me a sparate tab with all sites by
// all filters to edit on row itest to correct the sizes at once. like
// excel edit. I just need format of store, SFO iD, store name , City,
// material, Width heght, , bleed Qty Partner so that i can edit the sizes
// at once." Follows straight on from the same-day fix that made every
// other LFG Connect surface mm-only (see lfg-units.ts's header comment) --
// this page is the dedicated "correct the sizes" workspace that fix was
// building toward: one dense, filterable, all-sites table where Width/
// Height/Bleed/Material/Qty are all editable directly in the row, several
// rows at once, with a single batched "Save changes" rather than the
// popover-per-field-per-row pattern the Status Sheet uses.
//
// Deliberately does NOT reuse Status Sheet's SiteFieldsEditControl pattern
// -- that control has its own live bug (labels the fields "(mm)" but
// writes the typed number straight into the width/height inches columns
// with no conversion, see status-sheet/page.tsx) which would silently
// reintroduce the exact corruption class the mm-only fix just eliminated
// if copied here. Every write below goes through mmToInches() right
// before the Supabase update, mirroring the now-corrected Site 360 Edit
// form, New Site form, and Bulk Import.
//
// Format/SFO ID/Store Name/City/Partner are shown for context (so a row
// is identifiable while fixing its size) but stay read-only here --
// reassigning a partner or renaming a store is a different, more
// consequential action than "correct the sizes", and isn't part of what
// was asked for.
interface SizeRow {
  id: string;
  site_id: string;
  format: string | null;
  sfo_id: string | null;
  outlet_name: string;
  city: string | null;
  material: string | null;
  width: number | null; // inches (DB storage unit -- see lfg-units.ts)
  height: number | null; // inches
  bleed: number | null; // inches
  number_of_sites: number;
  partner_id: string | null;
  program_id: string | null;
  lfg_partners: { name: string } | { name: string }[] | null;
}

interface PartnerOption {
  id: string;
  name: string;
}

interface ProgramOption {
  id: string;
  name: string;
}

// A row's editable fields, always in DISPLAY units/strings (mm for size
// fields) so every input can be a plain controlled <input value=.../> --
// converted back to the DB's inches columns only at save time.
interface Draft {
  material: string;
  width: string;
  height: string;
  bleed: string;
  qty: string;
}

function partnerName(row: SizeRow): string {
  const p = Array.isArray(row.lfg_partners) ? row.lfg_partners[0] : row.lfg_partners;
  return p?.name ?? "—";
}

function draftFromRow(r: SizeRow): Draft {
  return {
    material: r.material ?? "",
    width: r.width != null ? String(inchesToMm(r.width)) : "",
    height: r.height != null ? String(inchesToMm(r.height)) : "",
    bleed: r.bleed != null ? String(inchesToMm(r.bleed)) : "",
    qty: String(r.number_of_sites),
  };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return a.material === b.material && a.width === b.width && a.height === b.height && a.bleed === b.bleed && a.qty === b.qty;
}

/** null = valid. Qty must be a whole number >= 1 (lfg_sites.number_of_sites
 * is `integer not null default 1`, so an empty/zero/fractional value would
 * either fail the write or silently corrupt the row the same way the
 * inches bug did) -- Width/Height/Bleed are nullable, so blank is allowed
 * for them, but anything typed must parse as a plain number. */
function validateDraft(d: Draft): string | null {
  for (const [label, val] of [
    ["Width", d.width],
    ["Height", d.height],
    ["Bleed", d.bleed],
  ] as const) {
    if (val.trim() !== "" && Number.isNaN(Number(val))) return `${label} must be a number`;
  }
  const qty = Number(d.qty);
  if (d.qty.trim() === "" || Number.isNaN(qty) || qty < 1 || !Number.isInteger(qty)) return "Qty must be a whole number, at least 1";
  return null;
}

const inputClass =
  "h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";
const selectClass =
  "shrink-0 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-primary focus:outline-none";

export default function LfgSizesPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<SizeRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [originals, setOriginals] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");

  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const formatOptions = useLfgDistinctValues("format");
  const cityOptions = useLfgDistinctValues("city");
  const materialOptions = useLfgDistinctValues("material");

  useEffect(() => {
    // Same "fetch every non-archived site once, filter client-side" shape
    // as the Site Master page -- an Excel-like editor needs the full row
    // set in memory anyway (edits live in local `drafts` state until
    // Save), so there's no benefit to re-querying per filter change here.
    fetchAllRows<SizeRow>((from, to) =>
      supabase
        .from("lfg_sites")
        .select(
          "id, site_id, format, sfo_id, outlet_name, city, material, width, height, bleed, number_of_sites, partner_id, program_id, lfg_partners(name)"
        )
        .is("archived_at", null)
        .order("outlet_name")
        .range(from, to)
    ).then((data) => {
      setRows(data);
      const d: Record<string, Draft> = {};
      for (const r of data) d[r.id] = draftFromRow(r);
      setDrafts(d);
      setOriginals(d);
    });
    supabase
      .from("lfg_partners")
      .select("id, name")
      .order("name")
      .then(({ data }) => setPartners((data as PartnerOption[]) ?? []));
    supabase
      .from("lfg_programs")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => setPrograms((data as ProgramOption[]) ?? []));
  }, []);

  const loading = rows === null;

  function isDirty(id: string): boolean {
    const a = drafts[id];
    const b = originals[id];
    if (!a || !b) return false;
    return !draftsEqual(a, b);
  }

  const dirtyIds = useMemo(
    () => (rows ? rows.filter((r) => drafts[r.id] && originals[r.id] && !draftsEqual(drafts[r.id], originals[r.id])).map((r) => r.id) : []),
    [rows, drafts, originals]
  );

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function resetRow(id: string) {
    setDrafts((prev) => ({ ...prev, [id]: originals[id] }));
  }

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (formatFilter && r.format !== formatFilter) return false;
      if (cityFilter && r.city !== cityFilter) return false;
      if (partnerFilter && r.partner_id !== partnerFilter) return false;
      if (programFilter && r.program_id !== programFilter) return false;
      if (!q) return true;
      return (
        r.outlet_name.toLowerCase().includes(q) ||
        (r.sfo_id ?? "").toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q) ||
        r.site_id.toLowerCase().includes(q) ||
        (r.format ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, formatFilter, cityFilter, partnerFilter, programFilter]);

  const hasActiveFilter = !!(query.trim() || formatFilter || cityFilter || partnerFilter || programFilter);

  async function handleSaveAll() {
    if (!rows || dirtyIds.length === 0) return;
    for (const id of dirtyIds) {
      const err = validateDraft(drafts[id]);
      if (err) {
        const row = rows.find((r) => r.id === id);
        toast("danger", `${row?.outlet_name ?? "A row"}: ${err} -- fix it before saving.`);
        return;
      }
    }
    setSaving(true);
    let okCount = 0;
    let failCount = 0;
    for (const id of dirtyIds) {
      const d = drafts[id];
      const patch = {
        material: d.material.trim() || null,
        width: d.width.trim() === "" ? null : mmToInches(Number(d.width)),
        height: d.height.trim() === "" ? null : mmToInches(Number(d.height)),
        bleed: d.bleed.trim() === "" ? null : mmToInches(Number(d.bleed)),
        number_of_sites: Math.round(Number(d.qty)),
      };
      const { error } = await supabase.from("lfg_sites").update(patch).eq("id", id);
      if (error) {
        failCount++;
        const row = rows.find((r) => r.id === id);
        toast("danger", `${row?.outlet_name ?? id}: ${error.message}`);
      } else {
        okCount++;
        setOriginals((prev) => ({ ...prev, [id]: d }));
      }
    }
    setSaving(false);
    if (okCount > 0) {
      toast("success", `Saved ${okCount} site${okCount === 1 ? "" : "s"}${failCount > 0 ? `, ${failCount} failed` : ""}.`);
    }
  }

  function handleResetAll() {
    setDrafts(originals);
  }

  const COLUMNS: TableColumn<SizeRow>[] = [
    {
      key: "id",
      header: "",
      width: "2.25rem",
      render: (r) =>
        isDirty(r.id) ? (
          <button
            type="button"
            title="Discard changes to this row"
            onClick={() => resetRow(r.id)}
            className="flex items-center justify-center rounded p-1 text-warning hover:bg-warning-tint"
          >
            <Undo2 size={13} />
          </button>
        ) : null,
    },
    { key: "format", header: "Format", width: "6rem", sortable: true, render: (r) => r.format ?? "—" },
    { key: "sfo_id", header: "SFO ID", width: "7rem", sortable: true, render: (r) => r.sfo_id ?? "—" },
    { key: "outlet_name", header: "Store Name", sortable: true },
    { key: "city", header: "City", width: "7rem", sortable: true, render: (r) => r.city ?? "—" },
    {
      key: "material",
      header: "Material",
      width: "9.5rem",
      render: (r) => (
        <input
          value={drafts[r.id]?.material ?? ""}
          onChange={(e) => updateDraft(r.id, { material: e.target.value })}
          disabled={saving}
          list="lfg-sizes-material-options"
          className={inputClass}
          placeholder="—"
        />
      ),
    },
    {
      key: "width",
      header: "Width (mm)",
      width: "6.5rem",
      render: (r) => (
        <input
          value={drafts[r.id]?.width ?? ""}
          onChange={(e) => updateDraft(r.id, { width: e.target.value })}
          disabled={saving}
          inputMode="decimal"
          className={inputClass}
          placeholder="—"
        />
      ),
    },
    {
      key: "height",
      header: "Height (mm)",
      width: "6.5rem",
      render: (r) => (
        <input
          value={drafts[r.id]?.height ?? ""}
          onChange={(e) => updateDraft(r.id, { height: e.target.value })}
          disabled={saving}
          inputMode="decimal"
          className={inputClass}
          placeholder="—"
        />
      ),
    },
    {
      key: "bleed",
      header: "Bleed (mm)",
      width: "6.5rem",
      render: (r) => (
        <input
          value={drafts[r.id]?.bleed ?? ""}
          onChange={(e) => updateDraft(r.id, { bleed: e.target.value })}
          disabled={saving}
          inputMode="decimal"
          className={inputClass}
          placeholder="—"
        />
      ),
    },
    {
      key: "number_of_sites",
      header: "Qty",
      width: "4.5rem",
      render: (r) => (
        <input
          value={drafts[r.id]?.qty ?? ""}
          onChange={(e) => updateDraft(r.id, { qty: e.target.value })}
          disabled={saving}
          inputMode="numeric"
          className={inputClass}
        />
      ),
    },
    { key: "partner_id", header: "Partner", width: "9.5rem", render: (r) => partnerName(r) },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Edit Sizes" }]} />

      <LfgConnectHeader
        icon={Ruler}
        section="Edit Sizes"
        subtitle="Every non-archived site, one row each -- edit Material, Width, Height, Bleed, or Qty directly and save the whole batch at once, Excel-style. Sizes are entered in mm; converted to the stored unit only when you save."
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={saving || dirtyIds.length === 0} onClick={handleResetAll}>
              <RotateCcw size={13} className="mr-1.5" /> Reset all
            </Button>
            <Button size="sm" loading={saving} disabled={dirtyIds.length === 0} onClick={handleSaveAll}>
              <Save size={13} className="mr-1.5" /> Save changes{dirtyIds.length > 0 ? ` (${dirtyIds.length})` : ""}
            </Button>
          </div>
        }
      />

      <datalist id="lfg-sizes-material-options">
        {materialOptions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Sites" value={loading ? "…" : String(rows!.length)} trend="flat" trendLabel="Non-archived" />
        <StatCard
          label="Showing"
          value={loading ? "…" : String(filteredRows.length)}
          trend="flat"
          trendLabel={hasActiveFilter ? "Matching your filters" : "All sites"}
        />
        <StatCard
          label="Unsaved changes"
          value={loading ? "…" : String(dirtyIds.length)}
          trend="flat"
          trendLabel={dirtyIds.length > 0 ? "Click Save changes to apply" : "Nothing edited yet"}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2">
          <Search size={16} className="text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search outlet name, Site ID, SFO ID, City, or Format"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className={selectClass}>
          <option value="">All Programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className={selectClass}>
          <option value="">All formats</option>
          {formatOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className={selectClass}>
          <option value="">All cities</option>
          {cityOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)} className={selectClass}>
          <option value="">All partners</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFormatFilter("");
              setCityFilter("");
              setPartnerFilter("");
              setProgramFilter("");
            }}
            className="text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {loading ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading sites…</p>
        ) : filteredRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {hasActiveFilter ? "No sites match your filters." : "No sites yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table columns={COLUMNS} rows={filteredRows} />
          </div>
        )}
      </div>
    </div>
  );
}
