import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { vibrant, fonts } from "../../theme/vibrant";

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
 * add) per the user's own sequencing call. Five *visible* tabs total still
 * fits directly in the tab bar (iOS shows up to 5 before needing a "More"
 * overflow tab) -- revisit this file's structure once Estimate Builder and
 * Cost Sheet bring the count to 7.
 *
 * "lets create a beautiful home page after login instead directly get into
 * copilot" -- index.tsx is now a Home screen (greeting, quick actions,
 * recent activity) instead of Copilot, since "index" is this group's
 * default/landing route. Per the user's own call on where Copilot should
 * live: Copilot moved to copilot.tsx and is reached from a hero
 * quick-action card on Home, NOT from the tab bar -- `href: null` below
 * keeps it a real, pushable route (router.push("/copilot")) while hiding
 * its tab bar button, so the visible tab count stays at 5 (Home, Surveys,
 * Estimate, Basil Installations, Sales by Rep) rather than growing to 6.
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
  const t = vibrant;

  return (
    <Tabs
      screenOptions={{
        // Dark tab bar deliberately, even though every screen above it is
        // light -- matches the reference dashboard-kit exactly (its whole
        // UI is light/card-forward except a solid dark bottom bar). Brand
        // red reads clearly against near-black; inactive icons use a
        // dedicated muted tone (tabBarInactive) rather than the light-mode
        // inkMuted, which is far too dark to read on this background.
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.tabBarInactive,
        // "use Lora serif font with very small size" -- applies to every
        // tab's label via screenOptions rather than per-Tabs.Screen.
        tabBarLabelStyle: { fontFamily: fonts.serif, fontSize: 10 },
        // Large titles are a native-stack-only feature (UINavigationController);
        // Tabs' header is a plain JS-drawn @react-navigation/elements Header
        // with no equivalent -- see the NativeTabs note above for the real
        // way to get native tab-bar/header behaviour.
        headerStyle: { backgroundColor: t.surface },
        headerTintColor: t.ink,
        headerTitleStyle: { fontFamily: fonts.serifBold, fontSize: 16 },
        tabBarStyle: { backgroundColor: t.tabBarBg, borderTopColor: t.tabBarBg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <SymbolView name="house.fill" tintColor={color} size={26} />,
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
          // "Sgn Estimator named as Estimate user get confused so chnage it
          // as Sign Costing" -- "Estimate" read as ambiguous (estimate of
          // what?); "Sign Costing" says what the tab actually produces.
          title: "Sign Costing",
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
      <Tabs.Screen
        name="copilot"
        options={{
          title: "Copilot",
          // Hidden from the tab bar (see the file header comment) -- still
          // a real route, reached via router.push("/copilot") from Home's
          // hero quick-action card.
          href: null,
        }}
      />
    </Tabs>
  );
}
