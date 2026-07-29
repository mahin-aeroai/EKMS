# MMDI ONE

**Live demo: [ekms.vercel.app](https://ekms.vercel.app) · [app.mmdi.in](https://app.mmdi.in)**

Repo: [github.com/mahin-aeroai/EKMS](https://github.com/mahin-aeroai/EKMS)

An AI-native enterprise operating platform for MMDI, built on top of a 42-component
design system: 33 Intelligent Workspace modules covering the full MDI-ONE navigation
tree (Executive, Customers, Operations, Manufacturing, Knowledge, People, Finance,
Compliance, Administration), effectively all of which read/write real data from
Supabase (either directly, or through the AI Copilot's API route / a workspace's own
tab subcomponents). Highlights beyond the core CRUD workspaces: an AI Copilot with
19 grounded tools including Gmail search and draft (recipient locked to a
customer/contact picker, never to model input), a from-scratch soft-signage cost
estimator (bin-packing, LED layout, GST-ready pricing), a searchable archive of 333
real site-survey PDFs backed by Cloudflare R2, and an installation-report capture
flow spanning both the web app and a native iOS app. The web app is installable as
a PWA on iOS and Android.

**For a full status report — what's built, what's wired to real data, known gaps,
and suggested next steps — see [`PROJECT_STATUS.md`](./PROJECT_STATUS.md).**

Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + Supabase
for the web app; Expo (SDK 57) + React Native for the iOS app; both share code via
an npm workspaces monorepo.

## Monorepo layout

- **`apps/web`** — the Next.js app (deployed to `app.mmdi.in` / `ekms.vercel.app`).
  Everything under "What's here" below lives inside this app.
- **`apps/mobile`** — the Expo/React Native iOS app: five tabs (Copilot, Surveys,
  Estimate, Documents, Reports), sign-in via Supabase, installation report capture
  with local drafts and idempotent submit. Runs on a physical device today via a
  development build (Apple Developer: Individual enrollment); not yet on the App
  Store.
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
- `src/app/workspaces/*` — 33 Intelligent Workspace modules (`project` is a redirect
  stub pointing at `job-orders`, its real replacement). The flagship ones
  (`customer`, `machine`, `raw-material`, `job-orders`) use the full 6-tab Universal
  Workspace Pattern with a Server/Client component split; most others are lighter
  single-page modules; `sign-estimator` is its own small multi-tab app (Estimator /
  Masters / Cost Sheet / Dashboard / History); `cut-file-tool` and
  `installation-report` run entirely client-side (canvas/PDF work with no server
  round-trip for the files themselves). See `PROJECT_STATUS.md` for the full build
  history of each.
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

`npm run build` passes clean: **56 routes** total per `next build`'s own output — 33
workspace modules (32 real + the `project` redirect stub), 7 API routes, and the
design-system/foundation pages, with static prerendering everywhere except the
workspaces that fetch live Supabase data server-side on every request
(`customer/[code]`, `job-orders`, `machine`, `raw-material`) and the API routes
themselves. `npx eslint src` currently has 2 pre-existing errors and 2 warnings
unrelated to recent work (tracked separately); nothing introduced in this pass adds
to that count.

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
