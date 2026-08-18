import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { vibrant, fonts, type VibrantTheme } from "../theme/vibrant";
import { GradientButton } from "../theme/components";
import { useSession } from "@/context/auth";

/**
 * Email + password only -- mirrors the core of src/app/login/page.tsx.
 * Deliberately does not port the TOTP/MFA step-up flow from that page; an
 * account enrolled in MFA can sign in here (password accepted) but the
 * server-side calls that require an assurance level of aal2 will still
 * reject it. Worth fixing before this ships to anyone with MFA enabled.
 *
 * Logo mark: recolored from the red reference logo to MMDI's existing
 * brand blue (#2e5395, same as packages/shared/src/theme.ts's brand.steel)
 * -- see apps/mobile/assets/images/logo-mark.png's header note for how.
 */
export default function SignInScreen() {
  const t = vibrant;
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
        <Image source={require("../assets/images/logo-mark.png")} style={s.logo} resizeMode="contain" />
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

        <GradientButton label="Sign In" onPress={submit} loading={busy} disabled={!canSubmit} style={s.button} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface, justifyContent: "center", padding: 24 },
    card: { gap: 12, alignItems: "stretch" },
    logo: { width: 64, height: 64, borderRadius: 16, alignSelf: "center", marginBottom: 4 },
    // "still the fonts erantic" -- serif dropped app-wide, clean bold sans.
    heading: { fontSize: 20, fontFamily: fonts.bold, color: t.ink, textAlign: "center" },
    subheading: { fontSize: 15, color: t.inkSecondary, textAlign: "center", marginBottom: 16 },
    // Filled + colored border rather than a hairline on a near-white
    // background -- an input field should read as "the thing you type
    // into", distinct from the plain heading/subheading text above it.
    input: {
      height: 50,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: t.line,
      backgroundColor: t.surfaceSunken,
      paddingHorizontal: 16,
      fontSize: 16,
      color: t.ink,
    },
    error: { color: t.danger, fontSize: 14, textAlign: "center" },
    button: { marginTop: 8 },
  });
