"use client";

// Tracking Detail Report -- 12 Sept 2026 task (Mahin, verbatim): "New
// Module within distribution name it as Tracking Detail report ... fill
// and share the report of the below columns in excel file named:
// MMDI_Q426_FALL_Tracking_Master.xlsx".
//
// Flow: pick the season -> set its (single) Project Code -> upload the
// CURRENT MMDI_Q426_FALL_Tracking_Master.xlsx -> map any new Item Type
// (Costs) values to a Group + Rate Card SKU (reused automatically forever
// after) -> enter/edit each Group x Shipping City's tracking facts (also
// reused/edited season to season) -> Generate fills the uploaded workbook
// in place and downloads it. See parseTrackingMaster.ts for why this fills
// in place rather than reconstructing the file from the DB.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, FileSpreadsheet, Search, Tags, Upload } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { downloadBlob } from "@/lib/distribution/labelDocx";
import {
  CANONICAL_HEADER_LABEL,
  ensureWriteColumns,
  fillTrackingMasterWorksheet,
  parseTrackingMasterWorksheet,
  trackingEntryKey,
  type TrackingEntryValues,
  type TrackingMasterParseResult,
} from "@/lib/distribution/parseTrackingMaster";
import type {
  DistributionDeliverableGroupRow,
  DistributionRateCardRow,
  DistributionSeasonRow,
  DistributionTrackingEntryRow,
} from "@/lib/distribution/types";

const BLANK_ENTRY: TrackingEntryValues = {
  estimateNumber: null,
  deliveryNote: null,
  courier: null,
  trackingNumber: null,
  dispatchDate: null,
  eta: null,
  podDate: null,
  podName: null,
};

interface GroupCityInfo {
  groupName: string;
  city: string; // original casing, as seen in the uploaded file
  key: string; // trackingEntryKey(groupName, city)
}

export default function TrackingDetailClient() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workbookRef = useRef<ExcelJS.Workbook | null>(null);
  const worksheetRef = useRef<ExcelJS.Worksheet | null>(null);

  const [seasons, setSeasons] = useState<DistributionSeasonRow[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [projectCodeDraft, setProjectCodeDraft] = useState("");
  const [savingProjectCode, setSavingProjectCode] = useState(false);

  const [rateCards, setRateCards] = useState<DistributionRateCardRow[]>([]);
  const [groups, setGroups] = useState<DistributionDeliverableGroupRow[]>([]);
  const [entries, setEntries] = useState<DistributionTrackingEntryRow[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [groupDrafts, setGroupDrafts] = useState<Record<string, { groupName: string; skuId: string }>>({});
  const [savingGroup, setSavingGroup] = useState<string | null>(null);

  const [entryDrafts, setEntryDrafts] = useState<Record<string, TrackingEntryValues>>({});
  const [savingEntryGroup, setSavingEntryGroup] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [parsed, setParsed] = useState<TrackingMasterParseResult | null>(null);
  const [generating, setGenerating] = useState(false);

  // Saved-records browsing -- lets Mahin see/edit what's actually in the DB
  // (Group mappings, tracking entries for the selected season) without
  // having to upload a file first.
  const [groupSearch, setGroupSearch] = useState("");
  const [entrySearch, setEntrySearch] = useState("");

  // Seasons + the (not season-scoped) Rate Card / Deliverable Group map --
  // loaded once, same pattern as DistributionWorkspaceClient.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("distribution_seasons").select("*").order("created_at", { ascending: false });
      if (error) {
        toast("danger", `Couldn't load seasons: ${error.message}`);
        return;
      }
      const rows = (data as DistributionSeasonRow[]) ?? [];
      setSeasons(rows);
      setSeasonId((prev) => prev ?? (rows.length > 0 ? rows[0].id : null));
    })();
    (async () => {
      try {
        const [rateCardData, groupData] = await Promise.all([
          fetchAllRows<DistributionRateCardRow>((from, to) =>
            supabase.from("distribution_rate_card").select("*").order("sku_id", { ascending: true }).range(from, to)
          ),
          fetchAllRows<DistributionDeliverableGroupRow>((from, to) =>
            supabase.from("distribution_deliverable_groups").select("*").order("item_type_costs", { ascending: true }).range(from, to)
          ),
        ]);
        setRateCards(rateCardData);
        setGroups(groupData);
      } catch (err) {
        toast("danger", `Couldn't load Rate Card / Deliverable Group mapping: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const season = seasons.find((s) => s.id === seasonId) ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProjectCodeDraft(season?.project_code ?? "");
  }, [season?.id, season?.project_code]);

  async function loadEntries(sid: string) {
    setLoadingEntries(true);
    try {
      const rows = await fetchAllRows<DistributionTrackingEntryRow>((from, to) =>
        supabase.from("distribution_tracking_entries").select("*").eq("season_id", sid).range(from, to)
      );
      setEntries(rows);
    } catch (err) {
      toast("danger", `Couldn't load tracking entries: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingEntries(false);
    }
  }

  useEffect(() => {
    if (!seasonId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries([]);
    setEntryDrafts({});
    loadEntries(seasonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  async function saveProjectCode() {
    if (!seasonId) return;
    setSavingProjectCode(true);
    try {
      const value = projectCodeDraft.trim() || null;
      const { error } = await supabase.from("distribution_seasons").update({ project_code: value }).eq("id", seasonId);
      if (error) {
        toast("danger", `Couldn't save Project Code: ${error.message}`);
        return;
      }
      setSeasons((prev) => prev.map((s) => (s.id === seasonId ? { ...s, project_code: value } : s)));
      toast("success", "Project Code saved.");
    } finally {
      setSavingProjectCode(false);
    }
  }

  const rateCardBySkuId = useMemo(() => new Map(rateCards.map((r) => [r.sku_id, r])), [rateCards]);
  const rateCardOptions = useMemo(
    () =>
      [...rateCards].sort((a, b) =>
        (a.sku_description ?? a.category ?? a.program ?? a.sku_id).localeCompare(b.sku_description ?? b.category ?? b.program ?? b.sku_id)
      ),
    [rateCards]
  );
  const groupByItemTypeCosts = useMemo(() => new Map(groups.map((g) => [g.item_type_costs.trim().toLowerCase(), g.group_name])), [groups]);
  const knownGroupNames = useMemo(() => [...new Set(groups.map((g) => g.group_name))].sort(), [groups]);

  const unmappedItemTypes = useMemo(() => {
    if (!parsed) return [] as string[];
    const set = new Set<string>();
    for (const row of parsed.rows) {
      if (!row.itemTypeCosts) continue;
      if (!groupByItemTypeCosts.has(row.itemTypeCosts.trim().toLowerCase())) set.add(row.itemTypeCosts);
    }
    return [...set].sort();
  }, [parsed, groupByItemTypeCosts]);

  useEffect(() => {
    // Seeds a draft for every newly-seen item -- a blank one for an
    // unmapped item from the current upload, or pre-filled from the saved
    // row for an already-mapped one (so the "All mappings" browser below
    // can edit it) -- never overwrites an in-progress edit, so this is
    // idempotent/safe as a synchronization effect despite the direct
    // setState call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGroupDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of unmappedItemTypes) {
        if (!(item in next)) {
          next[item] = { groupName: "", skuId: "" };
          changed = true;
        }
      }
      for (const g of groups) {
        if (!(g.item_type_costs in next)) {
          next[g.item_type_costs] = { groupName: g.group_name, skuId: g.rate_card_sku_id ?? "" };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [unmappedItemTypes, groups]);

  // Every Item Type (Costs) this app knows about at all -- already-mapped
  // ones (from `groups`) plus any newly-seen unmapped ones from the
  // current upload -- what the "All mappings" browser below lists.
  const allMappedItemTypes = useMemo(() => {
    const set = new Set<string>([...groups.map((g) => g.item_type_costs), ...unmappedItemTypes]);
    return [...set].sort();
  }, [groups, unmappedItemTypes]);

  const groupSearchResults = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return allMappedItemTypes;
    return allMappedItemTypes.filter((item) => item.toLowerCase().includes(q) || (groupDrafts[item]?.groupName ?? "").toLowerCase().includes(q));
  }, [allMappedItemTypes, groupSearch, groupDrafts]);

  async function saveGroupMapping(itemTypeCosts: string) {
    const draft = groupDrafts[itemTypeCosts];
    if (!draft || !draft.groupName.trim()) {
      toast("danger", "Enter a Group name first.");
      return;
    }
    setSavingGroup(itemTypeCosts);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const row = {
        item_type_costs: itemTypeCosts,
        group_name: draft.groupName.trim(),
        rate_card_sku_id: draft.skuId || null,
        mapped_by: user?.id ?? null,
        mapped_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("distribution_deliverable_groups").upsert(row);
      if (error) {
        toast("danger", `Couldn't save mapping: ${error.message}`);
        return;
      }
      setGroups((prev) => [...prev.filter((g) => g.item_type_costs !== itemTypeCosts), { ...row, split_note: null }]);
      toast("success", `Mapped "${itemTypeCosts}" to ${row.group_name}.`);
    } finally {
      setSavingGroup(null);
    }
  }

  // Every distinct (Group, Shipping City) pair present in the CURRENTLY
  // uploaded file, for rows whose Item Type (Costs) already resolves to a
  // Group -- only meaningful once a file's been uploaded this session.
  const uploadGroupCities = useMemo<GroupCityInfo[]>(() => {
    if (!parsed) return [];
    const seen = new Map<string, GroupCityInfo>();
    for (const row of parsed.rows) {
      if (!row.itemTypeCosts || !row.shippingCity) continue;
      const groupName = groupByItemTypeCosts.get(row.itemTypeCosts.trim().toLowerCase());
      if (!groupName) continue;
      const key = trackingEntryKey(groupName, row.shippingCity);
      if (!seen.has(key)) seen.set(key, { groupName, city: row.shippingCity, key });
    }
    return [...seen.values()];
  }, [parsed, groupByItemTypeCosts]);

  // Every (Group, Shipping City) pair that already has a SAVED tracking
  // entry for this season -- this is what makes those records browsable
  // (and editable) without having to re-upload a file, per Mahin's "saved
  // records" ask.
  const savedGroupCities = useMemo<GroupCityInfo[]>(
    () => entries.map((e) => ({ groupName: e.group_name, city: e.shipping_city, key: trackingEntryKey(e.group_name, e.shipping_city) })),
    [entries]
  );

  // Union of both -- whatever's already saved, PLUS anything new the
  // current upload introduces -- this is what the tracking-entries editor
  // below shows.
  const groupCities = useMemo<GroupCityInfo[]>(() => {
    const seen = new Map<string, GroupCityInfo>();
    for (const gc of [...savedGroupCities, ...uploadGroupCities]) {
      if (!seen.has(gc.key)) seen.set(gc.key, gc);
    }
    return [...seen.values()].sort((a, b) => a.groupName.localeCompare(b.groupName) || a.city.localeCompare(b.city));
  }, [savedGroupCities, uploadGroupCities]);

  const groupCitiesByGroup = useMemo(() => {
    const m = new Map<string, GroupCityInfo[]>();
    for (const gc of groupCities) {
      const list = m.get(gc.groupName) ?? [];
      list.push(gc);
      m.set(gc.groupName, list);
    }
    return m;
  }, [groupCities]);

  const entrySearchResults = useMemo(() => {
    const q = entrySearch.trim().toLowerCase();
    if (!q) return groupCitiesByGroup;
    const m = new Map<string, GroupCityInfo[]>();
    for (const [groupName, cities] of groupCitiesByGroup) {
      if (groupName.toLowerCase().includes(q)) {
        m.set(groupName, cities);
        continue;
      }
      const matchingCities = cities.filter((gc) => gc.city.toLowerCase().includes(q));
      if (matchingCities.length > 0) m.set(groupName, matchingCities);
    }
    return m;
  }, [groupCitiesByGroup, entrySearch]);

  const entryByKey = useMemo(() => {
    const m = new Map<string, DistributionTrackingEntryRow>();
    for (const e of entries) m.set(trackingEntryKey(e.group_name, e.shipping_city), e);
    return m;
  }, [entries]);

  // Fill in a blank draft for any (Group, City) row not already drafted --
  // never overwrites an in-progress edit -- same idempotent-sync reasoning
  // as the groupDrafts effect above.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntryDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const gc of groupCities) {
        if (next[gc.key]) continue;
        const existing = entryByKey.get(gc.key);
        next[gc.key] = existing
          ? {
              estimateNumber: existing.estimate_number,
              deliveryNote: existing.delivery_note,
              courier: existing.courier,
              trackingNumber: existing.tracking_number,
              dispatchDate: existing.dispatch_date,
              eta: existing.eta,
              podDate: existing.pod_date,
              podName: existing.pod_name,
            }
          : { ...BLANK_ENTRY };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [groupCities, entryByKey]);

  function updateEntryField(key: string, field: keyof TrackingEntryValues, value: string) {
    setEntryDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? BLANK_ENTRY), [field]: value || null } }));
  }

  function updateGroupEstimateNumber(groupName: string, value: string) {
    const keys = (groupCitiesByGroup.get(groupName) ?? []).map((gc) => gc.key);
    setEntryDrafts((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = { ...(next[k] ?? BLANK_ENTRY), estimateNumber: value || null };
      return next;
    });
  }

  async function saveGroupEntries(groupName: string) {
    if (!seasonId) return;
    const cities = groupCitiesByGroup.get(groupName) ?? [];
    if (cities.length === 0) return;
    setSavingEntryGroup(groupName);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const rows = cities.map((gc) => {
        const d = entryDrafts[gc.key] ?? BLANK_ENTRY;
        return {
          season_id: seasonId,
          group_name: groupName,
          shipping_city: gc.city,
          estimate_number: d.estimateNumber,
          delivery_note: d.deliveryNote,
          courier: d.courier,
          tracking_number: d.trackingNumber,
          dispatch_date: d.dispatchDate,
          eta: d.eta,
          pod_date: d.podDate,
          pod_name: d.podName,
          updated_by: user?.id ?? null,
          updated_at: now,
        };
      });
      const { error } = await supabase.from("distribution_tracking_entries").upsert(rows, { onConflict: "season_id,group_name,shipping_city" });
      if (error) {
        toast("danger", `Couldn't save: ${error.message}`);
        return;
      }
      toast("success", `Saved tracking details for ${groupName}.`);
      await loadEntries(seasonId);
    } finally {
      setSavingEntryGroup(null);
    }
  }

  async function handleFile(file: File) {
    setLoadingFile(true);
    setParsed(null);
    workbookRef.current = null;
    worksheetRef.current = null;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const worksheet = workbook.worksheets.find((ws) => /tracking/i.test(ws.name)) ?? workbook.worksheets[0];
      if (!worksheet) {
        toast("danger", "No sheet found in that file.");
        return;
      }
      const result = parseTrackingMasterWorksheet(worksheet);
      if (result.missingColumns.length > 0) {
        toast(
          "danger",
          `This file is missing required column(s): ${result.missingColumns.map((k) => CANONICAL_HEADER_LABEL[k]).join(", ")}.`
        );
        return;
      }
      if (result.rows.length === 0) {
        toast("danger", "No data rows found under the header row.");
        return;
      }
      workbookRef.current = workbook;
      worksheetRef.current = worksheet;
      setParsed(result);
      setFileName(file.name);
      toast("success", `Loaded ${result.rows.length} row(s) from ${file.name}.`);
    } catch (err) {
      toast("danger", `Couldn't read that file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingFile(false);
    }
  }

  async function handleGenerate() {
    if (!parsed || !workbookRef.current || !worksheetRef.current) return;
    setGenerating(true);
    try {
      const { columnMap, addedColumns } = ensureWriteColumns(worksheetRef.current, parsed.columnMap);
      const finalParsed: TrackingMasterParseResult = { ...parsed, columnMap };

      const unitPriceByItemTypeCosts = new Map<string, number>();
      for (const g of groups) {
        if (!g.rate_card_sku_id) continue;
        const rate = rateCardBySkuId.get(g.rate_card_sku_id)?.revised_rate_2026;
        if (rate != null) unitPriceByItemTypeCosts.set(g.item_type_costs.trim().toLowerCase(), rate);
      }

      const entryByGroupCity = new Map<string, TrackingEntryValues>();
      for (const gc of groupCities) {
        const d = entryDrafts[gc.key];
        if (d) entryByGroupCity.set(gc.key, d);
      }

      const result = fillTrackingMasterWorksheet(worksheetRef.current, finalParsed, {
        projectCode: projectCodeDraft.trim() || null,
        groupByItemTypeCosts,
        entryByGroupCity,
        unitPriceByItemTypeCosts,
      });

      const arrayBuffer = await workbookRef.current.xlsx.writeBuffer();
      const blob = new Blob([arrayBuffer as unknown as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      downloadBlob(blob, fileName ?? "Tracking_Master.xlsx");

      if (addedColumns.length > 0) {
        toast("info", `Added new column(s) to the workbook: ${addedColumns.map((k) => CANONICAL_HEADER_LABEL[k]).join(", ")}.`);
      }
      toast(
        "success",
        `Filled ${result.rowsFilled} row(s). ${result.rowsUnmappedGroup} row(s) had no Group mapping yet, ${result.rowsNoTrackingEntry} had a Group but no tracking entry yet for that city.`
      );
    } catch (err) {
      toast("danger", `Couldn't generate the file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6 pb-16">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Distribution", href: "/workspaces/distribution" },
          { label: "Tracking Detail Report" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Tracking Detail Report</h1>
          <p className="text-sm text-ink-secondary">
            Upload the current Tracking Master file — this fills in Estimate Number, Delivery Note, Courier, Tracking
            Number, dates, POD, and pricing, and hands back the same workbook with everything else untouched.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/workspaces/distribution")}>
          <ArrowLeft size={14} /> Back to Distribution
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-ink-secondary">Season</span>
          <select
            value={seasonId ?? ""}
            onChange={(e) => setSeasonId(e.target.value || null)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          >
            {seasons.length === 0 && <option value="">No seasons imported yet</option>}
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.dispatch_wave ? ` (${s.dispatch_wave})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="h-4 w-px bg-line" />
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-ink-secondary">Project Code</span>
          <input
            value={projectCodeDraft}
            onChange={(e) => setProjectCodeDraft(e.target.value)}
            onBlur={() => {
              if (season && projectCodeDraft.trim() !== (season.project_code ?? "")) saveProjectCode();
            }}
            disabled={!seasonId}
            placeholder="Single value for this season"
            className="w-56 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink disabled:opacity-60"
          />
          {savingProjectCode && <span className="text-xs text-ink-muted">Saving…</span>}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-sunken px-4 py-2 text-xs text-ink-secondary">
        <CheckCircle2 size={14} className="text-success" />
        <span>
          Saved records: <span className="font-medium text-ink">{groups.length}</span> Item Type → Group mapping
          {groups.length === 1 ? "" : "s"}, <span className="font-medium text-ink">{entries.length}</span> tracking
          {entries.length === 1 ? " entry" : " entries"} for this season — see below, no upload needed to view them.
        </span>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loadingFile || !seasonId}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line py-10 text-center hover:border-primary hover:bg-surface-sunken disabled:opacity-60"
        >
          <Upload size={22} className="text-ink-muted" />
          <span className="text-sm font-medium text-ink">
            {loadingFile
              ? "Reading workbook…"
              : fileName
                ? `${fileName} — click to replace`
                : "Click to choose the current MMDI_Q426_FALL_Tracking_Master.xlsx"}
          </span>
        </button>
        {parsed && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <Badge>{parsed.rows.length} rows</Badge>
            {unmappedItemTypes.length > 0 && <Badge status="warning">{unmappedItemTypes.length} Item Type(s) unmapped</Badge>}
            <Badge status="info">{uploadGroupCities.length} Group × City combination(s) in this file</Badge>
          </div>
        )}
      </div>

      {unmappedItemTypes.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
          <div className="mb-2 flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-medium text-ink">
                {unmappedItemTypes.length} Item Type (Costs) value(s) in this file aren&apos;t mapped to a Group yet
              </p>
              <p className="text-xs text-ink-secondary">
                Give each one a Group name (reuse an existing one to share tracking details across Item Types) and,
                optionally, the Rate Card SKU that prices it — mapped once, reused automatically for every future
                season using the same Item Type (Costs).
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {unmappedItemTypes.map((item) => {
              const draft = groupDrafts[item] ?? { groupName: "", skuId: "" };
              return (
                <div key={item} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-xs">
                  <span className="min-w-[14rem] flex-1 font-medium text-ink">{item}</span>
                  <input
                    list="tracking-known-group-names"
                    value={draft.groupName}
                    onChange={(e) => setGroupDrafts((prev) => ({ ...prev, [item]: { ...draft, groupName: e.target.value } }))}
                    placeholder="Group name…"
                    className="w-56 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                  />
                  <select
                    value={draft.skuId}
                    onChange={(e) => setGroupDrafts((prev) => ({ ...prev, [item]: { ...draft, skuId: e.target.value } }))}
                    className="w-72 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                  >
                    <option value="">Rate Card SKU (optional)…</option>
                    {rateCardOptions.map((r) => (
                      <option key={r.sku_id} value={r.sku_id}>
                        {r.sku_description ?? r.category ?? r.program ?? "—"} ({r.sku_id})
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" loading={savingGroup === item} onClick={() => saveGroupMapping(item)}>
                    Save
                  </Button>
                </div>
              );
            })}
          </div>
          <datalist id="tracking-known-group-names">
            {knownGroupNames.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
      )}

      {allMappedItemTypes.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Tags size={16} className="text-ink-muted" />
              <h2 className="text-base font-semibold text-ink">All Item Type → Group mappings</h2>
              <Badge>{groups.length} saved</Badge>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1">
              <Search size={13} className="text-ink-muted" />
              <input
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Search Item Type or Group"
                className="w-64 bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
              />
            </div>
          </div>
          <p className="text-xs text-ink-secondary">
            Every Item Type (Costs) → Group mapping saved so far — not season-specific, reused automatically across
            every season. Change a Group or SKU here and hit Save to update it.
          </p>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-ink-secondary">
                  <th className="px-3 py-2">Item Type (Costs)</th>
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2">Rate Card SKU</th>
                  <th className="px-3 py-2">Mapped At</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {groupSearchResults.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                      No matches.
                    </td>
                  </tr>
                ) : (
                  groupSearchResults.map((item) => {
                    const draft = groupDrafts[item] ?? { groupName: "", skuId: "" };
                    const saved = groups.find((g) => g.item_type_costs === item);
                    return (
                      <tr key={item} className="border-b border-line last:border-b-0">
                        <td className="px-3 py-2 font-medium text-ink">{item}</td>
                        <td className="px-3 py-2">
                          <input
                            list="tracking-known-group-names"
                            value={draft.groupName}
                            onChange={(e) => setGroupDrafts((prev) => ({ ...prev, [item]: { ...draft, groupName: e.target.value } }))}
                            className="w-48 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={draft.skuId}
                            onChange={(e) => setGroupDrafts((prev) => ({ ...prev, [item]: { ...draft, skuId: e.target.value } }))}
                            className="w-64 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                          >
                            <option value="">— none —</option>
                            {rateCardOptions.map((r) => (
                              <option key={r.sku_id} value={r.sku_id}>
                                {r.sku_description ?? r.category ?? r.program ?? "—"} ({r.sku_id})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-ink-secondary">
                          {saved ? new Date(saved.mapped_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "not saved yet"}
                        </td>
                        <td className="px-3 py-2">
                          <Button size="sm" variant="secondary" loading={savingGroup === item} onClick={() => saveGroupMapping(item)}>
                            Save
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {groupCities.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-ink-muted" />
              <h2 className="text-base font-semibold text-ink">Tracking details by Group</h2>
              <Badge>{entries.length} saved</Badge>
              {loadingEntries && <span className="text-xs text-ink-muted">Loading saved entries…</span>}
            </div>
            <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1">
              <Search size={13} className="text-ink-muted" />
              <input
                value={entrySearch}
                onChange={(e) => setEntrySearch(e.target.value)}
                placeholder="Search Group or City"
                className="w-64 bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
              />
            </div>
          </div>
          {entrySearchResults.size === 0 && (
            <p className="rounded-lg border border-dashed border-line py-6 text-center text-xs text-ink-muted">No matches.</p>
          )}
          {[...entrySearchResults.entries()].map(([groupName, cities]) => {
            const estimateNumber = entryDrafts[cities[0]?.key ?? ""]?.estimateNumber ?? "";
            return (
              <div key={groupName} className="rounded-lg border border-line bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{groupName}</span>
                    <Badge status="neutral">{cities.length} cit{cities.length === 1 ? "y" : "ies"}</Badge>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-ink-secondary">Estimate Number (whole Group)</span>
                    <input
                      value={estimateNumber}
                      onChange={(e) => updateGroupEstimateNumber(groupName, e.target.value)}
                      className="w-44 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                    />
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[60rem] text-xs">
                    <thead>
                      <tr className="text-left text-ink-secondary">
                        <th className="px-2 py-1">City</th>
                        <th className="px-2 py-1">Delivery Note / Email Contact</th>
                        <th className="px-2 py-1">Courier</th>
                        <th className="px-2 py-1">Tracking Number</th>
                        <th className="px-2 py-1">Dispatch Date</th>
                        <th className="px-2 py-1">ETA</th>
                        <th className="px-2 py-1">POD Date</th>
                        <th className="px-2 py-1">POD Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cities.map((gc) => {
                        const d = entryDrafts[gc.key] ?? BLANK_ENTRY;
                        return (
                          <tr key={gc.key} className="border-t border-line">
                            <td className="px-2 py-1 font-medium text-ink">{gc.city}</td>
                            <td className="px-2 py-1">
                              <input
                                value={d.deliveryNote ?? ""}
                                onChange={(e) => updateEntryField(gc.key, "deliveryNote", e.target.value)}
                                placeholder="Any text here = Units Shipped/Delivered filled"
                                className="w-56 rounded-md border border-line bg-surface px-2 py-1 text-ink"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                value={d.courier ?? ""}
                                onChange={(e) => updateEntryField(gc.key, "courier", e.target.value)}
                                className="w-28 rounded-md border border-line bg-surface px-2 py-1 text-ink"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                value={d.trackingNumber ?? ""}
                                onChange={(e) => updateEntryField(gc.key, "trackingNumber", e.target.value)}
                                className="w-32 rounded-md border border-line bg-surface px-2 py-1 text-ink"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="date"
                                value={d.dispatchDate ?? ""}
                                onChange={(e) => updateEntryField(gc.key, "dispatchDate", e.target.value)}
                                className="rounded-md border border-line bg-surface px-2 py-1 text-ink"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="date"
                                value={d.eta ?? ""}
                                onChange={(e) => updateEntryField(gc.key, "eta", e.target.value)}
                                className="rounded-md border border-line bg-surface px-2 py-1 text-ink"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="date"
                                value={d.podDate ?? ""}
                                onChange={(e) => updateEntryField(gc.key, "podDate", e.target.value)}
                                className="rounded-md border border-line bg-surface px-2 py-1 text-ink"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                value={d.podName ?? ""}
                                onChange={(e) => updateEntryField(gc.key, "podName", e.target.value)}
                                className="w-28 rounded-md border border-line bg-surface px-2 py-1 text-ink"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="secondary" loading={savingEntryGroup === groupName} onClick={() => saveGroupEntries(groupName)}>
                    Save {groupName}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {parsed && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-ink-muted" />
            <span className="text-sm font-medium text-ink">Generate</span>
          </div>
          {unmappedItemTypes.length === 0 ? (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-ink">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
              <span>Every Item Type (Costs) in this file is mapped to a Group.</span>
            </div>
          ) : (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              <span>
                {unmappedItemTypes.length} Item Type(s) still unmapped — their rows will be filled with Delivery
                Exception/NPIT Shipping Code/Project Code only, nothing else, until mapped.
              </span>
            </div>
          )}
          <div className="flex justify-end">
            <Button loading={generating} onClick={handleGenerate}>
              Generate Tracking Master
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
