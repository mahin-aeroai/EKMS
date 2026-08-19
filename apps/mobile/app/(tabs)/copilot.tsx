import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import * as Print from "expo-print";
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
 *  - Hands-free wake word ("Hey Jarvis", follow-up request): a toggle chip
 *    starts expo-speech-recognition listening in short bursts in the
 *    background, watching each transcript for the phrase; on a match it
 *    stops that background session and hands off to the exact same
 *    dictation flow as the manual mic button. Originally built on
 *    Picovoice Porcupine (a dedicated low-power wake-word engine), but
 *    swapped out after signing up revealed Picovoice ended its unconditional
 *    free tier this year -- what's left is a 7-day trial gated behind
 *    manual approval, not viable for a business app like this one. This
 *    version needs no account/key at all, so the toggle is unconditional.
 *    Only one recognition session can hold the mic at a time, so starting
 *    real dictation always stops background listening first. Deliberately
 *    NOT using the module's own continuous: true option -- the toggle
 *    crashed the app on first real-device test, and continuous mode is
 *    exactly the kind of less-common code path a version mismatch would
 *    leave broken (expo-speech-recognition's latest release is still
 *    tagged for Expo SDK 56, this app is on 57). Instead each burst is
 *    short (continuous: false) and immediately restarted from the "end"
 *    handler whenever wakeEnabledRef is still true, which reads as
 *    effectively continuous listening without relying on that option, and
 *    every native call is wrapped so a future failure surfaces as an
 *    inline error instead of taking the app down again.
 *  - All three are new native modules (not pure JS), so this needs a full
 *    rebuild, not just a JS bundle -- see app.json's new
 *    "expo-speech-recognition" plugin entry (mic + speech-recognition
 *    Info.plist strings) and package.json/package-lock.json.
 *  - "an animation that Tony Stark has when he talks to Jarvis" --
 *    ListeningOverlay below: a full-screen takeover (pure
 *    react-native Animated, no new dependency) that appears the moment
 *    real dictation starts (whether from the mic button or a wake-word
 *    handoff) and disappears the moment it ends. Three staggered rings
 *    pulse outward from a gently breathing gradient orb -- same
 *    gradientPrimary as the send button and user bubbles, so it reads as
 *    "this app's AI," not a generic sci-fi skin -- with the live
 *    transcript appearing under it as you talk, and a tap anywhere
 *    cancels (same as tapping the mic button again).
 */

const MAX_CARDS_PER_CALL = 4;

const SUGGESTIONS = [
  "Find a site survey",
  "What's my job order status?",
  "Show this month's sales",
  "Look up a rate card item",
];

// Hands-free wake word -- no account or native SDK beyond
// expo-speech-recognition (already in use for manual dictation), so this
// needs no setup and the toggle below is always available.
const WAKE_WORD_LABEL = "Hey Jarvis";
// "Jarvis is not responding at all" -- matching the exact phrase "hey
// jarvis" is fragile: Apple's on-device recognizer has no strong prior for
// an uncommon name like "Jarvis" and can easily drop or mis-hear "hey" in
// a short, quiet utterance, especially over a few-hundred-ms burst. Just
// "jarvis" is a much rarer word with a much lower false-positive risk in a
// work context, so matching on that alone trades a little specificity for
// a lot more recall.
const WAKE_PHRASE = "jarvis";

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

// "an animation that Tony Stark has when he talks to Jarvis" (round 1),
// then "Jarvis animation i want like attached screen with a color circle
// gradient moving around and mic animation" (round 2, this pass, against
// a reference screenshot of a light-background assistant UI with a soft
// blue circular gradient glowing and turning behind a mic icon) -- swapped
// the near-black sonar-ping takeover for a light backdrop (matches the
// rest of this app rather than a generic sci-fi skin) with a genuinely
// ROTATING gradient ring: a LinearGradient disc, continuously spun via
// Animated's rotate transform, with a smaller solid disc masking its
// centre so only a glowing ring shows -- the closest a plain
// react-native Animated + expo-linear-gradient combination (no new
// dependency, so still no rebuild) can get to a moving conic gradient.
// The mic icon breathes gently in the middle the same way the old orb did.
function ListeningOverlay({ t, transcript, onCancel }: { t: VibrantTheme; transcript: string; onCancel: () => void }) {
  const s = overlayStyles(t);
  const appear = useRef(new Animated.Value(0)).current;
  const micPulse = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, { toValue: 1.12, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    // "moving around" -- a slow, continuous, linear (not eased) full
    // rotation reads as the gradient itself circling the ring rather than
    // the whole ring spinning like a wheel.
    const rotate = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true })
    );
    pulse.start();
    rotate.start();
    return () => {
      pulse.stop();
      rotate.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={[s.overlay, { opacity: appear }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View style={s.orbWrap} pointerEvents="none">
        <Animated.View style={[s.gradientRing, { transform: [{ rotate: spinDeg }] }]}>
          <LinearGradient
            colors={[t.info, t.gradientPrimary[0], t.gradientPrimary[1], t.info]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View style={s.ringMask} />
        <Animated.View style={[s.micWrap, { transform: [{ scale: micPulse }] }]}>
          <SymbolView name="mic.fill" tintColor={t.primary} size={30} />
        </Animated.View>
      </View>
      <Text style={s.overlayLabel}>Start speaking</Text>
      <Text style={s.overlayTranscript} numberOfLines={4}>{transcript || " "}</Text>
      <Text style={s.overlayHint}>Tap anywhere to stop</Text>
    </Animated.View>
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
  const [wakeEnabled, setWakeEnabled] = useState(false);
  // True while the background, continuous "listening for the phrase"
  // session is running -- always mutually exclusive with `listening`
  // (full-command dictation), since only one recognition session can hold
  // the mic at a time.
  const [wakeListening, setWakeListening] = useState(false);
  const [wakeError, setWakeError] = useState<string | null>(null);
  // "Jarvis is not responding at all" -- there was no way to see whether
  // the background session was actually hearing anything, so a silent
  // failure (permission quietly not granted, a session that never
  // restarts, ambient noise never producing a transcript) looked
  // identical to "the mic just isn't picking anything up." This mirrors
  // draft's live-transcript behaviour but only while wake-listening, and
  // is shown right under the toggle -- see s.wakeTranscriptText below.
  const [wakeTranscript, setWakeTranscript] = useState("");
  // "still jarvis unresponsive" + the caption above never leaving
  // "Listening for Jarvis…" (confirmed: no "result" event is firing at
  // all while wake-listening, not just a phrase-matching miss) -- the
  // previous diagnostic could only show a HEARD transcript, so silence
  // there is ambiguous between "no session is actually running" and "a
  // session is running but genuinely hearing nothing." Counting real
  // native "start" events (see useSpeechRecognitionEvent("start", ...)
  // below) and showing that count in the caption answers that: a number
  // that's stuck at 0 means start() itself is never succeeding; a number
  // climbing fast means sessions ARE starting and ending in a tight loop
  // (each one too short to catch a spoken word); a number that climbs
  // slowly/normally but still never shows a "Heard" transcript means
  // sessions run for a normal duration but the recognizer itself never
  // produces a result.
  const [wakeSessionCount, setWakeSessionCount] = useState(0);
  const listRef = useRef<FlatList<Turn>>(null);
  // Refs mirroring the booleans above for the useSpeechRecognitionEvent
  // handlers below -- those are wired up once per render and need to read
  // current values at the moment a native event fires, not whatever was
  // closed over when they were first registered.
  const wakeEnabledRef = useRef(false);
  const wakeListeningRef = useRef(false);
  // Mirrors `listening` for the same reason wakeEnabledRef/wakeListeningRef
  // mirror their state -- resumeWakeIfNeeded (below) is called from
  // expo-speech's onDone/onStopped/onError callbacks, which fire whenever
  // playback actually finishes, not synchronously with any particular
  // render, so it needs the current value rather than whatever was closed
  // over when that render's callback was created.
  const listeningRef = useRef(false);
  // What to do once the *current* recognition session's "end" event
  // fires -- "dictation" when we're mid-handoff from wake listening to a
  // real command, otherwise left "none" and the "end" handler falls back
  // to resuming wake listening on its own if wakeEnabledRef is still true.
  // Everything routes through this one ref rather than calling stop()
  // immediately followed by start(), since stop() is asynchronous on the
  // native side and starting a fresh session before the old one has
  // actually closed is exactly the kind of race that can silently drop
  // the takeover.
  const nextActionRef = useRef<"none" | "dictation">("none");

  // Every direct call into the native module below is wrapped -- an
  // unhandled rejection or thrown error from a native binding inside an
  // event handler can take the whole app down in a release build (no red
  // box safety net like in dev mode), so any failure here should surface
  // as an inline error message instead of a crash.
  const safeStop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore -- nothing was listening
    }
  }, []);

  const beginDictation = useCallback(() => {
    try {
      // "Listen voice ... cuts like old days radio signal" -- a
      // recognition session competing for the same audio session as
      // an in-progress TTS playback is exactly the kind of thing that
      // produces choppy/interrupted audio, so make sure nothing is
      // still speaking before the mic takes over.
      Speech.stop();
      setSpeakingIndex(null);
      setMicError(null);
      setDraft("");
      setListening(true);
      listeningRef.current = true;
      ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: false, addsPunctuation: true });
    } catch (err) {
      setListening(false);
      listeningRef.current = false;
      setMicError((err as Error).message || "Couldn't start listening.");
    }
  }, []);

  // Deliberately continuous: false, restarted from the "end" handler below
  // every time a session closes -- not continuous: true. That option is
  // technically available on this module, but expo-speech-recognition's
  // latest published release is still tagged for Expo SDK 56 (this app is
  // on 57), and continuous mode is exactly the kind of less-common code
  // path that a version mismatch like that tends to leave broken. Each
  // short burst plus near-instant restart reads as effectively continuous
  // listening without relying on it.
  const beginWakeListening = useCallback(async () => {
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setWakeError("Microphone/speech access is off -- enable it in Settings to ask by voice.");
        setWakeEnabled(false);
        wakeEnabledRef.current = false;
        return;
      }
      // Same reasoning as beginDictation above -- don't let background
      // wake-listening start while TTS is still using the audio session.
      Speech.stop();
      setSpeakingIndex(null);
      setWakeError(null);
      setWakeTranscript("");
      wakeListeningRef.current = true;
      setWakeListening(true);
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: false,
        addsPunctuation: false,
        // Biases Apple's on-device recognizer's language model toward
        // these exact strings (SFSpeechRecognitionRequest.contextualStrings)
        // -- "Jarvis" alone has no strong prior in a general-purpose
        // recognizer, so a quiet or fast utterance of an uncommon name is
        // exactly the kind of thing this option exists to help with. Not
        // previously tried.
        contextualStrings: ["Jarvis", "Hey Jarvis"],
      });
    } catch (err) {
      wakeListeningRef.current = false;
      setWakeListening(false);
      setWakeEnabled(false);
      wakeEnabledRef.current = false;
      setWakeError((err as Error).message || "Couldn't start \"Hey Jarvis\" listening.");
    }
  }, []);

  const toggleWakeWord = useCallback(() => {
    const next = !wakeEnabled;
    setWakeEnabled(next);
    wakeEnabledRef.current = next;
    if (next) {
      setWakeSessionCount(0);
      // If real dictation is already running, the "end" handler below
      // picks this up once it finishes (wakeEnabledRef is now true).
      if (!listening && !wakeListeningRef.current) beginWakeListening();
    } else if (wakeListeningRef.current) {
      wakeListeningRef.current = false;
      setWakeListening(false);
      setWakeTranscript("");
      safeStop();
    }
  }, [wakeEnabled, listening, beginWakeListening, safeStop]);

  // See wakeSessionCount's declaration above -- only counts sessions
  // started while wake-listening (not manual dictation), so it's purely
  // this diagnostic's signal.
  useSpeechRecognitionEvent("start", () => {
    if (wakeListeningRef.current) setWakeSessionCount((n) => n + 1);
  });

  // Voice input -- fills the draft as you talk, same review-then-Send flow
  // as the system keyboard's own dictation button (doesn't auto-send).
  // While wake-listening is active this same event instead just watches
  // for the phrase, since it's the same start()/result stream either way.
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    if (wakeListeningRef.current) {
      // Diagnostic caption (see wakeTranscript's declaration above) -- set
      // on every partial result, not just a match, so "nothing shows up
      // here at all" and "it shows up but never matches" are visibly
      // different problems next time this is tested.
      setWakeTranscript(transcript);
      if (transcript.toLowerCase().includes(WAKE_PHRASE)) {
        nextActionRef.current = "dictation";
        wakeListeningRef.current = false;
        setWakeListening(false);
        safeStop();
      }
      return;
    }
    if (transcript) setDraft(transcript);
  });
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    listeningRef.current = false;
    const next = nextActionRef.current;
    nextActionRef.current = "none";
    if (next === "dictation") {
      beginDictation();
    } else if (wakeEnabledRef.current) {
      beginWakeListening();
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    listeningRef.current = false;
    wakeListeningRef.current = false;
    setWakeListening(false);
    if (event.error !== "no-speech" && event.error !== "aborted") {
      setMicError(event.message || "Couldn't hear that -- try again.");
    }
    const next = nextActionRef.current;
    nextActionRef.current = "none";
    if (next === "dictation") {
      beginDictation();
    } else if (wakeEnabledRef.current) {
      beginWakeListening();
    }
  });

  const toggleListening = useCallback(() => {
    setMicError(null);
    if (listening) {
      safeStop(); // "end" handler resumes wake listening if enabled
      return;
    }
    if (wakeListeningRef.current) {
      // Hand the mic from background wake listening to full dictation.
      nextActionRef.current = "dictation";
      wakeListeningRef.current = false;
      setWakeListening(false);
      safeStop();
      return;
    }
    beginDictation();
  }, [listening, beginDictation, safeStop]);

  // Voice output -- read a single reply aloud on demand (never auto-played
  // on arrival, see file header note). Tapping the same bubble's speaker
  // again stops it; tapping a different one switches to that reply.
  //
  // "Listen voice is not coming clear it cut like old days radio signal
  // with lot of cuts" -- the background wake-listening session (if
  // enabled) keeps restarting itself on a short loop the whole time it's
  // on, including while a reply is being read aloud. Two recognition/
  // playback sessions fighting over the same iOS audio session at once is
  // a well-known cause of exactly this kind of stuttering, so this now
  // explicitly pauses wake-listening for the duration of playback and
  // resumes it afterwards (onDone/onStopped/onError all lead back to the
  // same resume path) rather than leaving it running underneath.
  const resumeWakeIfNeeded = useCallback(() => {
    if (wakeEnabledRef.current && !wakeListeningRef.current && !listeningRef.current) {
      beginWakeListening();
    }
  }, [beginWakeListening]);

  const toggleSpeak = useCallback((index: number, text: string) => {
    if (speakingIndex === index) {
      Speech.stop();
      setSpeakingIndex(null);
      resumeWakeIfNeeded();
      return;
    }
    Speech.stop();
    if (wakeListeningRef.current) {
      wakeListeningRef.current = false;
      setWakeListening(false);
      setWakeTranscript("");
      safeStop();
    }
    setSpeakingIndex(index);
    Speech.speak(text, {
      onDone: () => { setSpeakingIndex(null); resumeWakeIfNeeded(); },
      onStopped: () => { setSpeakingIndex(null); resumeWakeIfNeeded(); },
      onError: () => { setSpeakingIndex(null); resumeWakeIfNeeded(); },
    });
  }, [speakingIndex, safeStop, resumeWakeIfNeeded]);

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

  // "Site Survey are not openign in app instead its just downlaoding to
  // local folder" -- see surveys.tsx's own note on this same fix.
  // printAsync opens a real in-app preview (iOS's
  // UIPrintInteractionController); the share sheet only offers
  // save/send-elsewhere destinations, which reads as "it just downloaded."
  const openSurvey = useCallback(async (row: SurveyRow) => {
    setOpening(row.relative_path);
    try {
      const url = await getSignedUrl("survey", { path: row.relative_path });
      const destination = new File(Paths.cache, row.file_name);
      const file = await File.downloadFileAsync(url, destination, { idempotent: true });
      try {
        await Print.printAsync({ uri: file.uri });
      } catch {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
        }
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
        style={s.flatList}
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
      {wakeError ? <Text style={s.micErrorText}>{wakeError}</Text> : null}
      <Pressable onPress={toggleWakeWord} style={[s.wakeToggle, wakeEnabled && s.wakeToggleActive]}>
        <View style={[s.wakeDot, wakeListening && s.wakeDotActive]} />
        <Text style={[s.wakeToggleText, wakeEnabled && s.wakeToggleTextActive]}>
          {wakeEnabled ? `Listening for "${WAKE_WORD_LABEL}"` : `Enable "${WAKE_WORD_LABEL}"`}
        </Text>
      </Pressable>
      {/* Live diagnostic caption -- see wakeTranscript's declaration above.
          Only shown while actually wake-listening, so it disappears the
          instant real dictation takes over. */}
      {wakeListening && (
        <Text style={s.wakeTranscriptText} numberOfLines={1}>
          {wakeTranscript ? `Heard: "${wakeTranscript}"` : `Listening for "Jarvis"… (session #${wakeSessionCount})`}
        </Text>
      )}

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

      {listening && <ListeningOverlay t={t} transcript={draft} onCancel={toggleListening} />}
    </KeyboardAvoidingView>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    // FlatList needs its own flex:1 (separate from contentContainerStyle
    // below) to actually shrink when KeyboardAvoidingView adds bottom
    // padding for the keyboard -- without it, the extra rows below the
    // list (typing indicator, error text, the wake-word toggle) have
    // nowhere to give up space, so the composer -- and the TextInput
    // inside it -- gets pushed down behind the keyboard instead.
    flatList: { flex: 1 },
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
    userText: { fontSize: 16, fontFamily: fonts.regular, color: t.onGradient, lineHeight: 22 },

    botRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "92%" },
    botAvatar: {
      width: 26, height: 26, borderRadius: 13, backgroundColor: t.primaryTint,
      alignItems: "center", justifyContent: "center", marginBottom: 2,
    },
    botBubble: { alignSelf: "flex-start", backgroundColor: t.surfaceRaised, borderRadius: 22, borderBottomLeftRadius: 6, paddingVertical: 12, paddingHorizontal: 16, shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
    // "the text looks little confusing to read.. can you make it beautiful
    // reading, like pleasant" (round 1: Roboto Regular + line-height) then
    // "lets choose a thin font like claude left side bar font kind but
    // nicely readable" (round 2, this pass) -- swapped to Roboto Light,
    // which is what most chat-style UIs (Claude included) actually use for
    // body copy: a lighter weight reads as calmer/more "designed" than
    // Regular at this size, as long as line-height and letter-spacing pick
    // up the slack so it doesn't go thin-and-cramped. Kept the same 26pt
    // line-height (the ~1.5x ratio bill.tsx uses for body copy) and bumped
    // letter-spacing slightly, since light weights need a touch more
    // breathing room between letters to stay crisp at small sizes.
    botText: { fontSize: 17, fontFamily: fonts.light, color: t.ink, lineHeight: 26, letterSpacing: 0.15 },
    speakBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 4, paddingVertical: 2 },
    speakBtnText: { fontSize: 12, fontFamily: fonts.medium, color: t.inkMuted },

    cardGroup: { alignSelf: "flex-start", width: "88%", gap: 8, marginTop: 6, marginLeft: 34 },
    moreLine: { fontSize: 13, color: t.inkMuted, paddingHorizontal: 4 },

    typingRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    typingBubble: { flexDirection: "row", gap: 5, alignItems: "center", paddingVertical: 14 },
    typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.inkMuted },

    micErrorText: { fontSize: 12, color: t.danger, textAlign: "center", paddingHorizontal: 16, paddingBottom: 4 },

    wakeToggle: {
      flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center",
      paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, marginBottom: 6,
      backgroundColor: t.surfaceSunken,
    },
    wakeToggleActive: { backgroundColor: t.primaryTint },
    wakeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.inkMuted },
    wakeDotActive: { backgroundColor: t.success },
    wakeToggleText: { fontSize: 12, fontFamily: fonts.medium, color: t.inkMuted },
    wakeToggleTextActive: { color: t.primary },
    wakeTranscriptText: { fontSize: 11, color: t.inkMuted, textAlign: "center", marginBottom: 6, paddingHorizontal: 24 },

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

const RING_SIZE = 190;
const RING_THICKNESS = 22;
const MIC_SIZE = 78;

// ListeningOverlay's own styles -- separate from `styles` for the same
// reason cardStyles is (a distinct, self-contained visual language).
// "like attached screen" -- reference was a light background with a soft
// blue glow, not a dark sci-fi takeover, so the backdrop is now the app's
// own cream surface (semi-transparent, so the chat behind it still shows
// through faintly) instead of near-black.
const overlayStyles = (t: VibrantTheme) =>
  StyleSheet.create({
    overlay: {
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(255,249,249,0.97)",
      alignItems: "center",
      justifyContent: "center",
      gap: 18,
      paddingHorizontal: 32,
    },
    orbWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
    // The full gradient disc -- rotated continuously in the component
    // above. RING_MASK (below) covers everything but its outer edge, so
    // only a glowing ring of the gradient is ever visible, and that ring
    // reads as "turning" as the disc spins beneath it.
    gradientRing: {
      position: "absolute",
      width: RING_SIZE,
      height: RING_SIZE,
      borderRadius: RING_SIZE / 2,
      overflow: "hidden",
      shadowColor: t.info,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 20,
      elevation: 6,
    },
    ringMask: {
      position: "absolute",
      width: RING_SIZE - RING_THICKNESS * 2,
      height: RING_SIZE - RING_THICKNESS * 2,
      borderRadius: (RING_SIZE - RING_THICKNESS * 2) / 2,
      backgroundColor: "#FFF9F9",
    },
    micWrap: {
      position: "absolute",
      width: MIC_SIZE,
      height: MIC_SIZE,
      borderRadius: MIC_SIZE / 2,
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#3D2E6B",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 4,
    },
    overlayLabel: { fontSize: 17, fontFamily: fonts.medium, color: t.inkMuted, letterSpacing: 0.5 },
    overlayTranscript: { fontSize: 20, fontFamily: fonts.light, color: t.ink, textAlign: "center", lineHeight: 28 },
    overlayHint: { position: "absolute", bottom: 48, fontSize: 12, color: t.inkMuted },
  });
