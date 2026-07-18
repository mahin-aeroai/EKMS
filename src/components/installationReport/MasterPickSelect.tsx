"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Notifications";

const ADD_NEW = "__add_new__";

/**
 * A <select> backed by one of the Installation Report master tables
 * (installation_report_fixture_types / _materials / _sign_types / _teams —
 * all shaped { id, name, active }). Picking a value stores its plain text
 * `name` in the form (not the row id) — the exported PDF just needs the
 * text, so there's no need to resolve foreign keys at export time, and it
 * keeps this component reusable across all four tables.
 *
 * Includes an inline "+ Add new" flow so an installer who hits a fixture
 * type that isn't in the list yet doesn't have to leave the form and go to
 * Manage Master Data — it's saved to the master table right there and
 * immediately selected.
 */
export function MasterPickSelect({
  label,
  table,
  value,
  onChange,
}: {
  label: string;
  table: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { toast } = useToast();
  const [options, setOptions] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    supabase
      .from(table)
      .select("name")
      .eq("active", true)
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setOptions([]);
          return;
        }
        setOptions(((data as { name: string }[]) ?? []).map((r) => r.name));
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  async function saveNew() {
    const name = newValue.trim();
    if (!name) return;
    setSaving(true);
    const { error } = await supabase.from(table).insert({ name, active: true });
    setSaving(false);
    if (error) {
      toast("danger", `Couldn't save "${name}": ${error.message}`);
      return;
    }
    toast("success", `${name} added`);
    onChange(name);
    setAdding(false);
    setNewValue("");
    load();
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-secondary">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveNew()}
            placeholder={`New ${label.toLowerCase()}`}
            className="h-10 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={saveNew}
            disabled={saving || !newValue.trim()}
            className="flex h-10 items-center rounded-md bg-primary px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewValue("");
            }}
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken"
            aria-label="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
      {label}
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD_NEW) {
            setAdding(true);
            return;
          }
          onChange(e.target.value);
        }}
        className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink focus:border-primary focus:outline-none"
      >
        <option value="">Select…</option>
        {value && options && !options.includes(value) && <option value={value}>{value}</option>}
        {options?.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        <option value={ADD_NEW}>
          + Add new…
        </option>
      </select>
    </label>
  );
}
