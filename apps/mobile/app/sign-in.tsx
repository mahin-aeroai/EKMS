import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { themes, radius, type Theme } from "@mmdi/shared/theme";
import { useSession } from "@/context/auth";

/**
 * Email + password only -- mirrors the core of src/app/login/page.tsx.
 * Deliberately does not port the TOTP/MFA step-up flow from that page; an
 * account enrolled in MFA can sign in here (password accepted) but the
 * server-side calls that require an assurance level of aal2 will still
 * reject it. Worth fixing before this ships to anyone with MFA enabled.
 */
export default function SignInScreen() {
  const scheme = useColorScheme();
  const t = themes[scheme === "dark" ? "dark" : "light"];
  const s = styles(t);
  const { signIn } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const message = await signIn(email.trim(), password);
    setBusy(false);
    if (message) setError(message);
    // On success, session flips in AuthContext and RootLayoutNav's
    // Stack.Protected guard swaps this screen out for (tabs) on its own --
    // no navigation call needed here.
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.card}>
        <Text style={s.heading}>MMDI ONE</Text>
        <Text style={s.subheading}>Sign in to continue</Text>

        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={t.inkMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
        />
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={t.inkMuted}
          secureTextEntry
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Pressable onPress={submit} disabled={!canSubmit} style={[s.button, !canSubmit && s.buttonDisabled]}>
          {busy ? <ActivityIndicator color={t.onBrand} /> : <Text style={s.buttonText}>Sign In</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface, justifyContent: "center", padding: 24 },
    card: { gap: 12 },
    heading: { fontSize: 28, fontWeight: "600", color: t.ink, textAlign: "center" },
    subheading: { fontSize: 15, color: t.inkSecondary, textAlign: "center", marginBottom: 16 },
    input: {
      height: 48,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      backgroundColor: t.surfaceSunken,
      paddingHorizontal: 14,
      fontSize: 17,
      color: t.ink,
    },
    error: { color: t.danger, fontSize: 14, textAlign: "center" },
    button: {
      height: 48,
      borderRadius: radius.md,
      backgroundColor: t.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: t.onBrand, fontSize: 17, fontWeight: "600" },
  });
