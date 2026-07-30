"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import type { BomTemplateLineRow, BomTemplateRow, RawMaterialRow } from "@mmdi/shared/rows";
import { RawMaterialPicker } from "./RawMaterialPicker";

// Combined view of bom_templates + bom_template_lines -- the web equivalent
// of the Excel workbook's "BOM Master" + "BOM Item Mapping" + "BOM Cost
// Detail" sheets rolled into one screen: pick a template, see its material
// lines, map each to a real raw_materials.code, edit consumption/wastage.
export function BomMasterTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<BomTemplateRow[] | null>(null);
  const [linesByTemplate, setLinesByTemplate] = useState<Record<string, BomTemplateLineRow[]>>({});
  const [materials, setMaterials] = useState<RawMaterialRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("bom_templates")
      .select("*")
      .order("code")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load BOM templates");
          return;
        }
        setTemplates((data as BomTemplateRow[]) ?? []);
      });
    supabase
      .from("raw_materials")
      .select("*")
      .order("code")
      .then(({ data, error }) => {
        if (error) return;
        setMaterials((data as RawMaterialRow[]) ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(templateId: string) {
    if (expanded === templateId) {
      setExpanded(null);
      return;
    }
    setExpanded(templateId);
    if (!linesByTemplate[templateId]) {
      supabase
        .from("bom_template_lines")
        .select("*")
        .eq("template_id", templateId)
        .order("line_no")
        .then(({ data, error }) => {
          if (error) {
            toast("danger", "Couldn't load BOM lines");
            return;
          }
          setLinesByTemplate((prev) => ({ ...prev, [templateId]: (data as BomTemplateLineRow[]) ?? [] }));
        });
    }
  }

  async function updateLine(templateId: string, line: BomTemplateLineRow, patch: Partial<BomTemplateLineRow>) {
    setSavingLineId(line.id);
    const { error } = await supabase.from("bom_template_lines").update(patch).eq("id", line.id);
    setSavingLineId(null);
    if (error) {
      toast("danger", `Couldn't save: ${error.message}`);
      return;
    }
    setLinesByTemplate((prev) => ({
      ...prev,
      [templateId]: prev[templateId].map((l) => (l.id === line.id ? { ...l, ...patch } : l)),
    }));
  }

  if (!templates) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;

  const unmappedCount = Object.values(linesByTemplate)
    .flat()
    .filter((l) => !l.raw_material_code).length;

  return (
    <div>
      <p className="mb-4 text-sm text-ink-secondary">
        {templates.length} BOM templates from FG Codes BOM Specs. Expand a template to see its material lines and map each to
        a real raw material. Lines with no confident text match are unmapped by design — pick one from the suggested
        candidates or search.
        {unmappedCount > 0 && (
          <span className="ml-1 text-warning">({unmappedCount} line{unmappedCount === 1 ? "" : "s"} opened so far still unmapped)</span>
        )}
      </p>

      <div className="flex flex-col gap-2">
        {templates.map((t) => (
          <div key={t.id} className="rounded-lg border border-line bg-surface">
            <button
              type="button"
              onClick={() => toggle(t.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                {expanded === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <div>
                  <div className="text-sm font-medium text-ink">
                    {t.code} <span className="font-normal text-ink-secondary">— {t.description}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <Badge status="info">{t.category}</Badge>
                    <Badge status="neutral">{t.print_mode}</Badge>
                    <Badge status="neutral">{t.substrate_type}</Badge>
                  </div>
                </div>
              </div>
              <span className="shrink-0 text-xs text-ink-muted">{t.work_centres.length} work centres</span>
            </button>

            {expanded === t.id && (
              <div className="border-t border-line px-4 py-3">
                {!linesByTemplate[t.id] ? (
                  <p className="py-4 text-center text-xs text-ink-muted">Loading lines…</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-line text-left text-ink-secondary">
                          <th className="py-1.5 pr-2">#</th>
                          <th className="py-1.5 pr-2">Material (BOM name)</th>
                          <th className="py-1.5 pr-2">Category</th>
                          <th className="py-1.5 pr-2">Mapped raw material</th>
                          <th className="py-1.5 pr-2">Basis</th>
                          <th className="py-1.5 pr-2">Consumption</th>
                          <th className="py-1.5 pr-2">Wastage %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linesByTemplate[t.id].map((line) => (
                          <tr key={line.id} className="border-b border-line/60 align-top">
                            <td className="py-2 pr-2 text-ink-muted">{line.line_no}</td>
                            <td className="py-2 pr-2 font-medium text-ink">{line.material_name}</td>
                            <td className="py-2 pr-2 text-ink-secondary">{line.material_category ?? "—"}</td>
                            <td className="py-2 pr-2">
                              <RawMaterialPicker
                                materials={materials}
                                value={line.raw_material_code}
                                onChange={(code) => updateLine(t.id, line, { raw_material_code: code })}
                              />
                              {!line.raw_material_code && line.suggested_codes && (
                                <div className="mt-1 max-w-xs text-[11px] italic text-ink-muted">{line.suggested_codes}</div>
                              )}
                            </td>
                            <td className="py-2 pr-2">
                              <select
                                value={line.basis}
                                onChange={(e) => updateLine(t.id, line, { basis: e.target.value as BomTemplateLineRow["basis"] })}
                                className="h-8 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                              >
                                <option value="per_sqft">per sqft</option>
                                <option value="per_piece">per piece</option>
                              </select>
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="number"
                                step="0.01"
                                value={line.consumption_qty}
                                onChange={(e) => updateLine(t.id, line, { consumption_qty: Number(e.target.value) })}
                                className="h-8 w-20 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="number"
                                step="1"
                                value={Math.round(line.wastage_pct * 100)}
                                onChange={(e) => updateLine(t.id, line, { wastage_pct: Number(e.target.value) / 100 })}
                                className="h-8 w-16 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none"
                              />
                              {savingLineId === line.id && <span className="ml-1 text-ink-muted">saving…</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
