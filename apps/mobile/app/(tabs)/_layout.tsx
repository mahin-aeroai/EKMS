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
 * Sales by Rep was the first of several "Tools"-section web workspaces
 * ported natively; Estimate Builder and Cost Sheet followed.
 *
 * "remove survey from menu and place only at home page ... add new
 * module: estimates to the menu and add cost sheet from tools to the menu
 * too. if place not sufficient you can remove basil installtions to move
 * on home page icon" -- with Estimates and Cost Sheets both becoming real
 * visible tabs, keeping every prior tab visible too would push the count
 * to 7 (past the 5 iOS shows before folding the rest into a "More" tab).
 * Per the user's own call, Surveys AND Basil Installations both move to
 * hidden-route-only (same `href: null` treatment already used for
 * Copilot below) -- both were already duplicated as Home quick-action
 * tiles (see index.tsx's QUICK_ACTIONS), so nothing becomes unreachable,
 * it just stops living in both places. That keeps the visible tab count
 * at exactly 5: Home, Sign Costing, Sales by Rep, Estimates, Cost Sheets.
 *
 * "lets create a beautiful home page after login instead directly get into
 * copilot" -- index.tsx is now a Home screen (greeting, quick actions,
 * recent activity) instead of Copilot, since "index" is this group's
 * default/landing route. Per the user's own call on where Copilot should
 * live: Copilot moved to copilot.tsx and is reached from a hero
 * quick-action card on Home, NOT from the tab bar.
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
        // "still the fonts erantic" -- serif dropped app-wide (see
        // theme/vibrant.ts), clean Roboto everywhere including tab labels.
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 10 },
        // Large titles are a native-stack-only feature (UINavigationController);
        // Tabs' header is a plain JS-drawn @react-navigation/elements Header
        // with no equivalent -- see the NativeTabs note above for the real
        // way to get native tab-bar/header behaviour.
        headerStyle: { backgroundColor: t.surface },
        headerTintColor: t.ink,
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 16 },
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
        name="sales-by-rep"
        options={{
          title: "Sales by Rep",
          tabBarIcon: ({ color }) => <SymbolView name="chart.line.uptrend.xyaxis" tintColor={color} size={26} />,
        }}
      />
      <Tabs.Screen
        name="estimate-builder"
        options={{
          // "add new module: estimates to the menu" -- Estimate Builder
          // (tools/estimate-builder on web, client quotations, NOT Sign
          // Estimator/Sign Costing above) promoted from a Home-only hidden
          // route to a real visible tab.
          title: "Estimates",
          tabBarIcon: ({ color }) => <SymbolView name="text.badge.plus" tintColor={color} size={26} />,
        }}
      />
      <Tabs.Screen
        name="cost-sheets"
        options={{
          // "in my previous chat i asked to add new module cost sheet but
          // not sign costsheets. the cost sheet from tool from web app and
          // which we build costing like attached screen" -- this tab was
          // first built as a list of past Sign Costing runs (wrong --
          // that's now sign-costing-history.tsx, still reachable from a
          // link at the bottom of this screen). cost-sheets.tsx is now a
          // real port of the web app's Tools > Cost Sheet BOM+Work-Centre
          // calculator: pick an FG Code/Template, enter job details, see a
          // live cost breakdown computed from bom_templates/
          // bom_template_lines/raw_materials/work_centre_rates.
          title: "Cost Sheets",
          tabBarIcon: ({ color }) => <SymbolView name="doc.text" tintColor={color} size={26} />,
        }}
      />
      <Tabs.Screen
        name="sign-costing-history"
        options={{
          title: "Sign Costing History",
          // Not a primary tab -- reached via a link on the Cost Sheets
          // calculator screen (see cost-sheets.tsx) or router.push
          // directly. Same href:null treatment as Surveys/Basil
          // Installations below.
          href: null,
        }}
      />
      <Tabs.Screen
        name="surveys"
        options={{
          title: "Surveys",
          // Moved off the tab bar per the user's own request -- still a
          // real route, reached via the Surveys tile on Home (see
          // index.tsx's QUICK_ACTIONS) or router.push("/surveys").
          href: null,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Basil Installations",
          // Moved off the tab bar to make room for Estimates/Cost Sheets
          // per the user's own contingency -- still reachable from Home's
          // Basil Installations tile, same as Surveys above.
          href: null,
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
