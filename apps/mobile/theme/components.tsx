import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { vibrant } from "./vibrant";

/**
 * Shared primitives for the vibrant-gradient redesign (see ./vibrant.ts for
 * the full "why a new file, why one fixed theme" reasoning). Built once
 * here rather than duplicated per screen -- every tab uses at least a
 * GradientButton and either a GradientCard (one hero highlight) or several
 * SoftCards (everything else).
 *
 * Gradient used SPARINGLY on purpose, matching the reference screenshots
 * themselves: their own dashboard only gradients the ONE featured card
 * (balance chart / credit card) and keeps list rows, secondary stats, and
 * backgrounds clean white with soft shadows -- covering an entire screen in
 * gradient reads as gaudy and hurts text contrast. GradientCard is for the
 * single most important number/action on a screen; SoftCard (flat white,
 * soft shadow, no hairline border) is for everything else, replacing the
 * old flat-bordered card style used before this redesign.
 */

const shadow = {
  shadowColor: "#3D2E6B",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 16,
  elevation: 4,
} as const;

export function GradientButton({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  style?: StyleProp<ViewStyle>;
}) {
  const colors = variant === "primary" ? vibrant.gradientPrimary : vibrant.gradientSecondary;
  const inactive = disabled || loading;
  return (
    <Pressable onPress={onPress} disabled={inactive} style={[s.btnWrap, style]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.btn, inactive && s.btnDisabled]}
      >
        {loading ? <ActivityIndicator color={vibrant.onGradient} /> : <Text style={s.btnText}>{label}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

export function GradientCard({
  variant = "primary",
  style,
  children,
}: {
  variant?: "primary" | "secondary";
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const colors = variant === "primary" ? vibrant.gradientPrimary : vibrant.gradientSecondary;
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.card, style]}>
      {children}
    </LinearGradient>
  );
}

export function SoftCard({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return <View style={[s.softCard, style]}>{children}</View>;
}

// "rounded rectalugars and less rounded" -- was near-pill (26/24/20,
// borderRadius roughly half the element's height), now a moderate rounded
// rectangle throughout. Shared primitives, so this is every button/card
// app-wide, not just Sign Costing.
const s = StyleSheet.create({
  btnWrap: { borderRadius: 14, ...shadow },
  btn: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 16, fontWeight: "700", color: vibrant.onGradient },
  card: { borderRadius: 16, padding: 18, ...shadow },
  softCard: { borderRadius: 14, backgroundColor: vibrant.surfaceRaised, padding: 14, ...shadow },
});
