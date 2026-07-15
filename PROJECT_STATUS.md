# MMDI ONE — Project Status

Last updated: 15 July 2026 (session: added authentication + wired the 6
aggregation dashboards)

This file exists so a new chat session (or a new contributor) can pick up this
project without re-deriving context. Read this before making changes.

## What MMDI ONE is

An AI-native enterprise operating platform for MMDI (a packaging/printing
manufacturer). Built by Srinivas and his son Mahin as a knowledge-share
project. Currently: a Next.js app implementing a full component design
system plus 26 "Intelligent Workspace" modules covering the whole MDI-ONE
navigation tree, gated behind Supabase Auth, with 23 of those modules wired
to a live Supabase backend in some form (17 straightforward + 6 aggregation
dashboards rebuilt around real cross-table data — see below for what that
means for each one).

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
   - The 6 cross-module aggregation/dashboard pages (Command Center,
     Analytics, Costing, AI Knowledge, Finance, AI Copilot) were also wired
     this session — see item 8 below for what "wired" means for these
     specifically, since none of them have a single natural backing table.
5. **Backend**: Supabase project `mahin-aeroai's Project`
   (`https://vzyrvzgtjcodxkjydxxn.supabase.co`), free tier. Browser-safe
   client uses the anon/publishable key (safe to expose — protected by RLS,
   not a secret). All row-type TypeScript interfaces live in
   `src/lib/supabase.ts`.
6. **RLS policies tightened this session and confirmed run in production**
   — `supabase-auth-rls-migration.sql` (repo root) replaces every table's
   wide-open `using (true)` policies with `TO authenticated` policies
   (select/insert/update/delete all require a valid signed-in session; the
   anon key alone can no longer read or write anything). No per-role
   distinctions yet — any signed-in user has full access to every table
   (matches the "simple: authenticated-only" model chosen for this phase,
   not a granular RBAC system). User accounts exist in the Supabase
   dashboard (Authentication → Users); confirmed live by visiting
   ekms.vercel.app and observing the redirect to `/login`.
7. Build and lint both verified clean on every change (`npm run build`,
   `npm run lint` — 0 errors). All routes render as expected (static for the
   22 lighter modules + `/login`, dynamic/force-rendered for
   `/workspaces/customer`).
8. **6 aggregation dashboards wired this session** (Command Center,
   Analytics, Costing, Finance, AI Knowledge, AI Copilot) — with an
   important caveat: the schema has **no real financial/cost data anywhere**
   (quote/contract/CRM `value` fields are pre-formatted display strings like
   `"₹4.92 Cr"`, not numbers) and **no timestamps on the 16 lighter-module
   tables** (only Customer's tables have `created_at`). So instead of
   faking revenue/margin/DSO/cost-variance numbers, each dashboard was
   rebuilt around what's genuinely real:
   - **Command Center**: live counts (customers, pending approvals, open
     compliance findings, pending access requests), customers-by-region bar
     chart, avg on-time-delivery / avg health-score gauges (real numeric
     columns on `customers`), and a real activity feed merged from
     `customer_comments` + `customer_approvals` sorted by `created_at`.
   - **Analytics**: live customer/CRM/quote/contract counts, customers-by-
     tier, quotes-by-status, contracts-by-status, approvals-by-status — all
     real distributions, explicitly labeled as a snapshot (no trend lines,
     since there's no historical data to chart).
   - **Costing**: reframed around what's real — supplier count, purchase
     orders in progress, at-risk inventory SKUs, POs-by-stage,
     suppliers-by-status. A visible `Tag` tells the user cost variance needs
     a costing ledger schema that doesn't exist yet.
   - **Finance**: real numbers this time — `customers.lifetime_value` and
     `customers.open_orders` ARE numeric columns, so total portfolio LTV
     (summed, formatted with the same `₹X.XX Cr` convention as the Customer
     workspace), total open orders, active/expiring contract counts, and
     lifetime-value-by-region are all genuinely computed. A `Tag` flags that
     revenue/margin/DSO need a finance ledger that doesn't exist yet.
   - **AI Knowledge**: `Indexed Records` is a real summed row count across
     20 live tables; the relationship graph is no longer a hardcoded sample
     — it's built from the same demo customer
     (`CUST-MU-002104`) the Customer workspace uses, tracing their real
     contacts/comments/approvals.
   - **AI Copilot**: the chat itself is still an illustrative demo (real
     LLM grounding is a separate, larger integration phase — out of scope
     here), but its 3 stat cards now show real cross-table counts framed as
     "context available to the assistant" rather than fabricated usage
     metrics.
   - New shared helper: `src/lib/dashboard-queries.ts` (`getCount`,
     `getCountWhere`, `groupCount`, `groupSum`, `statusDonutData`,
     `formatCrore`) — used by all 6 pages to avoid re-implementing the same
     count/group-by logic six times.

## What's NOT done yet (known gaps)

- **No role/permission granularity.** Every signed-in user can read/write
  every table. If MMDI wants viewer-vs-editor or department-scoped access
  later, that's a further RLS/`profiles` table phase.
- **Machine, Raw Material, Project workspaces are not wired to Supabase**
  (see correction above) — this was previously miscategorized as done.
- **No real financial/costing data in the schema at all.** Quote/contract/
  CRM `value` fields are pre-formatted display strings, not numbers; the 16
  lighter-module tables have no timestamps. The Costing and Finance
  dashboards were rebuilt around what's genuinely real (see item 8 above)
  rather than faking revenue/margin/DSO/cost-variance — if MMDI wants those
  numbers to be real, that needs an actual costing/finance ledger schema
  first.
- The 4 flagship workspaces' Insights/Timeline/Documents/Relationships tabs
  are sample content everywhere, including on the wired Customer workspace.
- No real AI/LLM integration anywhere yet — all "AI insight" cards are
  static or lightly-templated copy, not generated by a model. AI Copilot's
  chat is still an illustrative demo.
- No file upload / document storage wired (Documents, Drawings, SOPs pages
  read metadata rows from Supabase but don't handle actual file storage).
- No tests.
- No password reset entry point on `/login` (a user has to be sent a
  recovery link from the Supabase dashboard — there's no "forgot password"
  link on the sign-in form itself yet).

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
- `supabase-auth-rls-migration.sql` — this session's RLS migration, already
  run in production. Safe to re-run (idempotent) if new tables get added
  later and need the same treatment.
- `src/lib/dashboard-queries.ts` — shared count/group-by helpers
  (`getCount`, `getCountWhere`, `groupCount`, `groupSum`, `statusDonutData`,
  `formatCrore`) used by all 6 aggregation dashboards.
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

1. **Actually wire Machine, Raw Material, and Project workspaces** to
   Supabase (this was previously thought done — it isn't). Follow the
   Customer workspace's Server/Client split pattern.
2. **Add role/permission granularity** (a `profiles` table + role-scoped RLS)
   if "any signed-in user can do anything" turns out to be too permissive.
3. **Wire the remaining 4 tabs per flagship workspace** (Insights, Timeline,
   Documents, Relationships) to real data.
4. **Real AI integration** — replace static/templated "AI insight" card
   copy with actual model-generated insights, and give AI Copilot's chat
   real grounding (would need an LLM API call layer).
5. **File storage** for Documents/Drawings/SOPs (Supabase Storage buckets).
6. **Add a "forgot password" link on `/login`** — right now recovery emails
   can only be triggered by an admin from the Supabase dashboard.
7. **A real costing/finance ledger schema**, if MMDI wants the Costing and
   Finance dashboards to show actual revenue/margin/DSO/cost-variance numbers
   instead of the real-but-adjacent metrics (portfolio LTV, PO pipeline,
   supplier/SKU status) they show today.

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
9. User ran `supabase-auth-rls-migration.sql` and created the first user
   accounts via the Supabase dashboard (Authentication → Users). Confirmed
   in production: visiting ekms.vercel.app now redirects to
   `/login?redirectTo=%2F` instead of loading the app straight through.
10. Found and fixed two bugs in the invite/password-recovery flow, both
    surfaced by the user actually testing it end-to-end:
    - The Supabase project's **Site URL** was still `localhost:3000`, so
      every invite/recovery email linked to a dead address. Fixed by the
      user in the Supabase dashboard (Authentication → URL Configuration →
      Site URL = `https://ekms.vercel.app/login`, plus a
      `https://ekms.vercel.app/**` entry in Redirect URLs).
    - `/login` had no UI to handle the `#access_token=...&type=invite` (or
      `type=recovery`) hash those emails link to — it just showed the
      normal sign-in form with a raw token dangling in the URL. Added
      invite/recovery detection + a "set your password" form to
      `src/app/login/page.tsx`.
    - Bigger bug: `middleware.ts` was redirecting any already-authenticated
      request away from `/login` server-side — including one carrying a
      fresh invite/recovery token, since URL hashes never reach the server.
      Net effect: opening someone else's invite link in a browser that
      still had your own session active silently dropped you into the app
      as *yourself*, discarding their token with no error. Fixed by moving
      the "already signed in → skip /login" nicety client-side (gated on
      not being in the middle of an invite/recovery flow) — see
      `src/lib/supabase-middleware.ts` for the full explanation left
      in-code.
11. Wired the 6 aggregation dashboards (Command Center, Analytics, Costing,
    Finance, AI Knowledge, AI Copilot) — see item 8 in "Current state"
    above for the full breakdown and the financial-data caveat that shaped
    the approach.
