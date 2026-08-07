import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { radius } from "@mmdi/shared/theme";
import { vibrant, fonts, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "@/lib/supabase";
import { loadDraft, saveDraft } from "@/lib/installationReports/draftStore";
import { capturePhoto, PhotoPermissionDeniedError } from "@/lib/installationReports/photo";
import { submitReport, type SubmitProgress } from "@/lib/installationReports/submit";
import {
  emptyDraftReport,
  emptyDraftSite,
  SITE_LEVEL_KINDS,
  STORE_LEVEL_KINDS,
  type DraftPhoto,
  type DraftReport,
  type DraftSite,
  type InstallationStoreRow,
  type InstallationStoreSiteRow,
  type NamedMasterRow,
  type PhotoKind,
  type SiteLevelKind,
  type StoreLevelKind,
} from "@/lib/installationReports/types";

const AUTOSAVE_DEBOUNCE_MS = 500;

const STORE_PHOTO_LABELS: Record<StoreLevelKind, string> = {
  storeFullCover: "Store Full Cover",
  installationCloseUp: "Installation Close-up",
  streetView1: "Street View 1",
  streetView2: "Street View 2",
};
const SITE_PHOTO_LABELS: Record<SiteLevelKind, string> = {
  mainSlide: "Main Slide",
  closeUp: "Close-up View",
  cornerTL: "Top Left Corner",
  cornerTR: "Top Right Corner",
  cornerBL: "Bottom Left Corner",
  cornerBR: "Bottom Right Corner",
};

export default function ReportScreen() {
  const t = vibrant;
  const s = styles(t);
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [draft, setDraft] = useState<DraftReport | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justLoaded = useRef(false);

  // ── Master data ──
  const [storeQuery, setStoreQuery] = useState("");
  const [storeResults, setStoreResults] = useState<InstallationStoreRow[]>([]);
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeSiteOptions, setStoreSiteOptions] = useState<InstallationStoreSiteRow[]>([]);
  const [programs, setPrograms] = useState<NamedMasterRow[]>([]);
  const [teams, setTeams] = useState<NamedMasterRow[]>([]);
  const [fixtureTypes, setFixtureTypes] = useState<NamedMasterRow[]>([]);
  const [materials, setMaterials] = useState<NamedMasterRow[]>([]);
  const [signTypes, setSignTypes] = useState<NamedMasterRow[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<SubmitProgress | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Load draft ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await loadDraft(id);
      if (cancelled) return;
      justLoaded.current = true;
      setDraft(existing ?? emptyDraftReport(id));
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Autosave ──
  useEffect(() => {
    if (!draft) return;
    if (justLoaded.current) {
      justLoaded.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(draft), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft]);

  // ── Master lookups (loaded once) ──
  useEffect(() => {
    async function loadNamed(table: string, setter: (rows: NamedMasterRow[]) => void) {
      const { data, error } = await supabase.from(table).select("id, name").eq("active", true).order("name", { ascending: true });
      if (!error) setter((data as NamedMasterRow[]) ?? []);
    }
    loadNamed("installation_report_programs", setPrograms);
    loadNamed("installation_report_teams", setTeams);
    loadNamed("installation_report_fixture_types", setFixtureTypes);
    loadNamed("installation_report_materials", setMaterials);
    loadNamed("installation_report_sign_types", setSignTypes);
  }, []);

  // ── Store search ──
  useEffect(() => {
    if (!storeOpen) return;
    const handle = setTimeout(async () => {
      const term = storeQuery.trim();
      let q = supabase
        .from("installation_report_stores")
        .select("id, store_name, address, sfo_id, program, no_of_sites, default_fixture_type, default_material, default_sign_type, asm_name, asm_contact")
        .eq("active", true)
        .order("store_name", { ascending: true })
        .limit(25);
      if (term) q = q.or(`store_name.ilike.%${term}%,sfo_id.ilike.%${term}%`);
      const { data, error } = await q;
      if (!error) setStoreResults((data as InstallationStoreRow[]) ?? []);
    }, 250);
    return () => clearTimeout(handle);
  }, [storeQuery, storeOpen]);

  async function applyStore(row: InstallationStoreRow) {
    setDraft((d) =>
      d
        ? {
            ...d,
            storeId: row.id,
            storeName: row.store_name,
            address: row.address ?? "",
            sfoId: row.sfo_id ?? "",
            program: row.program ?? "",
            asmName: row.asm_name ?? "",
            asmContact: row.asm_contact ?? "",
          }
        : d
    );
    setStoreOpen(false);
    setStoreQuery("");

    const { data: siteRows, error } = await supabase
      .from("installation_report_store_sites")
      .select("id, site_index, fixture_type, material, sign_type, width_mm, height_mm")
      .eq("store_id", row.id)
      .eq("active", true)
      .order("site_index", { ascending: true });

    const options: InstallationStoreSiteRow[] =
      !error && siteRows && siteRows.length > 0
        ? (siteRows as InstallationStoreSiteRow[])
        : Array.from({ length: row.no_of_sites && row.no_of_sites > 0 ? row.no_of_sites : 1 }, (_, i) => ({
            id: "",
            site_index: i + 1,
            fixture_type: row.default_fixture_type,
            material: row.default_material,
            sign_type: row.default_sign_type,
            width_mm: null,
            height_mm: null,
          }));
    setStoreSiteOptions(options);
  }

  function siteFromOption(option: InstallationStoreSiteRow | undefined, siteIndex: number): DraftSite {
    const site = emptyDraftSite(siteIndex);
    if (!option) return site;
    site.fixtureType = option.fixture_type ?? "";
    site.material = option.material ?? "";
    site.signType = option.sign_type ?? "";
    site.widthMm = option.width_mm;
    site.heightMm = option.height_mm;
    return site;
  }

  function addSite() {
    setDraft((d) => (d ? { ...d, sites: [...d.sites, emptyDraftSite(d.sites.length + 1)] } : d));
  }
  function addKnownSite(siteIndex: number) {
    const option = storeSiteOptions.find((o) => o.site_index === siteIndex);
    setDraft((d) => (d ? { ...d, sites: [...d.sites, siteFromOption(option, siteIndex)] } : d));
  }
  function updateSite(siteId: string, patch: Partial<DraftSite>) {
    setDraft((d) => (d ? { ...d, sites: d.sites.map((s) => (s.id === siteId ? { ...s, ...patch } : s)) } : d));
  }
  function removeSite(siteId: string) {
    setDraft((d) => (d ? { ...d, sites: d.sites.filter((s) => s.id !== siteId) } : d));
  }

  function setStorePhoto(kind: StoreLevelKind, photo: DraftPhoto | null) {
    setDraft((d) => (d ? { ...d, storePhotos: { ...d.storePhotos, [kind]: photo ?? undefined } } : d));
  }
  function setSitePhoto(siteId: string, kind: SiteLevelKind, photo: DraftPhoto | null) {
    setDraft((d) =>
      d
        ? {
            ...d,
            sites: d.sites.map((s) => (s.id === siteId ? { ...s, photos: { ...s.photos, [kind]: photo ?? undefined } } : s)),
          }
        : d
    );
  }

  async function handleSubmit() {
    if (!draft) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitReport(draft, setSubmitProgress);
      router.back();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't submit the report.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!draft) {
    return (
      <View style={s.centerFill}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  const readOnly = draft.submitState === "submitting";
  const knownSiteIndexes = new Set(draft.sites.map((s) => s.siteIndex));

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}>
      <ScrollView contentContainerStyle={s.contentInner} keyboardShouldPersistTaps="handled">
        <Section t={t} title="Store information">
          <View style={{ position: "relative" }}>
            <Field t={t} label="Store name — search to autofill, or type a new one">
              <TextInput
                style={s.input}
                value={draft.storeName}
                onChangeText={(v) => {
                  setDraft((d) => (d ? { ...d, storeName: v, storeId: null } : d));
                  setStoreQuery(v);
                  setStoreOpen(true);
                }}
                onFocus={() => setStoreOpen(true)}
                placeholder="e.g. Aptronix - Malabar Vijayawada"
                placeholderTextColor={t.inkMuted}
                editable={!readOnly}
              />
            </Field>
            {storeOpen && storeResults.length > 0 && (
              <View style={s.dropdown}>
                {storeResults.map((row) => (
                  <Pressable key={row.id} style={s.dropdownRow} onPress={() => applyStore(row)}>
                    <Text style={s.dropdownTitle}>{row.store_name}</Text>
                    <Text style={s.dropdownMeta}>
                      {[row.sfo_id ? `SFO ${row.sfo_id}` : null, row.program].filter(Boolean).join(" · ")}
                    </Text>
                  </Pressable>
                ))}
                <Pressable style={s.dropdownClose} onPress={() => setStoreOpen(false)}>
                  <Text style={s.dropdownCloseText}>Close</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={s.fieldRow}>
            <View style={s.fieldHalf}>
              <Field t={t} label="SFO ID">
                <TextInput style={s.input} value={draft.sfoId} onChangeText={(v) => setDraft((d) => (d ? { ...d, sfoId: v } : d))} editable={!readOnly} placeholderTextColor={t.inkMuted} />
              </Field>
            </View>
            <View style={s.fieldHalf}>
              <Field t={t} label="Program">
                <TextInput style={s.input} value={draft.program} onChangeText={(v) => setDraft((d) => (d ? { ...d, program: v } : d))} editable={!readOnly} placeholderTextColor={t.inkMuted} />
              </Field>
            </View>
          </View>

          <Field t={t} label="Address">
            <TextInput style={s.input} value={draft.address} onChangeText={(v) => setDraft((d) => (d ? { ...d, address: v } : d))} editable={!readOnly} placeholderTextColor={t.inkMuted} />
          </Field>

          <View style={s.fieldRow}>
            <View style={s.fieldHalf}>
              <Field t={t} label="ASM Name">
                <TextInput style={s.input} value={draft.asmName} onChangeText={(v) => setDraft((d) => (d ? { ...d, asmName: v } : d))} editable={!readOnly} placeholderTextColor={t.inkMuted} />
              </Field>
            </View>
            <View style={s.fieldHalf}>
              <Field t={t} label="ASM Contact">
                <TextInput style={s.input} value={draft.asmContact} onChangeText={(v) => setDraft((d) => (d ? { ...d, asmContact: v } : d))} editable={!readOnly} keyboardType="phone-pad" placeholderTextColor={t.inkMuted} />
              </Field>
            </View>
          </View>
        </Section>

        <Section t={t} title="Program & schedule">
          <PickerField t={t} label="Season Program" value={draft.seasonProgram} onChange={(v) => setDraft((d) => (d ? { ...d, seasonProgram: v } : d))} options={programs.map((p) => ({ value: p.name, label: p.name }))} disabled={readOnly} />
          <PickerField t={t} label="Installation Team" value={draft.teamName} onChange={(v) => { const row = teams.find((tm) => tm.name === v); setDraft((d) => (d ? { ...d, teamName: v, teamId: row?.id ?? null } : d)); }} options={teams.map((tm) => ({ value: tm.name, label: tm.name }))} disabled={readOnly} />
          <Field t={t} label="Installation Date (YYYY-MM-DD)">
            <TextInput style={s.input} value={draft.installationDate} onChangeText={(v) => setDraft((d) => (d ? { ...d, installationDate: v } : d))} placeholder="2026-07-27" placeholderTextColor={t.inkMuted} editable={!readOnly} />
          </Field>
        </Section>

        <Section t={t} title="Store overview photos">
          <View style={s.photoGrid}>
            {STORE_LEVEL_KINDS.map((kind) => (
              <PhotoSlot
                key={kind}
                t={t}
                label={STORE_PHOTO_LABELS[kind]}
                photo={draft.storePhotos[kind] ?? null}
                disabled={readOnly}
                onPick={async (source) => {
                  const photo = await capturePhoto(source, kind, draft.id);
                  if (photo) setStorePhoto(kind, photo);
                }}
                onRemove={() => setStorePhoto(kind, null)}
              />
            ))}
          </View>
        </Section>

        <Section t={t} title="Installation sites">
          <View style={s.siteQuickAdd}>
            {storeSiteOptions
              .filter((o) => !knownSiteIndexes.has(o.site_index))
              .map((o) => (
                <Pressable key={o.site_index} style={s.quickAddChip} onPress={() => addKnownSite(o.site_index)} disabled={readOnly}>
                  <Text style={s.quickAddChipText}>+ Site {o.site_index}</Text>
                </Pressable>
              ))}
            <Pressable style={s.quickAddChip} onPress={addSite} disabled={readOnly}>
              <Text style={s.quickAddChipText}>+ Add site</Text>
            </Pressable>
          </View>

          {draft.sites.map((site, i) => (
            <SoftCard key={site.id} style={s.siteCard}>
              <View style={s.siteCardHead}>
                <Text style={s.siteCardTitle}>Installation Site {i + 1}</Text>
                {draft.sites.length > 1 && (
                  <Pressable onPress={() => removeSite(site.id)} disabled={readOnly}>
                    <Text style={s.removeText}>Remove</Text>
                  </Pressable>
                )}
              </View>

              <PickerField t={t} label="Fixture Type" value={site.fixtureType} onChange={(v) => updateSite(site.id, { fixtureType: v })} options={fixtureTypes.map((r) => ({ value: r.name, label: r.name }))} disabled={readOnly} />
              <PickerField t={t} label="Material" value={site.material} onChange={(v) => updateSite(site.id, { material: v })} options={materials.map((r) => ({ value: r.name, label: r.name }))} disabled={readOnly} />
              <PickerField t={t} label="Sign Type" value={site.signType} onChange={(v) => updateSite(site.id, { signType: v })} options={signTypes.map((r) => ({ value: r.name, label: r.name }))} disabled={readOnly} />

              <View style={s.fieldRow}>
                <View style={s.fieldHalf}>
                  <NumberField t={t} label="Width (mm)" value={site.widthMm} onChange={(v) => updateSite(site.id, { widthMm: v })} disabled={readOnly} />
                </View>
                <View style={s.fieldHalf}>
                  <NumberField t={t} label="Height (mm)" value={site.heightMm} onChange={(v) => updateSite(site.id, { heightMm: v })} disabled={readOnly} />
                </View>
              </View>

              <Field t={t} label="Remarks">
                <TextInput style={s.input} value={site.remarks} onChangeText={(v) => updateSite(site.id, { remarks: v })} editable={!readOnly} placeholderTextColor={t.inkMuted} />
              </Field>

              <Text style={s.photoSectionLabel}>Photos</Text>
              <View style={s.photoGrid}>
                {SITE_LEVEL_KINDS.map((kind) => (
                  <PhotoSlot
                    key={kind}
                    t={t}
                    label={SITE_PHOTO_LABELS[kind]}
                    photo={site.photos[kind] ?? null}
                    disabled={readOnly}
                    onPick={async (source) => {
                      const photo = await capturePhoto(source, kind, draft.id);
                      if (photo) setSitePhoto(site.id, kind, photo);
                    }}
                    onRemove={() => setSitePhoto(site.id, kind, null)}
                  />
                ))}
              </View>
            </SoftCard>
          ))}
        </Section>

        {submitError && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{submitError}</Text>
          </View>
        )}
      </ScrollView>

      <View style={s.footer}>
        {submitting && submitProgress && (
          <Text style={s.progressText}>
            {submitProgress.phase === "rows" && "Saving report details…"}
            {submitProgress.phase === "photos" && `Uploading photos (${submitProgress.photosDone}/${submitProgress.photosTotal})…`}
            {submitProgress.phase === "finalizing" && "Finalizing…"}
            {submitProgress.phase === "done" && "Done."}
          </Text>
        )}
        <GradientButton
          label="Submit Report"
          onPress={handleSubmit}
          loading={submitting}
          disabled={!draft.storeName.trim()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function Section({ t, title, children }: { t: VibrantTheme; title: string; children: React.ReactNode }) {
  const s = styles(t);
  return (
    <SoftCard style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </SoftCard>
  );
}

function Field({ t, label, children }: { t: VibrantTheme; label: string; children: React.ReactNode }) {
  const s = styles(t);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

function NumberField({ t, label, value, onChange, disabled }: { t: VibrantTheme; label: string; value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  const s = styles(t);
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <Field t={t} label={label}>
      <TextInput
        style={s.input}
        value={text}
        onChangeText={(raw) => {
          setText(raw);
          if (raw === "") { onChange(null); return; }
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(n);
        }}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={t.inkMuted}
        editable={!disabled}
      />
    </Field>
  );
}

function PickerField({
  t, label, value, onChange, options, disabled,
}: {
  t: VibrantTheme; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean;
}) {
  const s = styles(t);
  const [open, setOpen] = useState(false);
  return (
    <Field t={t} label={label}>
      <Pressable style={s.pickerField} onPress={() => !disabled && setOpen(true)}>
        <Text style={value ? s.pickerText : s.pickerPlaceholder} numberOfLines={1}>
          {value || "Select…"}
        </Text>
        <Text style={s.pickerChevron}>⌄</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setOpen(false)} />
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)}><Text style={s.modalClose}>Done</Text></Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            style={s.modalList}
            renderItem={({ item }) => (
              <Pressable style={[s.modalOption, item.value === value && s.modalOptionActive]} onPress={() => { onChange(item.value); setOpen(false); }}>
                <Text style={s.modalOptionText}>{item.label}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={s.modalEmpty}>No options in master data yet.</Text>}
          />
        </View>
      </Modal>
    </Field>
  );
}

function PhotoSlot({
  t, label, photo, onPick, onRemove, disabled,
}: {
  t: VibrantTheme; label: string; photo: DraftPhoto | null; onPick: (source: "camera" | "library") => Promise<void>; onRemove: () => void; disabled?: boolean;
}) {
  const s = styles(t);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick(source: "camera" | "library") {
    setOpen(false);
    setBusy(true);
    try {
      await onPick(source);
    } catch (err) {
      if (err instanceof PhotoPermissionDeniedError) {
        Alert.alert(
          err.source === "camera" ? "Camera access needed" : "Photo library access needed",
          err.message,
          [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]
        );
      } else {
        Alert.alert("Couldn't add photo", err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.photoSlot}>
      <Pressable style={s.photoTap} onPress={() => !disabled && setOpen(true)} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={t.primary} />
        ) : photo ? (
          <Image source={{ uri: photo.uri }} style={s.photoImage} resizeMode="cover" />
        ) : (
          <Text style={s.photoPlaceholder}>+</Text>
        )}
      </Pressable>
      <Text style={s.photoLabel} numberOfLines={1}>{label}</Text>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setOpen(false)} />
        <View style={s.modalSheetSmall}>
          <Pressable style={s.modalOption} onPress={() => pick("camera")}>
            <Text style={s.modalOptionText}>Take Photo</Text>
          </Pressable>
          <Pressable style={s.modalOption} onPress={() => pick("library")}>
            <Text style={s.modalOptionText}>Choose from Library</Text>
          </Pressable>
          {photo && (
            <Pressable style={s.modalOption} onPress={() => { setOpen(false); onRemove(); }}>
              <Text style={[s.modalOptionText, { color: t.danger }]}>Remove Photo</Text>
            </Pressable>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
    // "Installation report too looks cluster. make it spacious" -- was 16px
    // section gap / 12-14px internal gaps throughout; both widened so each
    // section and field reads as its own thing instead of running together.
    contentInner: { padding: 16, gap: 20, paddingBottom: 32 },

    section: { gap: 16, padding: 18 },
    sectionTitle: { fontSize: 11, fontFamily: fonts.serifBold, color: t.inkMuted, textTransform: "uppercase", letterSpacing: 0.4 },

    field: { gap: 6 },
    label: { fontSize: 12, fontFamily: fonts.medium, color: t.inkSecondary },
    // Same "highlite input boxes" treatment as Sign Costing -- a filled,
    // colored-border field reads as "type here", distinct from labels and
    // static rows around it.
    input: {
      minHeight: 46, borderRadius: 12, borderWidth: 1.5, borderColor: t.primary + "55",
      backgroundColor: t.primaryTint, paddingHorizontal: 14, paddingVertical: 10,
      fontSize: 15, fontFamily: fonts.regular, color: t.ink,
    },
    fieldRow: { flexDirection: "row", gap: 12 },
    fieldHalf: { flex: 1 },

    dropdown: { position: "absolute", top: 80, left: 0, right: 0, zIndex: 20, backgroundColor: t.surfaceOverlay, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, maxHeight: 240, overflow: "hidden" },
    dropdownRow: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    dropdownTitle: { fontSize: 14, fontFamily: fonts.medium, color: t.ink },
    dropdownMeta: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted, marginTop: 2 },
    dropdownClose: { padding: 10, alignItems: "center" },
    dropdownCloseText: { fontSize: 12, fontFamily: fonts.bold, color: t.primary },

    pickerField: {
      minHeight: 46, borderRadius: 12, borderWidth: 1.5, borderColor: t.primary + "55",
      backgroundColor: t.primaryTint, paddingHorizontal: 14, paddingVertical: 10,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8,
    },
    pickerText: { flex: 1, fontSize: 15, fontFamily: fonts.regular, color: t.ink },
    pickerPlaceholder: { flex: 1, fontSize: 15, fontFamily: fonts.regular, color: t.inkMuted },
    pickerChevron: { fontSize: 15, color: t.primary },

    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    modalSheet: { backgroundColor: t.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "70%", paddingBottom: 24 },
    modalSheetSmall: { position: "absolute", top: "35%", left: 24, right: 24, backgroundColor: t.surfaceRaised, borderRadius: radius.lg, overflow: "hidden" },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    modalTitle: { fontSize: 14, fontFamily: fonts.bold, color: t.ink },
    modalClose: { fontSize: 14, fontFamily: fonts.bold, color: t.primary },
    modalList: { paddingHorizontal: 8 },
    modalOption: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md },
    modalOptionActive: { backgroundColor: t.primaryTint },
    modalOptionText: { fontSize: 14, fontFamily: fonts.regular, color: t.ink },
    modalEmpty: { padding: 24, textAlign: "center", color: t.inkMuted, fontSize: 13 },

    photoSectionLabel: { fontSize: 11, fontFamily: fonts.bold, color: t.inkMuted, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4 },
    photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    photoSlot: { width: "22%", gap: 5 },
    photoTap: { aspectRatio: 1, borderRadius: 14, borderWidth: 1.5, borderColor: t.line, backgroundColor: t.surfaceSunken, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    photoImage: { width: "100%", height: "100%" },
    photoPlaceholder: { fontSize: 22, color: t.inkMuted },
    photoLabel: { fontSize: 10, fontFamily: fonts.regular, color: t.inkSecondary, textAlign: "center" },

    siteQuickAdd: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    quickAddChip: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1.5, borderColor: t.primary, backgroundColor: t.primaryTint, alignItems: "center", justifyContent: "center" },
    quickAddChipText: { fontSize: 12, fontFamily: fonts.bold, color: t.primary },

    siteCard: { gap: 16, padding: 18 },
    siteCardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    siteCardTitle: { fontSize: 14, fontFamily: fonts.bold, color: t.ink },
    removeText: { fontSize: 12, fontFamily: fonts.medium, color: t.danger },

    errorBox: { borderRadius: radius.md, backgroundColor: t.dangerTint, padding: 12 },
    errorText: { fontSize: 13, fontFamily: fonts.regular, color: t.danger },

    footer: {
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, backgroundColor: t.surfaceRaised,
      paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 10 : 14, gap: 8,
    },
    progressText: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary, textAlign: "center" },
  });
