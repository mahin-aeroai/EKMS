# MMDI ONE — Project Status

Last updated: 15 July 2026 (session: auth + role-based access control +
all 6 dashboards + all 4 flagship workspaces wired, plus real customer/
revenue/machine/raw-material/finished-goods/job-order data imported;
"Projects" replaced with a real "Job Orders" workspace)

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
register), not just seed/demo rows. The 4th flagship workspace is "Job
Orders" (`/workspaces/job-orders`), not "Projects" — MMDI's real unit of
work is a job order, and the workspace + schema were rebuilt around that
partway through this session (2,072 real job orders imported).

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
3. **4 flagship workspaces** — Customer, Machine, Raw Material, Job Orders
   (renamed from "Projects" this session — see below) — each uses the full
   6-tab Universal Workspace Pattern (Overview / Insights / Timeline /
   Documents / Relationships / Activity), with a Server/Client split
   matching the Customer workspace's original pattern (see
   `src/lib/supabase-server.ts`). The stat row, a real spec/info panel, and
   the Activity tab (comments + approvals, writable) are real for all 4.
   Insights/Timeline/Documents remain illustrative sample content on all 4
   (no sensor telemetry, consumption/downtime log, budget ledger, or
   document-storage schema exists to back them) — **except** Job Orders'
   Timeline tab, which is real (order date / production start / production
   end are genuine columns).
   - **"Projects" → "Job Orders"**: the generic `projects` table
     (sponsor/budget_utilization/schedule_health/open_risks) never matched
     how MMDI actually works — the user clarified they run job orders, not
     projects in that sense. Replaced with a purpose-built `job_orders`
     table (customer, machine, substrate application, qty/sqft/value,
     status, dates — see `supabase-job-orders-schema.sql`), imported from a
     real production report (`import-job-orders.sql`, from "Production
     Report FY2026_Q1.xlsx" — 2,072 job orders aggregated from 10,055
     production line items, Hyderabad plant, Apr–Jun 2026). The route moved
     from `/workspaces/project` to `/workspaces/job-orders`; the old route
     now just redirects there (old links/bookmarks still work). The old
     `projects`/`project_comments`/`project_approvals` tables and
     `ProjectRow`/`ProjectCommentRow`/`ProjectApprovalRow` types are left in
     place, unused, rather than dropped — `ProjectWorkspaceClient.tsx` was
     deleted since nothing routes to it anymore.
   - Server pages (`src/app/workspaces/{customer,machine,raw-material,job-orders}/page.tsx`)
     fetch a specific real record by code (Customer/Machine/Raw
     Material/Job Orders all now do this — see below) rather than "most
     recently created row" everywhere.
   - `machines` (73 rows) and `raw_materials` (1,558 rows) have real
     imported data. `job_orders` has 2,072 rows (see above).
   - Customer workspace specifically is pointed at a real imported customer
     — `C03739` (Apple India Pvt Ltd - Bangalore, the real customer with the
     highest Q1 revenue and a real contact on file) — not the original
     fictional "Reliance Retail Ltd" demo record, which is still sitting in
     the table under code `CUST-MU-002104` unused.
   - Machine, Raw Material, and Job Orders workspaces are now also pointed
     at specific real demo records (same pattern): `MC-HYD-001` (Vutek GS
     3250 LX Pro, Unit 1, Hyderabad), `RM-11001` (Frontlit Flex, a core
     signage substrate), and Job Order `7455` (Shark Shopfits Private
     Limited, ₹14.7L — the highest-value job order that isn't an internal
     "BASIL"/"CASH SALES" bucket and has a confident customer_id link, for
     the fullest demo).
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
   - **AI Copilot**: originally an illustrative demo; **now genuinely real**
     (see item 20 in session history) — real Claude API calls grounded in
     live Supabase data via tool use, not a canned response. Its 3 stat
     cards still show real cross-table counts.
   - New shared helper: `src/lib/dashboard-queries.ts` (`getCount`,
     `getCountWhere`, `groupCount`, `groupSum`, `statusDonutData`,
     `formatCrore`) — used by all 6 pages to avoid re-implementing the same
     count/group-by logic six times.

## What's NOT done yet (known gaps)

- ~~No role/permission granularity~~ — closed and confirmed live:
  `supabase-role-based-rls-migration.sql` adds admin/editor/viewer roles
  (see item 6 above; `m.nandipa@icloud.com` is the current admin). ~~No
  department/region scoping~~ — partially closed, see item 24: a second,
  independent axis (module access, scoped to the 8 real sidebar groups)
  now exists on top of role, so e.g. a salesperson can be limited to
  Customers-group data regardless of their role. ~~No admin UI for
  managing roles yet~~ — closed, see item 23: the Administration workspace
  now has a real "Users & roles" panel (extended in item 24 to also manage
  module access).
- **No real financial/costing data in the schema at all.** Quote/contract/
  CRM `value` fields are pre-formatted display strings, not numbers; the 16
  lighter-module tables have no timestamps. The Costing and Finance
  dashboards were rebuilt around what's genuinely real (see item 8 above)
  rather than faking revenue/margin/DSO/cost-variance — if MMDI wants those
  numbers to be real, that needs an actual costing/finance ledger schema
  first.
- The 4 flagship workspaces' Insights/Documents/Relationships tabs are
  sample content everywhere — there's no telemetry/consumption/downtime/
  budget-ledger/document-storage schema to back them with yet. (Job
  Orders' Timeline tab is the one exception — it's real.)
- ~~Customer Workspace always showed one hardcoded demo customer~~ — closed,
  see item 27: `/workspaces/customer` is now a real searchable list, and
  any customer opens at `/workspaces/customer/[code]`. Machine, Raw
  Material, and Job Orders still work the old way (one fixed demo record
  each, `MC-HYD-001` / `RM-11001` / Job Order `7455`) — not yet extended to
  a list+detail pattern, only Customer was requested so far.
- Only 598 of 2,072 job orders (29%) are linked to a real `customers` row
  via `customer_id` — the rest keep `customer_name` as text only. This
  wasn't fuzzy-matched on purpose (branch-suffix and naming variants like
  "Pvt Ltd" vs "PRIVATE LIMITED" made that too risky to guess at scale —
  see `import-job-orders.sql`'s header comment). Revisit if MMDI wants a
  cleaner match — likely needs either a real code-based join key from the
  production system, or manual reconciliation of the ~187 distinct
  unmatched customer names.
- `job_orders.status` ('Completed' / 'In Progress') is inferred from the
  source file's single-letter Job Status code ('C'/'I') — the column is
  literally named "Job Status (Lost Hold transfer)", implying more codes
  exist in other exports that don't appear in this one. Not confirmed with
  the user.
- Only Hyderabad plant data has been imported into `job_orders` (that's
  all "Production Report FY2026_Q1.xlsx" covered) — other plant cities
  (Chennai, Bangalore, Mumbai, Noida, Kochi, Vizag, Kolkata, per the
  machines import) have no job order data yet.
- Every "AI insight" card (the purple "AI recommendation" boxes with
  Accept/Dismiss) is still static/lightly-templated copy, not generated by
  a model — that's unchanged. Every "Ask [about/AI]" free-text box IS now
  real, though: the AI Copilot workspace chat, the global Ask AI drawer,
  AND the 4 flagship workspaces' "Ask about this record" boxes all call
  the same `/api/ai-copilot` route (see items 20, 25, 26 in session
  history). Requires `ANTHROPIC_API_KEY` set in Vercel — without it, every
  one of these surfaces shows a clear "not configured" message rather than
  crashing.
- The AI Copilot could only answer sales questions shaped like "how much
  did customer X buy" (via `customers.lifetime_value` / `job_orders.
  total_value`) — it had no way to break sales down by material/product
  category, sales person, or time period, because that line-item detail
  was never imported anywhere (only per-customer Q1 totals existed). Closed
  by item 28: a new `sales_transactions` table (9,274 real line items) plus
  two new AI Copilot tools (`sales_summary`, `search_sale_items`).
- No file upload / document storage wired (Documents, Drawings, SOPs pages
  read metadata rows from Supabase but don't handle actual file storage).
- No tests.
- ~~No password reset entry point on `/login`~~ — closed: a "Forgot
  password?" link now calls `supabase.auth.resetPasswordForEmail()`
  directly from the sign-in form (see session history).

## Key files to know

- `src/app/api/ai-copilot/route.ts` — the AI Copilot's real backend. Needs
  `ANTHROPIC_API_KEY` set as a Vercel environment variable (server-side
  only, never sent to the client) — without it, returns a clear 503 rather
  than crashing. Model is hardcoded to `claude-sonnet-5`; change the
  `MODEL` constant to swap it. Uses Claude tool use (not prompt-stuffing)
  to ground answers in live `customers`/`job_orders`/`machines`/
  `raw_materials`/approvals/`compliance_findings` data — see the file's
  top comment for the reasoning.
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
- `src/app/workspaces/*/page.tsx` — one folder per module. `customer`,
  `machine`, `raw-material`, and `job-orders` delegate to a Server/Client
  split (`src/components/workspaces/*.tsx`); the other 22 (+ `project`,
  now just a redirect) are self-contained.
- `supabase-auth-rls-migration.sql` — the first RLS migration (authenticated-
  only), already run in production. Superseded by
  `supabase-role-based-rls-migration.sql` for tables both files touch, but
  still the only RLS ever applied to the original ~28 tables it lists.
- `src/lib/dashboard-queries.ts` — shared count/group-by helpers
  (`getCount`, `getCountWhere`, `groupCount`, `groupSum`, `statusDonutData`,
  `formatCrore`) used by all 6 aggregation dashboards.
- SQL files (all committed to the repo root, all idempotent, all validated
  against a real local Postgres instance via `@electric-sql/pglite` before
  being handed off — confirm each has actually been run in production
  before trusting the workspace/data it backs, except where marked
  confirmed below):
  - Customer workspace schema (customer_contacts, customer_comments,
    customer_approvals, etc.) — run first, earliest phase. Live in production.
  - `supabase-remaining-modules-schema.sql` — the 16-table schema for the
    lighter modules listed above. Live in production.
  - `supabase-machine-rawmaterial-project-schema.sql` — creates
    machines/raw_materials/projects + each one's `_comments`/`_approvals`
    sub-tables (9 tables), authenticated-only RLS (written before the role
    migration existed). Live in production. `projects` etc. are unused now
    (see Job Orders above) but left in place.
  - `import-machines.sql` / `import-raw-materials.sql` /
    `import-finished-goods.sql` — real data imports, all confirmed run.
  - `supabase-role-based-rls-migration.sql` — role-based RLS (see item 6
    above). Live in production, confirmed 15 July 2026.
  - `supabase-job-orders-schema.sql` — creates job_orders/job_order_comments/
    job_order_approvals with role-aware RLS baked in from the start (the
    first schema file written after the role migration existed — every
    schema file before this one only had authenticated-only RLS). **Confirmed
    run in production.**
  - `import-job-orders.sql` — 2,072 job orders from Production Report
    FY2026_Q1.xlsx. **Confirmed run in production.**
  - `correct-q1-revenue-taxable-value.sql` — corrects `lifetime_value` for
    the same 850 customers `backfill-q1-revenue.sql` touched, switching
    from Voucher amount (GST-inclusive, deduped per invoice) to Taxable
    Value (pre-GST, summed per line item) — see item 22. Idempotent,
    UPDATE-only. **Not yet run in production — run this next.**

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

1. ~~Point Machine/Raw Material/Job Orders at specific real demo
   records~~ — done for all 4 flagship workspaces now (`C03739`,
   `MC-HYD-001`, `RM-11001`, Job Order `7455`).
   Possible follow-up: reconcile the 1,474 unmatched job-order customer
   names against `customers` (see gap above) if MMDI wants that link
   cleaner than "text-only, 29% linked.".
2. ~~Add role/permission granularity~~ — done (see item 6 in "Current
   state"). ~~Possible follow-up: a real admin UI for managing roles~~ —
   done, see item 23.
3. **Wire the remaining 4 tabs per flagship workspace** (Insights, Timeline,
   Documents, Relationships) to real data — needs telemetry/consumption/
   downtime/budget-ledger/document-storage tables that don't exist yet.
4. ~~Real AI integration for AI Copilot~~ — done (see item 20 in session
   history). Two follow-ups if wanted: (a) extend real grounding to the 4
   flagship workspaces' "Ask about this record" boxes (explicitly deferred
   — chose AI Copilot only as the first version), (b) replace the other
   static/templated "AI insight" cards elsewhere with real model output.
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

19. User clarified: MMDI doesn't run "projects" — the actual unit of work
    is a job order. Replaced the generic Projects workspace entirely:
    - Uploaded `Production Report FY2026_Q1.xlsx`, a real Hyderabad-plant
      job-order-level production log (10,055 line items, 2,072 distinct
      job orders, Apr–Jun 2026, ~5 lines/job order on average, max 220).
      Confirmed per-job-order fields (customer, application, sales person,
      Job Status, location) are internally consistent across every line —
      aggregation to one header row per job order was straightforward.
    - Three genuine scope decisions surfaced via a clarifying question
      before writing any code: (1) header-only aggregation vs. also
      keeping all 10,055 line items — chose headers only; (2) how to
      handle the ~71% of job orders whose customer name doesn't exactly
      match an existing `customers` row (branch-suffix and "Pvt Ltd" vs.
      "PRIVATE LIMITED" naming variants, some inconsistent even within
      this one file) — chose to store the raw name as text always and
      link `customer_id` only on confident exact (normalized) matches,
      rather than fuzzy-match or fabricate new customer records; (3)
      whether to force-fit this into the existing `projects` schema or
      build a real one — chose a purpose-built `job_orders` table and
      renamed the workspace.
    - Also discovered mid-exploration: the source file explicitly told me
      not to match on customer code, but it turned out to have a hidden,
      fully-populated customer-code column (blank header, "Unnamed: 41" in
      pandas) — flagged this to keep in mind, but respected the user's
      explicit instruction to match on name only rather than overriding it.
    - Built `supabase-job-orders-schema.sql` (job_orders +
      job_order_comments + job_order_approvals, role-aware RLS baked in
      from creation — the first schema file written after the role
      migration existed) and `import-job-orders.sql` (2,072 rows,
      total_value computed per line as Sqft×Rate or Qty×Rate depending on
      the source's Price Type, status inferred from a 'C'/'I' code flagged
      as unconfirmed). Validated end-to-end against a real local Postgres
      instance — loaded the actual production customers data first (so
      the customer_id foreign key exercises real matching UUIDs), ran the
      role migration, then the new schema and import, confirmed exact row
      counts (2,072 job orders, 598 linked to a customer), zero dangling
      foreign keys, and idempotency on a second run.
    - Built `JobOrderWorkspaceClient.tsx` (new) modeled on the old
      `ProjectWorkspaceClient.tsx` but with real fields throughout:
      Overview info panel, stat row (total value/sqft/qty/line items), and
      — unlike every other flagship workspace — a genuinely real Timeline
      tab (order date → production start → production end are real
      columns, not sample data). Insights/Documents/Relationships stay
      illustrative, same reasoning as the other 3 workspaces.
    - Route moved from `/workspaces/project` to `/workspaces/job-orders`;
      the old route now just `redirect()`s there rather than 404ing.
      `ProjectWorkspaceClient.tsx` deleted (nothing referenced it anymore);
      the old `projects`/`project_comments`/`project_approvals` tables and
      TS types are left in place, unused, rather than dropped. Nav label
      changed from "Projects" to "Job Orders" in `AppShell.tsx`.
    - Pointed the workspace at Job Order `7455` (Shark Shopfits Private
      Limited, ₹14.7L) as the demo record — the highest-value real job
      order that isn't an internal "BASIL"/"CASH SALES" bucket (both show
      up misleadingly high in the raw value ranking) and has a confident
      customer link, for the fullest relationship-graph demo.
    - Build and lint both clean. **User confirmed both
      `supabase-job-orders-schema.sql` and `import-job-orders.sql` were run
      successfully in production** — Job Orders workspace is now genuinely
      live, not just shipped.

20. Built real AI/LLM grounding for the AI Copilot workspace — the first
    (and, per a clarifying question, the only) surface in the app backed
    by an actual model call; every other "AI insight" card everywhere else
    remains static/templated copy, unchanged. Two scope questions were
    asked before writing code: (1) how big a first version — chose AI
    Copilot only, not also the 4 flagship workspaces' "Ask about this
    record" boxes; (2) API key handling — user will create an Anthropic
    key themselves and add it to Vercel directly, so I never see the raw
    key. Implementation:
    - `src/app/api/ai-copilot/route.ts` (new): a Next.js Route Handler
      (server-only, so `ANTHROPIC_API_KEY` never reaches the client) using
      `@anthropic-ai/sdk` (added as a dependency) with `claude-sonnet-5`.
      Chose Claude tool use over prompt-stuffing: rather than guessing what
      data might be relevant and cramming it into the system prompt
      upfront, Claude gets 8 read-only tools backed by real Supabase
      queries (search/get customers, search/get job orders, search
      machines, search raw materials, list pending approvals across all 4
      writable workspaces, list compliance findings) and decides what to
      look up per question — a real, if small, agentic loop (call model →
      if it requests a tool, run the real query → feed the result back →
      repeat, capped at 5 iterations). Citations returned to the client are
      built from which tools actually got called, not guessed.
    - Gracefully degrades if `ANTHROPIC_API_KEY` isn't set: returns a 503
      with a clear message instead of crashing; the client shows a toast
      explaining exactly what's missing rather than a generic error.
    - `src/components/ui/AIConversation.tsx` gained a `loading` prop
      (thinking indicator + disables the input while a response is in
      flight) — backward compatible, defaults to `false`.
    - `src/app/workspaces/ai-copilot/page.tsx`: `handleSend` now actually
      calls the new route instead of returning a hardcoded string; removed
      the two seeded demo turns that used to pre-populate the conversation
      (the fictional "IKEA Wardrobe Program" exchange) — the chat starts
      empty now, same as any other message app.
    - Verified via a clean `next build` (full TypeScript check, including
      the Anthropic SDK's fairly intricate content-block types) and
      `next lint` — could not test an actual end-to-end model call in this
      sandbox (no API key, no outbound access to Anthropic's API), so this
      is unusually not-yet-live-tested compared to everything else this
      session; **the user should send a real test message once
      `ANTHROPIC_API_KEY` is set in Vercel and report back if anything
      looks wrong.**

21. User's first real test of the AI Copilot surfaced a genuine bug: asked
    for ITC Limited's sales figures, got Rs2.35L; the user's own Excel
    said Rs72.63L. Investigated using the original source files still on
    hand (Sales_day_book...xlsx) rather than guessing — confirmed the
    underlying data was actually correct and complete (ITC's ~33
    site-level accounts total ~Rs86L in Q1 revenue, matching both
    `import-customers.sql` and `backfill-q1-revenue.sql` correctly). The
    bug was entirely in the AI Copilot's `search_customers` tool: no
    `ORDER BY` on a name search that can match dozens of rows (like
    "ITC"), capped at a small limit, so it silently returned an arbitrary
    low-value slice and Claude summed only what it saw. Also fixed in the
    same pass: Claude was writing markdown tables the plain-text chat UI
    can't render (system prompt now says so explicitly, and message
    rendering got `whitespace-pre-line` so line breaks in lists actually
    show). Real fix for the totals bug: `search_customers` and
    `search_job_orders` now run two Supabase queries — one unlimited
    aggregate (true SUM/COUNT across every match) and one value-sorted
    top-20 for detail — and both the tool descriptions and system prompt
    tell Claude to always use the aggregate fields for sum/total questions
    rather than adding up the capped list itself. This is the first bug
    caught in production this session by the user actually using a
    feature rather than by validation before handoff — a good reminder
    that PGlite/build/lint validation catches structural problems, not
    "does this specific tool call return a materially misleading answer."

22. Corrected `customers.lifetime_value` to use the right revenue metric.
    User flagged the AI Copilot's ITC sales figure as wrong even after
    item 21's fix, and pasted their own Excel pivot table (ITC Group, Sum
    of Taxable Value, Grand Total Rs72,63,660.00) as ground truth.
    Investigated directly against the original source file
    (`Sales_day_book from 1st Apr 2026 to 30th June 2026.xlsx`) rather than
    guessing: computing "Taxable Value" (pre-GST) summed across every line
    item per customer — NOT "Voucher amount" (GST-inclusive) deduplicated
    to one row per invoice, which is what `backfill-q1-revenue.sql`
    (item 12) actually used — reproduces all 31 ITC-entity figures in the
    user's pivot to the rupee, with the total matching exactly once
    accounting for "ITC Limited Food Divison - Mumbai" (code `C03862`), a
    real, separately-coded customer the user's pivot filter doesn't
    include under "ITC Group" (not a bug — that customer already has its
    own row in `customers`, distinct from every other ITC entity).
    Confirmed with the user this was the right basis ("yes go ahead with
    taxable value") before touching data, consistent with this session's
    pattern of not making broad corrections unilaterally.
    Since the discrepancy was structural (wrong metric, wrong aggregation
    level), not ITC-specific, it affected `lifetime_value` for all 850
    customers item 12's backfill touched, not just ITC:
    company-wide Taxable Value sums to Rs23.17 Cr for Q1 vs. the original
    Rs27.34 Cr under the Voucher-amount basis — roughly the GST component,
    consistent with moving from a tax-inclusive to a tax-exclusive figure.
    Wrote `correct-q1-revenue-taxable-value.sql` (new, repo root,
    generated by `~/work/import/gen_revenue_correction_sql.py`): a single
    idempotent `UPDATE customers SET lifetime_value = ... WHERE code = ...`
    covering the same 850 customer codes as the original backfill (all of
    which now exist as real rows, both the 154 originally matched and the
    696 originally inserted — so this is UPDATE-only, no INSERT needed),
    plus a verification `SELECT` confirming the touched rows sum close to
    the Rs23.17 Cr total. Validated against a real local Postgres instance
    (`@electric-sql/pglite`) by seeding all 850 codes as if the original
    backfill had already run, applying the correction, and spot-checking
    known ITC codes (e.g. `C03739` → Rs1,76,25,514; `C03862` → Rs57,112)
    against the user's pivot figures — matches. **Not yet run in
    production** — hand this off next; until it's run, `lifetime_value`
    company-wide still reflects the old (wrong) Voucher-amount basis, which
    means the Finance dashboard's portfolio LTV total and every AI Copilot
    answer about revenue/sales are currently overstated by roughly the GST
    proportion (~15%) for any customer touched by the Q1 backfill.

23. Built a real admin UI for user role management on the existing
    Administration workspace (`src/app/workspaces/administration/page.tsx`),
    closing the last open item from the role-based-access-control work
    (item 6/18) — promoting/demoting a user no longer requires the
    Supabase SQL editor. Added a "Users & roles" panel: fetches every
    `profiles` row, and — for admins only (gated by the existing
    `useUserRole()` hook) — renders each row's role as an editable
    `<select>` that calls `supabase.from("profiles").update({ role })`
    directly; non-admins see their own role as a read-only badge instead
    of the dropdown, with a note that only admins can manage roles.
    No new RLS was needed: `profiles_update_admin` (from
    `supabase-role-based-rls-migration.sql`) already allows any admin to
    update any profile's role, and `profiles_select_own_or_admin` already
    means a non-admin's query naturally returns only their own row — the
    UI just needed to exist. Also replaced two of the panel's stat cards
    that were previously hardcoded/illustrative ("Active Users: 248",
    "Roles Configured: 16") with real ones: user count from `profiles`,
    and "3" for roles configured (admin/editor/viewer, the fixed set this
    system actually has).
    One safeguard added: if an admin tries to demote *themselves* away
    from admin, a confirmation dialog warns that if they're the only
    admin, no one will be able to manage roles from this page afterward
    (recovery would require an UPDATE via the Supabase SQL editor, same as
    before this feature existed) — everything else applies immediately, no
    confirmation needed.
    "Joined" date uses the existing `timeAgo()` helper (already used the
    same way in 4+ other workspace clients) rather than the deterministic-
    date-formatter pattern from Job Orders — safe here specifically
    because this page fetches all data client-side in `useEffect` after
    mount, so there's no server-rendered HTML for it to mismatch against
    (the Job Orders bug happened in a Server Component rendering a date
    synchronously into the initial HTML).
    Verified via a clean `next build` (including the new page's route in
    the static page list) and `next lint`. **Not yet confirmed run/tested
    in production** — this only needed a code change, no new SQL, so
    there's nothing to "run," but the user should open Administration as
    an admin and confirm the role dropdown actually updates Supabase.

24. Added module-level access scoping — a second, independent axis on top
    of admin/editor/viewer roles, per the user's request ("a sales person
    can access customer and crm data") and two scoping decisions made via
    clarifying questions before writing code: (1) granularity is the 8
    existing sidebar business-domain groups (Customers, Operations,
    Manufacturing, Knowledge, People, Finance, Compliance, Administration)
    — not individual modules, not a new department concept; (2) default is
    unrestricted (NULL), so nobody's access changes until an admin
    explicitly scopes someone down, same rollout pattern as roles
    themselves. Executive (Command Center/AI Copilot/Analytics) is
    deliberately NOT a scoped group — it's cross-cutting and stays visible
    to everyone; a restricted user just sees zeroes/partial data there for
    anything outside their access, which isn't a leak since the same RLS
    still applies underneath.
    `supabase-module-access-migration.sql` (new, run AFTER the role
    migration and the job orders schema): adds `profiles.allowed_groups
    text[]` (nullable), a `user_has_group_access(required_groups)`
    security-definer function (admins always bypass; NULL allowed_groups
    always bypasses), and re-layers every table's role-based RLS policies
    (drop + recreate, same idempotent pattern as before) to also require
    group access. Table-to-group mapping was derived by actually checking
    each dashboard/workspace page's live Supabase queries, not guessed —
    this caught that `customers` and `contracts` genuinely serve two
    groups (Customers workspace AND the Finance dashboard's portfolio LTV
    figure), so those two tables are granted by either group, not forced
    into one bucket.
    Caught one real bug during PGlite validation before handoff: the
    first draft of the migration never re-enabled RLS on tables it didn't
    already own (only supabase-job-orders-schema.sql had done that for
    job_orders), so a user restricted away from Operations could still
    read job_orders — fixed by adding `ALTER TABLE ... ENABLE ROW LEVEL
    SECURITY` into the same loop, matching every prior migration's
    pattern. After the fix, validated: a viewer scoped to Customers reads
    customers/contracts but is denied job_orders/raw_materials/documents/
    employees/compliance_findings/access_requests; an editor scoped to
    Operations can read AND write job_orders but is denied customers;
    admins and unscoped (NULL) users still see everything; the file is
    idempotent.
    App side: new `src/lib/UserGroupsContext.tsx` (`useAllowedGroups()`,
    `canAccessGroup()`) mirrors the existing `UserRoleContext` pattern —
    kept separate rather than reshaping `UserRoleContext` itself, so every
    existing consumer of `useUserRole()` (TopNav, the 4 flagship
    workspaces' Comments/ApprovalPanel gating, Administration) needed zero
    changes. `AppShell.tsx` now fetches `allowed_groups` alongside `role`
    in the same query, and filters the sidebar's `NAV` sections through a
    `SECTION_GROUP` title-to-group map before rendering `Sidebar` and the
    command palette — admins and unscoped users see every section,
    unchanged from before this feature existed.
    Administration's "Users & roles" panel (from item 23) gained a
    "Module access" column: a compact local multi-select (not the design
    system's `Dropdown` component, which always renders its own label —
    wrong fit repeated per table row) showing "All modules" when
    unrestricted, or the specific groups when scoped, admin-only, with a
    "Reset to all modules" action. Deselecting everything writes NULL
    (unrestricted), not an empty array — an empty array would mean "no
    module access at all," the opposite of what an empty selection should
    mean.
    Verified via a clean `next build` and `next lint`. **Not yet run in
    production** — hand off `supabase-module-access-migration.sql` next;
    until it's run, `profiles.allowed_groups` doesn't exist yet and every
    user continues to see everything (fail-open), so nothing breaks in the
    meantime.

25. Fixed the global "Ask AI" drawer (the assistant opened from the top nav
    on every single page, and from the command palette) — it was still
    showing the original hardcoded canned response from before real AI
    integration existed ("This is a demo response showing the AI
    Conversation component's shape…"), even though the dedicated AI
    Copilot workspace page (item 20) had been wired to the real
    `/api/ai-copilot` route since that work. The dedicated page's own
    subtitle already claimed to be "the same assistant available from
    every workspace" — this was the one place that promise wasn't true
    yet. User caught it directly ("on each page copilot is not working").
    Fix: `AppShell.tsx`'s `handleSend` now mirrors the dedicated page's
    logic exactly — posts the running conversation to `/api/ai-copilot`,
    shows a loading state on the drawer's `AIConversation` while waiting,
    and toasts the same `not_configured`/generic-error messages on
    failure. Conversation history and loading state stay owned by
    `AppShell` (not the AI Copilot page) since the drawer persists across
    navigation between workspaces, unlike a single page's local state.
    Verified via a clean `next build` and `next lint`. No SQL, no new
    scope decision — this was a straightforward bug (two AI surfaces that
    were supposed to share one backend, only one of which actually did).

26. Found the real bug behind the user's report that "on each page copilot
    is not working" — it was never the global Ask AI drawer (that turned
    out to be a separate, real bug, fixed in item 25). The actual surfaces
    the user meant were the 4 flagship workspaces' embedded "Ask about
    this account/machine/material/job order" boxes — these had been pure
    demos since they were first built: `onSubmit={(v) => toast("ai",
    \`AI Assistant is looking into: "${v}"\`)}`, no real call, no answer
    ever displayed anywhere, just a toast that appears and disappears —
    exactly matching the user's description ("message just comes and
    disappear"), confirmed via a screenshot showing that toast on the
    Customer workspace. This was previously flagged in this file as
    "deliberately out of scope" for the AI Copilot work (item 20), but the
    user now wants it wired for real, and diagnosing the drawer bug first
    (item 25, genuinely broken, worth fixing regardless) helped isolate
    that THIS was the actual complaint once that didn't turn out to be it.
    New `src/lib/useRecordCopilot.ts`: reuses the exact same
    `/api/ai-copilot` route and tool-use loop as every other AI surface —
    no backend changes needed. The only new idea is a `contextPrefix`
    string prepended to the question (e.g. "The user is viewing Customer
    C03739 (Apple India Pvt Ltd - Bangalore) in MMDI ONE."), so a vague
    question like "summarize open risk on this account" resolves against
    the right record without the person naming it — Claude's existing
    tools (`get_customer`, `get_job_order`, etc.) still do the actual
    lookup. Each box is single question/answer (a new question replaces
    the previous answer), not a running thread — there's no room for a
    full conversation in these panels.
    Wired into all 4 flagship workspace clients (Customer, Machine, Raw
    Material, Job Orders): each now calls `ask()` from the shared hook
    with its own record's context prefix, shows a "looking into it…"
    line while loading, and renders the real answer (with citations, if
    any) in a small panel below the input — all of which previously
    didn't exist at all for these boxes.
    Verified via a clean `next build` and `next lint`. Not yet tested by
    the user against the live deployment.

27. Replaced the Customer Workspace's hardcoded single demo record with a
    real searchable list + dynamic detail route. User noticed every visit
    to Customer Workspace always showed the same company ("why always
    apple") and asked for a real list once it was explained that
    `/workspaces/customer` had been hardcoded to customer `C03739` (Apple
    India Pvt Ltd - Bangalore) since the very first version of this
    workspace — a deliberate shortcut at the time, never revisited.
    `/workspaces/customer/page.tsx` is now a real list page (Client
    Component): a debounced search box (name or code, 250ms), a live
    Supabase query (`ilike` on name/code, ordered by lifetime_value,
    capped at 50 rows — with 1,687 real customers this can't load
    everything at once), real stat cards (total customer count via a
    `count: "exact"` query, how many rows are currently shown, combined
    lifetime value of just the shown rows), and a `Table` whose row click
    navigates to the customer.
    The old detail-view logic (fetch one customer + contacts/comments/
    approvals, render `CustomerWorkspaceClient`) moved to a new dynamic
    route, `/workspaces/customer/[code]/page.tsx` — this app's first
    dynamic route. Uses `notFound()` for a code that doesn't exist rather
    than the old hardcoded-always-succeeds assumption. The breadcrumb's
    "Customers" link (already pointed at `/workspaces/customer`) now
    correctly lands on the real list instead of redisplaying the same demo
    customer.
    Verified via a clean `next build` and `next lint` (build output shows
    both `/workspaces/customer` as static and `/workspaces/customer/[code]`
    as dynamic, as expected). Not yet tested against the live deployment.
    Scope note: only Customer got this treatment — Machine, Raw Material,
    and Job Orders workspaces still show one fixed demo record each. Doing
    the same for those wasn't requested yet; flagged as a natural follow-up
    in "What's NOT done yet" above.

28. Gave the AI Copilot real data and tools to answer sales analytics
    questions — user listed several ("material category wise sales, sales
    person sales, weekly sale, monthly sale, total sale, customer wise
    sale, product group wise sale, price details, machine detail") and
    said some weren't working; a clarifying question narrowed it to
    "no data found" for material category, sales person, and product
    group/price/machine-detail style questions.
    Root cause: every prior sales figure in the app (`customers.
    lifetime_value`, the Finance dashboard) was a per-customer Q1 TOTAL,
    aggregated away from the underlying line items — there was no table
    anywhere with material category, sales person, or per-item price detail,
    because that granularity was dropped during aggregation when
    `backfill-q1-revenue.sql` was built (see item 12).
    Checked the original source file (`Sales_day_book from 1st Apr 2026 to
    30th June 2026.xlsx`, 45 columns, 9,274 line items) column-by-column
    rather than guessing which fields would answer this — caught a real
    trap early: the file has an actual column literally named "Product
    Category", but it's the constant string "Normal" on every single row
    and useless as a category. The real material/product type is in the
    "Item" column (e.g. "SD FLEX BLACKOUT", "NONLIT SIGNAGE", "HSD FABRIC -
    Biodegradable"). Also found "Sales Manager" (the real sales-person
    field), "Price Type" (NOS vs SQFT, the pricing basis — same field
    `import-job-orders.sql` used), and "Rate" (per-unit price).
    New `supabase-sales-transactions-schema.sql` + `import-sales-
    transactions.sql`: imports all 9,274 line items into a new
    `sales_transactions` table, narrowed to 16 columns (dropped Brand/
    Campaign/PO/DC dates/HSN/dimensions/individual tax-component columns —
    GST% + Taxable Value + Voucher amount already cover "how much tax"
    without 4 extra columns). `customer_id` is looked up by a per-row
    subquery against `customers.code` rather than precomputed — matched
    100% (9,274/9,274), since `backfill-q1-revenue.sql`'s earlier 696-row
    INSERT already created every customer code this file references.
    `taxable_value` is the metric throughout (not Voucher amount), per the
    correction in item 22. RLS is role-aware AND group-scoped from
    creation (same two groups as `customers`/`contracts`: 'customers' and
    'finance'), calling `public.user_role()` and `public.user_has_group_
    access()` directly — both already live in production, no need to touch
    either older migration file.
    Validated via PGlite: loaded the actual `import-customers.sql` +
    `backfill-q1-revenue.sql` + role migration + module-access migration
    first (so this exercises real customer codes and real RLS functions,
    not stubs), then the new schema (twice, confirming idempotency) and
    import. Confirmed: 9,274/9,274 rows, 100% customer match, `sum(taxable_
    value)` = ₹23,17,14,099.89 (exact match to the company-wide figure
    already confirmed in item 22), sane top-5 product categories by value,
    and RLS behaving correctly (a finance-scoped viewer sees all rows, an
    operations-scoped viewer sees none, admin sees everything).
    Two new tools in `src/app/api/ai-copilot/route.ts`:
    - `sales_summary(group_by, date_from?, date_to?, top_n?)` — group_by is
      one of product_category/sales_manager/customer/month/week/day.
      Fetches matching rows (whole quarter is only 9,274 rows, small enough
      to aggregate in the route itself rather than needing a Postgres RPC
      function) and returns a grand total for the filtered range PLUS a
      grouped breakdown — so it doubles as the "total sales" answer when
      asked without a specific breakdown in mind.
    - `search_sale_items(query)` — matches item code/description/product
      category, returns matching line items (with rate) plus an aggregate
      average rate and total taxable value, for "price details" questions.
    System prompt updated to point Claude at these tools for sales
    questions and to reinforce that "sales" means Taxable Value, never
    Voucher amount.
    Verified via a clean `next build` and `next lint`. **Not yet run in
    production** — both SQL files need to be run (schema first, then
    import), and the code needs to be pushed, before any of this is live.

29. Extended `sales_summary` (item 28) to support combined filter+group
    queries after the user hit a real gap testing it: asked "Jayaraj sales
    in June" (worked — group_by=sales_manager), then followed up "show his
    customers", which the tool couldn't answer at all — it could only
    group by ONE dimension with no way to filter to a specific sales
    person first. Added three optional filter params (`sales_manager_
    filter`, `customer_filter`, `product_category_filter`), applied as
    `ilike` filters before the grouping/aggregation step, so "which
    customers did Jayaraj sell to in June" is now one call:
    `group_by: "customer", sales_manager_filter: "Jayaraj", date_from/
    date_to for June`. Result payload now echoes back `filters_applied` so
    the answer is verifiable, and the citation reflects whatever filters
    were actually used. Verified via a clean `next build` and `next lint`.
    **Not yet run in production** — needs the same `route.ts` push as item
    28 (this is an extension of the same file, not a separate deploy).

30. Made the AI Copilot workspace's chat panel taller, then dialed it back.
    User asked because long sales-analytics answers (20-item breakdowns,
    now common since item 28/29) needed heavy internal scrolling in a
    fixed 520px box regardless of screen size. First attempt changed
    `h-[520px]` to a viewport-relative `h-[calc(100vh-260px)] min-h-
    [420px]` — user reported that was too big. Settled on a fixed
    `h-[680px]` instead: a moderate step up from the original, enough for
    long list answers without taking over the screen, and easier to
    reason about without seeing the user's actual viewport than another
    calc() guess. The global Ask AI drawer (item 25) was already
    full-height by design (`Drawer` uses `h-full`), so this only ever
    touched the dedicated page. Verified via a clean `next build` and
    `next lint`. **Not yet run in production** — needs the usual push.

31. Found and fixed a serious, systemic bug: any AI Copilot query fetching
    "all matching rows to compute a true aggregate" (the exact pattern
    built in items 21/42 to fix the earlier undercounted-totals bug) had
    no explicit `.limit()` — meaning it silently relied on Supabase's
    default per-request row cap, which truncates a broad/unfiltered query
    well below a table's real size. This is the same CLASS of bug as
    items 21/42, just never actually triggered until `sales_transactions`
    (9,274 rows) existed and someone asked an unfiltered question against
    it. User asked "who are our top customers by group" (no filter, whole
    quarter) and got a grand total of ₹1,83,05,441.09 — reported it looked
    wrong, correctly, since it's nowhere near the real company-wide total
    of ₹23,17,14,099.89 confirmed multiple times already (items 22, 28).
    Root cause confirmed: `sales_summary`'s main query had `.select(...)`
    with no `.limit()` at all, so Supabase's default row cap silently cut
    it off far short of all 9,274 rows before the JS-side aggregation ever
    ran. Checked every other "fetch everything, aggregate in JS" query in
    the same file for the same gap — found it in three more places:
    `search_customers`'s and `search_job_orders`'s "all" queries (item 42
    added the true-aggregate concept but never added an explicit limit
    either — it happened to not get caught because 1,687 customers/2,072
    job orders apparently stayed under whatever the actual cap is, or
    every question asked so far matched few enough rows — either way, the
    exact same silent-truncation risk was live in those two the whole
    time) and `search_sale_items`'s "all" query (item 28, same gap from
    day one). Fixed all four with explicit limits comfortably above each
    table's real size (5,000 for customers/job_orders, 20,000 for
    sales_transactions) rather than leaving any of them exposed to
    whatever Supabase's default happens to be.
    Verified via a clean `next build` and `next lint`. Could not
    reproduce/verify the exact fixed numbers against live Supabase from
    this sandbox (no network access) — the user should re-ask "who are our
    top customers by group" once this is deployed and confirm the grand
    total now reads ~₹23.17 Cr instead of ~₹1.83 Cr. **Not yet run in
    production** — needs the usual push.
32. Item 31's fix ("add explicit `.limit()`") did NOT actually fix the bug —
    user re-tested after deploy, `sales_summary` grouped by customer still
    returned the same wrong ₹1,83,05,441.09 grand total, and this time the
    tool result itself showed `grand_total_transactions: 1000` against a
    9,274-row table. Root cause is one level deeper than item 31 assumed:
    Supabase/PostgREST enforces its own server-side "max rows" setting
    (project default: 1000) that silently clamps a response to that many
    rows regardless of what `.limit()` a client requests in code — a
    `.limit(20000)` call can still come back with exactly 1000 rows if the
    project's cap is 1000. Item 31's fix requested more rows but the server
    was still clamping the response the whole time, so nothing changed.
    The only reliable fix is pagination: fetch in pages via `.range()` and
    keep requesting the next page until one comes back shorter than
    requested, which works no matter what the project's max-rows setting
    actually is (never assume a client-side `.limit()` alone is honored).
    Added a `fetchAllRows()` helper implementing this and replaced all four
    "fetch everything to aggregate" queries from item 31
    (`search_customers`, `search_job_orders`, `sales_summary`,
    `search_sale_items`) to use it instead of a bare `.limit()`.
    Verified via a clean `npx tsc --noEmit`, `next lint`, and `next build`.
    Could not verify the exact fixed numbers against live Supabase from this
    sandbox (no network access) — user should re-ask "who are our top
    customers by group" (or similar unfiltered aggregate question) once
    deployed and confirm the grand total now reads ~₹23.17 Cr and Apple
    shows its real ~₹1,76,25,514.05 (182 transactions), not the earlier
    undercounted figures. **Not yet run in production** — needs the usual
    push.
33. Integrated real purchase/spend data, per the user's request ("I have
    purchase register too .. do we integrate"). User uploaded two files —
    "Purchases orders register" (PO register, 8,240 rows) and "MRN Register"
    (Material Receipt Note / goods-receipt register, 9,528 rows), correctly
    guessing the MRN one "has more data." Used MRN Register as the source
    (not the PO register) because it's the actual receipt-and-billed ledger
    (carries PO No/PO Date/Bill No/Bill Date all on the same row) — the
    closer analog to the Sales Day Book's real invoices, whereas the PO
    register is just orders raised and may not reflect what was actually
    received/billed.
    New table `purchase_transactions` (see
    supabase-purchase-transactions-schema.sql for full methodology): spend
    metric is Taxable Value (pre-GST), same convention as sales_transactions
    — confirmed by grouping sample bills that "Net Value" is a bill-level
    running total appearing on only ~1/3 of rows (same trap as sales'
    "Voucher amount") and "Net Amount (Line)" is GST-inclusive, neither is
    the right figure to sum. Enriched MRN's bare "Item Name" column by
    joining against Item List.xlsx (the same item master used earlier for
    raw_materials/finished goods) — matched 8,603/9,528 rows (90.3%) to a
    real item_code/item_type/product_category (master's "Parent Name").
    raw_material_id set via subquery only where item_type='Raw material' AND
    the code exists in the already-imported raw_materials table (3,346
    confident matches) — same "confident match or NULL" methodology as
    sales_transactions.customer_id. Deliberately did NOT add a supplier_id
    FK: unlike customers, the `suppliers` table only ever got sample/demo
    seed data, never a real import, so there's no real master to match MRN's
    595 distinct supplier names against — supplier_name stays plain text.
    RLS: role-aware AND group-scoped from creation (like sales_transactions),
    granted to ['manufacturing', 'finance'] groups — not added to
    supabase-module-access-migration.sql's group_map, same precedent as
    sales_transactions (which also sets its own RLS directly rather than
    being folded into that shared file).
    Validated via PGlite: schema idempotent, 9,528/9,528 rows imported,
    8,603 item-master matches, 3,346 raw_material_id matches,
    sum(taxable_value) = ₹32,38,73,242.49 (Jan-Jun 2026 total spend, a wider
    and different date range than sales' Apr-Jun 2026 — the two ledgers are
    NOT the same period), RLS confirmed (finance-scoped viewer sees all
    rows, customers-scoped viewer sees 0, admin sees all).
    Added two new AI Copilot tools mirroring the sales pattern exactly,
    including combined filter+group support from day one (learned from the
    sales_summary gap found and fixed earlier this session) and the
    fetchAllRows pagination helper (learned from the row-limit bug found and
    fixed earlier this session) — not a bare .limit(): `purchase_summary`
    (group by supplier/product_category/month/week/day, with
    supplier_filter/product_category_filter/date range, always returns a
    grand total) and `search_purchase_items` (item code/name/category search
    with average rate + total taxable value aggregate).
    Built a new real "Purchase Register" workspace page
    (/workspaces/purchase-register, added to the Manufacturing nav group,
    distinct from the existing "Procurement" Kanban which tracks PO pipeline
    STAGES with sample cards, not this ledger) — a searchable/filterable
    table (by item, supplier, category, or item code), not a list+detail
    pair like Customers, since a purchase line item isn't a standalone
    business entity the way a customer account is. Stat cards use the same
    paginated-fetch pattern as the AI Copilot route for the true grand total
    (a single .select() would undercount the same way sales_summary did
    before item 32's fix).
    Verified via a clean `npx tsc --noEmit`, `next lint`, and `next build`
    (new /workspaces/purchase-register route confirmed in the build output).
    Could not run any of this against live Supabase from this sandbox (no
    network access) — needs the usual handoff: run
    supabase-purchase-transactions-schema.sql, then the 11 split
    import-purchase-transactions-part*.sql files in order (same
    Supabase-SQL-Editor-size-cap workaround as the sales import), then push
    the code changes (route.ts, AppShell.tsx, supabase.ts, new
    purchase-register/page.tsx). **Not yet run in production.**
34. User clarified MMDI's 9 branches (Hyderabad, Noida, Mumbai, Bangalore,
    Chennai, Kolkata, Kochi, Visakhapatnam, Pune) after the AI Copilot itself
    correctly explained it couldn't do a clean branch-wise breakdown yet
    (sales_summary/purchase_summary only grouped by
    product_category/sales_manager/customer/supplier/time period, no
    location dimension). Checked the source files directly: the Sales Day
    Book has BOTH a "Location" column (clean branch names) and a "Sales
    Office" column (mixes actual branch names with non-branch entities like
    "Head Office", "Indura", "EGD", "Gurugram", "Subsidiary Companies",
    "OMC" — NOT usable as a clean branch field) — confirmed `location` on
    sales_transactions/purchase_transactions (sourced from "Location"/
    "Location.Name") is the right field, not a new column.
    Added group_by='location' + location_filter to both sales_summary and
    purchase_summary (same combined filter+group pattern as every other
    dimension). Documented two real data quirks in the system prompt rather
    than silently normalizing them: the data spells it "Vishakapatnam" (not
    the standard "Visakhapatnam"), and some rows use "Chandanvelly" (a
    plant/godown location) or "Head Office" instead of one of the 9 branches
    — both are real, both should be reported as-is.
    Verified via a clean `npx tsc --noEmit`, `next lint`, and `next build`.
    Could not test against live Supabase from this sandbox (no network
    access) — user should re-ask a branch-wise question (e.g. "sales by
    branch" or "Hyderabad branch spend") once deployed. **Not yet run in
    production.**
35. User asked "do we have purchase category like capital equipment and raw
    materials etc.?" after a failed live query ("restrict to raw materials
    for sales comparison do not include capital goods purchases" returned
    "I couldn't find a clear answer to that"). Root cause: purchase_summary
    only exposed product_category_filter (fuzzy text on the item master's
    "Parent Name", e.g. "RM - ADHESIVE MATERIALS") — it never exposed the
    cleaner item_type field (Raw material/Finished goods/Service/
    Intermediate item/Non stock item) that was already imported alongside
    it. Checked the actual breakdown by re-deriving item_type from Item
    List.xlsx against the MRN Register: Raw material ₹18.64 Cr (3,355 rows),
    Intermediate item ₹6.26 Cr (3,225 rows), Finished goods ₹3.35 Cr (878),
    uncategorized ₹3.27 Cr (925, no item-master match), Service ₹60.4 L
    (767), Non stock item ₹25.9 L (378). Found a real gotcha worth flagging
    rather than hiding: capital equipment purchases (product_category=
    'FIXED ASSETS', ~₹3.01 Cr) are classified as item_type='Intermediate
    item' in the source item master, NOT their own type — so "raw materials
    only" needs item_type_filter='Raw material' specifically (which already
    correctly excludes FIXED ASSETS), while item_type_filter='Intermediate
    item' would NOT mean "everything except raw materials and capital
    goods" the way someone might assume.
    Added group_by='item_type' and item_type_filter to purchase_summary
    (same combined filter+group pattern as every other dimension), and
    documented the FIXED ASSETS gotcha directly in both the tool schema and
    the system prompt so the model filters correctly rather than guessing.
    Also noted in the system prompt that sales_transactions has no
    item_type field at all (it was never enriched against the item master
    the way purchase_transactions was) — a "raw materials only" filter is
    only possible on the purchase side, not sales.
    Verified via a clean `npx tsc --noEmit`, `next lint`, and `next build`.
    Could not test against live Supabase from this sandbox (no network
    access) — user should re-ask their original failed question ("raw
    material purchases only, excluding capital goods") once deployed.
    **Not yet run in production.**
36. User confirmed MMDI's financial year runs 1 Apr - 31 Mar and asked to
    "restrict FY" after I flagged (in response to "do we have financial year
    in ur records?") that no fiscal_year column exists anywhere — only raw
    calendar dates — and that the purchase ledger (Jan-Jun 2026) actually
    straddles two financial years (FY25-26 Q4 = Jan-Mar, FY26-27 Q1 =
    Apr-Jun) while the sales ledger (Apr-Jun 2026 only) sits entirely in
    FY26-27 Q1.
    Rather than add a stored fiscal_year column (unnecessary — it's a pure
    function of the date, and a stored/denormalized version would risk
    drifting out of sync), added two shared helper functions to
    src/app/api/ai-copilot/route.ts: fiscalYearLabel() and
    fiscalQuarterLabel(), both computing MMDI's Apr-Mar FY from a plain
    YYYY-MM-DD string (verified by hand: 2026-01-15/2026-03-31 -> FY25-26
    Q4, 2026-04-01/2026-06-30 -> FY26-27 Q1, 2026-12-25 -> FY26-27 Q3,
    2027-03-01 -> FY26-27 Q4). Added group_by='fiscal_year' and
    'fiscal_quarter' to both sales_summary and purchase_summary (same
    pattern as every other dimension), and added a new "Financial year"
    paragraph to SYSTEM_PROMPT explaining the Apr-Mar rule so the model can
    correctly compute date_from/date_to itself for "FY26-27" / "FY25-26 Q4"
    type questions (there's no fiscal_year_filter param — date_from/date_to
    already cover arbitrary ranges once the model knows the conversion
    rule), plus a reminder that the two ledgers' FY coverage differs (sales
    = all FY26-27 Q1; purchases = FY25-26 Q4 + FY26-27 Q1).
    Verified via a clean `npx tsc --noEmit`, `next lint`, `next build`, and
    a standalone node script confirming the FY/quarter math above.
    Could not test against live Supabase from this sandbox (no network
    access) — user should re-ask a fiscal-year-scoped question (e.g. "FY26-27
    Q1 sales" or "compare FY25-26 Q4 vs FY26-27 Q1 purchases") once deployed.
    **Not yet run in production.**
37. Caught a real AI Copilot accuracy bug via the user sharing a live
    conversation transcript (not a code bug — a prompting/reasoning gap).
    Asked "did we purchase any capital investment goods," the model answered
    by SUBTRACTING a raw-material-filtered total from the unfiltered total
    (₹1,25,25,043 across 15 transactions) instead of directly filtering to
    product_category='FIXED ASSETS' — that gap also swept in Service,
    Finished goods, Non stock item, and Uncategorized spend, not just
    capital goods. The model caught its own mistake one turn later when
    asked to itemize ("list the purchases with vendor details and value"),
    at which point it ran the real filtered query and got the true number:
    ₹16,73,000 across 4 transactions for June 2026 — roughly a 7.5x
    overstatement in the first answer. Model self-corrected honestly and
    named its own error, which is the right behavior once it happens, but
    the goal is to not make the mistake in the first place.
    Added an explicit new paragraph to SYSTEM_PROMPT naming this exact
    failure mode and instructing the model to always call
    purchase_summary/search_purchase_items with
    product_category_filter='FIXED ASSETS' directly for any capital-goods/
    capital-equipment/capital-investment question, never by inferring from
    a gap between two other totals — cited the real ₹1,25,25,043 vs
    ₹16,73,000 discrepancy in the prompt itself as a concrete anchor.
    Verified via a clean `npx tsc --noEmit`, `next lint`, `next build`.
    Could not test against live Supabase from this sandbox (no network
    access) — user should re-ask a capital-goods question fresh (new
    conversation, so there's no prior "gap" reasoning already in context)
    once deployed and confirm it goes straight to the ₹16.73L-style direct
    figure. **Not yet run in production.**
38. User asked for a full itemized table of all 43 FIXED ASSETS purchases
    (branch, supplier, item, rate, value) and the Copilot could only return
    20 rows (search_purchase_items' detail list was hard-capped) and
    admitted location/branch wasn't even selected per-row in that tool at
    all — its own proposed fix (month-by-month slicing) would have worked
    but was clunky for a 43-row result that should fit in one call.
    Added an optional `limit` input (default 20, max 150, clamped) to both
    search_sale_items and search_purchase_items, added `location` to both
    tools' per-row select (branch now shows up in detail rows, which it
    never did before), and renamed the fixed "most_recent_20" result field
    to "most_recent" plus added detail_rows_shown/detail_rows_are_complete
    so the model can tell, from the response itself, whether it got
    everything or needs to ask for more.
    Added a new SYSTEM_PROMPT paragraph instructing the model to check
    total_matches from a normal call first, then re-call with limit set to
    total_matches (a single extra call) to get full coverage when the
    result set is small (~under 150), rather than manually slicing the
    request by month/branch/supplier -- only falling back to slicing when
    even limit=150 isn't enough.
    Hit and fixed a self-inflicted bug while writing this: used backticks
    around the word "limit" for emphasis inside the new SYSTEM_PROMPT
    paragraph, not realizing SYSTEM_PROMPT itself is a backtick template
    literal in this file -- that prematurely closed the string and broke
    the build (`tsc` caught it immediately: "',' expected"). Removed the
    inner backticks; the two tool *description* strings (line 138, 172)
    still safely contain literal backticks since those are double-quoted
    string literals, not template literals.
    Verified via a clean `npx tsc --noEmit`, `next lint`, `next build`.
    Could not test against live Supabase from this sandbox (no network
    access) — user should re-ask for the full FIXED ASSETS list once
    deployed and confirm all 43 rows come back with branch included.
    **Not yet run in production.**
39. User caught another real gap while reviewing the full FIXED ASSETS list:
    "i dont see noida machine purchase from arrow" — the ₹2.1 Cr Arrow
    Digital transaction (the single largest capital-goods purchase in the
    whole dataset) was genuinely in the list under its item name (EFI VUTEK
    H3 PRINTER), but searching "Arrow Digital" directly via
    search_purchase_items returned zero hits, because that tool's filter
    only matched item_code/item_name/product_category — never
    supplier_name. Same gap existed in search_sale_items (no customer_name
    match). The Copilot correctly self-diagnosed this live and explained it
    accurately, but the underlying gap needed a real fix, not just an
    explanation.
    Added supplier_name.ilike to search_purchase_items' filter and
    customer_name.ilike to search_sale_items' filter (both already selected
    those columns for display — they just weren't part of the match
    condition). Updated both tool descriptions to state they now match on
    supplier/customer name too, so the model knows to reach for these tools
    directly for "what did we buy from X supplier" / "what did we sell to Y
    customer" line-item questions instead of assuming it needs
    purchase_summary/sales_summary's supplier_filter/customer_filter (which
    only return aggregates, not the individual line items someone might
    want listed).
    Verified via a clean `npx tsc --noEmit`, `next lint`, `next build`.
    Could not test against live Supabase from this sandbox (no network
    access) — user should re-search "Arrow Digital" via search_purchase_items
    once deployed and confirm it now returns the ₹2.1 Cr transaction
    directly. **Not yet run in production.**
40. User's Arrow Digital search returned 347 matches — over the 150-row cap
    set two commits ago, so it couldn't be listed in full in one call.
    Checked real transaction-count distributions before picking a new
    number rather than guessing: top single supplier (Vijaya Display
    Systems) has 477 transactions, top single customer (I And S Communique
    Pvt Ltd) has 454 — so 150 was too conservative for the realistic
    "everything from one company" case this tool exists to serve. Raised
    the max limit from 150 to 500 in both search_sale_items and
    search_purchase_items (the clamp, both tool descriptions, both `limit`
    param descriptions, and the SYSTEM_PROMPT paragraph, kept consistent
    across all six spots). 500 comfortably covers the largest real
    single-entity case (477) with headroom, while still bounding response
    size for genuinely broad category-wide searches (which should keep
    using product_category_filter + summary tools' aggregates, not a raw
    line-item dump, anyway).
    Verified via a clean `npx tsc --noEmit`, `next lint`, `next build`.
    Could not test against live Supabase from this sandbox (no network
    access) — user should re-ask for the full Arrow Digital transaction list
    once deployed and confirm all 347 rows come back in one call.
    **Not yet run in production.**
41. Added a real CSV export to the Purchase Register workspace page
    (src/app/workspaces/purchase-register/page.tsx), after the user asked
    the AI Copilot for "branch, purchase type, supplier, goods name, rate,
    value for all purchases" and the Copilot correctly explained it can't
    dump 9,528 rows as chat text and suggested a direct export was the right
    tool instead — confirmed via AskUserQuestion that the user wanted
    exactly that built.
    New "Export all to CSV" button (top-right of the page, next to the
    title) fetches every purchase_transactions row via the same paginated
    .range() loop pattern used everywhere else in this app to avoid
    Supabase/PostgREST's server-side max-rows clamp (see items 31/32's
    history — a single .select() would silently truncate well short of
    9,528), builds a CSV client-side (proper quote/comma/newline escaping),
    and triggers a browser download named
    purchase-register-YYYY-MM-DD.csv. Shows live progress ("Exporting…
    N") via the button's loading state while paginating, since 9,528 rows
    across ~10 requests takes a few seconds. Columns: Date, GRN No.,
    Branch, Purchase Type (item_type — the closest concept this schema has
    to what was asked as "purchase type"), Category, Supplier, Goods Name,
    Item Code, Quantity, Rate, Taxable Value.
    Verified via a clean `npx tsc --noEmit`, `next lint`, `next build`.
    Could not test the actual download against live Supabase from this
    sandbox (no network access) — user should click "Export all to CSV" on
    the deployed Purchase Register page and confirm the download completes
    with 9,528 data rows. **Not yet run in production.**
42. User re-asked "all purchases" itemized right after the CSV export
    feature (item 41) was deployed, and the Copilot still only offered
    chat-based slicing/summaries — it had no way to know the export button
    now exists, since that's a UI feature with nothing in
    src/app/api/ai-copilot/route.ts pointing to it. Added a new SYSTEM_PROMPT
    paragraph telling the model directly: when someone wants the entire
    9,528-row purchase ledger itemized with no narrowing filter, tell them
    about the Purchase Register page's "Export all to CSV" button as the
    right tool for that, in addition to (not instead of) offering to drill
    into a narrower slice in-chat.
    Verified via a clean `npx tsc --noEmit`, `next lint`, `next build`.
    Could not test against live Supabase from this sandbox (no network
    access) — user should re-ask "all purchases" itemized once deployed and
    confirm the Copilot now mentions the CSV export button. **Not yet run in
    production.**
