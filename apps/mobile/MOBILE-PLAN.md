# MMDI ONE — iOS app plan

> **Status (22 August 2026): historical.** This is the original pre-build
> scaffold plan — useful for the reasoning behind the monorepo split and
> the Bearer-auth patch, but the "v1 tabs" list and effort estimates below
> no longer describe the real app. The actual current tab bar, feature
> set, and session-by-session build history live in
> [`PROJECT_STATUS.md`](../../PROJECT_STATUS.md) (repo root) and the
> `apps/mobile` section of [`README.md`](../../README.md) — read those
> first for "what's actually built," and treat everything below this note
> as the plan that got it started, not a live description.

Scaffold and migration notes, written against the EKMS repo as uploaded
(Next 16.2.10, React 19.2.4, Tailwind v4, Supabase, 33 workspaces).

**v1 tabs:** Copilot · Site surveys · Estimator · Documents
**Excluded:** installation reports, and the other 29 workspaces.

---

## 1. The one blocking change

All three API routes resolve the session from cookies via
`createServerSupabaseClient()`. A React Native client has no cookie jar for
your domain — it holds the session in Keychain and sends
`Authorization: Bearer <access_token>`.

Until this is fixed, every mobile request to `/api/ai-copilot`,
`/api/knowledge-files/signed-url` and `/api/lfg-surveys/signed-url` returns 401.

Fix: add `web-patch/src/lib/supabase-route.ts` to the web repo and change one
line in each of the three routes. Header first, cookies as fallback, so browser
behaviour is untouched. Still the anon key, so RLS applies exactly as now.

---

## 2. Monorepo layout

```
mmdi/
├── apps/
│   ├── web/                     ← the current repo, moved wholesale
│   └── mobile/                  ← Expo
├── packages/
│   └── shared/
│       └── src/
│           ├── calc.ts          ← from src/lib/sign-estimator/calc.ts
│           ├── rows.ts          ← row interfaces from src/lib/supabase.ts
│           └── theme.ts         ← from src/app/globals.css
└── package.json                 ← workspaces
```

Three packages, not two: `package.json` is named `mmdi-one-design-system` and
`src/app/components/*` is a documentation site for the design system. That can
stay inside `apps/web` or split out later; it does not affect mobile.

### What moves cleanly

**`calc.ts` — 894 lines, zero imports.** Whoever kept that file
dependency-free saved the project weeks. `CutOpt`, `SheetCalc`, `LEDCalc`,
`DriverOpt`, `computeAccessoryDefaults`, `computePrint`, `computePricing`,
`toMM`, `fmtRupee` all run unmodified under Hermes. Move the file, change the
web import path, done.

**Row interfaces.** `src/lib/supabase.ts` mixes the browser client with ~45 row
interfaces. Split it: interfaces to `packages/shared/src/rows.ts`, client stays
per-platform. Both apps then import identical types, so a schema change breaks
compilation in both places at once — which is what you want.

**Tokens.** All 137 custom properties, three themes (light/dark/enterprise),
transcribed in `packages/shared/src/theme.ts`. Names match the CSS variables
exactly. Shadows are deliberately excluded — CSS box-shadow strings do not map
onto the iOS shadow model.

### What does not move

`lib/installationReport/*` — `imaging.ts` has 12 canvas/DOM references and
`pdfBuild.ts` has 7. Out of scope now that installation reports are excluded.
If they come back, generate the PDF server-side rather than porting the canvas
layer; `masterConfig.ts` is clean and would travel as-is.

---

## 3. Screens

| Screen | Source of truth | Effort |
|---|---|---|
| Copilot | `/api/ai-copilot`, 17 tools, already streams | Chat UI + tool-result cards |
| Site surveys | `apple_lfg_site_surveys` + existing signed-url route | Done — see `surveys.tsx` |
| Estimator | `calc.ts` unchanged | UI only, but the largest UI job |
| Documents | `documents` table, 6 fixed categories | List + filter + download |

Document categories are already fixed in code: IKEA IWAY, FSC COC Audit,
ISO 9001, Statutory Documents, Drawings, Other. Note `Drawings` is a category
value inside `documents`, not the separate `drawings` table — your own comment
says that is deliberate.

---

## 4. Two Copilot changes worth making

**`find_site_survey` tells the model to send people to
`/workspaces/site-surveys`.** On mobile there is no URL to visit. Return
`relative_path` in the tool result and the app can render a card that opens the
PDF directly — better than the web behaviour, not just equivalent.

**`search_lfg_sites` is the strongest mobile use case in the system.** 852
sites, size specs, materials, rates, installation cost, scaffolding flags —
someone standing in a Croma store asking "does this site need scaffolding".
No new screen needed. Render NULL as "not recorded", since the Croma rows have
no address or scaffolding data and the tool description already warns about it.

---

## 5. Things to fix regardless of mobile

**`knowledge-files/signed-url` hand-replicates `user_role()` and
`user_has_group_access()`,** and the comment says it is not kept in sync with
the RLS migration automatically. One client makes that tolerable. A second
client makes it the single point where document access control can silently
diverge — and it guards IWAY audit reports and statutory filings. Extract it
into one function both routes call before adding a consumer.

**`documents` has no expiry columns.** `superseded: boolean` covers "is this
current", which is more than most systems have, but FSC CoC and IWAY both run
renewal cycles. Adding `valid_from`, `valid_until`, `issuing_body` enables an
expiry badge and lets the Copilot answer "what expires soon". Schema work, not
UI work. Optional for v1.

**Six workspaces have no responsive prefix at all:** `job-orders`, `machine`,
`project`, `raw-material`, `installation-report`, `cut-file-tool`. None are in
v1, so this does not block the app — but they are unusable on a phone browser
today.

---

## 6. Setup

```bash
npx create-expo-app@latest apps/mobile --template tabs
cd apps/mobile
npx expo install expo-secure-store expo-symbols expo-file-system \
  expo-sharing react-native-url-polyfill @supabase/supabase-js
```

`.env` for the mobile app:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_BASE=https://your-vercel-domain
```

Anon key only. It is designed to ship to clients and RLS is what protects the
data. Never put the service-role key or the R2 credentials in an Expo env var —
`EXPO_PUBLIC_*` values are compiled into the binary and trivially extracted.

### Non-obvious requirements

- `react-native-url-polyfill/auto` must be the first import in the app.
  supabase-js uses the WHATWG URL API, which Hermes does not ship.
- Use `expo/fetch`, not global fetch, for the Copilot. RN's fetch is XHR-backed
  with no `ReadableStream`, so streaming silently degrades to one lump at the
  end.
- Dynamic Type is an HIG requirement. No fixed heights on anything containing
  text; use `minHeight` and let rows grow.
- For iOS 26 Liquid Glass, use `NativeTabs` from
  `expo-router/unstable-native-tabs`. A JS-drawn tab bar cannot reproduce the
  scroll-shrink behaviour or live refraction.

---

## 7. Order of work

1. Bearer auth patch on the three routes — nothing else works without it
2. Monorepo split; move `calc.ts` and the row types
3. Expo scaffold, auth, tab layout
4. Site surveys (scaffolded here) — proves the whole chain end to end
5. Documents — same pattern, different table
6. Copilot chat + tool-result cards
7. Estimator UI

Step 4 is deliberately before the Copilot: it is the smallest screen that
exercises auth, Bearer headers, a signed URL and a file download in one path.
If it works, the plumbing is right.
