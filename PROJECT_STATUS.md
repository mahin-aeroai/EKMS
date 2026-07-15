# MMDI ONE — Project Status

Last updated: 15 July 2026 (session: added authentication)

This file exists so a new chat session (or a new contributor) can pick up this
project without re-deriving context. Read this before making changes.

## What MMDI ONE is

An AI-native enterprise operating platform for MMDI (a packaging/printing
manufacturer). Built by Srinivas and his son Mahin as a knowledge-share
project. Currently: a Next.js app implementing a full component design
system plus 26 "Intelligent Workspace" modules covering the whole MDI-ONE
navigation tree, now gated behind Supabase Auth, with 17 of those modules
wired to a live Supabase backend.

- Live demo: https://ekms.vercel.app
- Repo: https://github.com/mahin-aeroai/EKMS (main branch, auto-deploys to Vercel)
- Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + Supabase

## Correction from the last handoff

The previous version of this file claimed all 4 flagship workspaces (Customer,
Machine, Raw Material, Project) were wired to Supabase. That was wrong — only
**Customer** actually is. The commit that claimed to wire Machine/Raw
Material/Project ("Connect Machine, Raw Material, and Project workspaces to
Supabase", `4e1d876`) only touched `customer/page.tsx` and added the
`CustomerWorkspaceClient.tsx` split; it also added the `MachineRow`,
`RawMaterialRow`, `ProjectRow` (and their comment/approval) TypeScript
interfaces to `src/lib/supabase.ts`, but the Machine/Raw Material/Project
`page.tsx` files themselves are still 100% client-side sample data with no
`supabase.from(...)` calls anywhere in them. Treat "wire Machine/Raw
Material/Project workspaces" as **not started**, not "done", going forward.

## Current state (done, verified working)

1. **Design system**: 42 reusable UI components (`src/components/ui/`), 3 themes
   (Light/Dark/Enterprise), full style-guide showcase app under `/components/*`
   and `/foundations`.
2. **Authentication (new this session)**: Supabase Auth, email + password,
   no self-signup — accounts are created by an admin via the Supabase
   dashboard (Authentication → Users → Add user). Built with `@supabase/ssr`:
   - `src/lib/supabase.ts` — browser client (`createBrowserClient`), used by
     every "use client" component. Same export name/path as before
     (`supabase`), so none of the 20+ client-side workspace modules needed
     changes.
   - `src/lib/supabase-server.ts` — `createServerSupabaseClient()`, an async
     per-request client for Server Components. Currently only
     `src/app/workspaces/customer/page.tsx` uses this (the only real Server
     Component fetch in the app).
   - `middleware.ts` + `src/lib/supabase-middleware.ts` — refreshes the
     session cookie on every request and redirects signed-out users to
     `/login` (except `/login` itself and static assets).
   - `src/app/login/page.tsx` — email/password sign-in form.
   - `src/components/AppShell.tsx` / `src/components/ui/TopNav.tsx` — track
     the signed-in user client-side (`supabase.auth.getUser()` +
     `onAuthStateChange`), show their initials in the top-right avatar with a
     sign-out menu, and skip the sidebar/topnav chrome entirely on `/login`.
3. **4 flagship workspaces** — Customer, Machine, Raw Material, Project — each
   *designed* to use the full 6-tab Universal Workspace Pattern (Overview /
   Insights / Timeline / Documents / Relationships / Activity), but **only
   Customer is actually wired to Supabase** (Overview + Activity tabs; the
   other 4 tabs are sample content there too). Machine/Raw Material/Project
   are entirely sample data — see correction above.
4. **22 lighter workspace modules** covering the rest of the MDI-ONE IA
   (Executive, Customers, Operations, Manufacturing, Knowledge, People,
   Finance, Compliance, Administration groups in the sidebar nav). Pattern:
   header + stat row + one AI insight card + one real domain widget (table,
   kanban, calendar, tree, etc.) — not the full 6-tab pattern.
   - **16 of these are wired to real Supabase data** (simple `useEffect` +
     `useState` fetch, no Server/Client split needed): CRM, Quotations,
     Contracts, Production, Maintenance, Installation, Inventory, Procurement,
     Suppliers, Documents, Drawings, SOPs, Lessons Learned, People,
     Compliance, Administration.
   - **6 remain sample/hardcoded data** (deliberately, since they're
     cross-module aggregation/dashboard pages with no single natural backing
     table): Command Center, AI Copilot, Analytics, Costing, AI Knowledge,
     Finance.
5. **Backend**: Supabase project `mahin-aeroai's Project`
   (`https://vzyrvzgtjcodxkjydxxn.supabase.co`), free tier. Browser-safe
   client uses the anon/publishable key (safe to expose — protected by RLS,
   not a secret). All row-type TypeScript interfaces live in
   `src/lib/supabase.ts`.
6. **RLS policies tightened this session** — a migration
   (`supabase-auth-rls-migration.sql`, repo root, **not yet run against
   production as of this handoff — confirm with Srinivas before assuming
   it's live**) replaces every table's wide-open `using (true)` policies with
   `TO authenticated` policies (select/insert/update/delete all require a
   valid signed-in session; the anon key alone can no longer read or write
   anything). No per-role distinctions yet — any signed-in user has full
   access to every table (matches the "simple: authenticated-only" model
   chosen for this phase, not a granular RBAC system).
7. Build and lint both verified clean on every change (`npm run build`,
   `npm run lint` — 0 errors). All routes render as expected (static for the
   22 lighter modules + `/login`, dynamic/force-rendered for
   `/workspaces/customer`).

## What's NOT done yet (known gaps)

- **Confirm the RLS migration has actually been run** — `supabase-auth-rls-migration.sql`
  was written and reviewed this session but the assistant couldn't reach the
  Supabase API from its sandbox to execute it directly. Until it's run, the
  tables are still wide open despite the app now requiring login.
- **No role/permission granularity.** Every signed-in user can read/write
  every table. If MMDI wants viewer-vs-editor or department-scoped access
  later, that's a further RLS/`profiles` table phase.
- **Machine, Raw Material, Project workspaces are not wired to Supabase**
  (see correction above) — this was previously miscategorized as done.
- The 6 aggregation dashboards (Command Center, AI Copilot, Analytics,
  Costing, AI Knowledge, Finance) are still hardcoded sample data.
- The 4 flagship workspaces' Insights/Timeline/Documents/Relationships tabs
  are sample content everywhere, including on the wired Customer workspace.
- No real AI/LLM integration anywhere yet — all "AI insight" cards are
  static copy, not generated by a model.
- No file upload / document storage wired (Documents, Drawings, SOPs pages
  read metadata rows from Supabase but don't handle actual file storage).
- No tests.
- No password reset flow on `/login` yet (only sign-in). Add if users
  forget passwords rather than an admin resetting them from the dashboard.

## Key files to know

- `src/lib/supabase.ts` — browser Supabase client + every row-type interface.
  Read this first before touching any workspace page.
- `src/lib/supabase-server.ts` — Server Component Supabase client (only used
  by `customer/page.tsx` today; use this pattern for any new server-fetched
  workspace).
- `middleware.ts` / `src/lib/supabase-middleware.ts` — auth session refresh +
  route protection. `PUBLIC_PATHS` in `supabase-middleware.ts` controls what
  doesn't require login (currently just `/login`).
- `src/app/login/page.tsx` — sign-in form.
- `src/components/AppShell.tsx` — top nav, sidebar (all IA groups), command
  palette, AI assistant drawer wrapper, now also the signed-in user's
  email/sign-out menu and the `/login` chrome bypass.
- `src/app/workspaces/*/page.tsx` — one folder per module. Only `customer`
  delegates to a Server/Client split (`src/components/workspaces/*.tsx`); the
  other 25 are self-contained.
- `supabase-auth-rls-migration.sql` — this session's RLS migration. Run in
  the Supabase SQL editor; safe to re-run (idempotent).
- SQL schema files (not committed to the repo, delivered separately to the
  user and already run against the live Supabase project):
  - Customer workspace schema (customer_contacts, customer_comments,
    customer_approvals, etc.) — run first, earliest phase.
  - Machine / Raw Material / Project workspace schemas — tables likely exist
    (interfaces reference them) but nothing in the app queries them yet.
  - `supabase-remaining-modules-schema.sql` — the 16-table schema for the
    lighter modules listed above. Already run against production.

## Working conventions established in this project

- Build/lint in this session were run directly against a fresh `git clone`
  of the repo in the assistant's own sandbox (not the mounted outputs
  folder) — `npm install && npm run build && npm run lint`, both clean.
- Client Components import the shared browser client from `@/lib/supabase`
  as before. **Server Components must call
  `await createServerSupabaseClient()` from `@/lib/supabase-server` inside
  the function body** — never import the browser `supabase` singleton in a
  Server Component now that RLS requires a real session; it won't have
  access to the request's cookies and every fetch will fail auth.
- `react/no-unescaped-entities`: escape apostrophes (`&apos;`) in JSX text
  children, but NOT inside JSX string attributes (e.g. `title="What's..."`).
- Avoid `setState` directly inside `useEffect` bodies for lint compliance —
  either accept the `react-hooks/exhaustive-deps` disable comment (used
  throughout the 16 lighter modules' fetch effects) or use a lazy `useState`
  initializer.
- Kanban-style pages (Production, Procurement) reconstruct `KanbanColumn[]`
  client-side from flat DB rows via a `toKanbanColumns()` helper grouping by
  a `column_id` text field, using a fixed `COLUMN_ORDER` + `COLUMN_TITLES`
  lookup.
- A page using `useSearchParams()` must wrap the part that calls it in
  `<Suspense>` or `next build` fails prerendering it (hit this on
  `/login`; fixed by splitting into an outer `LoginPage` + inner
  `LoginForm`).

## Natural next steps (not started, pick one)

1. **Confirm `supabase-auth-rls-migration.sql` has been run** and create the
   first real user account(s) in the Supabase dashboard, if not done already.
2. **Add role/permission granularity** (a `profiles` table + role-scoped RLS)
   if "any signed-in user can do anything" turns out to be too permissive.
3. **Actually wire Machine, Raw Material, and Project workspaces** to
   Supabase (this was previously thought done — it isn't). Follow the
   Customer workspace's Server/Client split pattern.
4. **Wire the 6 remaining aggregation dashboards** to real cross-table
   queries/views.
5. **Wire the remaining 4 tabs per flagship workspace** (Insights, Timeline,
   Documents, Relationships) to real data.
6. **Real AI integration** — replace static "AI insight" card copy with
   actual model-generated insights (would need an LLM API call layer).
7. **File storage** for Documents/Drawings/SOPs (Supabase Storage buckets).

## Session history (chronological, high level)

1. Enterprise architecture docx → Domain A data dictionaries → Product
   Blueprint docx → Product Design System docx (all delivered as Word docs
   before any code was written).
2. Scaffolded the Next.js design system codebase, built all 42 components +
   showcase app, verified build, pushed to GitHub, deployed to Vercel.
3. Built 4 flagship workspaces one at a time (Customer → Machine → Raw
   Material → Project), each with sample/hardcoded data initially.
4. User provided the full MDI-ONE navigation tree; built all 22 remaining
   lighter workspace modules in one batch, restructured the sidebar nav to
   match the tree exactly.
5. Moved to backend integration: user set up Supabase themselves, provided
   the anon key. Wired Customer workspace end-to-end first (proof of
   pattern) — despite the commit message, Machine/Raw Material/Project were
   NOT actually wired in this step — then wired the 16 lighter modules with
   a natural single backing table each.
6. `PROJECT_STATUS.md` created to hand off state to the next session (this
   file — its first version incorrectly stated Machine/Raw Material/Project
   were wired; corrected in step 8).
7. Added Supabase Auth (email/password, no self-signup) via `@supabase/ssr`:
   browser + server clients, session-refreshing middleware with route
   protection, `/login` page, sign-out control in the top nav. Wrote
   `supabase-auth-rls-migration.sql` to tighten every table's RLS policies
   from wide-open to `authenticated`-only. Verified `npm run build` and
   `npm run lint` clean. Could not run the SQL migration or create the first
   user directly — the assistant's sandbox network doesn't reach the
   Supabase API, only GitHub — so both are handed off as manual steps.
8. This update: corrected the Machine/Raw Material/Project wiring claim
   inherited from the previous version of this file.
