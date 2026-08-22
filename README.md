# MMDI ONE

**Live demo: [ekms.vercel.app](https://ekms.vercel.app) · [app.mmdi.in](https://app.mmdi.in)**

Repo: [github.com/mahin-aeroai/EKMS](https://github.com/mahin-aeroai/EKMS)

An AI-native enterprise operating platform for MMDI, built on top of a 42-component
design system: 36 Intelligent Workspace modules covering the full MDI-ONE navigation
tree (Executive, Customers, Operations, Manufacturing, Knowledge, People, Finance,
Compliance, Administration), effectively all of which read/write real data from
Supabase (either directly, or through the AI Copilot's API route / a workspace's own
tab subcomponents). Highlights beyond the core CRUD workspaces: an AI Copilot with
19 grounded tools including Gmail search and draft (recipient locked to a
customer/contact picker, never to model input), a from-scratch soft-signage cost
estimator (bin-packing, LED layout, GST-ready pricing), a Cost Sheet module (BOM
Master, Rate Card, and per-job cost calculation against real raw material/work
centre pricing) for the finished-goods product line, an Estimate Builder that
generates versioned, GST/HSN-ready customer quote PDFs from contract rate cards,
past sales history, or fully custom line items, a searchable archive of 333
real site-survey PDFs backed by Cloudflare R2, and an installation-report capture
flow spanning both the web app and a native iOS app. The web app is installable as
a PWA on iOS and Android.

**For a full status report — what's built, what's wired to real data, known gaps,
and suggested next steps — see [`PROJECT_STATUS.md`](./PROJECT_STATUS.md). For how
to actually develop and ship (GitHub/Vercel/Supabase/mobile-build workflow, tokens,
Apple Developer details) — see [`OPERATIONS.md`](./OPERATIONS.md).**

Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + Supabase
for the web app; Expo (SDK 57) + React Native for the iOS app; both share code via
an npm workspaces monorepo.

## Monorepo layout

- **`apps/web`** — the Next.js app (deployed to `app.mmdi.in` / `ekms.vercel.app`).
  Everything under "What's here" below lives inside this app.
- **`apps/mobile`** — the Expo/React Native iOS app: five visible tabs (Home, Sign
  Costing, Sales by Rep, Estimates, Cost Sheets), plus Copilot, Surveys, Basil
  Installations, and Sign Costing History reached from Home's quick actions rather
  than the tab bar (`app/(tabs)/_layout.tsx`). Sign-in via Supabase, an AI Copilot
  with a "Hey Jarvis" wake word (`expo-speech-recognition`), a native Sign Costing
  estimator and a full BOM+Work-Centre Cost Sheet calculator (material/work-centre
  on-off overrides, alternative-material picker, a cost-plus-markup Suggested
  Selling Price with a visible calculation breakdown, "Add to Estimate Pool"),
  Sales by Rep with a donut chart + bar breakdowns, a Bill/Estimate PDF viewer
  matching the web app's fonts/layout, and installation report capture with local
  drafts and idempotent submit. Runs on a physical device today via a development
  build (Apple Developer: Individual enrollment) built with `eas build --local`;
  not yet on the App Store.
- **`packages/shared`** (`@mmdi/shared`) — code genuinely shared between both apps:
  the sign estimator's `calc.ts` (pure, dependency-free, runs unmodified under
  Hermes), ~45 Supabase row-type interfaces (`rows.ts`), and the design tokens
  restated as a plain JS object (`theme.ts`, since React Native has no CSS custom
  properties).

## Running locally

### Web app

```bash
npm install
npm run dev
```

(`npm run dev` at the repo root proxies to `apps/web` via npm workspaces.)

Open http://localhost:3000. Switch themes (Light / Dark / Enterprise) from the top nav —
every screen re-renders live since nothing is hardcoded to a theme.

You'll need an `apps/web/.env.local` with your Supabase URL and anon key for the
workspace pages to load real data (see `apps/web/src/lib/supabase.ts`), plus
`ANTHROPIC_API_KEY` for the AI Copilot and Google OAuth credentials for Gmail
search/draft (see `PROJECT_STATUS.md` for the full list). The app requires sign-in
— visit `/login` and use an account created in the Supabase dashboard
(Authentication → Users → Add user). There's no self-signup by design.

### Mobile app (iOS)

```bash
cd apps/mobile
npm install
npm run ios     # or: npm run android / npm run web
```

Needs its own `apps/mobile/.env` with `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY`. Authenticates against the same Supabase project as
the web app, via a Bearer token rather than cookies (`apps/web/src/lib/
supabase-route.ts` accepts either).

## What's here (`apps/web`)

- `src/app/globals.css` — the full design token set (color, typography, spacing, radius,
  elevation, motion) as CSS custom properties, mapped into Tailwind v4's `@theme inline`
  block so tokens generate real utility classes (`bg-primary`, `text-ink`, `shadow-2`, etc).
  The same values are restated as a JS object in `packages/shared/src/theme.ts` for the
  mobile app.
- `src/components/theme/` — the Light / Dark / Enterprise theme system (`ThemeProvider`,
  `ThemeSwitcher`), persisted to `localStorage`.
- `src/components/ui/` — all 42 components, one JSDoc block per component citing which
  Design System deliverable/section it implements.
- `src/components/AppShell.tsx` — the app shell (Top Nav, Sidebar, Command Palette,
  AI Assistant drawer) wrapping every route. Collapses to an off-canvas mobile nav
  and a controllable command palette below `md`.
- `src/app/foundations` and `src/app/components/*` — the showcase pages demonstrating
  every component live, grouped the same way as the Design System document
  (Inputs & Actions, Cards, Data & Structure, Navigation, Collaboration, Feedback &
  Overlays, AI-Native, Document & Media Viewers, Layout Primitives).
- `src/app/workspaces/*` — 36 Intelligent Workspace modules (`project` is a redirect
  stub pointing at `job-orders`, its real replacement). The flagship ones
  (`customer`, `machine`, `raw-material`, `job-orders`) use the full 6-tab Universal
  Workspace Pattern with a Server/Client component split; most others are lighter
  single-page modules; `sign-estimator` is its own small multi-tab app (Estimator /
  Masters / Cost Sheet / Dashboard / History); `cost-sheet` is another multi-tab app
  (Cost Sheet / BOM Master / Rate Card / Material Pricing) for costing finished-goods
  product lines against real raw material and work centre rates, with a BOM Master
  tab for mapping/editing/reordering each FG code's bill of materials and a
  client-side-filtered `RawMaterialPicker` for mapping BOM lines and alternative
  materials to real `raw_materials` codes; `estimate-builder` generates versioned,
  GST/HSN-ready customer quote PDFs client-side (`pdf-lib`) from contract rate cards,
  past sales history, or custom line items, with every version listed in
  `quotations`; `cut-file-tool` and `installation-report` run entirely client-side
  (canvas/PDF work with no server round-trip for the files themselves). See
  `PROJECT_STATUS.md` for the full build history of each.
- `src/app/api/ai-copilot/route.ts` — the AI Copilot's backend: Claude tool use
  grounded in live Supabase data, 19 tools including Gmail `search_email` /
  `draft_email`. Every route (this one included) authenticates via
  `src/lib/supabase-route.ts`, which accepts either a browser cookie session or a
  mobile client's `Authorization: Bearer` header, and enforces `aal2` (MFA) where
  required.
- `src/lib/supabase.ts` — the shared browser Supabase client and every workspace
  row-type definition. `src/lib/supabase-server.ts` is the equivalent for Server
  Components; `middleware.ts` + `src/lib/supabase-middleware.ts` refresh the auth
  session and redirect signed-out users to `/login` (API routes are exempted — they
  authenticate themselves).
- `public/manifest.webmanifest`, `public/sw.js`, `src/components/InstallPrompt.tsx` /
  `IosInstallHint.tsx` — the PWA layer: manifest + icons generated from the brand
  mark, an app-shell service worker (deliberately never caches `/api/*` or Supabase
  calls — stale business data with no way to tell is worse than no offline support),
  and dismissible install prompts for Android (`beforeinstallprompt`) and iOS Safari
  (a one-time Share → Add to Home Screen hint, since iOS has no equivalent event).

## Verified

**59 routes** (35 workspace modules — 34 real + the `project` redirect stub — 7 API
routes, and the design-system/foundation pages) was the last count actually confirmed
against a real `next build` output, before the Cost Sheet module (`/workspaces/
cost-sheet`) shipped — see `PROJECT_STATUS.md` item 72 onward. Every Cost Sheet/BOM
Master change since has only been verified via `npx tsc --noEmit` and `npx eslint`
(both clean bar the same pre-existing issues noted below) — the sandboxes doing that
work hit a native `next build` "Bus error" on `@next/swc-linux-{gnu,musl}` every time
(an ARM64/sandbox incompatibility, not a code issue), so the route count above is not
yet re-confirmed post-Cost-Sheet and is very likely 60 now, not 59. `npx eslint src`
currently has a small number of pre-existing errors unrelated to recent work (e.g. a
`react-hooks/purity` hit on a `Date.now()` call in `workspaces/people/page.tsx`, and a
`react-hooks/set-state-in-effect` hit in `account/page.tsx`, both tracked separately);
nothing introduced in recent work adds to that count.

## Deployment

Hosted on Vercel, auto-deploying from the `main` branch on every push. Production
deployments: `ekms.vercel.app` and the custom domain `app.mmdi.in` (Vercel's Standard
Protection exempts a production custom domain but not the `*.vercel.app` one, which
matters for the mobile app reaching the API at all). Root Directory is set to
`apps/web` with "include files outside the root directory" enabled, so the build can
resolve `@mmdi/shared`.

The iOS app is not yet distributed — it runs today as a development build installed
directly on a physical device (see `PROJECT_STATUS.md` for the Apple
Individual-vs-Organization enrollment decision blocking an App Store listing).

## Contributing

```bash
git clone https://github.com/mahin-aeroai/EKMS.git
cd EKMS
npm install
npm run dev
```

Push to `main` to trigger a redeploy, or open a PR for review first.
