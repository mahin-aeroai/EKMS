import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { vibrant, fonts, sectionLabelStyle, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "@/lib/supabase";

/**
 * "After generatng the installtion report it shows complete and not bale
 * to open and see the preview" -- reports.tsx deliberately makes a
 * complete report's row un-pressable at all (resumable = !complete &&
 * !!draft, see that file's own comment on why), since report/[id].tsx is
 * a LOCAL-DRAFT editor -- reopening it for an already-submitted report
 * would mean editing/re-submitting data that's already live, not
 * "previewing" it. This is the missing other half: a real, separate,
 * READ-ONLY screen that reads the actual submitted rows back from the
 * server (installation_reports + installation_report_site_entries), not
 * the local draft file, so what you see here is what was actually filed.
 *
 * Photos are shown as a count per site/store, not as inline thumbnails --
 * installation_report_photos.relative_path is an R2 key, and unlike site
 * surveys or knowledge files there's no signed-url API route for these
 * yet (apps/web only has an upload-url route, see that route's own
 * neighbouring folder). Rendering real thumbnails needs a new endpoint on
 * the web app, a separate deploy from this mobile build -- flagged as a
 * follow-up rather than guessed at here.
 */

interface ReportHeader {
  store_name: string;
  address: string | null;
  sfo_id: string | null;
  program: string | null;
  asm_name: string | null;
  asm_contact: string | null;
  season_program: string | null;
  installation_date: string | null;
  team_name: string | null;
  status: string;
  created_at: string;
  submitted_at: string | null;
}

interface SiteEntry {
  id: string;
  site_index: number;
  fixture_type: string | null;
  material: string | null;
  sign_type: string | null;
  width_mm: number | null;
  height_mm: number | null;
  remarks: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ReportPreviewScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [header, setHeader] = useState<ReportHeader | null>(null);
  const [sites, setSites] = useState<SiteEntry[] | null>(null);
  const [storePhotoCount, setStorePhotoCount] = useState(0);
  const [sitePhotoCounts, setSitePhotoCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: reportRow, error: reportErr }, { data: siteRows, error: siteErr }, { data: photoRows }] = await Promise.all([
        supabase
          .from("installation_reports")
          .select("store_name, address, sfo_id, program, asm_name, asm_contact, season_program, installation_date, team_name, status, created_at, submitted_at")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("installation_report_site_entries")
          .select("id, site_index, fixture_type, material, sign_type, width_mm, height_mm, remarks")
          .eq("report_id", id)
          .order("site_index", { ascending: true }),
        supabase.from("installation_report_photos").select("site_entry_id").eq("report_id", id),
      ]);
      if (cancelled) return;
      if (reportErr || !reportRow) {
        setError("Couldn't load this report.");
        return;
      }
      setHeader(reportRow as ReportHeader);
      setSites((siteRows as SiteEntry[]) ?? []);
      let storeCount = 0;
      const perSite = new Map<string, number>();
      for (const p of (photoRows as { site_entry_id: string | null }[]) ?? []) {
        if (p.site_entry_id) perSite.set(p.site_entry_id, (perSite.get(p.site_entry_id) ?? 0) + 1);
        else storeCount += 1;
      }
      setStorePhotoCount(storeCount);
      setSitePhotoCounts(perSite);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <View style={s.centerFill}>
        <Text style={s.alertText}>{error}</Text>
        <GradientButton label="Go back" onPress={() => router.back()} />
      </View>
    );
  }

  if (!header || sites === null) {
    return (
      <View style={s.centerFill}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.heroCard}>
          <Text style={s.heroStore}>{header.store_name || "Untitled report"}</Text>
          {header.address ? <Text style={s.heroAddress}>{header.address}</Text> : null}
          <View style={s.heroStatusWrap}>
            <View style={[s.heroDot, { backgroundColor: header.status === "submitted" ? t.success : t.warning }]} />
            <Text style={s.heroStatusText}>{header.status === "submitted" ? "Submitted" : header.status}</Text>
          </View>
        </View>

        <SoftCard style={s.metaCard}>
          <MetaRow t={t} label="SFO ID" value={header.sfo_id || "—"} />
          <MetaRow t={t} label="Program" value={header.program || "—"} />
          <MetaRow t={t} label="Season" value={header.season_program || "—"} />
          <MetaRow t={t} label="Installation date" value={formatDate(header.installation_date)} />
          <MetaRow t={t} label="Team" value={header.team_name || "—"} />
          <MetaRow t={t} label="ASM" value={header.asm_name || "—"} />
          <MetaRow t={t} label="Filed" value={formatDate(header.created_at)} />
          {header.submitted_at && <MetaRow t={t} label="Submitted" value={formatDate(header.submitted_at)} />}
          <MetaRow t={t} label="Store photos" value={`${storePhotoCount} uploaded`} />
        </SoftCard>

        <Text style={s.sectionTitle}>Sites ({sites.length})</Text>
        {sites.length === 0 ? (
          <Text style={s.empty}>No site entries recorded.</Text>
        ) : (
          sites.map((site) => (
            <SoftCard key={site.id} style={s.siteCard}>
              <Text style={s.siteTitle}>Site {site.site_index}</Text>
              <MetaRow t={t} label="Fixture type" value={site.fixture_type || "—"} />
              <MetaRow t={t} label="Material" value={site.material || "—"} />
              <MetaRow t={t} label="Sign type" value={site.sign_type || "—"} />
              <MetaRow
                t={t}
                label="Size"
                value={site.width_mm && site.height_mm ? `${site.width_mm} × ${site.height_mm} mm` : "—"}
              />
              {site.remarks ? <MetaRow t={t} label="Remarks" value={site.remarks} /> : null}
              <MetaRow t={t} label="Photos" value={`${sitePhotoCounts.get(site.id) ?? 0} uploaded`} />
            </SoftCard>
          ))
        )}

        <GradientButton label="Back" onPress={() => router.back()} style={s.doneBtn} />
      </ScrollView>
    </View>
  );
}

function MetaRow({ t, label, value }: { t: VibrantTheme; label: string; value: string }) {
  const s = styles(t);
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 16 },
    content: { padding: 16, paddingBottom: 32, gap: 16 },
    alertText: { fontSize: 14, color: t.danger, textAlign: "center" },

    heroCard: {
      alignItems: "center", gap: 4, paddingVertical: 22, paddingHorizontal: 18,
      backgroundColor: t.inkMuted, borderRadius: 16,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
    },
    heroStore: { fontSize: 17, fontFamily: fonts.bold, color: t.onGradient, textAlign: "center" },
    heroAddress: { fontSize: 12, fontFamily: fonts.regular, color: t.onGradient, opacity: 0.85, textAlign: "center", marginTop: 2 },
    heroStatusWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
    heroDot: { width: 8, height: 8, borderRadius: 4 },
    heroStatusText: { fontSize: 12, fontFamily: fonts.medium, color: t.onGradient, opacity: 0.9, textTransform: "capitalize" },

    metaCard: { padding: 14, gap: 8 },
    metaRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    metaLabel: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    metaValue: { fontSize: 12, fontFamily: fonts.medium, color: t.ink, flexShrink: 1, textAlign: "right" },

    sectionTitle: { ...sectionLabelStyle(t), marginTop: 2 },
    empty: { fontSize: 14, color: t.inkMuted, textAlign: "center", padding: 16 },

    siteCard: { padding: 14, gap: 6 },
    siteTitle: { fontSize: 14, fontFamily: fonts.bold, color: t.ink, marginBottom: 4 },

    doneBtn: { marginTop: 4 },
  });
