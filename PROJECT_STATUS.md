# MMDI ONE — Project Status

Last updated: 15 July 2026 (session: auth + all 6 dashboards + all 4
flagship workspaces wired, plus real customer/revenue/machine/raw-material/
finished-goods data imported)

This file exists so a new chat session (or a new contributor) can pick up this
project without re-deriving context. Read this before making changes.

## What MMDI ONE is

An AI-native enterprise operating platform for MMDI (a packaging/printing
manufacturer). Built by Srinivas and his son Mahin as a knowledge-share
project. Currently: a Next.js app implementing a full component design
system plus 26 "Intelligent Workspace" modules covering the whole MDI-ONE
navigation tree, gated behind Supabase Auth, with 26 of those modules wired
to a live Supabase backend in some form (16 straightforward + 6 aggregation
dashboards rebuilt around real cross-table data + all 4 flagship workspaces
— see below for what "wired" means for each). The `customers` table also
holds 1,687 real MMDI accounts (imported from a Tally export + a Q1 sales
register), not just seed/demo rows.

- Live demo: https://ekms.vercel.app
- Repo: https://github.com/mahin-aeroai/EKMS (main branch, auto-deploys to Vercel)
- Stack: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + Supabase

## Correction from an earlier handoff (now resolved)

An earlier version of this file claimed all 4 flagship workspaces (Customer,
Machine, Raw Material, Project) were wired to Supabase. That was wrong at the
time — only **Customer** actually was. The commit that claimed to wire
Machine/Raw Material/Project ("Connect Machine, Raw Material, and Project
workspaces to Supabase", `4e1d876`) only touched `customer/page.tsx` and
added the `CustomerWorkspaceClient.tsx` split; it also added the
`MachineRow`, `RawMaterialRow`, `ProjectRow` (and their comment/approval)
TypeScript interfaces to `src/lib/supabase.ts`, but the Machine/Raw
Material/Project `page.tsx` files themselves stayed 100% client-side sample
data with no `supabase.from(...)` calls anywhere in them for several
sessions. **This is now actually fixed** — see item 3 in "Current state"
below. Leaving this note here so nobody re-trusts a stale commit message
over what the code actually does again.

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
   uses the full 6-tab Universal Workspace Pattern (Overview / Insights /
   Timeline / Documents / Relationships / Activity), with a Server/Client
   split matching the Customer workspace's original pattern (see
   `src/lib/supabase-server.ts`). **All 4 have wired *code* as of this
   session** (previously only Customer did — see correction above): the
   stat row, a real spec/info panel, and the Activity tab (comments +
   approvals, writable) are real for all 4. **BUT** — the `machines`,
   `raw_materials`, and `projects` tables themselves turned out not to
   exist in production at all (confirmed by the user hitting
   `relation "machines" does not exist`), so Machine/Raw Material/Project
   were showing the graceful "couldn't load" error, not real data, until
   `supabase-machine-rawmaterial-project-schema.sql` gets run — **check
   it's actually been run before assuming these 3 workspaces show
   anything.** Insights/Timeline/Documents/Relationships remain
   illustrative sample content on every one of the 4 workspaces —
   deliberately out of scope, since there's no sensor telemetry,
   consumption/downtime log, budget ledger, or document storage backing
   those tabs.
   - Server pages (`src/app/workspaces/{customer,machine,raw-material,project}/page.tsx`)
     fetch the most recently created row from `customers`/`machines`/
     `raw_materials`/`projects` (`order by created_at desc limit 1`) rather
     than a hardcoded demo code — works regardless of what's actually
     seeded, and shows a graceful error pointing at the schema file if the
     table is empty or missing. `machines` (73 rows) and `raw_materials`
     (1,558 rows) now have real imported data, so those two workspaces load
     real records once `import-machines.sql` / `import-raw-materials.sql`
     have been run. `projects` still has zero rows — no project data has
     been uploaded yet, so that workspace still shows the graceful error.
   - Customer workspace specifically is pointed at a real imported customer
     — `C03739` (Apple India Pvt Ltd - Bangalore, the real customer with the
     highest Q1 revenue and a real contact on file) — not the original
     fictional "Reliance Retail Ltd" demo record, which is still sitting in
     the table under code `CUST-MU-002104` unused.
   - Machine and Raw Material workspaces are now also pointed at specific
     real demo records (same pattern): `MC-HYD-001` (Vutek GS 3250 LX Pro,
     Unit 1, Hyderabad) and `RM-11001` (Frontlit Flex, a core signage
     substrate). Project workspace still falls back to "most recently
     created row" since `projects` has zero rows — no project data exists
     to point it at yet.
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
6. **RLS**: two migrations, layered.
   `supabase-auth-rls-migration.sql` (earlier this session) first replaced
   every table's wide-open `using (true)` policies with `TO authenticated`
   policies (any signed-in user, full access). Confirmed run in production.
   `supabase-role-based-rls-migration.sql` (later, **confirmed run in
   production on 15 July 2026**) supersedes those policies with a real
   3-tier role model:
   - A `profiles` table (`id`/`email`/`role`, role = admin/editor/viewer,
     default 'viewer'), a `public.user_role()` security-definer function,
     an `auth.users` insert trigger that auto-creates a profile for every
     new user, a backfill for users created before the migration, and a
     bootstrap step. **Correction**: the file originally bootstrapped
     `srinivas@mmdi.in` to admin, assuming that was the account signed
     into the Supabase project — it wasn't (the real accounts are
     `m.nandipa@icloud.com`, `mahin.nandipa@gmail.com`,
     `nandipa@icloud.com`), so the bootstrap `UPDATE` matched zero rows
     and nobody got promoted. Fixed by running the correct `UPDATE`
     directly (`m.nandipa@icloud.com` → admin) and updating the file to
     match. Confirmed via `select email, role, created_at from
     public.profiles`: 3 real users, all with profile rows (the Supabase
     dashboard's "10 users (estimated)" figure around the same time was
     inaccurate — there was an active platform incident at the time).
   - Every table from the previous migration gets replaced policies:
     SELECT allowed for all 3 roles, INSERT/UPDATE for admin+editor only,
     DELETE for admin only.
   - Validated against a real local Postgres instance with a stub
     `auth.users`/`auth.uid()` before handoff — confirmed viewers can read
     but not write, editors can read/write but not delete, admins can do
     everything, a signed-in user with no profile row is locked out
     everywhere (fail-closed), the auto-create trigger fires correctly,
     and the whole file is idempotent.
   - App code reads the current user's role client-side (tolerant fetch —
     if `profiles` doesn't exist yet, or the row's missing, the UI just
     doesn't restrict anything; the database RLS is the real boundary
     either way) via `UserRoleContext` (`src/lib/UserRoleContext.tsx`),
     provided by `AppShell`. `TopNav` shows a role badge next to the
     signed-in user's email. The 4 flagship workspaces' Comment composer
     and Approve/Reject/Delegate buttons are hidden for viewers (`canWrite`
     prop on `Comments`, `canDecide` prop on `ApprovalPanel` — both default
     `true`, so every other caller is unaffected).
   User accounts exist in the Supabase dashboard (Authentication → Users);
   confirmed live by visiting ekms.vercel.app and observing the redirect to
   `/login`.
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
     — it's built from the same real demo customer
     (`C03739`, Apple India Pvt Ltd - Bangalore) the Customer workspace
     uses, tracing their real contacts/comments/approvals.
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

- ~~No role/permission granularity~~ — closed and confirmed live:
  `supabase-role-based-rls-migration.sql` adds admin/editor/viewer roles
  (see item 6 above; `m.nandipa@icloud.com` is the current admin). No
  department/region scoping — that was explicitly the option not chosen;
  a role is uniform across every table. No admin UI for managing roles yet
  — promote/demote via the Supabase SQL editor.
- **No real financial/costing data in the schema at all.** Quote/contract/
  CRM `value` fields are pre-formatted display strings, not numbers; the 16
  lighter-module tables have no timestamps. The Costing and Finance
  dashboards were rebuilt around what's genuinely real (see item 8 above)
  rather than faking revenue/margin/DSO/cost-variance — if MMDI wants those
  numbers to be real, that needs an actual costing/finance ledger schema
  first.
- The 4 flagship workspaces' Insights/Timeline/Documents/Relationships tabs
  are sample content everywhere, on all 4 now-wired workspaces — there's no
  telemetry/consumption/downtime/budget-ledger/document-storage schema to
  back them with yet.
- Project workspace still has zero rows to point at — no project data has
  been uploaded yet, so it falls back to "most recently created row" (which
  is empty). Machine and Raw Material are now pointed at specific real
  records (`MC-HYD-001`, `RM-11001`), same as Customer.
- No real AI/LLM integration anywhere yet — all "AI insight" cards are
  static or lightly-templated copy, not generated by a model. AI Copilot's
  chat is still an illustrative demo.
- No file upload / document storage wired (Documents, Drawings, SOPs pages
  read metadata rows from Supabase but don't handle actual file storage).
- No tests.
- ~~No password reset entry point on `/login`~~ — closed: a "Forgot
  password?" link now calls `supabase.auth.resetPasswordForEmail()`
  directly from the sign-in form (see session history).

## Key files to know

- `src/lib/supabase.ts` — browser Supabase client + every row-type interface,
  including `UserRole`/`ProfileRow`. Read this first before touching any
  workspace page.
- `src/lib/UserRoleContext.tsx` — the current user's role (admin/editor/
  viewer or `null` if unknown), provided by `AppShell`, consumed via
  `useUserRole()`. Also exports `canWrite()`/`canDelete()` helpers (both
  fail-open to `true` when role is `null`, since the UI must never be the
  only thing standing between a user and a write — RLS is).
- `supabase-role-based-rls-migration.sql` — the role-based RLS migration
  (profiles table, security-definer function, auth trigger, backfill,
  bootstrap, role-aware policies on every table). Safe to re-run
  (idempotent).
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
  user):
  - Customer workspace schema (customer_contacts, customer_comments,
    customer_approvals, etc.) — run first, earliest phase. Live in production.
  - `supabase-remaining-modules-schema.sql` — the 16-table schema for the
    lighter modules listed above. Live in production.
  - `supabase-machine-rawmaterial-project-schema.sql` — **the correction to
    another wrong assumption.** The previous version of this file said the
    Machine/Raw Material/Project tables "likely exist" — they did not.
    Confirmed by the user hitting `ERROR: 42P01: relation "machines" does
    not exist` when running `import-machines.sql`. This file creates all 9
    tables (machines/raw_materials/projects + each one's
    `_comments`/`_approvals` sub-tables) with authenticated-only RLS baked
    in from the start (unlike the older tables, which started wide-open and
    needed `supabase-auth-rls-migration.sql` as a second pass, auth already
    existed by the time these were created). Validated against a real local
    Postgres instance (idempotent re-run + a downstream import both
    succeeded) before being handed to the user — **confirm it's actually
    been run before trusting that these 3 workspaces load anything.**

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

1. **Point Project at a specific real demo record** once project data
   exists — Machine and Raw Material are now done (`MC-HYD-001`,
   `RM-11001`), same pattern as Customer's `C03739`.
2. ~~Add role/permission granularity~~ — done (see item 6 in "Current
   state"). Possible follow-up: a real admin UI for managing roles instead
   of the Supabase SQL editor, if that becomes a regular need.
3. **Wire the remaining 4 tabs per flagship workspace** (Insights, Timeline,
   Documents, Relationships) to real data — needs telemetry/consumption/
   downtime/budget-ledger/document-storage tables that don't exist yet.
4. **Real AI integration** — replace static/templated "AI insight" card
   copy with actual model-generated insights, and give AI Copilot's chat
   real grounding (would need an LLM API call layer).
5. **File storage** for Documents/Drawings/SOPs (Supabase Storage buckets).
6. ~~Add a "forgot password" link on `/login`~~ — done.
7. **A real costing/finance ledger schema**, if MMDI wants the Costing and
   Finance dashboards to show actual revenue/margin/DSO/cost-variance numbers
   instead of the real-but-adjacent metrics (portfolio LTV, PO pipeline,
   supplier/SKU status) they show today.
8. **Import more real data** (machines, raw materials, projects, quotes,
   contracts, etc.) — the pattern from the Customer Master / sales register
   import (generate SQL, validate against a real local Postgres instance
   before handing it over, run in the Supabase SQL editor) extends to any
   of these.

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
12. Imported real customer data from two files the user uploaded:
    - `Customer Master.xlsx` (a Tally export, 994 rows) → 991 real
      customer/vendor accounts inserted into `customers` +  800 contacts
      into `customer_contacts` (`import-customers.sql`). Excluded a
      ledger-group header row, an accounting-adjustment row, and the Grand
      Total footer. lifetime_value/open_orders/on_time_delivery/health_score
      were left at 0 — nothing in this file backs them.
    - `Sales_day_book from 1st Apr 2026 to 30th June 2026.xlsx` (Q1 FY26-27,
      9,274 line items / 4,376 invoices) → backfilled `lifetime_value` with
      real Q1 revenue (`backfill-q1-revenue.sql`). Important finding: only
      154 of the 850 customers who actually transacted this quarter existed
      in the Customer Master (77% of revenue, ₹21.1 Cr of ₹27.3 Cr, belonged
      to real companies — Maruti Suzuki, Shoppers Stop, Godrej & Boyce, IKEA,
      Decathlon, etc. — missing from that file entirely, not a matching
      bug). Per the user's choice, created thinner records for all 696
      rather than dropping their revenue. `customers` now has 1,687 rows
      total. Both SQL files were generated then **actually executed against
      a real local Postgres instance** (`@electric-sql/pglite`, no root/
      Docker needed) to verify they run cleanly and produce the right row
      counts/FK integrity before handing them to the user — worth doing
      again for any future data import, it caught nothing this time but
      it's cheap insurance the sandbox's lack of live Supabase access makes
      otherwise impossible.
13. Repointed the Customer workspace + AI Knowledge's relationship graph
    from the fictional `CUST-MU-002104` demo record to a real imported
    customer, `C03739` (Apple India Pvt Ltd - Bangalore — highest Q1
    revenue among customers that also have a real contact on file). Fixed
    the Relationships tab's graph, whose center node was hardcoded to
    "Reliance Retail Ltd" regardless of which customer loaded. Note: this
    customer has no seeded `customer_comments`/`customer_approvals`, so the
    Activity tab's approval panel doesn't render and the comment thread
    starts empty — expected now that it's real data, not a bug.
14. Wired Machine, Raw Material, and Project workspaces to Supabase,
    finally actually closing out the gap the "Correction" section at the
    top of this file has been tracking — see item 3 in "Current state" for
    the details. Each fetches whichever row was most recently created in
    its table (no specific demo record was chosen, unlike Customer's
    `C03739`) — a reasonable next step is picking real go-to examples for
    these three too, once there's more than one row in each table to
    choose from.
15. Imported real raw material and finished goods data from `Item List.xlsx`
    (a Tally item master, 6,439 rows across 5 item types). User's message
    ("this is list of all items there are FG and raw materials too")
    scoped this to the two types actually requested:
    - **Raw material** (1,558 rows, clean — no null names/codes, no
      duplicates) → `raw_materials` (`import-raw-materials.sql`). `category`
      = the source's `Parent Name` field (genuinely populated, e.g.
      "RM - ADHESIVE MATERIALS"); `tags` = `["Unit: <Default Base Unit>"]`
      where known (e.g. "Unit: Sqf"). Like every prior import this session,
      the file carries no operational data — `current_stock`,
      `reorder_point`, `lead_time_days`, `approved_suppliers`, `unit_cost`,
      `moq`, `storage_class` are all 0/NULL, flagged in-file, pending a
      stock/procurement source. `status = 'active'` is safe here because
      `raw_materials.status` is free text never rendered as a colored
      badge — the workspace derives its low-stock badge from
      `current_stock` vs `reorder_point` instead.
    - **Finished goods** (786 rows, minus 1 excluded junk/test row
      `"TEST FG"` = 785) → the pre-existing `inventory_skus` table
      (`import-finished-goods.sql`), since that table already exists and is
      wired (Inventory module) and has no better home in the schema.
      `stock = NULL`, `status = 'neutral'`, `status_label = 'No stock data
      yet'` — chosen deliberately over `'success'`/`'danger'`, which would
      falsely claim known stock health on a pure item master with no stock
      figures.
    - Excluded (not requested, and not FG/RM): Intermediate item (3,597 —
      WIP, not sellable or stockable in the same sense), Service (458),
      Non stock item (40).
    - Both SQL files validated against a real local Postgres instance
      (`@electric-sql/pglite`) before handoff — schema applied, both files
      run cleanly, row counts match (1,558 / 785), re-running both is a
      no-op (`on conflict do nothing`), spot-checked sample rows.
    - `raw_materials` now has 1,558 rows (workspace loads a real record,
      picking whichever was most recently inserted, same pattern as
      Machine); `inventory_skus` gains 785 more real SKUs alongside
      whatever was there before. **User confirmed both files were run in
      production successfully.**

16. Pointed Machine and Raw Material workspaces at specific real demo
    records instead of "whichever row was most recently created" —
    `MC-HYD-001` (Vutek GS 3250 LX Pro, Unit 1, Hyderabad) and `RM-11001`
    (Frontlit Flex), matching the pattern already used for Customer
    (`C03739`). Project still has no data to point at.

17. Added a "Forgot password?" link to `/login`'s sign-in form. Clicking it
    swaps in an email-only form that calls
    `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/login })`
    and shows a generic "check your inbox" confirmation regardless of
    whether the email matched an account (avoids leaking which emails have
    accounts). The resulting recovery link lands back on `/login` and is
    handled by the existing invite/recovery hash detection — no new
    handling needed there. Closes the last item in "What's NOT done yet"
    that didn't require new data or a scope decision.

17. Built role-based access control: admin/editor/viewer roles instead of
    the flat "any signed-in user can do anything" model. Chosen scope (via
    a clarifying question, since this was a genuine decision only the user
    could make): simple 3-tier roles, no department/region scoping;
    enforced both at the database (RLS) and in the UI (hiding buttons a
    denied write would otherwise fail against). `supabase-role-based-
    rls-migration.sql` adds a `profiles` table, an `auth.users` trigger
    that auto-creates a 'viewer' profile for every new user, a backfill
    for existing users, and bootstraps `srinivas@mmdi.in` to admin.
    Validated against a real local Postgres instance with a stub
    `auth.users`/`auth.uid()` (the first time this session's PGlite
    validation needed to simulate Supabase's actual role/session model,
    not just run plain SQL) — confirmed the full permission matrix holds
    (viewer read-only, editor no-delete, admin everything, no-profile
    locked out) and the trigger + bootstrap + idempotency all work.
    App-side: `UserRoleContext` (new) exposes the current role via
    `useUserRole()`, fetched tolerantly in `AppShell` so nothing breaks if
    the migration hasn't been run yet; `TopNav` shows a role badge; the 4
    flagship workspaces' `Comments` composer and `ApprovalPanel` actions
    are hidden for viewers. **Not yet confirmed run in production** — do
    that before assuming role restrictions are actually live; until then
    the old authenticated-only policies still apply (harmless — code
    degrades gracefully either way).

18. User ran `supabase-role-based-rls-migration.sql` in production.
    Discovered the bootstrap step's assumption was wrong (see the
    correction in item 6 of "Current state") via a screenshot of
    Authentication → Users showing the real accounts, none of which was
    `srinivas@mmdi.in`. Fixed by running the correct `UPDATE` directly and
    updating the migration file to match, so a future fresh deployment
    bootstraps the right person. Verified via `select email, role,
    created_at from public.profiles` — all 3 real users have a role,
    `m.nandipa@icloud.com` is admin, the other two are viewer. Role-based
    access control is now genuinely live, not just shipped.
