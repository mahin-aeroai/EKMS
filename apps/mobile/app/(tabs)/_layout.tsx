import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useColorScheme } from "react-native";
import { themes } from "@mmdi/shared/theme";

/**
 * "remove documents, and rename reports as Basil Installtions and add ...
 * sales by rep" -- Documents dropped entirely (documents.tsx deleted, not
 * just unlisted here); the installation-report tab keeps its route name
 * (reports.tsx / report/[id]) but now shows as "Basil Installations" in the
 * tab bar and native header, since renaming the route itself would touch
 * every router.push("/report/...") call for no real benefit. Installation
 * report *capture* lives here; PDF *generation* stays on the web app
 * (depends on pdf-lib + canvas, out of scope for native) -- see plan
 * section 5, not built yet.
 *
 * Sales by Rep is the first of several "Tools"-section web workspaces being
 * ported natively -- Estimate Builder and Cost Sheet are next (queued
 * separately, each is a real native build in its own right, not a quick
 * add) per the user's own sequencing call. Five tabs total still fits
 * directly in the tab bar (iOS shows up to 5 before needing a "More"
 * overflow tab) -- revisit this file's structure once Estimate Builder and
 * Cost Sheet bring the count to 7.
 *
 * SF Symbols via expo-symbols rather than an icon font: they align to the text
 * baseline, respond to weight, and pick the right optical size automatically.
 *
 * For iOS 26 Liquid Glass, swap `Tabs` for NativeTabs from
 * expo-router/unstable-native-tabs. That renders a real UITabBar, which is the
 * only way to get the scroll-shrink behaviour and live refraction -- a
 * JS-drawn bar cannot reproduce either.
 */
export default function TabLayout() {
  const scheme = useColorScheme();
  const t = themes[scheme === "dark" ? "dark" : "light"];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.inkMuted,
        // Large titles are a native-stack-only feature (UINavigationController);
        // Tabs' header is a plain JS-drawn @react-navigation/elements Header
        // with no equivalent -- see the NativeTabs note above for the real
        // way to get native tab-bar/header behaviour.
        headerStyle: { backgroundColor: t.surface },
        headerTintColor: t.ink,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Copilot",
          tabBarIcon: ({ color }) => (
            <SymbolView name="bubble.left.and.text.bubble.right" tintColor={color} size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="surveys"
        options={{
          title: "Surveys",
          tabBarIcon: ({ color }) => <SymbolView name="doc.text.magnifyingglass" tintColor={color} size={26} />,
        }}
      />
      <Tabs.Screen
        name="estimator"
        options={{
          title: "Estimate",
          tabBarIcon: ({ color }) => <SymbolView name="function" tintColor={color} size={26} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Basil Installations",
          tabBarIcon: ({ color }) => <SymbolView name="list.clipboard" tintColor={color} size={26} />,
        }}
      />
      <Tabs.Screen
        name="sales-by-rep"
        options={{
          title: "Sales by Rep",
          tabBarIcon: ({ color }) => <SymbolView name="chart.line.uptrend.xyaxis" tintColor={color} size={26} />,
        }}
      />
    </Tabs>
  );
}
