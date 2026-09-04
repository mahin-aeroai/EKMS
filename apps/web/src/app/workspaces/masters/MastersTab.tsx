"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { MASTER_CONFIGS, type MasterConfig, type FieldDef, type ColumnDef } from "./masterConfig";

type Row = Record<string, unknown> & { id: string };
// table -> id -> label, one lookup per distinct refTable referenced across
// this panel's own fields/columns (loaded once on mount, not per-row).
type RefOptions = Record<string, { value: string; label: string }[]>;

// Generic CRUD panel for one master-data table, driven entirely by its
// MasterConfig (columns + form fields) -- same pattern as
// workspaces/sign-estimator/MastersTab.tsx's own MasterPanel, extended
// with "reference" fields (a dropdown sourced from another master table
// at runtime, e.g. Branch's Company picker) instead of only fixed
// hand-typed "select" option lists.
function MasterPanel({ config, onChanged }: { config: MasterConfig; onChanged?: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [refOptions, setRefOptions] = useState<RefOptions>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    supabase
      .from(config.table)
      .select("*")
      .order("name", { ascending: true, nullsFirst: false })
      .then(({ data, error }) => {
        if (error) {
          toast("danger", `Couldn't load ${config.label}: ${error.message}`);
          return;
        }
        setRows((data as Row[]) ?? []);
      });
  }

  // Every distinct refTable named across this config's fields/columns,
  // loaded once per mount -- these master tables (companies, branches,
  // sales_offices, employees) are all small enough to fetch in full for a
  // dropdown/label lookup, no pagination needed.
  function loadRefOptions() {
    const refs = new Map<string, string>(); // table -> labelKey
    for (const f of config.fields) {
      if (f.type === "reference" && f.refTable) refs.set(f.refTable, f.refLabelKey ?? "name");
    }
    for (const c of config.columns) {
      if (c.refTable) refs.set(c.refTable, c.refLabelKey ?? "name");
    }
    if (refs.size === 0) return;
    refs.forEach((labelKey, table) => {
      // Supabase's typed client can't statically parse a select() string
      // built from a runtime variable (labelKey) -- same class of issue
      // as lib/useLfgDistinctValues.ts's own dynamic-column select, and
      // worked around the same way: cast the query to a plain untyped
      // PromiseLike before awaiting it.
      (
        supabase
          .from(table)
          .select(`id, ${labelKey}`)
          .order(labelKey, { ascending: true, nullsFirst: false }) as unknown as PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: unknown;
        }>
      ).then(({ data, error }) => {
        if (error) return; // Non-fatal -- the field/column just shows raw ids if this fails.
        const opts = (data ?? []).map((r) => ({
          value: String(r.id),
          label: String(r[labelKey] ?? r.id),
        }));
        setRefOptions((prev) => ({ ...prev, [table]: opts }));
      });
    });
  }

  useEffect(() => {
    load();
    loadRefOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.id]);

  function openAdd() {
    setEditing(null);
    setForm({ ...config.defaults });
    setShowForm(true);
  }
  function openEdit(row: Row) {
    setEditing(row);
    setForm({ ...row });
    setShowForm(true);
  }

  function setField(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    for (const f of config.fields) {
      if (f.required) {
        const v = form[f.key];
        if (v === undefined || v === null || v === "") {
          return `${f.label} is required.`;
        }
      }
    }
    return null;
  }

  async function save() {
    const err = validate();
    if (err) {
      toast("danger", err);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {};
    for (const f of config.fields) {
      let v = form[f.key];
      if (f.type === "number" && (v === "" || v === undefined)) v = null;
      if ((f.type === "reference" || f.type === "select") && v === "") v = null;
      payload[f.key] = v ?? null;
    }
    const result = editing
      ? await supabase.from(config.table).update(payload).eq("id", editing.id)
      : await supabase.from(config.table).insert(payload);
    setSaving(false);
    if (result.error) {
      toast("danger", `Couldn't save: ${result.error.message}`);
      return;
    }
    toast("success", `${config.singular} saved`);
    setShowForm(false);
    load();
    onChanged?.();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from(config.table).delete().eq("id", deleteTarget.id);
    if (error) {
      // A referenced row (e.g. a Company with Branches under it) fails on
      // its FK constraint rather than cascading silently -- surface that
      // plainly rather than a raw Postgres error code.
      toast("danger", `Couldn't delete: ${error.message}`);
    } else {
      toast("success", `${config.singular} deleted`);
      load();
      onChanged?.();
    }
    setDeleteTarget(null);
  }

  function displayValue(c: ColumnDef, row: Row): string {
    const v = row[c.key];
    if (c.refTable) {
      const match = refOptions[c.refTable]?.find((o) => o.value === v);
      return match?.label ?? (v ? String(v) : "—");
    }
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (v === null || v === undefined || v === "") return "—";
    return String(v);
  }

  const columns: TableColumn<Row>[] = [
    ...config.columns.map((c) => ({
      key: c.key as keyof Row,
      header: c.label,
      render: (r: Row) => displayValue(c, r),
    })),
    {
      key: "active" as keyof Row,
      header: "Status",
      render: (r) => <Badge status={r.active === false ? "neutral" : "success"}>{r.active === false ? "Off" : "Active"}</Badge>,
    },
    {
      key: "id" as keyof Row,
      header: "",
      render: (r) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(r)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink-secondary">{rows ? `${rows.length} ${config.label.toLowerCase()}` : "Loading…"}</p>
        <Button size="sm" onClick={openAdd}>
          <Plus size={14} /> Add {config.singular}
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {rows === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No records yet — click Add {config.singular} to create one.</p>
        ) : (
          <Table columns={columns} rows={rows} density="compact" />
        )}
      </div>

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `Edit ${config.singular}` : `Add ${config.singular}`}
        variant="form"
        onConfirm={save}
        confirmLabel={saving ? "Saving…" : "Save"}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {config.fields.map((f) => (
            <FormField key={f.key} field={f} value={form[f.key]} options={f.refTable ? refOptions[f.refTable] : f.options} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${config.singular}?`}
        variant="confirm"
        destructive
        onConfirm={confirmDelete}
        confirmLabel="Delete"
      >
        This cannot be undone. If anything else still references this record (e.g. a Branch under this Company), the
        delete will fail rather than silently break those records.
      </Dialog>
    </div>
  );
}

function FormField({
  field,
  value,
  options,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  options?: { value: string; label: string }[];
  onChange: (v: unknown) => void;
}) {
  const labelEl = (
    <label className="mb-1 block text-xs font-medium text-ink-secondary">
      {field.label}
      {field.required ? " *" : ""}
    </label>
  );

  if (field.type === "checkbox") {
    return (
      <div className="flex items-center gap-2 pt-5">
        <input
          type="checkbox"
          checked={value !== false}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-line-strong"
        />
        <label className="text-sm text-ink">{field.label}</label>
      </div>
    );
  }

  if (field.type === "select" || field.type === "reference") {
    return (
      <div>
        {labelEl}
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
        >
          <option value="">—</option>
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      {labelEl}
      <input
        type={field.type === "number" ? "number" : "text"}
        value={(value as string | number) ?? ""}
        onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        placeholder={field.placeholder}
        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted"
      />
    </div>
  );
}

export function MastersTab({ onChanged }: { onChanged?: () => void }) {
  return (
    <Tabs
      items={MASTER_CONFIGS.map((c) => ({
        id: c.id,
        label: c.label,
        content: <MasterPanel config={c} onChanged={onChanged} />,
      }))}
    />
  );
}
