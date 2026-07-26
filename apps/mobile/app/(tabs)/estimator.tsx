import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { themes, type Theme } from "@mmdi/shared/theme";
import { toMM, fmtRupee } from "@mmdi/shared/sign-estimator/calc";

/**
 * Placeholder. The estimator's logic is already shared and runs unmodified
 * under Hermes -- calc.ts has zero imports. What is missing is the UI, which
 * is the largest single piece of remaining work: numeric inputs, a keyboard
 * that covers half the viewport, and a total that has to stay visible.
 *
 * The two imports below are deliberate: they prove the shared package resolves
 * through Metro and that calc.ts executes on device. If this screen renders a
 * formatted rupee value, the whole packages/shared wiring is correct.
 */

export default function EstimatorScreen() {
  const scheme = useColorScheme();
  const t = themes[scheme === "dark" ? "dark" : "light"];
  const s = styles(t);

  const oneFootInMM = toMM(1, "feet");
  const sample = fmtRupee(1234.56);

  return (
    <View style={s.screen}>
      <Text style={s.heading}>Estimator</Text>
      <Text style={s.body}>Not built yet. The shared calculation layer is wired up and working:</Text>
      <View style={s.proof}>
        <Text style={s.mono}>toMM(1, "feet") = {oneFootInMM}</Text>
        <Text style={s.mono}>fmtRupee(1234.56) = {sample}</Text>
      </View>
      <Text style={s.note}>
        Both values come from packages/shared/src/sign-estimator/calc.ts, unmodified from the web app.
      </Text>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface, padding: 24, gap: 12 },
    heading: { fontSize: 22, fontWeight: "500", color: t.ink },
    body: { fontSize: 17, color: t.ink },
    proof: { gap: 6, paddingVertical: 12 },
    mono: { fontSize: 15, color: t.inkSecondary, fontFamily: "Courier" },
    note: { fontSize: 14, color: t.inkMuted },
  });
