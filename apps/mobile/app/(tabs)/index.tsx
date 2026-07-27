import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { askCopilot, getSignedUrl, type ToolCall } from "../../lib/copilot";
import { themes, radius, type Theme } from "@mmdi/shared/theme";
import { fmtRupee } from "@mmdi/shared/sign-estimator/calc";

/**
 * Copilot chat. Calls /api/ai-copilot, which returns
 * { content, citations, results } in one JSON response.
 *
 * `results` is what makes this an app rather than a chat log: each entry is
 * { tool, input, result } straight from the tool call, so a handful of tools
 * can render as cards instead of prose-only citations. CARD_REGISTRY below is
 * the single place that maps a tool name to how its result becomes cards --
 * adding a fifth tool means adding one entry here, nothing else. Every other
 * tool (sales_summary, purchase_summary, the rate cards, item-level searches)
 * intentionally has no entry and stays prose: those are either pure figures,
 * lookups, or too granular per-row to be worth a card.
 *
 * Row shapes below are copied from the actual `.select()` calls in
 * apps/web/src/app/api/ai-copilot/route.ts's executeToolCall, not assumed --
 * e.g. search_lfg_sites has no `chain` column at all, it's `program`; the old
 * find_site_survey card silently never rendered because its result never
 * actually selected `relative_path` despite every comment/description saying
 * it did (fixed server-side alongside this).
 */

const MAX_CARDS_PER_CALL = 4;

// ---- Row shapes, matching each tool's real `result` shape ----

interface SurveyRow {
  store_name: string | null;
  chain: string | null;
  file_name: string;
  relative_path: string;
}

// search_lfg_sites' `.select()` has no `id` and no `chain` -- `program` is
// the chain-equivalent for this table (APP/APR/Mono AAR/... /Croma).
interface LfgSiteRow {
  store_name: string | null;
  program: string | null;
  scaffolding: string | null;
  total_installation_amount: number | null;
}

// Shared by search_job_orders (result.top_20_by_value, an array) and
// get_job_order (result.job_order, a single object) -- both normalize to
// this same shape so one render function covers both tools.
interface JobOrderCardRow {
  code: string;
  customer_name: string | null;
  status: string;
  order_date: string | null;
}

interface CardCtx {
  t: Theme;
  opening: string | null;
  openSurvey: (row: SurveyRow) => void;
}

interface CardEntry {
  extract: (result: unknown) => unknown[];
  render: (item: unknown, index: number, ctx: CardCtx) => ReactNode;
}

function extractSurveyRows(result: unknown): SurveyRow[] {
  const rows = (result as { surveys?: unknown[] } | null)?.surveys;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (r): r is SurveyRow => Boolean((r as Partial<SurveyRow> | null)?.relative_path && (r as Partial<SurveyRow> | null)?.file_name)
  );
}

function renderSurveyCard(item: unknown, _index: number, ctx: CardCtx): ReactNode {
  const row = item as SurveyRow;
  const s = cardStyles(ctx.t);
  const isOpening = ctx.opening === row.relative_path;
  return (
    <Pressable
      key={row.relative_path}
      onPress={() => ctx.openSurvey(row)}
      disabled={isOpening}
      style={({ pressed }) => [s.card, pressed && { backgroundColor: ctx.t.surfaceSunken }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{row.store_name ?? row.file_name}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>{row.chain ?? "Not recorded"}</Text>
      </View>
      {isOpening ? <ActivityIndicator color={ctx.t.primary} /> : <Text style={s.chev}>›</Text>}
    </Pressable>
  );
}

function extractLfgSiteRows(result: unknown): LfgSiteRow[] {
  const rows = (result as { sites?: unknown[] } | null)?.sites;
  return Array.isArray(rows) ? (rows as LfgSiteRow[]) : [];
}

function renderLfgSiteCard(item: unknown, index: number, ctx: CardCtx): ReactNode {
  const row = item as LfgSiteRow;
  const s = cardStyles(ctx.t);
  return (
    // Not pressable, no chevron -- there's no site detail screen to open.
    <View key={`${row.store_name ?? "site"}-${index}`} style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{row.store_name ?? "Unknown site"}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>{row.program ?? "Not recorded"}</Text>
        {/* Croma rows have NULL scaffolding/installation data, not "No"/0 -- must read as unrecorded, not absent. */}
        <Text style={s.cardMeta} numberOfLines={1}>Scaffolding: {row.scaffolding ?? "Not recorded"}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>
          Installation: {row.total_installation_amount != null ? fmtRupee(row.total_installation_amount) : "Not recorded"}
        </Text>
      </View>
    </View>
  );
}

function extractJobOrdersFromSearch(result: unknown): JobOrderCardRow[] {
  const rows = (result as { top_20_by_value?: unknown[] } | null)?.top_20_by_value;
  return Array.isArray(rows) ? (rows as JobOrderCardRow[]) : [];
}

function extractJobOrderFromGet(result: unknown): JobOrderCardRow[] {
  const row = (result as { job_order?: unknown } | null)?.job_order;
  return row ? [row as JobOrderCardRow] : [];
}

// Mirrors STATUS_BADGE in src/components/workspaces/JobOrderWorkspaceClient.tsx
// -- same two real status strings (job_orders.status is inferred from the
// source's 'C'/'I' code, see supabase-job-orders-schema.sql), same colours.
function jobOrderStatusColor(status: string, t: Theme): string {
  if (status === "Completed") return t.success;
  if (status === "In Progress") return t.warning;
  return t.inkMuted;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_ABBR[m - 1]} ${y}`;
}

function renderJobOrderCard(item: unknown, index: number, ctx: CardCtx): ReactNode {
  const row = item as JobOrderCardRow;
  const s = cardStyles(ctx.t);
  return (
    // Not pressable, no chevron -- no job order detail screen yet.
    <View key={row.code ?? String(index)} style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{row.code}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>{row.customer_name ?? "Not recorded"}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>{row.order_date ? formatDate(row.order_date) : "Not recorded"}</Text>
      </View>
      {/* Colour alone fails colour-blind users -- the dot is paired with a text label, never standing alone. */}
      <View style={s.statusWrap}>
        <View style={[s.statusDot, { backgroundColor: jobOrderStatusColor(row.status, ctx.t) }]} />
        <Text style={s.statusText}>{row.status}</Text>
      </View>
    </View>
  );
}

const CARD_REGISTRY: Record<string, CardEntry> = {
  find_site_survey: { extract: extractSurveyRows, render: renderSurveyCard },
  search_lfg_sites: { extract: extractLfgSiteRows, render: renderLfgSiteCard },
  search_job_orders: { extract: extractJobOrdersFromSearch, render: renderJobOrderCard },
  get_job_order: { extract: extractJobOrderFromGet, render: renderJobOrderCard },
};

interface CardGroup {
  tool: string;
  items: unknown[]; // already capped at MAX_CARDS_PER_CALL
  moreCount: number;
}

function extractCardGroups(results: ToolCall[] | undefined): CardGroup[] {
  if (!Array.isArray(results)) return [];
  const groups: CardGroup[] = [];
  for (const call of results) {
    const entry = CARD_REGISTRY[call.tool];
    if (!entry) continue;
    const items = entry.extract(call.result);
    if (items.length === 0) continue;
    groups.push({
      tool: call.tool,
      items: items.slice(0, MAX_CARDS_PER_CALL),
      moreCount: Math.max(0, items.length - MAX_CARDS_PER_CALL),
    });
  }
  return groups;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  cardGroups?: CardGroup[];
}

export default function CopilotScreen() {
  const scheme = useColorScheme();
  const t = themes[scheme === "dark" ? "dark" : "light"];
  const s = styles(t);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Keyed by relative_path (the one field every survey row actually has and
  // is guaranteed unique) -- NOT an `id`, which this table's select doesn't
  // even return.
  const [opening, setOpening] = useState<string | null>(null);
  const listRef = useRef<FlatList<Turn>>(null);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;

    const history: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(history);
    setDraft("");
    setBusy(true);

    try {
      const reply = await askCopilot(history.map(({ role, content }) => ({ role, content })));
      setTurns([...history, { role: "assistant", content: reply.content, cardGroups: extractCardGroups(reply.results) }]);
    } catch (err) {
      setTurns([...history, { role: "assistant", content: (err as Error).message }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [draft, busy, turns]);

  const openSurvey = useCallback(async (row: SurveyRow) => {
    setOpening(row.relative_path);
    try {
      const url = await getSignedUrl("survey", { path: row.relative_path });
      const destination = new File(Paths.cache, row.file_name);
      const file = await File.downloadFileAsync(url, destination, { idempotent: true });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } finally {
      setOpening(null);
    }
  }, []);

  const cardCtx: CardCtx = { t, opening, openSurvey };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        ref={listRef}
        data={turns}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={s.list}
        contentInsetAdjustmentBehavior="automatic"
        ListEmptyComponent={<Text style={s.empty}>Ask about jobs, surveys, rates, or documents.</Text>}
        renderItem={({ item }) => (
          <View>
            <View style={item.role === "user" ? s.userBubble : s.botBubble}>
              <Text style={item.role === "user" ? s.userText : s.botText}>{item.content}</Text>
            </View>
            {item.cardGroups?.map((group) => {
              const entry = CARD_REGISTRY[group.tool];
              if (!entry) return null;
              return (
                <View key={group.tool} style={s.cardGroup}>
                  {group.items.map((row, i) => entry.render(row, i, cardCtx))}
                  {group.moreCount > 0 && <Text style={s.moreLine}>and {group.moreCount} more</Text>}
                </View>
              );
            })}
          </View>
        )}
      />

      {busy && <ActivityIndicator style={s.busy} color={t.primary} />}

      <View style={s.composer}>
        <TextInput
          style={s.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask anything"
          placeholderTextColor={t.inkMuted}
          multiline
          onSubmitEditing={send}
        />
        <Pressable onPress={send} disabled={!draft.trim() || busy} style={[s.sendBtn, (!draft.trim() || busy) && { opacity: 0.4 }]}>
          <Text style={s.sendIcon}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    list: { padding: 16, gap: 8 },
    empty: { textAlign: "center", padding: 32, fontSize: 15, color: t.inkMuted },
    userBubble: { alignSelf: "flex-end", maxWidth: "80%", backgroundColor: t.primary, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14 },
    botBubble: { alignSelf: "flex-start", maxWidth: "88%", backgroundColor: t.surfaceSunken, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14 },
    userText: { fontSize: 17, color: t.onBrand },
    botText: { fontSize: 17, color: t.ink },
    cardGroup: { alignSelf: "flex-start", width: "88%", gap: 6, marginTop: 6 },
    moreLine: { fontSize: 13, color: t.inkMuted, paddingHorizontal: 4 },
    busy: { paddingBottom: 8 },
    composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 17, color: t.ink },
    sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.primary, alignItems: "center", justifyContent: "center" },
    sendIcon: { fontSize: 20, color: t.onBrand },
  });

// Shared by every card renderer above (all module-level functions, called
// with an explicit `t` rather than closing over component state) -- kept
// separate from `styles` since it's used outside the component.
const cardStyles = (t: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 44,
      padding: 12,
      borderRadius: radius.lg,
      backgroundColor: t.surfaceRaised,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
    },
    cardTitle: { fontSize: 16, color: t.ink },
    cardMeta: { fontSize: 14, color: t.inkSecondary, marginTop: 2 },
    chev: { fontSize: 22, color: t.inkMuted },
    statusWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 13, color: t.inkSecondary },
  });
