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
import { MASTER_CONFIGS, type MasterConfig, type FieldDef } from "@/lib/installationReport/masterConfig";

type Row = Record<string, unknown> & { id: string };

// Generic CRUD panel for one Installation Report master-data table, driven
// entirely by its MasterConfig (columns + form fields) — same pattern as
// src/app/workspaces/sign-estimator/MastersTab.tsx, copied here rather than
// shared because the two tools' configs live in unrelated modules and this
// keeps each tool's master-data screen self-contained.
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
      .order(config.orderBy, { ascending: true, nullsFirst: false })
      .then(({ data, error }) => {
        if (error) {
          toast("danger", `Couldn't load ${config.label}`);
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
        if (v === undefined || v === null || v === "") return `${f.label} is required.`;
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
      payload[f.key] = form[f.key] ?? (f.type === "checkbox" ? false : null);
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
        This cannot be undone. Reports already exported that used this record are unaffected — the PDF already has its own copy of the text.
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

  return (
    <div>
      {labelEl}
      <input
        type="text"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
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
