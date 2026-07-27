import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { themes, type Theme } from "@mmdi/shared/theme";

export default function NotFoundScreen() {
  const scheme = useColorScheme();
  const t = themes[scheme === "dark" ? "dark" : "light"];
  const s = styles(t);

  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={s.container}>
        <Text style={s.title}>This screen doesn't exist.</Text>
        <Link href="/" style={s.link}>
          <Text style={s.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: t.surface },
    title: { fontSize: 20, fontWeight: "600", color: t.ink },
    link: { marginTop: 15, paddingVertical: 15 },
    linkText: { fontSize: 15, color: t.primary },
  });
