import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../context/auth";
import { listDrafts } from "../../lib/installationReports/draftStore";
import { vibrant, fonts, sectionLabelStyle, type VibrantTheme } from "../../theme/vibrant";
import { GradientCard, SoftCard } from "../../theme/components";

/**
 * "lets create a beautiful home page after login instead directly get into
 * copilot" -- this is now the (tabs) group's "index" route, so it's what
 * opens right after sign-in. Copilot moved to copilot.tsx (still a real
 * screen, just no longer a bottom tab -- see _layout.tsx's `href: null` on
 * that Tabs.Screen) and is reached from the hero quick-action card below,
 * per the user's own call on where Copilot should live.
 *
 * Recent activity re-derives the same local-draft + server-row merge as
 * reports.tsx (see that file's header comment for the full "why check the
 * server too" reasoning) rather than importing a shared helper -- small
 * per-screen UI logic stays local in this app, same convention as
 * fetchAllRows in sales-by-rep.tsx.
 */

type ReportStatus = "local-draft" | "incomplete" | "complete";

interface RecentItem {
  id: string;
  storeName: string;
  status: ReportStatus;
  sortKey: string;
  resumable: boolean;
}

const SERVER_PAGE = 30;

// "Remove recent activity from home page. instead display sales figures."
function monthStartISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

// Simple sequential pager, same shape as sales-by-rep.tsx's fetchAllRows --
// this only runs once per Home visit and month-to-date is a much smaller
// slice than that screen's all-time queries, so the extra complexity of a
// count-based parallel fetch (and the failure mode it turned out to have,
// see sales-by-rep.tsx's own fix note) isn't worth it here.
async function fetchMonthSales(): Promise<{ total: number; count: number }> {
  const pageSize = 1000;
  const from0 = monthStartISO();
  let total = 0;
  let count = 0;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("sales_transactions")
      .select("taxable_value")
      .gte("invoice_date", from0)
      .range(from, from + pageSize - 1);
    if (error || !data) break;
    for (const r of data) total += r.taxable_value ?? 0;
    count += data.length;
    if (data.length < pageSize) break;
  }
  return { total, count };
}

function formatCrore(rupees: number): string {
  return rupees >= 10000000 ? `₹${(rupees / 10000000).toFixed(2)} Cr` : `₹${rupees.toLocaleString("en-IN")}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(email: string | undefined): string {
  if (!email) return "there";
  const local = email.split("@")[0] ?? "";
  const word = local.split(/[.\-_]/)[0] ?? local;
  return word ? word[0].toUpperCase() + word.slice(1) : "there";
}

// `as const` keeps each `icon` a string literal (e.g. "function") rather
// than widening to `string` -- SymbolView's `name` prop is a large union of
// specific SF Symbol literals, not a plain string, so a widened type fails
// to typecheck even though every literal here is already used successfully
// as a bare string prop in _layout.tsx.
// "add few more color inside the pages so that it looks better" -- each
// tool gets its own accent (still all from the existing red-theme palette,
// nothing new invented) instead of every quick-action tile using the same
// flat primaryTint icon circle, so the grid reads as four distinct tools
// at a glance rather than four identical cards with different labels.
const ACCENT_MAP: Record<string, (t: VibrantTheme) => { main: string; tint: string }> = {
  primary: (t) => ({ main: t.primary, tint: t.primaryTint }),
  info: (t) => ({ main: t.info, tint: t.infoTint }),
  success: (t) => ({ main: t.success, tint: t.successTint }),
  warning: (t) => ({ main: t.warning, tint: t.warningTint }),
};

const QUICK_ACTIONS = [
  // "remove survey from menu and place only at home page" -- Surveys is
  // now href:null in _layout.tsx (no tab bar button); this tile is its
  // only remaining entry point, same for Basil Installations below.
  { label: "Surveys", sub: "Search & open site surveys", icon: "doc.text.magnifyingglass", route: "/surveys", color: "info" },
  { label: "Sign Costing", sub: "Build a signage cost sheet", icon: "function", route: "/estimator", color: "primary" },
  { label: "Basil Installations", sub: "Reports & new capture", icon: "list.clipboard", route: "/reports", color: "warning" },
  { label: "Sales by Rep", sub: "Customer breakdown by rep", icon: "chart.line.uptrend.xyaxis", route: "/sales-by-rep", color: "success" },
  // Estimates and Cost Sheets are now real tabs (see _layout.tsx) -- kept
  // here too, same as every other tool, since this grid lists every tool
  // regardless of tab-bar visibility (Surveys/Basil Installations above
  // prove that already).
  { label: "Estimates", sub: "Build & save client quotes", icon: "text.badge.plus", route: "/estimate-builder", color: "info" },
  { label: "Cost Sheets", sub: "Browse previously generated sheets", icon: "doc.text", route: "/cost-sheets", color: "warning" },
] as const;

export default function HomeScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();
  const { session } = useSession();

  const [items, setItems] = useState<RecentItem[] | null>(null);
  const [salesSummary, setSalesSummary] = useState<{ total: number; count: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchMonthSales().then((s) => { if (!cancelled) setSalesSummary(s); });
      (async () => {
        const [drafts, userRes] = await Promise.all([listDrafts(), supabase.auth.getUser()]);
        const userId = userRes.data.user?.id;
        if (cancelled) return;

        const draftsById = new Map(drafts.map((d) => [d.id, d]));

        const { data: serverReports } = userId
          ? await supabase
              .from("installation_reports")
              .select("id, store_name, status, created_at, submitted_at")
              .eq("created_by", userId)
              .order("created_at", { ascending: false })
              .limit(SERVER_PAGE)
          : { data: [] as { id: string; store_name: string; status: string; created_at: string; submitted_at: string | null }[] };
        if (cancelled) return;

        const byId = new Map<string, RecentItem>();
        for (const r of serverReports ?? []) {
          const draft = draftsById.get(r.id);
          const complete = r.status === "submitted";
          byId.set(r.id, {
            id: r.id,
            storeName: r.store_name || "Untitled report",
            status: complete ? "complete" : "incomplete",
            sortKey: r.submitted_at ?? r.created_at,
            resumable: !complete && !!draft,
          });
        }
        for (const d of drafts) {
          if (byId.has(d.id)) continue;
          byId.set(d.id, {
            id: d.id,
            storeName: d.storeName || "Untitled report",
            status: "local-draft",
            sortKey: d.updatedAt,
            resumable: true,
          });
        }

        const sorted = Array.from(byId.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
        setItems(sorted);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const inProgress = items?.filter((i) => i.status !== "complete").length ?? 0;
  const completedThisMonth =
    items?.filter((i) => {
      if (i.status !== "complete") return false;
      const d = new Date(i.sortKey);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length ?? 0;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.greetRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.greeting}>
            {greeting()}, {firstName(session?.user?.email)}
          </Text>
          <Text style={s.subGreeting}>Here's what's happening today.</Text>
        </View>
        <Image source={require("../../assets/images/logo-mark.png")} style={s.logo} resizeMode="contain" />
      </View>

      <Pressable onPress={() => router.push("/copilot")}>
        <GradientCard style={s.copilotCard}>
          <View style={s.copilotIconWrap}>
            <SymbolView name="bubble.left.and.text.bubble.right" tintColor={t.onGradient} size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.copilotTitle}>Ask Copilot</Text>
            <Text style={s.copilotSub}>Job orders, surveys, quick answers — just ask.</Text>
          </View>
          <Text style={s.copilotChev}>›</Text>
        </GradientCard>
      </Pressable>

      <View style={s.statRow}>
        <SoftCard style={[s.statCard, { borderLeftWidth: 3, borderLeftColor: t.warning }]}>
          <Text style={[s.statValue, { color: t.warning }]}>{items === null ? "—" : inProgress}</Text>
          <Text style={s.statLabel}>In progress</Text>
        </SoftCard>
        <SoftCard style={[s.statCard, { borderLeftWidth: 3, borderLeftColor: t.success }]}>
          <Text style={[s.statValue, { color: t.success }]}>{items === null ? "—" : completedThisMonth}</Text>
          <Text style={s.statLabel}>Completed this month</Text>
        </SoftCard>
      </View>

      <Text style={s.sectionTitle}>Quick actions</Text>
      <View style={s.grid}>
        {QUICK_ACTIONS.map((a) => {
          const accent = ACCENT_MAP[a.color](t);
          return (
            <Pressable key={a.route} style={s.gridItem} onPress={() => router.push(a.route as never)}>
              <SoftCard style={s.gridCard}>
                <View style={[s.gridIconWrap, { backgroundColor: accent.tint }]}>
                  <SymbolView name={a.icon} tintColor={accent.main} size={20} />
                </View>
                <Text style={s.gridLabel}>{a.label}</Text>
                <Text style={s.gridSub} numberOfLines={2}>{a.sub}</Text>
              </SoftCard>
            </Pressable>
          );
        })}
      </View>

      {/* "Remove recent activity from home page. instead display sales
          figures." -- was a list of individual draft/report rows; now a
          company-wide "this month" sales snapshot, same data source and
          hero-stat visual language as Sales by Rep's own Total Sales
          card, so Home reads as a dashboard rather than a worklist. */}
      <Text style={s.sectionTitle}>This month's sales</Text>
      {salesSummary === null ? (
        <ActivityIndicator style={s.pad} color={t.primary} />
      ) : (
        <Pressable onPress={() => router.push("/sales-by-rep")}>
          <View style={s.salesCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.salesLabel}>Total taxable value</Text>
              <Text style={s.salesValue}>{formatCrore(salesSummary.total)}</Text>
              <Text style={s.salesSub}>{salesSummary.count.toLocaleString("en-IN")} transactions this month</Text>
            </View>
            <Text style={s.salesChev}>›</Text>
          </View>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    content: { padding: 16, paddingBottom: 32, gap: 18 },

    greetRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    // "font headr can be little smaller and gap can be increased slightly"
    // -- shaved further and given more breathing room from what follows.
    // "still the fonts erantic" -- serif dropped, clean bold sans instead.
    greeting: { fontSize: 17, fontFamily: fonts.bold, color: t.ink },
    subGreeting: { fontSize: 13, color: t.inkSecondary, marginTop: -4 },
    logo: { width: 40, height: 40, borderRadius: 10 },

    copilotCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
    copilotIconWrap: {
      width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.22)",
      alignItems: "center", justifyContent: "center",
    },
    copilotTitle: { fontSize: 17, fontWeight: "700", color: t.onGradient },
    copilotSub: { fontSize: 13, color: t.onGradient, opacity: 0.85, marginTop: 2 },
    copilotChev: { fontSize: 22, color: t.onGradient, opacity: 0.85 },

    statRow: { flexDirection: "row", gap: 10 },
    statCard: { flex: 1, padding: 14, gap: 2 },
    statValue: { fontSize: 24, fontWeight: "700", color: t.ink },
    statLabel: { fontSize: 12, color: t.inkSecondary },

    // Matches the reference apps' small uppercase-tracked "FOR YOU" style
    // section labels -- see theme/vibrant.ts's sectionLabelStyle().
    sectionTitle: { ...sectionLabelStyle(t), marginTop: 4 },

    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    gridItem: { flexBasis: "47%", flexGrow: 1 },
    gridCard: { padding: 12, gap: 4, minHeight: 96 },
    gridIconWrap: {
      width: 34, height: 34, borderRadius: 17, backgroundColor: t.primaryTint,
      alignItems: "center", justifyContent: "center", marginBottom: 2,
    },
    gridLabel: { fontSize: 14, fontWeight: "600", color: t.ink },
    gridSub: { fontSize: 12, color: t.inkSecondary },

    pad: { padding: 16 },

    // "instead display sales figures" -- same flat hero-card language as
    // Sales by Rep's own Total Sales card (t.inkMuted flat background, not
    // a gradient -- see that file's own note on why flat over gradient for
    // a grand-total figure).
    salesCard: {
      flexDirection: "row", alignItems: "center", gap: 12,
      backgroundColor: t.inkMuted, borderRadius: 16, padding: 16,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
    },
    salesLabel: { fontSize: 12, color: t.onGradient, opacity: 0.85 },
    salesValue: { fontSize: 26, fontFamily: fonts.bold, color: t.onGradient, marginTop: 2 },
    salesSub: { fontSize: 12, color: t.onGradient, opacity: 0.75, marginTop: 4 },
    salesChev: { fontSize: 22, color: t.onGradient, opacity: 0.85 },
  });
