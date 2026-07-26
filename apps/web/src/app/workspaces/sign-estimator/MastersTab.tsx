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
import { MASTER_CONFIGS, type MasterConfig, type FieldDef } from "./masterConfig";

type Row = Record<string, unknown> & { id: string };

// Generic CRUD panel for one master-data table, driven entirely by its
// MasterConfig (columns + form fields). This is the React equivalent of
// SignERP_v2.html's MOD_CFG + openMod/_saveMod/confirmDelete pattern: one
// implementation covering all 7 master types instead of 7 near-duplicate
// screens.
function MasterPanel({ config, onChanged }: { config: MasterConfig; onChanged?: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
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
          // Some master tables (drivers) have no `name` column — fall back.
          supabase
            .from(config.table)
            .select("*")
            .then(({ data: d2, error: e2 }) => {
              if (e2) {
                toast("danger", `Couldn't load ${config.label}`);
                return;
              }
              setRows((d2 as Row[]) ?? []);
            });
          return;
        }
        setRows((data as Row[]) ?? []);
      });
  }

  useEffect(() => {
    load();
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
        if (v === undefined || v === null || v === "" || (typeof v === "number" && v <= 0 && f.key !== "wastage")) {
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
      if (f.type === "tags" && typeof v === "string") {
        v = v.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (f.type === "number" && (v === "" || v === undefined)) v = null;
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
      toast("danger", `Couldn't delete: ${error.message}`);
    } else {
      toast("success", `${config.singular} deleted`);
      load();
      onChanged?.();
    }
    setDeleteTarget(null);
  }

  const columns: TableColumn<Row>[] = [
    ...config.columns.map((c) => ({
      key: c.key as keyof Row,
      header: c.label,
      render: (r: Row) => {
        const v = r[c.key];
        if (typeof v === "boolean") return v ? "Yes" : "No";
        if (Array.isArray(v)) return v.join(", ");
        if (v === null || v === undefined || v === "") return "—";
        return String(v);
      },
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
            <FormField key={f.key} field={f} value={form[f.key]} onChange={(v) => setField(f.key, v)} />
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
        This cannot be undone. Any saved estimates referencing this record keep their own cost snapshot, so past cost sheets are unaffected.
      </Dialog>
    </div>
  );
}

function FormField({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
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

  if (field.type === "select") {
    return (
      <div>
        {labelEl}
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
        >
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "tags") {
    const display = Array.isArray(value) ? value.join(", ") : (value as string) ?? "";
    return (
      <div>
        {labelEl}
        <input
          type="text"
          value={display}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. dye-sub, uv"
          className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted"
        />
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
