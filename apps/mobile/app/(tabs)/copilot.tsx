import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { SymbolView } from "expo-symbols";
import { useHeaderHeight } from "expo-router/react-navigation";
import { askCopilot, getSignedUrl, type ToolCall } from "../../lib/copilot";
import { fmtRupee } from "@mmdi/shared/sign-estimator/calc";
import { vibrant, fonts, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard } from "../../theme/components";

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
 *
 * "make the copilot beautiful and can we add speech to it?" -- two changes
 * this round, both scoped via a clarifying question (voice input AND
 * output, per the answer):
 *  - Visual pass: a real empty state (icon + suggestion chips instead of a
 *    single line of grey text), a small avatar on bot replies, an animated
 *    three-dot "typing" bubble instead of a bare spinner, and a redesigned
 *    pill-shaped composer with the mic button built in.
 *  - Voice input: expo-speech-recognition's mic button fills the draft
 *    field with a live transcript as you talk (same "review, then tap
 *    Send" flow as the system keyboard's own dictation button, just more
 *    discoverable/prominent here) -- doesn't auto-send, so a garbled
 *    transcription can still be edited or discarded.
 *  - Voice output: expo-speech reads a reply aloud on demand via a small
 *    speaker icon on each bot bubble -- NOT auto-played on arrival, since
 *    that would be presumptive/disruptive in a shared or quiet space;
 *    the user opts in per message.
 *  - Both are new native modules (not pure JS), so this needs a full
 *    rebuild, not just a JS bundle -- see app.json's new
 *    "expo-speech-recognition" plugin entry (mic + speech-recognition
 *    Info.plist strings) and package.json/package-lock.json.
 */

const MAX_CARDS_PER_CALL = 4;

const SUGGESTIONS = [
  "Find a site survey",
  "What's my job order status?",
  "Show this month's sales",
  "Look up a rate card item",
];

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
  t: VibrantTheme;
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
    <Pressable key={row.relative_path} onPress={() => ctx.openSurvey(row)} disabled={isOpening}>
      <SoftCard style={s.cardInner}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{row.store_name ?? row.file_name}</Text>
          <Text style={s.cardMeta} numberOfLines={1}>{row.chain ?? "Not recorded"}</Text>
        </View>
        {isOpening ? <ActivityIndicator color={ctx.t.primary} /> : <Text style={s.chev}>›</Text>}
      </SoftCard>
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
    <SoftCard key={`${row.store_name ?? "site"}-${index}`} style={s.cardInner}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{row.store_name ?? "Unknown site"}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>{row.program ?? "Not recorded"}</Text>
        {/* Croma rows have NULL scaffolding/installation data, not "No"/0 -- must read as unrecorded, not absent. */}
        <Text style={s.cardMeta} numberOfLines={1}>Scaffolding: {row.scaffolding ?? "Not recorded"}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>
          Installation: {row.total_installation_amount != null ? fmtRupee(row.total_installation_amount) : "Not recorded"}
        </Text>
      </View>
    </SoftCard>
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
function jobOrderStatusColor(status: string, t: VibrantTheme): string {
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
    <SoftCard key={row.code ?? String(index)} style={s.cardInner}>
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
    </SoftCard>
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

// Three dots that pulse in sequence -- shown instead of a bare spinner
// while waiting for a reply, styled like a normal bot bubble so it reads
// as "Copilot is typing" rather than a generic loading state.
function TypingDots({ t }: { t: VibrantTheme }) {
  const s = styles(t);
  const anims = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;

  useEffect(() => {
    const loops = anims.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 350, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[s.botBubble, s.typingBubble]}>
      {anims.map((v, i) => (
        <Animated.View key={i} style={[s.typingDot, { opacity: v }]} />
      ))}
    </View>
  );
}

export default function CopilotScreen() {
  const t = vibrant;
  const s = styles(t);
  // Same fix as estimator.tsx/report/[id].tsx's own header-height note:
  // without this, KeyboardAvoidingView's "padding" behavior on iOS
  // doesn't account for this screen's native header, so it overshoots and
  // pushes the composer bar (and its TextInput) off the top of the
  // screen when the keyboard opens -- "copilot is not showing [an input]
  // to type".
  const headerHeight = useHeaderHeight();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Keyed by relative_path (the one field every survey row actually has and
  // is guaranteed unique) -- NOT an `id`, which this table's select doesn't
  // even return.
  const [opening, setOpening] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const listRef = useRef<FlatList<Turn>>(null);

  // Voice input -- fills the draft as you talk, same review-then-Send flow
  // as the system keyboard's own dictation button (doesn't auto-send).
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript;
    if (transcript) setDraft(transcript);
  });
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    if (event.error !== "no-speech" && event.error !== "aborted") {
      setMicError(event.message || "Couldn't hear that -- try again.");
    }
  });

  const toggleListening = useCallback(async () => {
    setMicError(null);
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setMicError("Microphone/speech access is off -- enable it in Settings to ask by voice.");
      return;
    }
    setDraft("");
    setListening(true);
    ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: false, addsPunctuation: true });
  }, [listening]);

  // Voice output -- read a single reply aloud on demand (never auto-played
  // on arrival, see file header note). Tapping the same bubble's speaker
  // again stops it; tapping a different one switches to that reply.
  const toggleSpeak = useCallback((index: number, text: string) => {
    if (speakingIndex === index) {
      Speech.stop();
      setSpeakingIndex(null);
      return;
    }
    Speech.stop();
    setSpeakingIndex(index);
    Speech.speak(text, {
      onDone: () => setSpeakingIndex(null),
      onStopped: () => setSpeakingIndex(null),
      onError: () => setSpeakingIndex(null),
    });
  }, [speakingIndex]);

  const send = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? draft).trim();
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
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      <FlatList
        ref={listRef}
        data={turns}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={s.list}
        contentInsetAdjustmentBehavior="automatic"
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIconWrap}>
              <SymbolView name="sparkles" tintColor={t.primary} size={28} />
            </View>
            <Text style={s.emptyTitle}>Ask Copilot</Text>
            <Text style={s.empty}>Jobs, surveys, rates, documents — type or tap the mic.</Text>
            <View style={s.suggestionWrap}>
              {SUGGESTIONS.map((sug) => (
                <Pressable key={sug} style={s.suggestionChip} onPress={() => setDraft(sug)}>
                  <Text style={s.suggestionText}>{sug}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <View>
            {item.role === "user" ? (
              <LinearGradient
                colors={t.gradientPrimary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.userBubble}
              >
                <Text style={s.userText}>{item.content}</Text>
              </LinearGradient>
            ) : (
              <View style={s.botRow}>
                <View style={s.botAvatar}>
                  <SymbolView name="sparkles" tintColor={t.primary} size={14} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={s.botBubble}>
                    <Text style={s.botText}>{item.content}</Text>
                  </View>
                  <Pressable
                    style={s.speakBtn}
                    onPress={() => toggleSpeak(index, item.content)}
                    hitSlop={8}
                  >
                    <SymbolView
                      name={speakingIndex === index ? "stop.circle.fill" : "speaker.wave.2"}
                      tintColor={t.inkMuted}
                      size={15}
                    />
                    <Text style={s.speakBtnText}>{speakingIndex === index ? "Stop" : "Listen"}</Text>
                  </Pressable>
                </View>
              </View>
            )}
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

      {busy && (
        <View style={s.typingRow}>
          <View style={s.botAvatar}>
            <SymbolView name="sparkles" tintColor={t.primary} size={14} />
          </View>
          <TypingDots t={t} />
        </View>
      )}

      {micError ? <Text style={s.micErrorText}>{micError}</Text> : null}

      <View style={s.composer}>
        <Pressable
          onPress={toggleListening}
          style={[s.micBtn, listening && s.micBtnActive]}
          hitSlop={6}
        >
          <SymbolView name={listening ? "waveform" : "mic.fill"} tintColor={listening ? t.onGradient : t.inkSecondary} size={18} />
        </Pressable>
        <TextInput
          style={s.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={listening ? "Listening…" : "Ask anything"}
          placeholderTextColor={listening ? t.primary : t.inkMuted}
          multiline
          onSubmitEditing={() => send()}
        />
        <Pressable onPress={() => send()} disabled={!draft.trim() || busy} style={[s.sendBtnWrap, (!draft.trim() || busy) && { opacity: 0.4 }]}>
          <LinearGradient colors={t.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sendBtn}>
            <Text style={s.sendIcon}>↑</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    list: { padding: 16, gap: 10, flexGrow: 1 },

    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, paddingHorizontal: 24, gap: 6 },
    emptyIconWrap: {
      width: 56, height: 56, borderRadius: 28, backgroundColor: t.primaryTint,
      alignItems: "center", justifyContent: "center", marginBottom: 6,
    },
    emptyTitle: { fontSize: 19, fontFamily: fonts.bold, color: t.ink },
    empty: { textAlign: "center", fontSize: 14, color: t.inkMuted, marginBottom: 14 },
    suggestionWrap: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
    suggestionChip: {
      paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, backgroundColor: t.surfaceRaised,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
    },
    suggestionText: { fontSize: 13, fontFamily: fonts.medium, color: t.ink },

    userBubble: { alignSelf: "flex-end", maxWidth: "80%", borderRadius: 22, borderBottomRightRadius: 6, paddingVertical: 11, paddingHorizontal: 16 },
    userText: { fontSize: 17, color: t.onGradient },

    botRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "92%" },
    botAvatar: {
      width: 26, height: 26, borderRadius: 13, backgroundColor: t.primaryTint,
      alignItems: "center", justifyContent: "center", marginBottom: 2,
    },
    botBubble: { alignSelf: "flex-start", backgroundColor: t.surfaceRaised, borderRadius: 22, borderBottomLeftRadius: 6, paddingVertical: 11, paddingHorizontal: 16, shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
    botText: { fontSize: 17, color: t.ink },
    speakBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 4, paddingVertical: 2 },
    speakBtnText: { fontSize: 12, fontFamily: fonts.medium, color: t.inkMuted },

    cardGroup: { alignSelf: "flex-start", width: "88%", gap: 8, marginTop: 6, marginLeft: 34 },
    moreLine: { fontSize: 13, color: t.inkMuted, paddingHorizontal: 4 },

    typingRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    typingBubble: { flexDirection: "row", gap: 5, alignItems: "center", paddingVertical: 14 },
    typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.inkMuted },

    micErrorText: { fontSize: 12, color: t.danger, textAlign: "center", paddingHorizontal: 16, paddingBottom: 4 },

    composer: {
      flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10,
      backgroundColor: t.surfaceRaised, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line,
    },
    micBtn: {
      width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
      backgroundColor: t.surfaceSunken, marginBottom: 2,
    },
    micBtnActive: { backgroundColor: t.primary },
    input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: t.surfaceSunken, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 17, color: t.ink },
    sendBtnWrap: { borderRadius: 22, shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    sendIcon: { fontSize: 20, fontWeight: "700", color: t.onGradient },
  });

// Shared by every card renderer above (all module-level functions, called
// with an explicit `t` rather than closing over component state) -- kept
// separate from `styles` since it's used outside the component.
const cardStyles = (t: VibrantTheme) =>
  StyleSheet.create({
    // Actual card chrome (rounded corners, background, shadow) now comes
    // from SoftCard -- this just lays out what's inside it.
    cardInner: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, padding: 0 },
    cardTitle: { fontSize: 16, color: t.ink },
    cardMeta: { fontSize: 14, color: t.inkSecondary, marginTop: 2 },
    chev: { fontSize: 22, color: t.inkMuted },
    statusWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 13, color: t.inkSecondary },
  });
