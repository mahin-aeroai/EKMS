# MMDI ONE — Project Status

Last updated: 22 August 2026 (session: a separate Cowork — not Claude
Code — chat, entirely inside `apps/mobile`, distinct from the BOM
Master/Rate Card session the paragraph below this one used to describe.
That earlier session's own outstanding items are UNCHANGED by this one —
item 78's `supabase-bom-template-line-alternatives-dedupe-migration.sql`
and item 76's `supabase-bom-templates-sort-order-migration.sql` are
**still not confirmed run**; "Next up" below is still the right list for
the web app's BOM Master work.

This session's arc (full detail in item 79) was entirely mobile: rebuilt
the "Cost Sheet" tab from a mis-scoped list of past Sign Costing runs into
a real BOM+Work-Centre calculator with full parity to the web tool
(per-line/work-centre on-off, alternative-material picker, "Add to
Estimate Pool"), then iterated its Suggested Selling Price GP methodology
through several corrections — ending on a cost-plus-markup formula
(Traditional: GP% of total cost, default 50%; Value Addition: raw
material recovered at cost, GP% of ink+work-centre cost, default 100%)
with a visible on-screen calculation breakdown, after an earlier
margin-based version turned out to not match MMDI's actual costing
policy. Also this session: fixed a "Hey Jarvis" wake word that never
produced a transcript (an iOS `AVAudioSession` restart race) and an
Estimate PDF that didn't match the web app's fonts/layout; fixed a
Sales by Rep screen whose filter panel and stat cards were frozen above
the list (now all scrolls together, plus a new donut chart); and traced +
fixed a real `sales_transactions.item_description` data gap (a specific
missing product name led to finding the backfill migration's positional
match had silently drifted for ~26% of rows — a second migration matching
on customer+invoice+amount instead brought real-world coverage from 74%
to 98.7%). Every mobile code change was handed off as a git bundle and
merged locally by the user — **this sandbox has no GitHub push access**,
same constraint as the earlier session above (fetch-only; every round
this session, too, was `git bundle` + handoff instructions, never a
direct push). **Confirm the latest mobile bundle from that handoff
(`gp-hide-zero-ink-row.bundle` plus its own conflict-resolution follow-up)
has actually been merged AND rebuilt on-device before assuming any of
item 79's Cost Sheet GP work is live** — bundle delivery and a real
device build are two separate steps in this workflow, and this file can't
confirm the second one on its own.

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

**Deployed and verified**

- `app.mmdi.in` — 59 routes total was the last count actually confirmed
  against a real `next build` output (see item 52's established
  convention; up from 56 now that Estimate Builder and Quotations — see
  item 70 — are counted), 35 workspace modules under `/workspaces/*` (34
  real + `project`, confirmed a pure redirect stub to job-orders) —
  **both numbers predate the Cost Sheet module (item 72) and haven't been
  re-confirmed since**, because every sandbox that's touched this module
  (including this session's) hits a native `next build` "Bus error" on
  `@next/swc-linux-{gnu,musl}` (ARM64/sandbox incompatibility, not a code
  issue — `npx tsc --noEmit` + `npx eslint` both stay clean instead).
  Cost Sheet adds one workspace (`/workspaces/cost-sheet`) with no other
  route changes noticed, so the real current figures are very likely 60
  routes / 36 workspace modules — someone should run a real `next build`
  outside a sandbox that hits this and update this line with a confirmed
  number rather than trusting this estimate. Installable as a PWA on both
  iOS and Android.
- Supabase Postgres, RLS on every table, roles `admin | editor | viewer`,
  MFA enforced at `aal2` on all API routes
- Cloudflare R2 for files, always via short-lived presigned URLs
- Copilot with 19 tools (counted directly from the `TOOLS` array in
  `src/app/api/ai-copilot/route.ts`) including Gmail search and draft
- iOS app running on a physical device (see item 79 for this round's full
  arc): five visible tabs (Home, Sign Costing, Sales by Rep, Estimates,
  Cost Sheets), plus Copilot/Surveys/Basil Installations/Sign Costing
  History reached from Home's quick actions rather than the tab bar
  (confirmed against `apps/mobile/app/(tabs)/_layout.tsx`) — sign-in,
  downloads, a Sign Costing estimator, a full BOM+Work-Centre Cost Sheet
  calculator, Sales by Rep with charts, a Copilot with a "Hey Jarvis" wake
  word, installation report capture with drafts and idempotent submit

**Monorepo**

`apps/web` · `apps/mobile` · `packages/shared` (`@mmdi/shared`) under npm
workspaces. The estimator's `calc.ts` and ~45 row types are shared verbatim.

## What's NOT done yet (known gaps)

**Blocked on a decision**

- **Individual vs Organization Apple enrollment.** Currently Individual, so
  an App Store listing would publish under a personal name rather than
  MMDI. Organization needs a D-U-N-S number and a separate membership; it
  is not a conversion.
- **Android.** Team uses both platforms. The PWA covers Android today; a
  native Android build would need its own Play Console account and review.

**Known gaps**

- `app.json` still has `name: "mobile"` and `bundleIdentifier:
  "com.ekms.mobile"` — the identifier is effectively permanent once a build
  reaches App Store Connect
- Knowledge tables (`documents`, `drawings`, `sops`) have zero rows with a
  non-null `relative_path` — the Documents tab is correct but empty until
  `upload-knowledge-files.mjs` is run with real files and metadata sidecars
- No Supabase backups configured (free tier, no PITR)
- Mobile Copilot has no card renderers for Gmail results — email answers
  render as prose
- The Gmail label allowlist is global config while labels are per-mailbox;
  fine as a superset that surfaces gaps, but undecided as a design
- Installation report PDF generation remains web-only (`pdfBuild.ts` is
  canvas-bound); mobile captures, web renders

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
- `src/app/workspaces/cost-sheet/` (item 72 onward, most actively-edited
  area this session — items 73-78) — `BomMasterTab.tsx` (map/edit/reorder
  each FG code's bill of materials, `ensureRateCombos()` auto-seeds
  missing work-centre rate rows), `RawMaterialPicker.tsx` (the shared
  category-filtered/multi-select-capable raw material dropdown used by
  both BOM Master and, via `preferredCategory`, alternative-material
  picking), `CostSheetCalcTab.tsx` (the live per-job calculator),
  `RateCardTab.tsx`, `calc.ts` (pure math, no Supabase import, kept that
  way on purpose). `sort_order` on `bom_templates` (item 76) and the
  bootstrap rows for WC4/WC5 on `work_centre_rates` (item 78) are both
  recent enough that a fresh session should double-check they've actually
  been run before assuming BOM Master's ordering/work-centre-checklist
  behavior matches what's in this code.
- `src/app/workspaces/estimate-builder/page.tsx` + `src/lib/estimateBuilder/
  pdf.ts` — the Estimate Builder workspace and its client-side (`pdf-lib`)
  quote PDF generator. See item 70 below for what this workspace actually
  does; this file's own session history had never mentioned it before that
  entry despite it being live in production across several prior sessions.
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
- **`returning` on any hand-run UPDATE or DELETE against production.** A
  statement matching zero rows is indistinguishable from one that worked.
  This cost five rounds on a single role update.
- **Never test authorization by changing your own role in production.**
  Insert a row owned by a different UUID instead. Doing otherwise caused
  two lockouts.
- **Credentials go to a file, never to a terminal that prints them.**
  `> /tmp/tok.json`, then hand over the path.
- **Two security checks were written, believed correct, and did not
  fire** — the middleware `/api` gap and the Gmail address-matching check.
  Both were caught by testing, neither by reading. Prefer schema-level
  enforcement to prompt-level or comment-level assurance.

## Next up (start here — this is where the session ended)

The Cost Sheet module (item 72) is long since merged and in real daily use
— everything below is this session's (items 73-78) real, in-progress
follow-on work, not a cold restart of the original handoff. In priority
order:

1. **Run the two outstanding SQL files.** Item 78's code (a material can't
   be its own alternative anymore) is confirmed merged, but its cleanup
   migration, `supabase-bom-template-line-alternatives-dedupe-migration.sql`
   (removes existing duplicate alternative rows), is **not yet confirmed
   run** — item 78's other SQL file,
   `supabase-work-centre-4-5-bootstrap-migration.sql`, already is.
2. **Run `supabase-bom-templates-sort-order-migration.sql`** if it hasn't
   been — item 76's manual FG-code reordering (up/down arrows in BOM
   Master) silently no-ops without it (`sort_order` falls back to `null`,
   which just sorts by code like before, so nothing visibly breaks if this
   is missed, but reordering won't actually persist correctly until it's
   run).
3. **Keep mapping BOM lines.** This is genuinely in progress now (not
   0/139 anymore) — the user has been actively working through BOM
   Master's raw-material mapping across this whole session, helped along
   by items 73-74 (the picker no longer shows Finished-Goods junk or gets
   stuck open) and item 77 (can now tick several alternative materials at
   once instead of one at a time). No exact remaining count is tracked
   here; check BOM Master for lines still showing "unmapped" /
   `suggested_codes` text.
4. **Keep filling in the rate card.** Item 78 just added WC4 Lamination
   and WC5 Application as checkable work centres for the first time (they
   had zero rows in `work_centre_rates` before, so never appeared as
   options at all) — those, plus whichever of the original 16 work
   centres are still `confidence = 'missing'`, need real rates entered via
   the Rate Card tab. Every work centre a template gets checked against
   now auto-creates its own "missing" placeholder row (`ensureRateCombos`
   in `BomMasterTab.tsx`) rather than silently costing ₹0, so the Rate
   Card tab itself is the authoritative "what's left to price" list —
   check it directly rather than trusting any specific count written here.
5. Possible follow-up, not required: link `inventory_skus` (785 real FG
   SKUs from the Tally import) to `bom_templates` (33+ product-type
   "recipes," growing as the user clones new FG code variants via item
   76's clone flow) via a `bom_template_id` FK, so a specific real FG SKU
   can resolve to a template automatically instead of the user picking a
   template by hand every time.
6. **Re-confirm the route/workspace count** (see "Current state" above) —
   nobody has run a real `next build` since the Cost Sheet module shipped;
   every sandbox that's touched it since (including this session's) hits
   the same ARM64 "Bus error" that item 72 first hit, so `npx tsc
   --noEmit` + `npx eslint` are all that's actually been verified for
   every change in items 72-78.

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
  - `supabase-estimate-builder-schema.sql` + five follow-on migrations
    (`-fields`, `-attention-person`, `-jobno-productno`, `-payment-terms-
    type`, `-salesperson`, `-versions`) — the Estimate Builder workspace's
    full schema (`estimates`, `estimate_line_items`, versioning, job
    number/product number, attention person, payment terms type, per-
    estimate sales person snapshot). **Confirmed run in production** — the
    workspace has been used live to generate real customer quotes (IKEA,
    etc.) across several sessions; see item 70 for the feature itself. Note:
    these files currently sit as untracked/uncommitted in the working
    repo (`git status` shows them `??`) despite being live in Supabase —
    worth an explicit `git add` pass at some point so the schema history
    isn't only in Supabase's own migration log.

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
43. Found and fixed a serious, self-inflicted regression from raising the
    search tools' row cap to 500 (item 40): "list the prices we are selling
    to IKEA" (282 sale item matches) returned "I couldn't find a clear
    answer to that." — the citations proved the tool DID fetch all 282 rows
    correctly (showing 20 then re-called and showing 282, exactly per the
    new guidance), but the model's attempt to render 282 rows as chat text
    ran out of MAX_TOKENS (1024, unchanged since the route was first built)
    partway through, leaving response.content with no text block at all.
    The old code's fallback couldn't tell "genuinely no answer" apart from
    "answer too long," so it always showed the same misleading message —
    implying no matching data existed when the real problem was output
    length.
    Fixed three ways: (1) raised MAX_TOKENS from 1024 to 4096, giving
    legitimate longer listings real room; (2) split the empty-text fallback
    into two distinct messages based on response.stop_reason — "too long to
    fit, try a summary or narrower request" when stop_reason is
    'max_tokens', vs. the original "couldn't find a clear answer" only when
    the model genuinely had nothing (also appends a "cut short" note when
    stop_reason is 'max_tokens' but SOME text did make it through, so a
    truncated answer never looks like a complete one); (3) added a new
    SYSTEM_PROMPT paragraph instructing the model NOT to enumerate more than
    ~50-60 rows as text even when it has fetched the full set — summarize
    (range/average/min/max + a representative ~10-15 row sample) and offer
    to narrow down instead, reserving full raw dumps for when total_matches
    is small enough to comfortably fit or the person explicitly insists.
    Also noted there's no CSV export for sales data yet (only Purchase
    Register has one, per item 41) — a natural next step, pending user
    input on scope.
    Verified via a clean `npx tsc --noEmit`, `next lint`, `next build`.
    Could not test against live Supabase from this sandbox (no network
    access) — user should re-ask "list the prices we are selling to IKEA"
    once deployed and confirm it now returns a real summary (not a failure)
    instead of silently failing. **Not yet run in production.**
44. Built a real "Sales by Rep" report page
    (src/app/workspaces/sales-by-rep/page.tsx, new nav item under Customers,
    Target icon), after the user asked for "sales report by sales person
    with all his customers for a period" and confirmed via AskUserQuestion
    they wanted a reusable in-app page (not a one-off file, not just chat).
    Pick a sales person (dropdown populated from real distinct sales_manager
    values in sales_transactions, not hardcoded) and an optional from/to
    date range, click "Run report," and see every customer that rep sold to
    — transaction count and total taxable value each — sorted by value
    descending, with stat cards for total sales/customers/transactions.
    "Export to CSV" downloads the current breakdown once a report has run.
    Every fetch (distinct sales-person list, the actual report query) uses
    the same paginated .range() loop pattern as everywhere else in this app
    — no bare .select()/.limit(), per the now-well-established
    Supabase/PostgREST max-rows clamp lesson (items 31/32/40 etc.).
    Table rows needed a synthetic `id` field added (customer_name, since
    grouping already guarantees uniqueness) — the shared Table component's
    generic type requires `{ id: string }`, caught immediately by `tsc`.
    Also added a new SYSTEM_PROMPT paragraph telling the AI Copilot this
    page exists, so if someone asks in chat for a rep's full customer
    breakdown as a reusable/exportable report (not a one-off answer), it
    can point them to /workspaces/sales-by-rep directly.
    Verified via a clean `npx tsc --noEmit`, `next lint`, `next build` (new
    /workspaces/sales-by-rep route confirmed in the build output).
    Could not test against live Supabase from this sandbox (no network
    access) — user should open the new page, pick a sales person, run the
    report, and confirm the customer breakdown and CSV export both work.
    **Not yet run in production.**
45. Added group_by='item' to sales_summary and purchase_summary
    (src/app/api/ai-copilot/route.ts), after the user tested "clean, precise
    list of products for Apple India Pvt Ltd - Bangalore" and got a partial,
    arbitrary "representative sample" (8 rows out of 184 real sale line
    items) instead of the complete distinct-product list they actually
    wanted. Root cause: the AI Copilot had no way to ask for "one row per
    distinct product" — only raw transaction search (capped/sampled per the
    earlier max_tokens fix) or category-level rollups. Fix adds a new
    group_by option, 'item', to both sales_summary and purchase_summary that
    groups by item_code + item_description/item_name instead of
    product_category or a time bucket — combined with customer_filter or
    supplier_filter this returns exactly one row per distinct product (e.g.
    Apple India Pvt Ltd - Bangalore's 184 line items collapse to ~36 distinct
    products), which is short enough to list in full instead of sampling.
    Also added per-group rate statistics (average_rate, min_rate, max_rate)
    to every group in both tools' output (not just group_by='item') — this
    directly fixes the "wide-ranging average rate, skewed by a few large
    installation-charge line items" problem from the same test, since rate
    stats are now computed per product/group rather than blended across a
    customer's entire product mix. SYSTEM_PROMPT updated with explicit
    guidance distinguishing "give me the full/clean list of products" (use
    group_by='item', raise top_n to ~100) from "list every transaction" (use
    search_sale_items/search_purchase_items raw rows) — these were being
    conflated before, which is why the model defaulted to an arbitrary
    partial sample.
    Verified via a clean `npx tsc --noEmit`, `npx eslint`, and `next build`
    (all routes unaffected, no errors). Could not test against live
    Supabase from this sandbox — user should re-ask the AI Copilot for
    Apple India Pvt Ltd - Bangalore's full product list (or any
    customer/supplier with many line items) and confirm it now returns a
    complete per-product breakdown instead of a partial sample.
    **Not yet run in production.**
46. Added Apple/IKEA contract & spec data (three new tables) + AI Copilot
    tools, after the user uploaded three real spreadsheets and asked "can we
    upload for copilot" — clarified via AskUserQuestion that these were
    Excel files and the goal was answering questions about terms/values
    (not just document lookup).
    - apple_lfg_sites (184 rows): Apple's LFG (large-format graphics) site
      catalog from "Apple LFG Sites Data sheet with prices.xlsx" — one row
      per physical retail site across 5 program tabs (APP, APR, Mono AAR,
      Multi AAR, APR AAR Temporary sites), each with its exact material/
      size/rate spec, installation team, and site address. The user
      flagged this specifically as "really important specification we will
      ask copilot".
    - apple_rate_card (117 rows): Apple's approved SKU-level rate card from
      "Apple Rate Card.xlsx" — one row per SKU with bill rate, program,
      substrate, dimensions, a full cost breakdown (materials/printing/
      process/QC/labour/overheads/profit), and a contract validity window
      (start/end date).
    - ikea_rate_card (51 rows): IKEA's rate card from "MMDI IKEA Rate Card
      2026.xlsx" — one row per product with scope (SITC vs Material
      Supply), material category, UOM, and revised rate.
    All three are reference/contract data (RLS granted to ['customers',
    'finance'], same groups as sales_transactions) — deliberately kept
    separate from sales_transactions/purchase_transactions since they carry
    no transaction-level keys, just site/SKU-level specs and rates. Schema
    + import validated together via PGlite (row counts, spot-checked real
    values against the source files, and RLS group-scoping all passing —
    see test-contracts-rate-cards.mjs).
    Added three new AI Copilot tools (search_lfg_sites, search_apple_rate_card,
    search_ikea_rate_card) with a new SYSTEM_PROMPT paragraph explicitly
    distinguishing this CONTRACT/spec data from actually-invoiced sales
    (sales_summary/search_sale_items) — the two can differ for the same
    product, so the model is told not to conflate them. Also noted that
    Apple LFG site survey PDF reports are planned but not yet uploaded, so
    the Copilot says so rather than guessing if asked to open one.
    Verified via a clean `npx tsc --noEmit`, `npx eslint`, and `next build`.
    Could not test against live Supabase from this sandbox — user should
    re-ask the AI Copilot a spec/rate question for an Apple LFG site or a
    rate-card SKU/product and confirm it answers from real data.
    **Not yet run in production. Site survey PDFs to follow in a later
    upload — will need a different approach (document storage/reference
    rather than a structured table) since the user wants to "see the PDF
    as it is", not have its contents parsed into fields.**
47. Fixed search_lfg_sites returning no dimension detail
    (src/app/api/ai-copilot/route.ts), after the user asked for "iStation @
    Kompally size and specifications" and the Copilot replied it didn't have
    width/height/bleed data — which was wrong: apple_lfg_sites has always
    stored width_mm/height_mm/bleed_mm/width_inches/height_inches (see item
    46's schema), but search_lfg_sites' select() only ever asked for
    sheet_name/program/apple_store_id/store_name/city/material/site_status/
    no_of_sites/sqft/rate/total_printing_amount/installation_team/address —
    the dimension columns were never in the query, so the tool genuinely
    never returned them to the model regardless of what data existed.
    Fixed by adding width_mm, height_mm, bleed_mm, width_inches,
    height_inches, amount, packing_forwarding, total, gst_amount, and
    remarks to the select — the tool's detail rows now carry the same full
    row the schema always supported. Also updated the tool's own
    description to state plainly it does NOT carry an installation-method
    field (e.g. scaffolding), which the user separately confirmed lives in
    a different (not-yet-uploaded) cost sheet — heading off the same "does
    this need scaffolding" question next time before the model has to
    guess or search a "scaffold" keyword that will never match anything in
    this data.
    Verified via a clean `npx tsc --noEmit`, `npx eslint`, and `next build`.
    Could not test against live Supabase from this sandbox — user should
    re-ask for iStation @ Kompally (or any LFG site) and confirm width/
    height/bleed now come back in the answer.
    **Not yet run in production.**
48. Replaced apple_lfg_sites with the fuller "LFG Active Sites_Master List.xlsx"
    (852 rows, up from 184), adding real scaffolding/installation cost data —
    after the user asked whether iStation @ Kompally needs scaffolding, the
    Copilot correctly said that data wasn't in what it had, and the user
    then confirmed installation costs live in "a different cost sheet."
    Connecting the LFG site survey PDF folder surfaced that exact sheet
    sitting alongside the PDFs. Compared to the original 5-sheet, 184-row
    import, the master list adds: Scaffolding (Yes/No), Scaffolding Size/
    Rate/Amount, Installation Rate/Amount, Installation Travelling, a
    separate Installation GST + final Total Installation Amount, a Budget/
    quarter label, AND three entire site chains not previously imported at
    all (Reliance, Vijay Sales, Wireless Chain) plus a larger Croma count
    (now split Croma / Croma (Hold) tabs, 255 + 197 rows) — confirmed via
    AskUserQuestion this was wanted before touching anything.
    Migration approach: ADD COLUMN IF NOT EXISTS for the 13 new fields
    (supabase-apple-lfg-sites-scaffolding-migration.sql), then TRUNCATE +
    reimport all 852 rows (import-apple-lfg-sites-master-list-part{1,2}-of-2.sql,
    split in two to stay under the ~270KB per-paste threshold learned from
    the purchase_transactions import). Three distinct source column layouts
    had to be handled: the "standard" 37-column layout (APP/APR/Mono AAR/
    Multi AAR/Vijay Sales/Wireless Chain/Croma (Hold)), Reliance's layout
    (has a stray near-always-blank extra "Remarks" column before Address),
    and Croma's minimal 24-column layout (no address/installation/
    scaffolding data at all, and a blank column shifting everything after
    Apple ID by one position) — verified real column offsets against the
    actual header row of every sheet before writing the extraction script,
    not assumed from one sheet's layout.
    Validated via PGlite: confirmed the OLD 184-row import loads first, then
    the migration + reimport correctly truncates and replaces it with all
    852 new rows (not appending/duplicating), confirmed the exact site the
    user asked about (iStation @ Kompally, Apple ID 1697010) now shows
    scaffolding='Yes', scaffolding_size=1200, scaffolding_amount=24000,
    scaffolding_plus_travelling=27000 for one of its two site entries, and
    re-confirmed RLS group-scoping (customers/finance) still holds after
    the ALTER TABLE.
    Updated search_lfg_sites' select + tool description + SYSTEM_PROMPT
    (src/app/api/ai-copilot/route.ts) to surface the new fields and
    explicitly tell the model to check scaffolding/installation_amount
    directly instead of guessing, and to treat Croma's NULLs as "not
    recorded" rather than "No". Verified via a clean `npx tsc --noEmit`,
    `npx eslint`, and `next build`.
    Could not test against live Supabase from this sandbox — user should
    re-ask about iStation @ Kompally's scaffolding requirement and confirm
    the Copilot now answers directly from real data instead of saying it
    isn't available.
    **Not yet run in production. PDF storage/linkage for the 333 site
    survey PDFs (5.7GB) is a separate, still-pending piece of work.**
49. Built PDF storage + viewer for the 333 LFG site survey reports (5.7GB),
    completing the "can we do lfg pdf files now" request from earlier —
    connected the user's local folder to inspect it first (never assume
    naming/structure sight-unseen): 333 PDFs, 88KB-229MB each, organized by
    chain (APP, APR, Mono AAR, Multi AAR, Croma with I&S/MMDI install-team
    subfolders, Tribe by Croma, Vijay Sales, WIRELESS CHAIN with its own
    PDF/Hold/OLD subfolders), most filenames embedding the site's Apple ID
    (confirmed 311/333 = 93% via a dry-run against the real folder; the
    other 22 are NSO/TBC/no-ID/version-suffixed filenames and get
    apple_store_id = NULL, which is correct, not a bug).
    5.7GB cannot move through chat or the SQL Editor, so this splits into:
    - apple_lfg_site_surveys table (chain, relative_path [unique, doubles
      as the Storage object path so the two can't drift], file_name,
      best-effort apple_store_id/store_name parsed from the filename,
      file_size_bytes) + a private `lfg-site-surveys` Storage bucket, RLS
      matching apple_lfg_sites (customers/finance groups). No insert policy
      for `authenticated` on purpose — only the upload script's service-role
      key writes rows, matching how the file is only ever bulk-loaded, not
      uploaded through the app itself yet.
    - upload-lfg-site-surveys.mjs — a LOCAL Node script the user runs on
      their own Mac (not something this sandbox can run — no access to the
      user's 6GB local folder from here at bulk-transfer scale, and no
      Supabase service role key). Walks the folder, skips junk (.DS_Store,
      Thumbs.db, .cdr, .zip, the Master List .xlsx itself), uploads each PDF,
      and inserts its linkage row. Idempotent (skips files already recorded,
      so an interrupted run can just be restarted) and logs failures to
      upload-failures.log rather than dying silently — flagged explicitly
      that Supabase Storage's default per-file size limit may be under our
      229MB largest file and may need raising first.
    - /api/lfg-surveys/signed-url — server route that mints a 60-second
      signed URL for one object, gated by the request's own session (so
      Storage's RLS policy is actually enforced, not bypassed).
    - /workspaces/site-surveys — new page (Customers nav section): search by
      store/chain/Apple ID, "View PDF" opens the real, unmodified PDF via
      the signed URL in a new tab. Deliberately NOT a table of
      extracted/parsed fields — the user explicitly wants to see the PDF
      "as it is".
    - find_site_survey AI Copilot tool — confirms whether a survey exists
      for a site and gives its file name, but is explicit in its own
      description and the SYSTEM_PROMPT that it cannot show/read the PDF's
      contents (chat is text-only) — points to the new page instead.
    Along the way, connecting the folder also surfaced "LFG Active Sites_
    Master List.xlsx" sitting alongside the PDFs — see item 48 for that
    separate (larger) piece of work, done first since it directly answered
    the scaffolding question from earlier in the same conversation.
    Validated the table/bucket/RLS via PGlite (with a minimal storage.
    buckets/storage.objects stand-in, since PGlite doesn't model Supabase's
    real Storage service) — bucket registered exactly once, private,
    relative_path unique constraint enforced, RLS group-scoping holds.
    Verified the upload script's file-walk + regex parsing against the
    REAL connected folder (not synthetic data): found exactly 333 PDFs,
    correct per-chain counts, correct 311/22 ID-parse split, syntax-checked
    with `node --check`. Verified the Next.js side via a clean
    `npx tsc --noEmit`, `npx eslint`, and `next build` (both
    /api/lfg-surveys/signed-url and /workspaces/site-surveys appear in the
    route list).
    Could not run the actual upload from this sandbox (no access to the
    user's local 6GB folder at that scale, no Supabase service role key) —
    that step is entirely on the user, following the instructions at the
    top of upload-lfg-site-surveys.mjs. Everything downstream (the page,
    the signed-url route, the Copilot tool) depends on that upload having
    run first.
    **Not yet run in production.**
50. Switched LFG site survey PDF storage from Supabase Storage to Cloudflare
    R2, after the first upload attempt failed ("fetch failed") and the user
    clarified they're on Supabase's free tier — which caps Storage at 1GB,
    well under the real 5.7GB dataset, so it would have failed partway
    through regardless of the connectivity issue. Confirmed via
    AskUserQuestion the user wants to keep the PDFs on separate storage
    (not upgrade Supabase's plan), specifically Cloudflare R2 (free tier:
    10GB storage, zero egress fees, S3-compatible).
    Changes: supabase-apple-lfg-site-surveys-schema.sql no longer registers
    a Supabase Storage bucket or its RLS policy — apple_lfg_site_surveys
    stays exactly as before (same table, same RLS), just with
    relative_path now understood as an R2 object key rather than a Supabase
    Storage path. upload-lfg-site-surveys.mjs now uses @aws-sdk/client-s3
    pointed at R2's S3-compatible endpoint
    (https://<ACCOUNT_ID>.r2.cloudflarestorage.com) for the actual file
    upload, while still using the Supabase service role key for the
    linkage-table insert (that data is tiny, stays in Postgres). The new
    /api/lfg-surveys/signed-url route now mints an R2 presigned URL via
    @aws-sdk/s3-request-presigner instead of Supabase's createSignedUrl.
    Important architectural note: R2 has no equivalent of Postgres RLS, so
    the role/group access check (admin bypasses; otherwise role must be
    admin/editor/viewer AND allowed_groups is null or includes customers/
    finance) that used to live in a Postgres policy is now manually
    replicated in this route's TypeScript, querying the profiles table
    directly. Flagged explicitly in the route's own comment that this is
    NOT automatically kept in sync with supabase-module-access-migration.sql
    the way a real RLS policy would be — if that migration's logic changes,
    this route needs a matching manual update.
    New required Vercel environment variables: R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (server-side
    only, no NEXT_PUBLIC_ prefix — same pattern as ANTHROPIC_API_KEY).
    Validated the revised table/RLS via PGlite (same assertions as before,
    minus the now-removed storage-bucket checks). Verified
    @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner install and
    type-check cleanly, confirmed via `npx tsc --noEmit`, `npx eslint`, and
    `next build` (both /api/lfg-surveys/signed-url and /workspaces/
    site-surveys still appear in the build output, unaffected by the
    storage-backend swap). Re-syntax-checked and re-tested the upload
    script's file-walk/parsing logic (unchanged from item 49, still 333
    files / correct chain counts) — only the actual upload call changed.
    Could not run the real upload from this sandbox (needs the user's local
    6GB folder + their own R2 and Supabase credentials) — that remains
    entirely on the user, following the setup steps at the top of
    upload-lfg-site-surveys.mjs (create the R2 bucket + API token first).
    **Not yet run in production. package.json/package-lock.json now include
    @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner as real
    dependencies — make sure `npm install` runs (or let Vercel do it on
    deploy) before/after this push.**
    6GB folder + their own R2 and Supabase credentials) — that remains
    entirely on the user, following the setup steps at the top of
    upload-lfg-site-surveys.mjs (create the R2 bucket + API token first).
    **Not yet run in production. package.json/package-lock.json now include
    @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner as real
    dependencies — make sure `npm install` runs (or let Vercel do it on
    deploy) before/after this push.**

51. Rebuilt SignERP_v2.html (the user's standalone soft-signage costing tool)
    as a native MMDI ONE workspace: Sign Estimator.
    Context: the user uploaded a 2637-line, self-contained vanilla-JS/HTML
    tool they'd built previously (localStorage-only persistence) and asked
    for it to be "incorporated within EKMS MMDI ONE to create estimates...
    in one single screen if possible." Offered two lower-risk defaults
    (embed as-is via iframe; keep localStorage for now) and the user
    explicitly chose the harder path both times: a full React rewrite
    matching MMDI ONE's design system, plus a full migration of all master
    data to real Supabase tables immediately (not localStorage).
    Read the entire original file end-to-end before writing anything, to
    capture every calculation rule faithfully: CutOpt (First-Fit-Decreasing
    bin-packing for aluminium profile cuts — replaces a naive
    ceil(side/stock) per side that wastes material), SheetCalc (charges
    actual sq.ft consumed + wastage%, not full sheets), LEDCalc (grid
    placement for modules; LED bars always placed VERTICALLY for drainage/
    wiring reasons, never horizontal), DriverOpt (smallest single driver
    meeting both a safety-buffer wattage and a max-load-% capacity
    threshold, falling back to multiples of the largest driver), and the
    full pricing rollup (overhead/labour/install/markup/discount/GST/
    margin).
    New Supabase tables (supabase-sign-estimator-schema.sql): 7 master
    tables (sign_profiles, sign_led_modules, sign_led_bars,
    sign_led_drivers, sign_sheets, sign_printing_media, sign_accessories)
    seeded with the original tool's default catalogue (sku is the
    idempotency key via a partial unique index — ON CONFLICT needed an
    explicit `WHERE sku IS NOT NULL` to match it, first PGlite run caught
    this), plus sign_estimates (one row per generated cost sheet/quote,
    storing a full JSON snapshot of the cost breakdown so a past quote's
    cost sheet always re-renders exactly as quoted even if master prices
    later change). RLS gated to the 'customers' group (same as Quotations/
    Site Surveys — same business domain), reusing user_role()/
    user_has_group_access() from the already-live
    supabase-module-access-migration.sql. Validated via PGlite
    (test-sign-estimator.mjs): seed idempotency, category check constraint,
    sku uniqueness with multi-NULL allowed, print_types array round-trip,
    and RLS admit/deny for customers-group vs operations-group users —
    all passed.
    New code: src/lib/sign-estimator/calc.ts (pure, framework-free port of
    every calculator above plus computePrint/computePricing — zero DOM/
    React/Supabase dependencies, so it's independently testable), and
    src/app/workspaces/sign-estimator/ containing page.tsx (hand-rolled,
    externally-controllable tab switcher — NOT the shared <Tabs>
    component, because generating a cost sheet needs to programmatically
    jump the user to the Cost Sheet tab, which <Tabs>'s self-contained
    state doesn't support), EstimatorTab.tsx (the 6-step wizard), 
    MastersTab.tsx + masterConfig.ts (one generic config-driven CRUD
    screen covering all 7 master types, mirroring the original tool's own
    MOD_CFG pattern instead of duplicating 7 near-identical screens),
    CostSheetTab.tsx (re-renders a saved estimate's stored JSON snapshot,
    print button), DashboardTab.tsx, HistoryTab.tsx (+ CSV export), and
    types.ts (the EstimateSnapshot shape stored in sign_estimates.calc).
    Added SignProfileRow/SignLedModuleRow/SignLedBarRow/SignLedDriverRow/
    SignSheetRow/SignPrintingMediaRow/SignAccessoryRow/SignEstimateRow to
    src/lib/supabase.ts, and a "Sign Estimator" nav entry (Customers
    section, after Quotations) to src/components/AppShell.tsx.
    "One single screen" interpreted as: ONE route/nav entry
    (/workspaces/sign-estimator) with internal tab navigation between
    Estimator / Masters / Cost Sheet / Dashboard / History, mirroring the
    original single-file tool's own single-page structure, rather than 5
    separate top-level nav items.
    Known simplification vs. the original: the bin-packing and LED-bar
    layout are shown as clear data tables instead of the original's custom
    SVG diagrams — same underlying numbers, less illustrative artwork.
    Flagged to the user as a deliberate scope trade-off, not an oversight.
    Also fixed two React-hooks-lint violations mid-build (set-state-in-
    effect): accessory line quantities are now derived via useMemo from
    overrides+custom-rows state instead of synced into state via a
    useEffect, and CostSheetTab's loading flag only flips inside the
    fetch's .then callback, not synchronously in the effect body.
    Verified clean via `npx tsc --noEmit`, `npx eslint` (zero errors/
    warnings on all new files), and `next build` (/workspaces/sign-
    estimator appears in the static route list, compiles successfully).
    The known small bug the user mentioned ("it got small error that we
    will fix it later") was never described further and didn't surface
    during the full read-through or the rewrite — if it resurfaces, it's
    likely specific to a workflow not yet exercised.
    **Not yet run in production.** The user needs to: (1) run
    supabase-sign-estimator-schema.sql in the Supabase SQL Editor (after
    confirming supabase-role-based-rls-migration.sql and
    supabase-module-access-migration.sql are already live, which they are),
    (2) copy the new files into ~/Documents/EKMS per the usual handoff
    pattern, (3) commit and push. No data migration script was needed here
    (the original tool's data was only ever in the user's own browser's
    localStorage, not a file that could be exported) — the 7 master tables
    ship pre-seeded with the same default catalogue the original tool
    shipped with, ready to edit via the new Masters tab.
    ship pre-seeded with the same default catalogue the original tool
    shipped with, ready to edit via the new Masters tab.

52. Confirmed Sign Estimator is live in production.
    Follow-up to item 51: the user ran supabase-sign-estimator-schema.sql in
    the Supabase SQL Editor and pushed the code (commit 0293de7) —
    /workspaces/sign-estimator is live. Also cleaned up two loose ends from
    that handoff while updating this file and README.md: added
    supabase-sign-estimator-schema.sql to the repo itself (it had only ever
    been run directly in the SQL Editor, never committed — every other
    schema/migration file in this repo lives at the repo root, so this
    brought it in line with that convention), and re-verified counts across
    the whole app for the README refresh below rather than estimating them
    (46 routes total per `next build`'s own output, 31 real workspace pages
    now that `project` is confirmed to be a pure redirect stub to
    job-orders, and effectively all 31 are Supabase-backed — the only two
    that don't import supabase.ts directly in their page.tsx, ai-copilot
    and sign-estimator, are backed indirectly via the Copilot's API route
    and sign-estimator's own tab subcomponents respectively). `npm run
    build` and `npx eslint src` both still pass clean after these changes.

53. **Bearer auth on API routes (the gate on everything mobile).**
    All three API routes resolved the session from cookies via
    `createServerSupabaseClient()`, which works for a browser but not for a
    React Native client — it holds the session in Keychain and sends
    `Authorization: Bearer`. Added `src/lib/supabase-route.ts` with
    `createRouteSupabaseClient(request)`: header first, cookies as fallback,
    so browser behaviour is unchanged. Still the anon key, so RLS applies as
    before. A third edit in `ai-copilot/route.ts` was easy to miss — line 267's
    `type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>`
    references the removed import and fails the build without it.
    Verified 401 without the header, 200 with it.

54. **Monorepo split.**
    Restructured to `apps/web`, `apps/mobile`, `packages/shared` under npm
    workspaces. `sign-estimator/calc.ts` (894 lines, zero imports — kept
    dependency-free deliberately) moved to `packages/shared` and runs
    unmodified under Hermes. The ~45 row interfaces split out of
    `supabase.ts` into `packages/shared/src/rows.ts`; the client stays
    per-platform. The 137 design tokens transcribed into
    `packages/shared/src/theme.ts` as a JS object, since React Native has no
    CSS custom properties. Shadows deliberately excluded — CSS box-shadow
    strings don't map onto the iOS shadow model.
    Vercel's Root Directory had to move to `apps/web`, with "include files
    outside the root directory" enabled, or the build resolves `@mmdi/shared`
    and fails.

55. **Custom domain and the middleware gap.**
    Added `app.mmdi.in`. Vercel's Standard Protection exempts production
    *custom* domains but not `*.vercel.app`, so this is what makes the API
    reachable from a device at all.
    Then found that `supabase-middleware.ts` redirected every unauthenticated
    request to `/login`, including `/api/*` — so a Bearer request was bounced
    before reaching the handler. Middleware now skips `/api` entirely; every
    route authenticates itself, and an API client gets a 401 rather than a
    redirect to an HTML page.

56. **MFA enforcement restored on API routes (regression fix).**
    Item 55's middleware change removed the only `aal2` check in the system —
    no route checked it independently. Any password-only session, browser or
    device, could call all three routes and bypass the TOTP step-up.
    Added `requireVerifiedUser()` to `supabase-route.ts`, returning 403
    `mfa_required` rather than 401 (credentials valid, assurance level not).
    Verified against the installed `@supabase/supabase-js` type declarations
    rather than the docs.

57. **R2 signed-URL vulnerability closed.**
    `lfg-surveys/signed-url` passed the caller's `path` straight to
    `GetObjectCommand` without checking it corresponded to a real row.
    Presigning succeeds for any key — R2 doesn't verify existence at signing
    time — so any authenticated viewer could obtain a signed URL for any
    object in the bucket by guessing keys. `knowledge-files/signed-url`
    already did this check, which is why it 404'd where surveys returned 200.
    Added the same row lookup. Verified: fake path now 404s, real path still
    resolves.

58. **Copilot returns structured tool results.**
    The route returned `{ content, citations }` where citations were prose
    strings — a client couldn't turn `Site survey search: "a"` back into a
    record. Now returns `results: [{ tool, input, result }]` alongside, so
    the app can render tappable cards.
    Also found `find_site_survey`'s `.select()` never included
    `relative_path`, despite the tool description, the system prompt and the
    result's own `note` field all claiming it did — three places describing
    behaviour that never existed, because they were edited as documentation
    rather than derived from the query.

59. **Client-agnostic prompt.**
    `SYSTEM_PROMPT` told the model to send people to `/workspaces/...` paths.
    Meaningless on mobile. Reworded across six places: files are named and
    the client renders them openable; genuine page-only features (CSV export,
    filterable reports) are named in words as desktop features.

60. **Expo app scaffolded and built (`apps/mobile`).**
    SDK 57, expo-router, five tabs: Copilot, Surveys, Estimate, Documents,
    Reports. Sign-in via `context/auth.tsx` with `Stack.Protected` guards.
    Non-obvious requirements that cost time: `react-native-url-polyfill/auto`
    must be the first import (Hermes has no WHATWG URL); `expo-secure-store`
    rather than localStorage; and the Supabase client must be created lazily
    or platform-gated — building it at module scope with the SecureStore
    adapter crashes expo-router's Node-side SSR validation pass, which
    presents as "dev server unreachable" rather than as an error.
    `metro.config.js` should be a bare `getDefaultConfig(__dirname)` — SDK 52+
    auto-configures monorepo resolution, and manual `watchFolders` /
    `disableHierarchicalLookup` overrides break transitive dependency
    resolution.

61. **Copilot tool-result cards.**
    Replaced the single survey extractor with a registry keyed by tool name.
    Three entries: `find_site_survey` (tappable, opens the PDF),
    `search_lfg_sites` and `search_job_orders`/`get_job_order` (informational,
    no chevron — a chevron that navigates nowhere teaches people the app is
    broken). Capped at 4 per tool call with an "and N more" line. Status shown
    as a coloured dot plus a text label, never colour alone.

62. **Installation report capture — schema and upload route.**
    Found that the web tool persists *nothing*: `InstallationReportClient.tsx`
    holds the whole report in React state and hands it to `pdfBuild.ts`.
    There was no `installation_reports` table. So this wasn't a port; the
    persistence layer never existed on either platform.
    Added three tables (`installation_reports`,
    `installation_report_site_entries`, `installation_report_photos`), with
    store fields snapshotted rather than only FK'd — master data changes, and
    a filed report should read as it was on the day.
    `POST /api/installation-photos/upload-url` issues presigned PUTs, with the
    same ownership check the surveys route was missing.
    An AWS SDK v3 quirk broke every upload until found:
    `requestChecksumCalculation: "WHEN_REQUIRED"` is needed, since newer SDK
    versions attach CRC32 params to presigned PUTs that R2 rejects.

63. **Installation report capture — mobile flow.**
    Drafts to `Paths.document` (not `Paths.cache` — iOS evicts cache under
    pressure, which is the exact data loss this prevents), photos resized to
    ~1600px / JPEG 0.7 before upload, idempotent per-photo submit with disk
    checkpointing. Reports list merges local drafts with server state across
    three visually distinct states, with Resume for partial submits and
    Discard for unresumable ones.
    `installation_reports` DELETE was admin-only, so Discard didn't work for
    the supervisors who own the orphans — added a narrow policy allowing a
    user to delete their own `draft` reports only. Verified with a real
    non-admin account across three isolated cases.

64. **`expo-file-system` migration.**
    `cacheDirectory` and `downloadAsync` were removed in SDK 54. Migrated all
    three screens to `new File(Paths.cache, name)` +
    `File.downloadFileAsync(...)`. Also removed `headerLargeTitle` from the
    tab layout — not a stale API so much as one that never existed on
    `BottomTabNavigationOptions`; large titles are native-stack only.

65. **Gmail integration — OAuth foundation.**
    `mmdi.in` is a Google Workspace domain, so the OAuth consent screen is
    **Internal** and Gmail's restricted scopes need no third-party security
    assessment. Scopes: `gmail.readonly` and `gmail.compose`.
    Refresh tokens in Supabase Vault via three `SECURITY DEFINER` wrappers
    that derive the user from `auth.uid()` with no user-id parameter — Vault's
    own `create_secret` has privileges revoked from `PUBLIC`, so the client
    can't call it directly. `google_tokens` exposes only a `vault_secret_id`.
    Connect gated behind `aal2`. Disconnect calls Google's revoke endpoint,
    not just a local delete — verified by reading the token before
    disconnecting and confirming Google returned `invalid_grant: Token has
    been expired or revoked` afterwards.
    Domain restricted to `@mmdi.in` via `hd` plus server-side re-verification.
    Address matching (Google address must equal the MMDI ONE login) was built
    and then **deliberately removed** — MMDI ONE logins may be on any domain
    while mailboxes must be `@mmdi.in`, so the two can't be compared
    meaningfully. Removed rather than disabled: dead code that looks like a
    security control is worse than none.

66. **Gmail — search, audit log, prompt hardening.**
    `search_email` returns sender, subject, date, thread link and a
    300-character excerpt, capped at 10 — never full bodies. Scoped to an
    allowlist of labels (`FollowUP`, `FSC COC`, `IKEA Purchase Order`,
    `MMDI/Customers`) held in config, not tool parameters, so the model picks
    among permitted labels and cannot widen the set.
    Gmail label matching is case-sensitive, and a config label that doesn't
    exist in the mailbox originally produced an empty result indistinguishable
    from "nothing matched" — now surfaced as `unresolved_labels`.
    `gmail_activity_log` records action, query, label and hit count. **Never
    message content** — there is no column for it. Insert-own, select-admin,
    no update or delete policy at all.
    Tested against a real injected instruction filed under an allow-listed
    label: the model summarised the legitimate content, named the injection
    attempt as untrusted, and neither complied nor acted silently. Confirmed
    on two independent runs.

67. **Gmail — draft, with the recipient constraint.**
    `draft_email`'s `input_schema` contains only `subject` and `body`. There
    is **no recipient field for the model to populate**, so an injected
    instruction has nowhere to write an address. The recipient comes from a
    `customer_contacts` lookup resolved server-side before the model is
    invoked, keyed on `contactId` from a request field structurally separate
    from the messages array.
    Tested with the plan's own adversarial scenario verbatim in an email body:
    no draft was created, and the model named the suspicious domain rather
    than acting on it. Zero draft actions logged across all test rounds.
    Recipient *selection state* (name and company, never the address) is
    passed into the model's context so it can prompt for a recipient up front
    rather than gathering content and failing at the end.
    Contact picker UI added on both the workspace page and the global drawer.

68. **PWA, and the mobile shell fix underneath it.**
    The real finding was that `AppShell` had no mobile behaviour at all —
    `Sidebar`'s own doc comment promised a slide-out drawer that was never
    built, and `TopNav` didn't wrap, so at phone width the nav consumed the
    viewport and every page looked broken regardless of its own breakpoints.
    That, not the individual workspaces, is why `job-orders`, `machine` and
    `raw-material` appeared unusable.
    Added a real off-canvas drawer, a collapsing top bar, a controllable
    command palette, and `RelationshipGraph`'s documented-but-unimplemented
    mobile list view.
    Then the PWA layer: manifest, icons from brand tokens, app-shell service
    worker (`/api/*` and Supabase deliberately excluded — caching business
    data means showing stale numbers with no way to tell), install prompt.
    Next 16's `appleWebApp` metadata only emits the unprefixed
    `mobile-web-app-capable`; iOS requires the `apple-` prefixed tag, added
    explicitly. Safe-area insets applied additively as
    `calc(original + env(safe-area-inset-*))` so desktop is unaffected.

69. **Apple Developer enrollment and first device build.**
    Individual enrollment, team `DR9HATVRF7`. Development build installed on a
    physical iPhone; Developer Mode required for non-App-Store builds.
    Verified on hardware for the first time: sign-in persistence, survey
    download through Bearer auth → signed URL → `File`/`Paths` → share sheet,
    Copilot with tool-result cards, estimator, Dynamic Type.
    Camera failed with `MissingCameraPermissionException` — root cause was
    that `expo-image-picker` was absent from the `plugins` array entirely, so
    `NSCameraUsageDescription` was never written to Info.plist. Added the
    plugin with explanatory strings and `microphonePermission: false` (the app
    only ever picks images).

70. **Estimate Builder + Quotations workspaces — documented here for the
    first time.** These two workspaces (`/workspaces/estimate-builder`,
    `/workspaces/quotations`) were built and shipped across several prior
    sessions with zero mention anywhere in this file — the gap surfaced
    when this session went looking for context before making further
    changes and found none. Documenting what actually exists, retroactively:
    - `estimates` + `estimate_line_items` (Supabase, versioned — every save
      creates a new row rather than updating in place, so `quoteNumber` +
      `version` display e.g. "IKEA-EST-0001 (Version 2)" while every past
      version stays retrievable).
    - Three line-item sources feeding one shared `DraftLine` shape: **From
      contract catalog** (IKEA/Apple rate cards), **From recent purchases**
      (real `sales_transactions` history for the selected customer), and
      **Non-contract / unlisted product** (fully custom). Pricing basis is
      either `nos` (quantity × rate) or `sqft` (area × rate).
    - Per-estimate fields beyond the line items: Campaign/Job#/Program,
      attention person (live-picked from that customer's active contacts,
      not a stale flat field), quote subject, customer address/GSTIN, GST
      percent, job-completion/delivery-commitment text, payment terms
      (net days / 100% advance / against delivery), notes, and a sales
      person snapshot (name/designation/phone/email) for the PDF sign-off.
    - `src/lib/estimateBuilder/pdf.ts` generates the actual customer-facing
      quote PDF entirely client-side (`pdf-lib` + `@pdf-lib/fontkit`,
      Caladea font as an OFL-licensed Cambria substitute — Cambria itself
      can't legally be bundled) — Date/To/Attn/Subject/Quote No. block, a
      line-items table, fixed Prices/Job-Completion/Delivery/Payment-
      Schedule paragraphs, and a signing block.
    - The Quotations workspace (`/workspaces/quotations`) lists every
      estimate ever saved, all versions, across all customers — searchable
      by Campaign/Job#/Program, quote number, or customer name — with a
      one-click PDF re-download per row (re-generates from the saved line
      items, not a cached file).
    No SQL migration was written or changed this session for this item —
    this is a documentation-only entry closing the gap. See item 71 for
    this session's actual code changes.

71. **Estimate Builder: a full round of live-testing-driven fixes**, found
    by the user generating real quotes against production and reporting
    back screenshots — no single big feature, six real bugs/gaps closed in
    one sitting:
    - **UOM was gated to the wrong tabs, then generalized.** The user
      wanted a real cm/feet/inches unit selector controlling how Width/
      Height are entered (select "Feet", then type the size in feet — no
      manual conversion), positioned before Width/Height, and visible on
      all three line-item source tabs (contract catalog/history/custom) —
      it had only been showing on custom/history. `getSizeUnit(uom)` in
      `pdf.ts` (replacing a plain `isFeetUom` boolean) now resolves cm/ft/
      in from the same `uom` text already persisted per line — no new DB
      column — and both the PDF and the on-screen Estimate Builder read
      Width/Height through it consistently.
    - **Bulk Total-SQFT entry**, for quoting a lump area with no specific
      panel dimensions. A "Size entry" toggle (Width × Height / Total
      SQFT) on area-priced lines; on reload, whether a saved line used bulk
      entry is reverse-inferred from `width_cm`/`height_cm` being null
      while `sqft_total` is populated — again no new DB column.
    - **On-screen Qty column was showing e.g. "1 ft"** for SQFT-priced
      lines — UOM there is the cm/ft/in size unit, not a genuine quantity
      unit, and was being appended to Qty by mistake. Only "nos" lines
      (which have a real per-piece UOM like Boxes/Rolls/Each) show it now.
    - **PDF table cells were clipped to one line and headers could
      overlap** ("GST@18%" running into "Grand Total"). Rows (body and
      header both) now wrap every cell up front and grow to fit the tallest
      cell instead of silently dropping text past the first line.
    - **PDF line items were missing their own description and an HSN
      code.** The Design/Product cell only ever showed design name +
      product name, dropping `description`/`additionalDescription` (e.g.
      "bubble free vinyl UV print" specs) that the on-screen table already
      displayed — threaded `additionalDescription` through
      `EstimatePdfLine` and every construction site. Every line now also
      prints "HSN: 4911", the HSN code covering this business's printed
      products (fixed value, not a new per-line field, since every line
      item this business quotes is a printed product).
    - **Quote subject now defaults to "Quote for - Digital Printing
      Graphics"** instead of blank, so it doesn't need retyping on every
      new estimate — still fully editable per estimate.
    - **Sales person picker was a plain `<select>` listing ~500
      employees** — replaced with the same searchable `Dropdown` component
      already used for rate-card/sales-history product search.
    - **People workspace gained its first edit affordance.** Clicking an
      employee row used to just show a toast ("Opened <name>") and do
      nothing. Added an edit drawer (office mobile number + office email
      ID) — `off_phone`/`off_email` columns already existed on
      `public.employees` (from an earlier session's HR-roster import),
      there was simply no UI anywhere to write them.
    Verified via a clean `next build` (Turbopack, using the established
    font-stub-then-restore workaround for the sandbox's lack of network
    access to fonts.googleapis.com), `tsc --noEmit`, and `eslint` on every
    changed file each round. One pre-existing, unrelated lint error was
    noticed in passing (`people/page.tsx`'s `recentJoiners` filter calls
    `Date.now()` during render, flagged by a `react-hooks/purity` rule) —
    not introduced by this session's changes, left as-is rather than
    scope-creeping into an unrelated fix.
72. **Cost Sheet module (Tools) — from a Cowork session, not Claude Code.**
    Started as a completely different task in a chat with no repo access:
    the user asked for a "cost sheet" built from two files (FG Codes BOM
    Specs.xlsx — 33 FG-type BOM "recipes" across 16 work centres — and a
    Jan-Jun 2026 purchase register export, ~6,900 real transaction rows).
    That was delivered first as a standalone Excel workbook (materials
    priced at both recent and quantity-weighted-average purchase rate,
    computed with live formulas over the raw purchase data, not
    hardcoded numbers) before the user said "I want a module in EKMS MMDI
    One in tools tab" — at which point the session fetched this repo's
    README, found this file, cloned the repo, and read the "Next up"
    section a previous session had left specifically for this moment. Its
    three scoping questions were asked verbatim (as multiple-choice, this
    being a Cowork chat) and answered: new standalone Tools workspace
    (not an extension of Sign Estimator's `CostSheetTab` or the Costing
    dashboard), wired to real Supabase data, BOM + Work Centre cost model.
    - **Schema** (`supabase-cost-sheet-schema.sql` /
      `-seed.sql` / `-unit-cost-backfill.sql`): `bom_templates` (33) +
      `bom_template_lines` (139, material name/category/consumption/
      wastage per line) + `work_centre_rates` (57, keyed on work centre +
      print mode + substrate, tagged confirmed/extrapolated/missing
      confidence) — plus 4 new columns on `raw_materials`
      (`unit_cost_recent/_avg/_recent_date/_source`), backfilled for 399
      of ~1,558 items (the ones actually purchased in the Jan-Jun 2026
      window; the rest stay NULL). Deliberately did NOT auto-map BOM
      lines to `raw_materials.code` — the BOM's shorthand names (e.g.
      "RSD Flex 340GSM") don't reliably text-match the purchase
      register's real item names, so every line ships unmapped with a
      `suggested_codes` hint column instead of a guessed FK, same
      reasoning as the Excel workbook's mapping sheet. RLS is plain
      `authenticated`-only, not group-gated (Tools nav section is
      deliberately ungated — see `AppShell.tsx`'s `SECTION_GROUP`
      comment). Validated all three files against a real local Postgres
      via a one-off PGlite harness before committing (row counts, RLS
      policy counts, and one cross-checked raw_materials backfill value
      all matched expectations) — no equivalent `test-*.mjs` was left in
      the repo since PGlite wasn't already a project dependency and
      wasn't added as one just for this.
    - **UI** (`apps/web/src/app/workspaces/cost-sheet/`): a 3-tab page
      (Cost Sheet / BOM Master / Rate Card), same one-route-internal-tabs
      structure as Sign Estimator. Cost Sheet tab is the live calculator
      (FG code → dimensions/qty/selling price → material cost at both
      recent and average price + per-work-centre process cost, flagging
      unmapped materials and missing rates inline rather than silently
      showing ₹0). BOM Master tab maps lines to real raw materials via a
      client-side-filtered picker (`RawMaterialPicker.tsx` — the ~1,558-
      row `raw_materials` table is loaded once, filtered in memory, no
      per-keystroke query). Rate Card tab edits rates inline with
      confidence badges. `calc.ts` holds the actual math with no Supabase
      import, kept separate and pure on purpose.
    - Added `BomTemplateRow` / `BomTemplateLineRow` / `WorkCentreRateRow`
      to `packages/shared/src/rows.ts`, extended `RawMaterialRow` with the
      4 new columns. Added a "Cost Sheet" entry to `AppShell.tsx`'s Tools
      section.
    - **Verification, and its limit.** `npm run typecheck` and `npm run
      lint` both came back clean on every new/changed file (a handful of
      pre-existing errors/warnings elsewhere — `account/page.tsx`,
      `people/page.tsx`, `procurement/page.tsx`, `sops/page.tsx`,
      `verify5_tmp.ts` — were left alone, not introduced here; the
      `people/page.tsx` one is the same `Date.now()`-during-render issue
      item 71 above already flagged and chose not to fix). Could NOT get
      a clean `next build` in this session's sandbox — it crashed with a
      native "Bus error" the instant Next tried to load
      `@next/swc-linux-arm64-gnu`, confirmed by `require()`-ing that
      module directly outside of Next entirely (same crash, and the musl
      variant crashes identically) — an environment-level ARM64/sandbox
      issue unrelated to this change's code, not something fixable from
      inside the session that hit it.
    - **Handoff mechanics — read this before assuming the work is lost.**
      This session's sandbox is a Cowork workspace with git fetch access
      but no push credentials (confirmed: `git push --dry-run` fails with
      "could not read Username for 'https://github.com'"), unlike a
      Claude Code session which might be configured with push access.
      The commit exists on a local branch (`cost-sheet-module`, one commit
      on top of the tip this session found) inside that ephemeral
      sandbox only — it does not exist on GitHub yet. Whoever picks this
      up next needs to find out from the user how (or whether) those
      changes made it out of that sandbox before re-doing any of this
      work from scratch.

73. **RawMaterialPicker data-quality fixes** (BOM Master's raw-material
    dropdown, both the main "Mapped raw material" picker and the "+
    alternative material" one), across several rounds in one continuous
    thread with the user. First report: "while selecting the material i
    see all list of items... i dont see some of them in the list i should
    search with their number then only they appear example when search
    for backlit material with keyword backlit i see 12001 then jumped to
    12006 whereas 12003 4, 5 are valid." Two real bugs, both in
    `RawMaterialPicker.tsx`:
    - `raw_materials` had picked up a batch of rows that are really
      Finished Goods reference codes (e.g. "FG - 41004 — BACKLIT
      SIGNAGES"), matching `import-finished-goods.sql`'s `inventory_skus`
      seed exactly — contaminating every search. Fixed with a code-format
      signature (`/\s-\s/`, space-dash-space — unique to the contaminated
      batch, real codes like "FG-13300"/"GE-23096" never have it) plus,
      once that signature proved incomplete (some junk rows like
      "FG-41123" have no spaces), a category-based `EXCLUDED_CATEGORIES`
      set covering 16 non-material categories confirmed via a live audit
      query the user ran and pasted back as CSV (General Items, Fixed
      Assets, General Services, Spare Parts for Machinary, SI - Margins,
      Flag Costing (placeholder), 7 "FG - ... Applications" categories,
      BPCL Signages, Backlit/Nonlit Soft Signs).
    - The empty-query "browse" list was capped at 200 rows BEFORE sorting
      by the line's `preferredCategory`, so relevant items (like
      RM-12003/4/5) could get squeezed out of the cap entirely by
      unrelated categories that happened to sort earlier — exactly the "I
      have to search by number" symptom. Fixed by pulling
      `preferredCategory` items out in full before applying the cap to
      everything else.
    - Follow-up report ("it is still not showing full backlit materilas
      with 12002,3,4,5") led to a second live audit (58 distinct
      `raw_materials.category` strings) that found the real root cause:
      RM-12002 through RM-12005 sat under old Tally-style category
      buckets ("RM - BACKLIT SIGNAGE MATERIALS" etc.) that were never
      migrated to the newer taxonomy ("Backlit Flex") a subset of codes
      already used — so they never grouped with RM-12001/12006 in the
      picker even though they're the same product family. Per the user's
      own answers to a clarifying question (hide non-material categories,
      hide "General Items" entirely, merge old/new category duplicates
      UI-only first): added `CATEGORY_ALIASES` (5 confirmed old↔new
      category pairs) and `canonicalCategory()`, used throughout the
      picker's filtering/grouping.
    - The user then explicitly asked for the real database fix, not just
      a UI merge ("give bom-raw-material-category-cleanup sql yi are not
      gving it here") — `supabase-raw-material-category-cleanup-
      migration.sql` (delivered standalone, not committed to git, same
      pattern as every other supabase-*.sql file this session) actually
      consolidates the same 5 pairs at the database level. **Confirmed
      run in production** — the user uploaded a follow-up audit CSV
      showing the exact expected post-migration category counts (e.g.
      "Backlit Flex" now 468 rows, matching 22+436+2+8 from the
      pre-migration breakdown), verified programmatically before telling
      the user it matched.
    Branches `bom-raw-material-picker-filter-fix` and
    `bom-raw-material-category-cleanup`, both **confirmed merged into
    `main`**.

74. **RawMaterialPicker dropdown that could never be closed** — "once i
    start selecting materials when i endup i cant close the selction
    box!!" Root cause: picking a row removes that `<button>` from the DOM
    (the list re-renders without it), and the browser's default behavior
    on losing focus like that is to shift focus back onto the search
    `<input>` immediately above it — whose own `onFocus` handler
    immediately reopened the dropdown, so closing it by picking something
    (or clicking away) looked like it never actually worked. Fixed with
    `onMouseDown={(e) => e.preventDefault()}` on every option/close button
    (stops the focus-shift from happening at all) plus a real independent
    close path: a click-outside listener and an Escape-key handler, both
    standard for a custom dropdown that isn't a native `<select>`, plus a
    small explicit close (×) button in the dropdown's own header.
    Verified via a clean `npx tsc --noEmit` + `npx eslint`. Branch
    `bom-raw-material-picker-close-fix`, **confirmed merged into `main`**.

75. **Sign Estimator Cost Sheet: per-sign display fix + real PDF
    download.** Two small, separate user reports on the same tab
    (`apps/web/src/app/workspaces/sign-estimator/CostSheetTab.tsx`):
    - "check this profie is charged for 3 qty rest all compnents are
      charged for 1 qty? how do we show it?" — a real display-consistency
      bug (not a pricing bug) in how the Profile line's total was shown
      relative to every other line; fixed so every cost line reads
      per-sign consistently, matching how the rest of the sheet already
      displayed. Verified against a re-rendered cost sheet before telling
      the user it was fixed.
    - "Instaed of print pdf give download pdf. and convert fonts to
      nearest cambria font" — replaced the old `window.print()` button
      with a real client-side PDF generator: new
      `src/lib/signEstimator/pdf.ts` (`pdf-lib`, portrait A4,
      `StandardFonts.TimesRoman`/`TimesRomanBold` as the closest available
      Cambria substitute — matching the same font choice already used by
      Import Duty's own `pdf.ts`), a 3-column label/detail/value row
      renderer matching the on-screen `<Row>` layout exactly, and a
      `downloadBlob()` helper triggering a real browser download named
      `<ref>.pdf`. Caught and fixed two self-found rendering bugs before
      handoff: a section-header background bar that extended 12pt above
      its own section's starting cursor position (overlapping the line
      above it whenever that line wrapped to two lines), and a stray leftover
      highlight rectangle + extra spacing that pushed the footer note onto
      an otherwise-blank second page — both confirmed fixed via a
      re-rendered test PDF, not just reasoned about.
    Verified via a clean `npx tsc --noEmit` + `npx eslint`. Branches
    `sign-estimator-profile-per-sign-display-fix` and
    `sign-estimator-download-pdf-cambria`, both **confirmed merged into
    `main`**.

76. **BOM Master: editable FG code names, a better clone flow, and manual
    display ordering** — "give an option to edit names and also give
    option to duplicate the FG codes and place them in order," after the
    user noticed two very similarly-named FG codes ("UVDD-Flex" /
    "UVDD-Flex-MultiLayer") sitting apart in the list purely because their
    codes happened to sort that way alphabetically, with no way to place a
    clone next to its source on purpose. Three changes to
    `BomMasterTab.tsx`:
    - **Inline editing**: a pencil icon next to each FG code opens an
      editable Code + Description pair (Check to save, X to cancel).
      Confirmed renaming `code` is safe before shipping it — `
      bom_template_lines` references templates by `template_id` (a uuid
      FK), never by `code`; `work_centre_rates` keys on `(work_centre,
      print_mode, substrate)`, not code either; every place that displays
      a template's `code` elsewhere (saved cost sheets, the Estimate Pool)
      is a frozen historical snapshot that deliberately never rewrites
      itself when the source template changes later, matching the
      "don't rewrite history" convention already established for every
      other saved-snapshot feature in this app.
    - **Better clone**: the clone dialog now also lets you edit the
      description up front (previously code-only), and the new copy is
      spliced in directly after its source within the category — not
      wherever its new code string happens to sort alphabetically.
    - **Manual ordering**: new up/down arrows next to each FG code
      reorder it within its category. Backed by a new `bom_templates.
      sort_order integer` column
      (`supabase-bom-templates-sort-order-migration.sql`, backfilled to
      each row's current alphabetical position on migration so nothing
      visibly reorders the moment it ships — **not yet confirmed run in
      production**, see "Next up"). `renumberCategory()` renumbers a
      whole category to clean sequential values (0, 10, 20...) any time
      an item in it moves, gets created, or gets cloned, so gaps/ties
      never really accumulate. `CostSheetCalcTab.tsx`'s own
      `bom_templates` fetch was also updated to order by `sort_order`, so
      the Cost Sheet tab's template picker reflects the same manual order
      as BOM Master.
    - Self-caught (not user-reported) an HTML-invalidity bug while
      building the inline-editing UI: the existing clickable title area
      was a native `<button>`, and a `<button>` cannot legally contain
      another `<button>` or `<input>` as a descendant (browsers silently
      restructure/break the DOM when it happens, which can cause React
      hydration mismatches) — the new Edit/Save/Cancel buttons and text
      inputs needed exactly that. Fixed by converting the outer element to
      `<div role="button" tabIndex={0} onClick=... onKeyDown={...}>`,
      keeping click-to-toggle and Enter/Space keyboard access, before ever
      showing it to the user.
    Verified via a clean `npx tsc --noEmit` + `npx eslint`. Branch
    `bom-master-editable-names-and-ordering`, **confirmed merged into
    `main`**.

77. **Cost Sheet: tick multiple alternative materials at once** — "can i
    have selction ticks so that i can do it at once," after the "+
    alternative material" picker's click-to-pick-and-close behavior (fine
    for the primary "Mapped raw material" picker, which only ever holds
    one value) meant adding several alternatives required reopening and
    re-searching the dropdown after every single pick. Added a `multiple`
    mode to `RawMaterialPicker.tsx`: checkboxes on each row instead of an
    immediate pick, a running "N selected" label plus an explicit "Add
    (N)" button in the dropdown header, and a bulk `addAlternatives()` in
    `BomMasterTab.tsx` (`upsert` with `ignoreDuplicates: true`, so
    re-ticking an already-added alternative is a silent no-op, same
    handling as the existing single-add path's `23505` case). The primary
    picker is untouched — still single click-to-pick. Verified via a
    clean `npx tsc --noEmit` + `npx eslint`. Branch
    `bom-alternative-material-multiselect`, **confirmed merged into
    `main`**.

78. **WC4 Lamination / WC5 Application missing from the work centre
    checklist, and a related "material can't be its own alternative" bug**
    — two related small fixes from the same stretch of the session.
    - "in the work centres: 4 and 5 are missing lamination and
      application" — BOM Master's "Work centres for this FG code"
      checklist isn't hardcoded; it lists whatever distinct `work_centre`
      values already exist in `work_centre_rates`. A live audit (asked the
      user to run it, since this sandbox has no direct DB access) confirmed
      WC4 and WC5 had ZERO rows there at all — every other work centre
      (WC2, WC6A/B, WC7, WC8, WC9, etc.) did — so they'd never appeared as
      checkable options, even though they're real production steps. Per
      the user's own choice (bootstrap one placeholder row each, rather
      than guessing which substrates they apply to up front):
      `supabase-work-centre-4-5-bootstrap-migration.sql` inserts one
      `confidence = 'missing'` row per centre, just enough to make them
      appear in the checklist — `BomMasterTab.tsx`'s existing
      `ensureRateCombos()` already auto-creates the real substrate-specific
      rate row the moment either gets checked on an actual FG code, same
      as every other work centre, so nothing else needed to change.
      **Confirmed run in production** — the user shared a screenshot of
      the verification query returning both new rows.
    - While investigating, found a real duplicate-listing bug the user
      then separately reported: "the selction is duplicate observed
      highted ink" — the Cost Sheet tab's Mapped-to dropdown showed one
      material twice for some lines (once as the current default "...
      (default)", once again plain), because that material was also
      sitting in the line's own `bom_template_line_alternatives` — left
      over from before it was promoted from alternative to default. A
      material can't be its own alternative. Fixed at the source in
      `BomMasterTab.tsx` — `mapLineToMaterial()` now drops the newly-set
      default out of that line's alternatives if it was there;
      `addAlternative`/`addAlternatives` now refuse to add a line's
      current default as its own alternative in the first place — plus a
      display-side backstop in `CostSheetCalcTab.tsx` that skips any
      alternative matching the default regardless. Existing bad rows need
      a one-time cleanup:
      `supabase-bom-template-line-alternatives-dedupe-migration.sql`
      (deletes any `bom_template_line_alternatives` row that already
      matches its line's current `raw_material_code`) — **not yet
      confirmed run in production**.
    Verified via a clean `npx tsc --noEmit` + `npx eslint`. Branch
    `bom-alternative-material-no-self-duplicate`, **confirmed merged into
    `main`** — the dedupe migration itself is the one piece of this item
    not yet confirmed run (see "Next up").

79. **Mobile: real Cost Sheet calculator, GP methodology correction, Jarvis
    wake word, Estimate PDF parity, Sales by Rep unfreeze + charts, and a
    sales_transactions item_description data-quality fix.** A separate,
    later Cowork session, entirely inside `apps/mobile` — unrelated to
    items 73-78's web BOM Master work above (those items' own outstanding
    SQL files are untouched by this one). Delivered across many rounds as
    git bundles (this sandbox has no GitHub push access — same
    fetch-only/bundle-handoff constraint as every prior session in this
    file), each merged and rebuilt locally by the user via
    `eas build --platform ios --profile preview --local`.
    - **Cost Sheet tool rebuilt from scratch.** The existing mobile "Cost
      Sheet" tab was actually a list of past Sign Costing runs, not the
      web app's real Tools > Cost Sheet BOM+Work Centre calculator ("in my
      previous chat i asked to add new module cost sheet but not sign
      costsheets"). Built a real native port
      (`app/(tabs)/cost-sheets.tsx`, `lib/costSheet/calc.ts`,
      `lib/costSheet/categoryOrder.ts`) with full parity to
      `CostSheetCalcTab.tsx`: per-line on/off overrides, a per-line
      alternative-material picker (`bom_template_line_alternatives`),
      per-work-centre on/off, full price/wastage/markup/line-cost detail,
      and "Add to Estimate Pool" (writes to `estimate_pool_items`, same
      shape the web tool uses, pickable later from Estimates). The old
      Sign Costing history list was kept, just moved to its own
      `href: null` route (`sign-costing-history.tsx`) reached via a link
      on the new Cost Sheet screen, not lost.
    - **Suggested Selling Price GP methodology went through several real
      corrections, not one clean build.** First pass used a
      gross-profit-MARGIN formula (`price = cost / (1 - GP%)`), which
      looked right against one early chat-shorthand example ("GP 50%
      means 100 becomes 200") but was actually wrong — a later, detailed
      written methodology made clear MMDI's real costing policy is a
      cost-plus MARKUP (GP% as a percentage of a cost base, added on top
      of it), a different formula except by coincidence at certain
      percentages. Final formula (`suggestSellingPrice` in `calc.ts`):
      Traditional = GP% applied to the full cost base (raw material incl.
      wastage/markup + ink + work centre cost), default 50%; Value
      Addition = raw material recovered at cost (no GP), GP% applied to
      ink + work centre cost together, default 100% — ink was initially
      left out of Value Addition's GP base per an early reading of the
      methodology, then corrected back in per explicit follow-up
      instruction ("we should take ink cost component also in value
      addition GP"). Target GP% is user-editable (not fixed), resets to
      each method's own default when the Method toggle is switched, and a
      real on-screen "How this price was calculated" breakdown was added
      (raw material → ink → work centre → GP amount → final price, ink
      row hidden when it's ₹0) after the user reported the numbers alone
      were confusing without seeing the math. Also fixed along the way: a
      shared `NumberField` component whose displayed text never
      re-synced when its value changed from OUTSIDE the input itself
      (Method-switch reset, "Apply Suggested Price" button) — the
      underlying number was always correct, but the visible text box
      could show a stale value, which is exactly the kind of thing that
      looks like a math bug but isn't one.
    - **"Hey Jarvis" wake word fixed twice.** First: the on-device speech
      recognizer wasn't biased toward the wake phrase at all — added
      `contextualStrings: ["Jarvis", "Hey Jarvis"]` to
      `expo-speech-recognition`'s `start()` call, plus a visible
      diagnostic caption and session counter so "is it even listening"
      stopped being a guess. That surfaced a second, real bug: an iOS
      `AVAudioSession` activation race (restarting the recognizer in the
      same tick as the previous session's `end`/`error` event throws
      "Session activation failed") — fixed with a 400ms delay before
      every restart, both the wake-loop restart and the wake-to-dictation
      handoff (`app/(tabs)/copilot.tsx`).
    - **Estimate PDF matched to the web app's fonts/layout/colors.**
      `app/estimate/[id].tsx` now embeds the real Caladea TTF (base64
      `@font-face`, copied from `apps/web/public/fonts/`) instead of
      falling back to WebKit's default serif, and its HTML/CSS was
      redesigned with a colored `metabox` (customer/quote details) and a
      navy header row + zebra striping, mirroring the in-app Bill
      screen's look instead of plain black-on-white paragraphs.
    - **Sales by Rep: unfroze the top panel, added a donut chart.** The
      rep/customer pickers, date range, Run report button, and the Total
      Sales/Customers/Transactions cards used to be fixed siblings above
      the customer `FlatList`, permanently eating the top of the screen.
      Restructured so everything — filters, stat cards, the existing
      trend/bar charts, and the customer list — lives inside one
      `FlatList`'s own header/data, so the whole screen scrolls together.
      Also added `react-native-svg` (new native dependency — needs
      `npx expo install react-native-svg` once before the next rebuild)
      and a real donut/ring chart ("Sales mix by product," top 4 + an
      "Others" slice) alongside the existing bar breakdowns.
    - **sales_transactions.item_description data-quality gap found and
      mostly fixed.** User reported a specific missing product name on a
      real invoice (Bhima Gold, ₹3,00,375 line showing "Not recorded").
      Traced it to `supabase-sales-transactions-invoice-fidelity-
      migration.sql`'s own embedded backfill data (found the confirmed-
      correct name, "HSD STAR BLACKOUT FLEX," by matching invoice number +
      taxable value against that file's 9,274-row dataset) — that
      migration's gap-fill had run, but only reached 74% of rows
      (`supabase-sales-transactions-prefer-item-name-migration.sql`,
      confirmed via a live count query: 6,863/9,274). Root cause of the
      remaining 26%: the live table's `import_row_seq` had drifted from
      the source data's row numbers partway through the import (off by
      +3 at the point checked), so the original migration's exact-position
      match silently skipped every row after that drift began. Fixed with
      a second migration matching on (customer_name, taxable_value,
      invoice_no) instead of position
      (`supabase-sales-transactions-item-name-by-invoice-match-part*of9.sql`,
      9 parts — both this and the first migration had to be split into
      several files each since the full dataset was too large for a
      single Supabase SQL Editor query) — **confirmed run**, brought real
      coverage to 9,157/9,274 (98.7%). The remaining 117 rows are
      believed to be ones the second migration deliberately skipped as
      ambiguous (duplicate customer+amount+invoice combos where guessing
      wrong would be worse than leaving them alone), not a further bug.
    - Every code change verified via `npx tsc --noEmit` (this app's
      pre-existing `TS7016`/`TS7031`/`process` noise filtered out, zero
      real errors each round) — this sandbox cannot run `eas build`
      itself (no Apple credentials), so an actual on-device build/test
      pass after each merge was always the user's own next step, same as
      it remains for the final round of this item's work (see the
      top-of-file note above item 79 for exactly which bundle that is).
