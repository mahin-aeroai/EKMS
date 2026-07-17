# MMDI ONE

**Live demo: [ekms.vercel.app](https://ekms.vercel.app)**

Repo: [github.com/mahin-aeroai/EKMS](https://github.com/mahin-aeroai/EKMS)

An AI-native enterprise operating platform for MMDI, built on top of a 42-component
design system: 31 Intelligent Workspace modules covering the full MDI-ONE navigation
tree (Executive, Customers, Operations, Manufacturing, Knowledge, People, Finance,
Compliance, Administration), effectively all of which now read/write real data from
Supabase (either directly, or through the AI Copilot's API route / a workspace's own
tab subcomponents). Highlights beyond the core CRUD workspaces: an AI Copilot with
16 grounded tools, a from-scratch soft-signage cost estimator (bin-packing, LED
layout, GST-ready pricing) rebuilt from a standalone tool the team already used, and
a searchable archive of 333 real site-survey PDFs backed by Cloudflare R2.

**For a full status report — what's built, what's wired to real data, known gaps,
and suggested next steps — see [`PROJECT_STATUS.md`](./PROJECT_STATUS.md).**

Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + Supabase.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Switch themes (Light / Dark / Enterprise) from the top nav —
every screen re-renders live since nothing is hardcoded to a theme.

You'll need a `.env.local` with your Supabase URL and anon key for the workspace pages
to load real data (see `src/lib/supabase.ts`). The app requires sign-in — visit
`/login` and use an account created in the Supabase dashboard (Authentication →
Users → Add user). There's no self-signup by design.

## What's here

- `src/app/globals.css` — the full design token set (color, typography, spacing, radius,
  elevation, motion) as CSS custom properties, mapped into Tailwind v4's `@theme inline`
  block so tokens generate real utility classes (`bg-primary`, `text-ink`, `shadow-2`, etc).
- `src/components/theme/` — the Light / Dark / Enterprise theme system (`ThemeProvider`,
  `ThemeSwitcher`), persisted to `localStorage`.
- `src/components/ui/` — all 42 components, one JSDoc block per component citing which
  Design System deliverable/section it implements.
- `src/components/AppShell.tsx` — the app shell (Top Nav, Sidebar, Command Palette,
  AI Assistant drawer) wrapping every route.
- `src/app/foundations` and `src/app/components/*` — the showcase pages demonstrating
  every component live, grouped the same way as the Design System document
  (Inputs & Actions, Cards, Data & Structure, Navigation, Collaboration, Feedback &
  Overlays, AI-Native, Document & Media Viewers, Layout Primitives).
- `src/app/workspaces/*` — 31 Intelligent Workspace modules (`project` is a redirect
  stub pointing at `job-orders`, its real replacement). The flagship ones
  (`customer`, `machine`, `raw-material`, `job-orders`) use the full 6-tab Universal
  Workspace Pattern with a Server/Client component split; most others are lighter
  single-page modules; `sign-estimator` is its own small multi-tab app (Estimator /
  Masters / Cost Sheet / Dashboard / History) living entirely on one route. See
  `PROJECT_STATUS.md` for the full build history of each.
- `src/lib/supabase.ts` — the shared browser Supabase client and every workspace
  row-type definition. `src/lib/supabase-server.ts` is the equivalent for Server
  Components; `middleware.ts` + `src/lib/supabase-middleware.ts` refresh the auth
  session and redirect signed-out users to `/login`.

## Verified

`npm run build` and `npm run lint` both pass clean, 0 lint errors. 46 routes total —
static prerendering for the design-system pages and most workspace modules, dynamic/
force-rendered for the workspaces that fetch live Supabase data server-side on every
request (`customer/[code]`, `job-orders`, `machine`, `raw-material`), plus 2 API
routes (`/api/ai-copilot`, `/api/lfg-surveys/signed-url`).

## Deployment

Hosted on Vercel, auto-deploying from the `main` branch on every push. Production
deployment: `ekms.vercel.app`.

To deploy your own copy: import the repo at vercel.com → "Add New" → "Project" →
select the repo. No configuration needed — Next.js is auto-detected.

## Contributing

```bash
git clone https://github.com/mahin-aeroai/EKMS.git
cd EKMS
npm install
npm run dev
```

Push to `main` to trigger a redeploy, or open a PR for review first.
