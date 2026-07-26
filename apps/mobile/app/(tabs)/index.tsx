import { useCallback, useRef, useState } from "react";
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
import { askCopilot, getSignedUrl } from "../../lib/copilot";
import { themes, radius, type Theme } from "@mmdi/shared/theme";

/**
 * Copilot chat. Calls /api/ai-copilot, which returns
 * { content, citations, results } in one JSON response.
 *
 * `results` is what makes this an app rather than a chat log: each entry is
 * { tool, input, result } straight from the tool call, so a find_site_survey
 * result can render as a tappable card that opens the PDF. Prose alone could
 * not do that -- a citation string cannot be turned back into a record.
 */

type SurveyHit = { id: string; store_name: string | null; chain: string | null; file_name: string; relative_path: string };

interface Turn {
  role: "user" | "assistant";
  content: string;
  surveys?: SurveyHit[];
}

function extractSurveys(results: unknown): SurveyHit[] {
  if (!Array.isArray(results)) return [];
  const out: SurveyHit[] = [];
  for (const call of results) {
    if (call?.tool !== "find_site_survey") continue;
    const rows = call?.result?.surveys ?? call?.result?.rows ?? call?.result;
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (r?.relative_path && r?.file_name) out.push(r as SurveyHit);
    }
  }
  return out;
}

export default function CopilotScreen() {
  const scheme = useColorScheme();
  const t = themes[scheme === "dark" ? "dark" : "light"];
  const s = styles(t);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
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
      setTurns([...history, { role: "assistant", content: reply.content, surveys: extractSurveys((reply as any).results) }]);
    } catch (err) {
      setTurns([...history, { role: "assistant", content: (err as Error).message }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [draft, busy, turns]);

  const openSurvey = useCallback(async (hit: SurveyHit) => {
    setOpening(hit.id);
    try {
      const url = await getSignedUrl("survey", { path: hit.relative_path });
      const destination = new File(Paths.cache, hit.file_name);
      const file = await File.downloadFileAsync(url, destination, { idempotent: true });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } finally {
      setOpening(null);
    }
  }, []);

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
            {item.surveys?.map((hit) => (
              <Pressable
                key={hit.id}
                onPress={() => openSurvey(hit)}
                disabled={opening === hit.id}
                style={({ pressed }) => [s.card, pressed && { backgroundColor: t.surfaceSunken }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{hit.store_name ?? hit.file_name}</Text>
                  <Text style={s.cardMeta} numberOfLines={1}>{hit.chain ?? "Not recorded"}</Text>
                </View>
                {opening === hit.id ? <ActivityIndicator color={t.primary} /> : <Text style={s.chev}>›</Text>}
              </Pressable>
            ))}
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
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      alignSelf: "flex-start",
      width: "88%",
      minHeight: 44,
      marginTop: 6,
      padding: 12,
      borderRadius: radius.lg,
      backgroundColor: t.surfaceRaised,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
    },
    cardTitle: { fontSize: 16, color: t.ink },
    cardMeta: { fontSize: 14, color: t.inkSecondary, marginTop: 2 },
    chev: { fontSize: 22, color: t.inkMuted },
    busy: { paddingBottom: 8 },
    composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 17, color: t.ink },
    sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.primary, alignItems: "center", justifyContent: "center" },
    sendIcon: { fontSize: 20, color: t.onBrand },
  });
