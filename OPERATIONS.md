# MMDI ONE — Operations Runbook

This is the canonical reference for how to actually develop, build, and
ship this project — GitHub, Vercel, Supabase, the mobile build, and every
credential involved. Read this once and you shouldn't need to ask "how do
I..." again. It intentionally holds NO real secret values — every token
below is described by name/location, never by value, so this file stays
safe to commit and read in any future session.

If a future AI session is picking this up cold: also read
`PROJECT_STATUS.md` (what's built, session-by-session history) and
`README.md` (architecture overview). This file is the "how do I actually
run/ship this" complement to those two.

---

## 1. The one constraint that shapes everything below

**An AI sandbox session working on this repo has:**
- Fetch-only access to GitHub (`git fetch`/`git clone` work; `git push`
  fails with "could not read Username" — no credentials configured).
- No live Supabase database connection (no service-role key, no network
  path to the Supabase API from most sandbox environments).
- No Vercel CLI/API access.
- No Apple Developer / EAS credentials.

Every one of those has to be handed to a human (Srinivas) to actually
execute. The sections below are written from that reality — "how the
assistant hands work off" as much as "how to run a command yourself."

---

## 2. GitHub — code changes

**Repo:** `https://github.com/mahin-aeroai/EKMS` (branch `main`, auto-deploys to Vercel on every push)

### From an AI sandbox (no push access)

```bash
# Inside the sandbox's clone of the repo:
git fetch origin main                       # confirm main hasn't moved
git rev-parse origin/main                    # sanity-check the SHA
# ... make + commit changes on the current branch ...
git bundle create /path/to/outputs/my-change.bundle origin/main..HEAD
git bundle verify /path/to/outputs/my-change.bundle
```
Hand the `.bundle` file to Srinivas with the exact merge commands below.
Never guess a path — always use the real absolute path the file was
written to.

### On Srinivas's own machine (has push access, once auth is set up)

```bash
cd /path/to/local/EKMS/checkout          # the real clone, not a subfolder
git fetch "/absolute/path/to/my-change.bundle" HEAD:incoming-my-change
git merge incoming-my-change --no-edit
git push origin HEAD:main
```

**If `git merge` reports "Your local changes ... would be overwritten"**
— something local is uncommitted and collides with the incoming change
(this has happened with `apps/mobile/package.json` after running
`expo install`, and with `eas.json`/`package-lock.json`/build artifacts
sitting uncommitted at the repo root). Fix: commit everything local
first, THEN merge:
```bash
git add -A
git commit -m "Local changes before merge"
git merge incoming-my-change --no-edit
```
If that produces a real merge conflict on a specific file (e.g. a
dependency version line both sides touched), keep whichever side is
correct — usually **yours**, since a locally-run `expo install` knows the
exact SDK-compatible version:
```bash
git checkout --ours path/to/conflicted/file
git add path/to/conflicted/file
git commit --no-edit
```

**If `git merge`/`git commit` drops you into Vim** and it looks stuck:
type `:wq` and press Enter (saves and exits, using the default message).
To never see Vim again: `git merge ... --no-edit` skips it entirely, or
set it globally once: `git config --global core.editor "true"`.

### GitHub authentication (push from your own machine)

GitHub no longer accepts a plain password for `git push` over HTTPS. One-time setup:
1. https://github.com/settings/tokens → **Generate new token (classic)** → scope: `repo` → generate, copy it once.
2. `git config --global credential.helper osxkeychain` (macOS — caches the token in Keychain after first use).
3. `git push origin HEAD:main` → username = your GitHub username, password = the token (not your GitHub account password).

After step 2, macOS remembers it — you won't be prompted again unless the token is revoked/expires.

---

## 3. Vercel — web app deployment

- **Auto-deploy:** every push to `main` redeploys automatically. No manual deploy step, ever.
- **Root Directory:** `apps/web`, with "Include files outside the root directory" **enabled** (required — the build needs to resolve `@mmdi/shared` from the monorepo root).
- **Production domains:** `ekms.vercel.app` and the custom domain `app.mmdi.in`. Vercel's Standard Deployment Protection exempts the custom domain but NOT the `*.vercel.app` one — matters because the mobile app calls the API and needs an unprotected origin.
- **Environment variables** (set in Vercel dashboard → Project → Settings → Environment Variables — never in code, never in this file):
  - Supabase URL + anon key (client-safe, RLS enforces access)
  - `ANTHROPIC_API_KEY` (server-only — powers the AI Copilot's `/api/ai-copilot` route; the app returns a clean 503 if it's missing rather than crashing)
  - Google OAuth client ID/secret (Gmail search/draft feature)
- **Verifying a deploy:** Vercel dashboard → Deployments tab shows build status per commit. If a build fails, check the log there first — `next build` runs cleanly in Vercel's environment even though some AI sandboxes hit an ARM64 "Bus error" on `@next/swc-linux-*` that's specific to the sandbox, not the code.
- **A Preview deployment can crash on every request with `MIDDLEWARE_INVOCATION_FAILED` / "This Routing Middleware has crashed"** even when the build itself succeeded. Cause, confirmed 31 Aug 2026: `src/lib/supabase-middleware.ts` builds its Supabase client from `process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""` / `...ANON_KEY ?? ""` — if either var is scoped to Production only (not Preview) in Vercel, every Preview request crashes the client construction before anything else runs. Check Project → Environment Variables → each var's "Environments" column covers Preview, not just Production.
- **Adding a `NEXT_PUBLIC_*` env var via the Vercel dashboard can get permanently stuck.** This project has a team/account policy that locks a new variable's Type to "Secret" in the dashboard UI (the "Config" radio option shows disabled even for a brand-new, never-saved variable — not just an already-saved one, despite what the dashboard's own tooltip implies). A `NEXT_PUBLIC_`-prefixed var saved as Secret then hits a hard, un-dismissable validation blocker on Save ("Remove the public framework prefix... If that's safe, change the variable to Config"). **Fix: use the Vercel CLI instead, which doesn't have this restriction:**
  ```bash
  npm i -g vercel                 # once, if not already installed
  cd apps/web                     # the actual Vercel project root, not the repo root
  vercel link                     # once per machine, links this checkout to the EKMS project
  vercel env add NEXT_PUBLIC_SUPABASE_URL
  # prompts: Value? -> paste it
  # prompts: Environments? -> select Preview (and/or Production) with spacebar
  # prompts: Git branch? -> leave blank (Enter) to apply to all branches of that environment
  # prompts (NEXT_PUBLIC_* only): "How should this variable be stored?"
  #   -> pick "Expose to anyone visiting your site: keep <NAME> as Config"
  #      (NOT the first option, "rename to <NAME-without-prefix> and use Secret" —
  #      that silently renames the var, which breaks any code reading the
  #      NEXT_PUBLIC_-prefixed name; use `vercel env rm <wrong-name> <env>` to
  #      undo if this happens, then re-add correctly)
  ```
  Verify with `vercel env ls` — look for the var listed with Type `Config` and the environment(s) you selected. A Production-scoped Secret entry for the same name can coexist with a Preview-scoped Config entry for it without conflict; Vercel picks whichever matches the deployment's own environment.
- **Env var changes never apply to an already-built deployment.** After adding/fixing a var, use Deployments → the deployment's `⋯` menu → **Redeploy** to pick up the change — pushing a new commit isn't required.

---

## 4. Supabase — database

- **No live DB access from an AI sandbox** — no service-role key, and most sandbox network policies don't reach the Supabase API at all (GitHub is reachable, Supabase generally isn't). Every schema change or data fix has to be handed to Srinivas as a `.sql` file to run himself in the Supabase Dashboard's SQL Editor.
- **RLS is on for every table.** Roles are `admin | editor | viewer` (a `profiles` table + `user_has_group_access()` — see `supabase-role-based-rls-migration.sql` and `supabase-module-access-migration.sql`). MFA (`aal2`) is enforced on API routes that need it.
- **SQL Editor has a query-size limit.** A single query built from a large embedded dataset (thousands of `VALUES` rows) can hit "Query is too large to be run via the SQL Editor." Established fix this project uses: split the migration into multiple self-contained files of ~1,000 rows / ~150–200KB each, run in sequence. Each part should be independently safe to re-run (tripwire on a unique key, `where ... is null` guards, etc.) so running them out of order or twice never double-applies.
- **Before writing any migration:** validate it against a real local Postgres if at all possible (this project has used `@electric-sql/pglite` for that in AI sandbox sessions — no Docker/root needed) rather than trusting it untested against production.
- **Backups:** free tier, no point-in-time recovery — take an explicit `create table ... as select * from ...` snapshot before any UPDATE/DELETE migration that touches real data.

---

## 5. Mobile app — Expo / EAS / Apple

- **Local env:** `apps/mobile/.env` needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Anon key only — `EXPO_PUBLIC_*` values are compiled into the binary and trivially extractable, so the service-role key must never go here.
- **Installing a new native dependency:** always `npx expo install <package>` (not plain `npm install`) — it resolves the exact version compatible with the installed Expo SDK (currently 57). Run this from `apps/mobile`, and commit the resulting `package.json`/lockfile change before merging any incoming bundle that also touches `package.json` (see the merge-conflict note in section 2).
- **Building:**
  ```bash
  cd apps/mobile   # NOT the repo root
  eas build --platform ios --profile preview --local
  ```
  This builds a local `.ipa` on Srinivas's own machine — no EAS cloud build, no Apple credentials need to leave the machine.
- **Typechecking (do this before every handoff):**
  ```bash
  cd apps/mobile
  npx tsc --noEmit -p . 2>&1 | grep -v "TS7016\|TS7031\|Try \`npm i\|Cannot find name 'process'"
  ```
  Those three patterns are pre-existing sandbox/node_modules-resolution noise (missing `expo-router` type declarations, an implicit-any on a destructured tab icon param, `process` not being declared) — confirmed unrelated to any real code change. Zero remaining lines after that filter = no real errors. `next build`-style full production builds aren't run for the mobile app in-sandbox; this `tsc` check plus a real on-device build is the verification loop.
- **Apple Developer enrollment: Individual**, not Organization. This means:
  - App builds/installs fine as a development build on a physical device today — that's the current distribution method, no App Store involved.
  - An actual App Store listing would publish under a personal name, not "MMDI" — converting to Organization needs a D-U-N-S number and is a separate enrollment, not a simple upgrade. This is a real decision still pending, not a technical blocker.
- **Android:** not built natively today. The web app's PWA (installable via "Add to Home Screen") covers Android; a native Android build would need its own Google Play Console account and its own review process — not started.

---

## 6. Credentials & tokens — what exists and where it lives

None of the actual values live in this file, in the repo, or in any AI
sandbox. This table is the map of what exists and where to find/rotate
it — treat it as the checklist before ever asking "do we have X."

| Credential | Used for | Lives in | Notes |
|---|---|---|---|
| GitHub Personal Access Token (classic, `repo` scope) | Pushing from Srinivas's own machine | macOS Keychain (via `credential.helper osxkeychain`) | Generate at github.com/settings/tokens; rotate there if it stops working |
| Supabase anon key | Web app client + mobile app | Vercel env vars + `apps/mobile/.env` | Safe to ship to clients — RLS is the real protection, not secrecy of this key |
| Supabase service-role key | The Razorpay webhook route (`/api/portal/razorpay-webhook`), the Customer Portal's staff "Create login" route (`/api/portal/companies/[id]/create-login`), and the internal staff deactivate/reactivate route (`/api/staff/[userId]/deactivate`) | Vercel env vars only, as `SUPABASE_SERVICE_ROLE_KEY` | The three legitimate uses in this codebase — see `src/lib/supabase-admin.ts`'s header comment for why: Razorpay calls its route directly with no user session for RLS to evaluate, and both creating and banning a Supabase Auth user require the Admin API, which has no RLS-governed equivalent at all. Never referenced from any Client Component; every other route still uses the anon key + RLS. Get it from Supabase dashboard → Project Settings → API → `service_role` secret. |
| `ANTHROPIC_API_KEY` | AI Copilot's server-side model calls | Vercel env vars only | Srinivas creates/rotates this directly in Vercel; the assistant never sees the raw key |
| Google OAuth client ID/secret | Gmail search/draft in AI Copilot | Vercel env vars | Standard OAuth app credentials from Google Cloud Console |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` | Every presigned-URL file route, including the Customer Portal's (design proofs, reference files, product preview images) | Vercel env vars | Already set up for LFG surveys/knowledge-files/installation-photos — the Customer Portal reuses the same bucket + credentials, just new key prefixes (`portal-orders/...`, `portal-products/...`) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Creating Razorpay Orders + verifying the Checkout.js success signature | Vercel env vars (`KEY_ID` is also sent to the browser to open Checkout — that's expected, only `KEY_SECRET` is sensitive) | From the Razorpay Dashboard → Settings → API Keys. Use test-mode keys until go-live, then switch to live-mode keys (same env var names) |
| `RAZORPAY_WEBHOOK_SECRET` | Verifying the Razorpay webhook's signature | Vercel env vars only | Set when creating the webhook (Razorpay Dashboard → Settings → Webhooks → add `https://app.mmdi.in/api/portal/razorpay-webhook`, subscribe to `payment.captured`, set a secret) — paste that same secret here |
| Apple Developer account | EAS local iOS builds | Srinivas's own Apple ID / Keychain, used implicitly by `eas build --local` | Individual enrollment — see section 5 for what that limits |

---

## 8. Customer Portal (`/portal/*`) — setup checklist

New invite-only ordering site for Apple-format retail chains (GPX04/GPX05
signage) — see `supabase-customer-portal-schema.sql`'s header comment for
the full design and `PROJECT_STATUS.md` for the build history. First-time
setup, in order:

1. Run `supabase-customer-portal-schema.sql` in the Supabase SQL Editor
   (after the role-based RLS migration, which it depends on). If the
   portal was already set up before the multi-store checkout / pay-at-
   checkout / per-store GSTN feature shipped, also run
   `supabase-portal-checkout-migration.sql` once, and if it was set up
   before customer self-service store editing shipped, also run
   `supabase-portal-store-self-service-migration.sql` once, and if it was
   set up before the customer-facing Cart (pay/cancel unpaid orders)
   shipped, also run `supabase-portal-cart-cancel-migration.sql` once —
   see each file's own header comment for exactly what it changes.
2. Add the credentials in section 6 above that don't already exist:
   `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_WEBHOOK_SECRET`. R2 vars are already set from earlier work.
3. Set up the Razorpay webhook (Dashboard → Settings → Webhooks) pointing
   at `https://app.mmdi.in/api/portal/razorpay-webhook`, event
   `payment.captured`.
4. Seed the two products: sign in as an admin, open **Customer Portal**
   (under the Customers section in the sidebar) → Products tab → create
   `GPX04` (Tactical Sign) and `GPX05` (Compatibility Sign) with real
   prices, and upload each one's preview image.
5. **One-time, before the first real invite** — two settings in the
   Supabase dashboard, both under **Authentication**:
   - **URL Configuration → Redirect URLs**: add
     `https://portal.mmdi.in/login`. Without this, Supabase silently
     refuses to send people to the invite link's real destination — the
     invite email still arrives and looks fine, but clicking it lands on
     a bare, generic sign-in form (no "set your password" step, no
     account to sign into yet) instead of the portal's own set-password
     screen, because the fallback redirect drops the one-time invite
     token along with the wrong destination. Confirmed happening in
     production (2026-08-28): a Portal invite to a test address landed on
     `ekms.vercel.app/login` instead of `portal.mmdi.in/login`, stuck with
     no password prompt, until this entry was added.
     **Add the identical entry for LFG Connect too** —
     `https://lfgconnect.mmdi.in/login` — same setting, same failure mode,
     for partner invites (`/api/lfg/partners/[partnerId]/create-login`)
     instead of customer ones. Both were missed when each subdomain was
     first set up; check both are present any time an invite link doesn't
     behave.
   - **Emails → SMTP Settings**: point it at a real mail sender —
     Supabase's own built-in mailer is heavily rate-limited (a handful of
     emails/hour) and not meant for actual customer invites. Sender
     mailbox is `noreply@mmdi.in` (Google Workspace): Host
     `smtp.gmail.com`, Port `587`, Username = `noreply@mmdi.in`, Password
     = a Google **App Password** generated while signed in as
     `noreply@mmdi.in` (Google Account → Security → 2-Step Verification
     must be on first, then App Passwords → generate one — its regular
     Gmail password won't work here), Sender email = `noreply@mmdi.in`,
     Sender name = "MMDI Customer Portal". Optionally customize the
     "Invite user" email template under **Emails → Templates** to match
     MMDI's voice.
6. For each retail chain: Customer Portal → Companies & Stores tab →
   create the company, add its store locations — **fill in each store's
   delivery address and GSTIN** (an "Add store"/edit row shows a "Needs
   address/GSTIN" warning until both are set; it's not enforced at the
   database level, but a customer literally cannot select that store when
   placing an order until it's complete — see point 9 below). This is a
   one-time convenience, not the only way it ever gets fixed: the customer
   can also fill in a missing address/GSTIN themselves from the portal's
   Account page (see 8c below) — no need to do this step perfectly before
   inviting them. Then fill in
   "Send invite" (email + optional contact name) and submit. This both
   allowlists the email past the `@mmdi.in`-only signup restriction and
   creates the account — no password is generated or shown to staff; the
   customer gets a real email with a link and sets their own password,
   which is also what confirms the address is real (a wrong/fake email
   just never gets clicked, so no usable account exists). No separate
   Supabase dashboard step needed either way. Requires
   `SUPABASE_SERVICE_ROLE_KEY` to already be set (see the table above) —
   the create-login route uses the Supabase Admin API, which only works
   with the service-role key regardless of who's signed in.
7. Staff review/approve/upload-proof/status-change actions all happen on
   the same order page a customer sees (`/portal/orders/[id]`) — reached
   by clicking a row in Customer Portal → Orders, not a separate admin
   view.

**Rule of thumb:** if a task seems to need a credential, the answer is
either "it's already configured where the table above says" or "it needs
Srinivas to create/paste it directly into Vercel/Supabase/Keychain
himself" — never into a chat message, terminal echo, or committed file.

### 8a. Portal subdomain (`portal.mmdi.in`)

The Customer Portal is reachable at its own subdomain instead of
`app.mmdi.in/portal/*`. All `/portal/*` pages are physically unchanged
(still real files under `src/app/portal/...`); a middleware rewrite in
`src/lib/supabase-middleware.ts` serves them without the `/portal` prefix
ever showing in the address bar on `portal.mmdi.in`, and old
`app.mmdi.in/portal/*` links 308-redirect to the clean subdomain URL
automatically. `ekms.vercel.app` and any Vercel preview deployment keep
serving `/portal/*` exactly as before, unaffected — a DNS-independent
fallback if the subdomain is ever down.

Two one-time, non-code steps are needed to actually activate it (neither
has been done yet as of this handoff):

1. **Vercel** → the EKMS web project → Settings → Domains → Add
   `portal.mmdi.in`. Vercel will show the exact CNAME target to use
   (usually `cname.vercel-dns.com`, but use whatever Vercel displays).
2. **DNS** → wherever `mmdi.in`'s DNS is managed → add a CNAME record:
   host `portal`, pointing at the target Vercel showed in step 1. Allow
   up to a few hours to propagate; Vercel's Domains page shows when the
   certificate issues and the domain goes live.

Nothing else changes — no new env vars, no redeploy required beyond the
one that already ships this middleware change. Once DNS resolves,
`portal.mmdi.in/login` works immediately.

### 8b. Multi-store checkout, mandatory design PDFs, pay-at-checkout

A customer's "New order" page is a cart, not a single-store form: they can
add products for several of their stores in one visit ("Add another store
to this order"), each product needs its own PDF design file attached
before it can be submitted, and payment happens immediately at checkout —
one Razorpay Checkout popup pays for every store's order created in that
session together, before MMDI has uploaded any design proof.

Under the hood this still creates one `portal_orders` row per store (each
gets its own design-approval/production tracking exactly as before) — the
"one cart, multiple stores" part is purely a checkout-page convenience,
not a database change to what an order is. Design-approval
(approve/request-revision) and production status are unaffected and still
work exactly as before; they're just no longer what gates payment.

If a customer closes the Razorpay popup before paying, the order(s) are
already saved (unpaid) — they land on the Orders list and can pay from
there later; `OrderDetailClient`'s "Pay now" button is that fallback path
for a single order.

A store missing its delivery address or GSTIN can't be selected when
placing an order (enforced both in the store picker and server-side in
`POST /api/portal/orders`) — see point 6 above for filling those in.

### 8c. Customer self-service store edits, address history, frozen order addresses

A customer can update their own store's delivery address/city/GSTIN
directly from the portal's Account page ("Your stores" → Edit) — applies
immediately, no MMDI approval step. Every change to a store's
address/city/GSTIN, from either side (this self-service form or staff's
own CompaniesTab edit), is written automatically to
`portal_store_address_history` by a database trigger — nothing in the app
code has to remember to log it — and both the customer (Account page →
"History") and staff (CompaniesTab) can see the full trail of who changed
what and when.

Placing an order snapshots the store's address/city/GSTIN onto the order
itself (`portal_orders.delivery_address/delivery_city/delivery_gstin`) at
that moment and freezes it there — editing a store's address afterward
(by either side) never changes what an already-placed order shows on
`/portal/orders/[id]`. This is enforced at the database level (a `revoke
update` on those three columns for the `authenticated` role, mirroring how
`payment_status`/`razorpay_payment_id`/`paid_at` are already frozen after
payment), not just by the UI not offering an edit button.

### 8d. Cart — unpaid orders can be paid or cancelled (real delete) by the customer

The "New order" page's Cart icon now means something: any order of theirs
still unpaid shows in a "Your cart" panel at the top of that page (payment
happens at checkout, before design-approval/production starts, so
"unpaid" is exactly "unfinished" — this also covers orders left behind by
an interrupted or failed checkout, not just a fresh visit). Each cart
order has two actions:

- **Pay now** — same single-order Razorpay flow as `OrderDetailClient`'s
  own "Pay now" button (`POST .../razorpay-order`, reuses an existing
  `razorpay_order_id` instead of creating a duplicate if checkout was
  already opened once for it).
- **Cancel** — a real `DELETE` (`DELETE /api/portal/orders/[orderId]`),
  not a status flag. Only reachable for the customer's own company's
  orders while genuinely unpaid (enforced by the
  `portal_orders_delete_customer` RLS policy, company-scoped); its line
  items and any already-uploaded design files are removed automatically
  via existing cascade FKs. The underlying Cloudflare R2 file objects for
  an already-uploaded design PDF are **not** deleted — same as every
  other delete path in this app (admin's product/store/order deletes),
  R2 objects are left orphaned rather than being cleaned up here.

Pre-existing unpaid test/duplicate orders (e.g. ones created before the
retry-dedup fix in 8b existed) can now be cleaned up by the customer
themselves from this Cart panel instead of needing a staff admin delete.

---

## 7. Quick command reference

```bash
# Typecheck the mobile app (run before every handoff)
cd apps/mobile && npx tsc --noEmit -p . 2>&1 | grep -v "TS7016\|TS7031\|Try \`npm i\|Cannot find name 'process'"

# Add a new native dependency to the mobile app
cd apps/mobile && npx expo install <package-name>

# Build the iOS app locally (from Srinivas's machine)
cd apps/mobile && eas build --platform ios --profile preview --local

# Run the web app locally
npm install && npm run dev        # from repo root, proxies into apps/web

# Deliver a sandbox's code changes (inside the sandbox)
git fetch origin main
git bundle create /path/to/outputs/change-name.bundle origin/main..HEAD
git bundle verify /path/to/outputs/change-name.bundle

# Merge a delivered bundle + push (on Srinivas's machine, from the repo root)
git fetch "/absolute/path/to/change-name.bundle" HEAD:incoming-change-name
git merge incoming-change-name --no-edit
git push origin HEAD:main
```

---

## 9. Deactivating an internal staff account

One-time setup: run `supabase-profiles-active-migration.sql` in the
Supabase SQL Editor (adds `profiles.active`). Requires
`SUPABASE_SERVICE_ROLE_KEY` to already be set (see section 6).

To use it: Administration → Users & roles table → each row (other than
your own) has a **Deactivate** link next to its status badge. Deactivating
blocks that person's sign-in immediately — including kicking them out of
an already-open session on their very next click, not just future
sign-ins — but keeps their profile and everything tied to their account
(estimates, orders, uploads) intact. **Reactivate** on the same row
reverses it instantly, any time. This is intentionally a soft block, not
account deletion — there is no delete option, by design (see chat history
for why: losing the attribution on that person's past records wasn't
worth it for a rarely-needed action that deactivate already covers).
