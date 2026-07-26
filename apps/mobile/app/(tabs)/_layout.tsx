import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useColorScheme } from "react-native";
import { themes } from "@mmdi/shared/theme";

/**
 * Four tabs. Installation reports are deliberately absent -- report generation
 * depends on pdf-lib + canvas and stays on the web app.
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
        name="documents"
        options={{
          title: "Documents",
          tabBarIcon: ({ color }) => <SymbolView name="folder" tintColor={color} size={26} />,
        }}
      />
    </Tabs>
  );
}
