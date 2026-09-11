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
- **`apps/web/vercel.json`** exists (first added for the LFG Connect Updates daily report) purely for its `"crons"` array — Vercel reads this automatically on deploy, no dashboard step needed beyond setting `CRON_SECRET` (see section 6). If a Vercel plan ever limits cron frequency/count, check this file for what's currently scheduled before adding more.

### 3a. Incident, 1 Sept 2026 — Production silently rolled back to a months-old build

**Symptom:** `app.mmdi.in` was missing entire nav sections that had existed for a long time (Home, Tools, LFG Connect) and instead showed the old "Design System Home/Foundations/Components" sidebar — a layout that predates a nav rewrite from long before this date. Confirmed it wasn't a browser/cache issue (reproduced in a fresh Private Browsing window with zero prior state for the site).

**Root cause, pieced together from the Deployments list:** the real latest `main` commit (a merge of the day's work) showed status **Blocked** and never went live. Instead, the deployment actually serving Production was a genuinely old commit from long before the nav rewrite — its build had been (re-)deployed and promoted to Production, overwriting everything newer. Best working theory: a `vercel --prod` (or equivalent) deploy was run from a **stale local clone on a different machine** that hadn't been kept in sync with GitHub — deploying whatever old code was sitting in that folder straight to Production, bypassing `main`'s real state entirely. (Separately, the GitHub repo had also briefly been toggled private→public around this time, which may have disrupted Vercel's GitHub App connection and contributed to the real latest commit landing Blocked instead of deploying normally — not confirmed as the definite cause, but worth checking Project Settings → Git if this recurs.)

**Fix used:** in Vercel → Deployments, found the last known-good deployment (the one confirmed to have the correct nav/features, from before the bad deploy) and used **Promote to Production** on it directly — no rebuild needed, just re-pointing which existing build serves traffic. Confirmed fixed via a fresh Private Browsing check at `app.mmdi.in`.

**Lessons for next time:**
- **Never run `vercel`/`vercel --prod` from a local clone you haven't just confirmed is up to date** (`git log -1` compared against `git log -1 origin/main` after a fresh fetch). A CLI deploy ships exactly what's in that folder, git history or no — it can silently roll Production back to something ancient. Prefer letting `git push` to `main` trigger the normal GitHub-integration deploy instead of a manual CLI deploy, unless you've just verified the local folder's state.
- **A "Blocked" deployment status is a red flag, not a quiet failure** — it means the actual latest commit did NOT go live, so whatever WAS serving Production before it is still there (or, worse, something else got promoted in its place). Always check what's actually live (the blue "Production" badge in the Deployments list) after any deploy, not just whether the newest commit built successfully.
- **The fastest recovery from a bad Production deploy is `⋯` → Promote to Production on the last-known-good deployment row** — it's instant (no rebuild) and doesn't require figuring out the root cause first. Root-cause it after the site is back up, not before.
- If toggling a GitHub repo's visibility (private ↔ public) is ever needed again, check Vercel → Project Settings → Git immediately after to confirm the connection is still healthy, before assuming the next push will deploy normally.

---

## 4. Supabase — database

- **No live DB access from an AI sandbox** — no service-role key, and most sandbox network policies don't reach the Supabase API at all (GitHub is reachable, Supabase generally isn't). Every schema change or data fix has to be handed to Srinivas as a `.sql` file to run himself in the Supabase Dashboard's SQL Editor.
- **RLS is on for every table.** Roles are `admin | editor | viewer` (a `profiles` table + `user_has_group_access()` — see `supabase-role-based-rls-migration.sql` and `supabase-module-access-migration.sql`). MFA (`aal2`) is enforced on API routes that need it.
- **SQL Editor has a query-size limit.** A single query built from a large embedded dataset (thousands of `VALUES` rows) can hit "Query is too large to be run via the SQL Editor." Established fix this project uses: split the migration into multiple self-contained files of ~1,000 rows / ~150–200KB each, run in sequence. Each part should be independently safe to re-run (tripwire on a unique key, `where ... is null` guards, etc.) so running them out of order or twice never double-applies.
- **Before writing any migration:** validate it against a real local Postgres if at all possible (this project has used `@electric-sql/pglite` for that in AI sandbox sessions — no Docker/root needed) rather than trusting it untested against production.
- **Backups:** free tier, no point-in-time recovery — take an explicit `create table ... as select * from ...` snapshot before any UPDATE/DELETE migration that touches real data.

### 4a. Email templates: show `{{ .Token }}` and, critically, remove `{{ .ConfirmationURL }}` entirely — required for the OTP-code login flow to actually work (1 Sept 2026, updated same day)

`/login`, `/lfg/login`, and `/portal/login` now offer a code alternative to the emailed invite/reset link (see PROJECT_STATUS.md item 82) — added because single-use links kept arriving already-consumed (Supabase error `otp_expired`) before the real user ever clicked them, most likely due to a mail app or security scanner silently pre-visiting the link. A typed code isn't clickable, so nothing but a human can consume it — **but only if the link isn't in the email at all.**

**Important, learned the hard way**: Supabase's `{{ .ConfirmationURL }}` link and `{{ .Token }}` code are two representations of the *same* single-use token record — consuming either one invalidates both. Leaving the link in "as a fallback" alongside the code (the original guidance here) does not work: whatever silently pre-visits the link keeps doing so on every send, burning the token before the code can ever be used, even though the code renders correctly in the email and the app is otherwise doing everything right. The fix is to remove the link, not keep it alongside the code.

Do this once, in Supabase Dashboard → **Authentication → Emails**:

1. Open **Reset Password**. Delete the "Reset Password" button/link (`{{ .ConfirmationURL }}`) entirely. Leave only:
   ```html
   <p>Or enter this code on the reset page: <strong>{{ .Token }}</strong></p>
   ```
2. Open **Invite user**. Delete the "Accept the invite" button/link (`{{ .ConfirmationURL }}`) entirely. Leave only:
   ```html
   <p>Or, on the login page, choose "Have an invite code from your email?" and enter this code: <strong>{{ .Token }}</strong></p>
   ```
3. Save both, and confirm neither template's Source view contains `{{ .ConfirmationURL }}` anywhere — not as a button, not as plain text (some mail-security scanners fetch any URL-shaped text, not just real `<a href>` links).
4. Test end-to-end: on `lfgconnect.mmdi.in/login`, use "Forgot password", check the email (should now show only the code, no link), and enter that code immediately on the code-entry screen. Confirmed working 1 Sept 2026.

SMTP note: the sender is Resend (`smtp.resend.com`), not Gmail — see PROJECT_STATUS.md item 82 for why Gmail SMTP was replaced.

**10 Sept 2026: "app.mmdi.in users aren't getting the reset email" — turned out to be intermittent, not broken.** Srinivas reported this on `app.mmdi.in` specifically; live testing (via a real browser against the real site, not guessing) reproduced a genuine `resetPasswordForEmail` failure with `error.message === "Failed to fetch"` (Chrome console: `net::ERR_CONNECTION_CLOSED`) — but it reproduced **identically on `lfgconnect.mmdi.in` too**, ruling out anything domain-specific (that also ruled out `app.mmdi.in` being missing from Authentication → URL Configuration → Redirect URLs, which it genuinely is (only `ekms.vercel.app`, `portal.mmdi.in`, `lfgconnect.mmdi.in` are listed) — worth adding `https://app.mmdi.in/**` there regardless, but it's not this bug). Checked, and ruled out, every config surface that could explain a project-wide failure: Attack Protection's Captcha toggle is off, Rate Limits (30 emails/h) is nowhere near being hit, and SMTP Settings still show Resend correctly configured exactly as the 1 Sept fix above left it. A plain `signInWithPassword` on the same page at the same time succeeded cleanly (proving the project itself and its Auth API are up) — and retrying the *exact same* `resetPasswordForEmail` call moments later succeeded too, repeatedly, with zero changes in between. Conclusion: this is a real but intermittent failure, not a config or code bug — `resetPasswordForEmail` does more work than a plain sign-in (it dispatches over SMTP to Resend synchronously), and on Supabase's free tier that occasionally drops the connection on a cold/idle instance, especially on the first request after the project's sat unused for a while. **Fix**: added `apps/web/src/lib/authRetry.ts` — every Supabase Auth call on all 3 login pages now retries once, silently, after ~1.2s, but only when the failure is this specific class of network error (a real API error like "Invalid login credentials" or an expired code still surfaces immediately, unretried). If this keeps recurring often enough to be a real problem rather than a rare hiccup, the actual fix is upgrading the Supabase project off the Free tier (removes/reduces cold-start behavior) — that's a cost decision for Srinivas, not something to force through code.

**10 Sept 2026, same evening: a SECOND, DIFFERENT password-reset failure — Windows/Edge team members hitting `ERR_QUIC_PROTOCOL_ERROR` against Supabase directly, not the cold-start issue above.** Mahin reported his team on Windows desktop browsers (Edge/Chrome) couldn't log in at all, while Mac users on the same team were fine. A teammate's DevTools console (screenshot, not guessed) showed the real cause: `net::ERR_QUIC_PROTOCOL_ERROR` on the POST to `<project>.supabase.co/auth/v1/recover`, twice in a row — while the login *page itself*, served from `app.mmdi.in`, loaded fine. This is a different failure mode from the cold-start one above (a retry over the same broken transport just fails again, which is exactly what the screenshot showed — two failed attempts back to back). `ERR_QUIC_PROTOCOL_ERROR` is a well-documented Chromium error when the browser's QUIC (HTTP/3) transport gets blocked or mangled by something on the network path — commonly a corporate firewall, antivirus doing TLS/SSL inspection, or certain VPNs — while plain HTTPS to a different host (like `app.mmdi.in`, not Cloudflare-fronted the same way) sails through. It's a client-network-side problem, not a Supabase config or code bug on our end, and it only affects direct browser → `supabase.co` requests. **Immediate workaround** (no deploy needed): affected users can disable QUIC in their browser at `edge://flags/#enable-quic` or `chrome://flags/#enable-quic` → set to Disabled → relaunch the browser. **Code-level fix shipped**: added `apps/web/src/app/api/auth/reset-password/route.ts`, a server-side proxy for `resetPasswordForEmail` — the browser now POSTs to our own domain (`/api/auth/reset-password`, already proven reachable since the page itself loaded) instead of calling `supabase.auth.resetPasswordForEmail()` directly from the browser; Vercel's server makes the actual call to Supabase over its own network, sidestepping whatever is blocking the user's browser-to-Supabase QUIC connection entirely. All 3 login pages' `handleForgotPassword` now call this route via the new `requestPasswordReset()` helper in `authRetry.ts`. **10 Sept 2026, same evening, part 2: confirmed plain sign-in hits the identical error — the rest of the login flow moved server-side too.** Mahin confirmed the same "Failed to fetch" happens on regular email+password sign-in for his Windows/Edge/Chrome team, not just password reset — expected, since `ERR_QUIC_PROTOCOL_ERROR` is a transport-level failure against `<project>.supabase.co` and isn't specific to any one Auth endpoint. Extended the same server-side-proxy pattern to the entire rest of the login flow across all 3 pages: `apps/web/src/app/api/auth/sign-in/route.ts` (`signInWithPassword`, plus the MFA step-up check/challenge inline in the same request when needed — main `/login` only), `mfa-verify/route.ts` (`mfa.verify`), `verify-code/route.ts` (the typed reset/invite code's `verifyOtp`), and `set-password/route.ts` (`updateUser`). Unlike the reset-password route (a bare `createClient()`, no session involved), these four use `createServerSupabaseClient()` from `src/lib/supabase-server.ts` — the same cookie-aware client Server Components already use — so a session established by any of these calls lands in the browser via a normal `Set-Cookie` response header instead of never happening at all. Each login page's `handleSignIn`/`handleMfaVerify`/`handleVerifyCode`/`handleSetPassword` now call these routes via new helpers in `authRetry.ts` (`signInViaServer`, `verifyMfaViaServer`, `verifyCodeViaServer`, `setPasswordViaServer`) instead of calling `supabase.auth.*` directly, and every success path now does a **hard navigation** (`window.location.href = ...`) instead of `router.push()`/`router.refresh()` — necessary because the session arrives via a cookie the browser's in-memory Supabase client has no way to notice on its own; only a real page load picks it up. **Still not covered**: the emailed-link flow (clicking the link instead of typing the code) still calls `supabase.auth.setSession()` directly from the browser to establish its session — lower priority since the app already steers people toward the typed-code flow (see the comment above `handleVerifyCode` on why: mail-app link prefetching burns the link before a real click). If that's ever reported failing too for a Windows user, the same pattern applies. Also not covered: the mount-time "already signed in, check MFA state" effect on `/login` (an edge case for someone landing directly on the login page while already holding a valid session) still calls `supabase.auth.getUser()` and `mfa.listFactors()`/`challenge()` directly — out of scope here since it isn't part of the reported sign-in flow.

**10 Sept 2026, same evening, part 3: the real fix — Mahin reported the login-flow patches STILL weren't enough ("whenever database is liked those pages are broken"), because `ERR_QUIC_PROTOCOL_ERROR` was never specific to Auth.** Every workspace page in this app (job orders, customers, LFG, cost sheets, all of it — dozens of pages) reads/writes Supabase through the SAME shared browser client (`src/lib/supabase.ts`), which was still calling `<project>.supabase.co` directly. Patching individual Auth endpoints one at a time (parts 1 and 2 above) was always going to be incomplete — the actual root cause is that this ONE shared client talks to a Cloudflare-fronted host these Windows users' network breaks on, for literally everything it does, not just login.

**Real fix**: added `apps/web/src/app/api/supabase-proxy/[...path]/route.ts`, a transparent reverse proxy — forwards any method/path/query/headers/body it receives straight to the real Supabase URL server-side (Vercel's network) and streams the response back untouched. `src/lib/supabase.ts`'s shared browser client now points at this same-origin path (`${window.location.origin}/api/supabase-proxy`) instead of `<project>.supabase.co` directly — so literally every call that client makes (auth AND every table read/write across the whole app) becomes a same-origin request, and the browser never talks to Supabase's Cloudflare-fronted domain at all. No code at any of the dozens of individual call sites had to change.

The one real gotcha: `@supabase/ssr` derives its session cookie name from the project ref in whatever URL it's given (`sb-<ref>-auth-token`). Left alone, pointing the browser client at our own domain would've made it derive a DIFFERENT cookie name (`sb-app-auth-token`, from `app.mmdi.in`) than every server-side client (`supabase-server.ts`, `supabase-middleware.ts`, `supabase-route.ts` — all unchanged, still hitting Supabase directly since server-to-server has no QUIC problem to route around) — which would've meant the browser writes its session under one cookie name while the server reads a different one, i.e. everyone silently looks signed out. Fixed by explicitly pinning `cookieOptions.name` on the browser client to the SAME derivation computed from the real `NEXT_PUBLIC_SUPABASE_URL`, so it matches regardless of which URL is actually used for network calls.

This app has no client-side Supabase Storage or Realtime usage (checked repo-wide before building this), so a plain HTTP-forwarding proxy is sufficient — Realtime specifically (a WebSocket upgrade) couldn't go through a Route Handler like this one if it were ever added later.

Verified locally in the dev sandbox with a throwaway HTTP echo server standing in for Supabase (not just tsc/eslint, since this change touches how the entire app talks to the database): GET with query strings, POST/PATCH/DELETE with JSON bodies, and header forwarding (`apikey`, `Authorization`, `Content-Type`, `Prefer`) all confirmed passing through the proxy correctly, byte for byte, to the right forwarded path. Could not test against the real Supabase project itself (no credentials in the sandbox) — first real confirmation is Mahin's own testing after deploy.

The 4 dedicated `/api/auth/*` routes from part 2 above are now redundant with this (every browser call is already same-origin) but were left in place rather than reverted — extra redundancy for the login flow specifically, at no cost, rather than touching already-verified code again.

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
| `BLUEDART_CONSUMER_KEY` / `BLUEDART_CONSUMER_SECRET` | Blue Dart JWT auth (`GET https://apigateway.bluedart.com/in/transportation/token/v1/login`, headers `ClientID`/`clientSecret`), shared by all three Blue Dart features below (`src/lib/blueDart.ts`) | Vercel env vars only | Created by Srinivas himself on developer.dhl.com: Register → Create App → select **Blue Dart API Suite (DHL eCommerce India, Blue Dart)** (the portal bundles Auth + Tracking + Finder + Transit Time into one product, unlike the older per-API breakdown in Blue Dart's manual) → the App's page shows "API Key" (= Consumer Key) and "API Secret" (= Consumer Secret) under Show Key. Not the same as the credentials Blue Dart emailed directly (those two below). Note: the URL above was confirmed against the real developer.dhl.com Reference Docs — an earlier version of this doc/the code briefly had it wrong as `/v2/login` (a generic tutorial screenshot's placeholder demo environment, not Blue Dart's real portal); if a future change to this URL is ever considered again, verify against a live screenshot of the Reference Docs first |
| `BLUEDART_LOGIN_ID` / `BLUEDART_LICENSE_KEY` | Query/body params (`loginid`/`lickey`, or `LoginID`/`LicenceKey`) on all three Blue Dart features: live AWB tracking (`/api/lfg/shipments/[shipmentId]/track`), pincode serviceability (`/api/lfg/bluedart/pincode-check`), and transit-time estimates (`/api/lfg/bluedart/transit-time`) | Vercel env vars only | From Blue Dart directly (Chakra Pani, Manager–Systems) — `BLUEDART_LOGIN_ID` is the LOGIN ID (e.g. `HYD00374`), `BLUEDART_LICENSE_KEY` is specifically the **TRACKINGAPI LICENSE KEY** (not the SHIPPINGAPI one — that's for waybill/booking, unused by any of these three tracking/lookup-only integrations). **10 Sept 2026 finding**: live AWB tracking works with these credentials, but Location Finder (`checkPincodeServiceability`) fails with a real Blue Dart business error, `ErrorMessage: "UserDoesNotExists"` (confirmed live, not a guess — `blueDart.ts`'s calls now surface the actual response body on failure, not just the HTTP status), and Transit Time fails with a bare `404 Not Found`. Both endpoints' URLs, headers, and field casing were independently re-verified against developer.dhl.com's own Reference Docs and already match, and the JWT/header fix that resolved tracking's 401 is already applied to all three calls — so this isn't a code bug in `blueDart.ts`. Most likely explanation: Login ID `HYD00374` was registered with Blue Dart for Tracking only, not for Location Finder / Transit Time (these were added to the app well after the original Tracking-only request — see PROJECT_STATUS.md item 86) — Blue Dart provisions API access per Login ID on their own backend, separate from whatever the DHL developer portal's "API Suite" product bundle implies is included. Next step is on Blue Dart's side, not code: ask Chakra Pani to confirm/enable `GetServicesforPincode` and `GetDomesticTransitTimeForPinCodeandProduct` access for this Login ID, and confirm whether they need a different license key than the TRACKINGAPI one for those two specifically (mirroring the existing TRACKINGAPI-vs-SHIPPINGAPI split noted above). **Re-checked 10 Sept 2026, same evening**: a fresh live test still shows the identical pair of errors, and re-fetching developer.dhl.com's own Reference Docs a second time for both endpoints confirms the URLs/methods/body shapes in `blueDart.ts` are unchanged and correct — so this stays a config/provisioning gap, not a code bug. Worth noting the two failures are shaped differently, which narrows where each gap actually is: Location Finder's 400 carries Blue Dart's own JSON fault body (`ErrorMessage: "UserDoesNotExists"`) — proof the call *reaches* Blue Dart's backend and gets rejected there, i.e. a Login-ID-level permission gap on Blue Dart's side (Chakra Pani's the right contact). Transit Time's 404 carries no body at all — the shape of an Apigee *routing* rejection, i.e. the call never reaches Blue Dart's backend at all, which usually means the developer.dhl.com App (the one whose Consumer Key/Secret this uses) isn't subscribed to the Transit Time / `time-finder` API product. Worth Srinivas checking developer.dhl.com → My Apps → the app in question → its subscribed API products, and adding Transit Time there if it's missing, *before* involving Blue Dart on that one specifically — Location Finder is the one that's actually Blue Dart's problem to fix |
| `RESEND_API_KEY` | Sending the daily "LFG Connect Updates" report email (`src/lib/email.ts`, Resend's HTTP API directly — no SDK) — used by both `/api/lfg/programs/[programId]/send-report` (the Programs page's "Send Report Now" button) and the daily cron route below | Vercel env vars only | MMDI's Resend account already exists (it's the SMTP relay behind Supabase Auth's own emails — see the SMTP note further up this doc), but that's a separate credential (an SMTP password) from an API key for programmatic sending. Generate a new API key in the Resend dashboard → API Keys, and set it here. Optionally also set `RESEND_FROM_EMAIL` (defaults to `LFG Connect <lfgconnect@mmdi.in>`) — whatever address you use must be a verified sending domain/address in Resend |
| `CRON_SECRET` | Authenticates Vercel Cron's own call to `/api/cron/lfg-daily-report` (see `apps/web/vercel.json`'s `crons` entry, scheduled for 7:00 AM IST daily) | Vercel env vars only | Any random secret string works — Vercel automatically attaches it as `Authorization: Bearer <value>` on its own cron requests once this env var is set (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs); the route rejects any request whose header doesn't match |

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
     **This redirect-URL entry is necessary but, as of 1 Sep 2026, not
     sufficient on its own** — see the `flowType` note immediately below
     for a second, separate bug that produces the identical symptom even
     once this entry is correctly in place.
   - **Client `flowType` must be `"implicit"`, not the `@supabase/ssr`
     default of `"pkce"`** (`src/lib/supabase.ts`). Found 1 Sep 2026
     diagnosing an LFG partner stuck exactly like the redirect-URL bug
     above (invite/reset link lands on plain sign-in, no error, no
     password prompt) even *after* confirming the redirect entry above
     was present. Root cause: every login page (`/login`, `/portal/login`,
     `/lfg/login`) reads the invite/recovery token from the URL's hash
     fragment (`#access_token=...&type=recovery`) — the older "implicit"
     auth flow. But `createBrowserClient` from `@supabase/ssr` defaults to
     `flowType: "pkce"`, which expects a `?code=` query param instead, and
     nothing in this codebase implements the corresponding
     `exchangeCodeForSession` step. Under that default, an invite/recovery
     link arrives with no hash the pages know how to read, so they fall
     straight through to a plain sign-in screen — no error, easy to
     mistake for the redirect-URL issue since the symptom is identical.
     Fixed by passing `auth: { flowType: "implicit" }` explicitly in
     `src/lib/supabase.ts`'s `createBrowserClient` call — see that file's
     comment for the full explanation. This is the only
     `createBrowserClient` call in the codebase, so the one change covers
     all three login surfaces. If a future `@supabase/ssr` upgrade or a
     new login surface ever silently drops this option, this exact bug
     comes back.
   - **Client `detectSessionInUrl` must be `false`** (same file, same
     `auth` config object as `flowType` above) — a THIRD bug, also found
     1 Sep 2026, that produces the identical symptom even with both fixes
     above in place. Confirmed via Supabase's own Authentication → Logs:
     every single recovery attempt showed a `login` event firing reliably
     ~6-10 seconds after the `user_recovery_requested` event (proving a
     session genuinely was being created from the token, every time) but
     never a subsequent `user_updated` event — the set-password form was
     just never reached, with no error anywhere. Root cause: with
     `detectSessionInUrl` at its default of `true`, the client
     automatically parses and consumes any access_token/refresh_token in
     the URL hash the instant it's constructed, and clears the hash from
     the address bar (`history.replaceState`) as soon as it succeeds.
     Every login page ALSO does its own manual hash handling
     (`initialModeFromUrl()` reading `window.location.hash` to decide
     sign-in vs. set-password, plus a manual `setSession()` call — see
     e.g. `lfg/login/page.tsx`'s own comment on why that manual path
     exists in the first place: "for in-app browsers that don't auto-
     detect the hash"). The two were racing over the same one-time hash,
     and the automatic path was consistently winning — quietly
     establishing the session (hence `login` firing every time) and
     wiping the hash before each page's own lazy-state read of
     `window.location.hash` ever ran, so `mode` always resolved to
     `"sign-in"` regardless of a perfectly valid token having just been
     consumed a moment earlier. Fixed by adding `detectSessionInUrl:
     false` to the same `auth` config — every login page's manual
     handling was already complete and correct on its own (that's the
     whole point of the existing "for browsers that don't auto-detect"
     fallback code), so this just removes the competing automatic
     listener entirely, leaving the manual code as the only thing that
     ever touches the hash. Confirmed nothing else in the codebase uses
     `signInWithOAuth`/`signInWithOtp` or otherwise depends on the
     automatic behavior — password sign-in, invite, and recovery (all
     handled manually already) are the only auth flows this app has.
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

---

## 10. LFG Connect — Site Master card fixes, Blue Dart auto-advance, courier picker, in-place timeline, staff site-survey auto-create (11 Sept 2026)

A batch of feedback from Mahin on the Site Master page (`app.mmdi.in`), covering the summary cards, Blue Dart tracking, and a couple of related gaps. All in one commit since they touch overlapping files.

**"0 Active" cards were wrong.** `LfgProgramSummaryCard.tsx` was reading `counts.active` — the count of sites whose CURRENT status is literally `"active"` — but the cards are meant to show "how many sites aren't stuck/flagged", i.e. everything except `issue_attention_required` and `deactivated`. Fixed: `activeCount = siteCount - issues - inactive`.

**Printed/shipped/delivered/installed cards didn't behave as a funnel.** They were reading the same current-status buckets (`counts.in_production`, `counts.shipped`, …), so a site that had already moved on to "delivered" stopped counting toward "shipped" — the numbers could go DOWN the pipeline instead of only ever growing, and a shipped-but-not-yet-delivered site wouldn't show up in "printed" even though it obviously was printed. Fixed by switching those four cards to the existing `lfgBenchmarkStatus()` helper (already used by the Status Sheet and Site Cards) — a "crossed this checkpoint or later" cumulative check via `LFG_STATUSES` rank order, so Printed ⊇ Shipped ⊇ Delivered ⊇ Installed the way Mahin described ("number of sites can not be less than shipped").

**Blue Dart "Delivered" wasn't reflected on the site itself.** `/api/lfg/shipments/[shipmentId]/track/route.ts` only ever updated `lfg_shipments.current_status` from a Blue Dart scan — `lfg_sites.site_status` (what every dashboard, card, and the Status Sheet actually reads) stayed wherever a human had last set it manually. Now, the instant Blue Dart's own status maps to "delivered", the route also calls `lfg_change_site_status(site_id, "delivered", ...)` — rank-guarded against `LFG_STATUSES` (same pattern as the site-survey auto-create below) so a site already further along (Installed, Active) is never regressed by a late/duplicate tracking call.

**Courier field was free-text.** Only Blue Dart shipments can be live-tracked, but "Blue Dart" had to be typed correctly for that gate to work (an inline regex, duplicated three ways in the codebase). Added `LFG_COURIERS` (Blue Dart, DTDC, WorldFirst, By Cargo, By Hand) and `isBlueDartCourier()` to `lfgStatus.ts`; the New Shipment form (`LfgSiteWorkspaceClient.tsx`) now uses a dropdown with an "Other" free-text fallback, and both existing regex call sites were switched to the shared helper.

**"View full timeline" navigated away to the Shipping tab.** Changed to open the full (unsliced) event list in the existing shared `Dialog` component in place, instead of `router.push()`ing off the Site Cards grid.

**Staff-created Site Survey Reports (via LFG Connect) never became a site.** `LfgPartnerSiteSurveyReportBridge.tsx`'s auto-create-a-site-from-a-survey step only ran when `identity.partnerId` was set — a staff LFG-Connect session has no partner, so a staff-generated survey silently stayed a siteless draft report, never appearing in the Site Master list ("We have created site survey using lfgconnect but those sites are not added to the list"). Fixed: the auto-create step now runs for staff sessions too, creating an unassigned site/store (`partner_id: null`, same as the New Site form with no partner picked — can be assigned one later). One care point: the existing-store-by-SFO-ID lookup now branches on `.is("partner_id", null)` vs `.eq("partner_id", partnerId)`, since Postgres `.eq(col, null)` never matches NULL rows.

**Survey PDF on site cards, and the Estimates download — both already worked.** Checked before writing any new code: the Site Cards grid already has a "Site Survey" / "Install Report" button per site (`surveyDoc`/`installReportDoc`, sourced from `lfg_site_documents`) that opens the signed PDF inline — it just had nothing to show for staff-created surveys until the fix above. And the Estimates page already has a "Download Costing Excel" button (visible to every role that can view Estimates, not gated to editors) producing a full per-site cost breakdown workbook. Neither needed changes.

**Still open:** the new LFG Connect rate card, map, and pricing update — on hold until Mahin sends the rate card file.

Verified: `npx tsc --noEmit` (whole project, clean) and `npx eslint` on all six changed files (clean). No schema/migration changes in this batch — everything above works against tables and RPCs that already existed.

---

## 11. Customer Portal (`portal.mmdi.in`) — shipping/Blue Dart tracking + invoice download (11 Sept 2026)

Task feedback (Mahin, verbatim): "Add feature shipping to portal.mmdi.in app with Bluedart tracking details. after receipt of the order with payment we go and add shipping details to the site and generate invoice for them and we will input CRN number and GSt invoice format to you for customers to download."

**Requires a manual SQL step** — run `supabase-portal-shipping-invoicing-migration.sql` in the Supabase SQL Editor before this code goes live (adds `portal_order_shipments`, `portal_shipment_events`, `portal_order_invoices` + RLS; safe to re-run). No new Vercel env vars — reuses the existing `R2_*` and `BLUEDART_*` credentials already set for LFG Connect (see section 6).

**Shipping.** Once a portal order's `payment_status` is `paid`, staff (admin/editor) can add a shipment on that order's page (`/portal/orders/[orderId]`, the same page both staff and the customer view — `OrderDetailClient.tsx`): courier (a dropdown — Blue Dart, DTDC, WorldFirst, By Cargo, By Hand, or Other — reusing `LFG_COURIERS`/`isBlueDartCourier()` from LFG Connect as-is, not a second copy), AWB/tracking number, dispatch date, expected delivery. For a Blue Dart shipment, a "Track via Blue Dart" button calls the courier's live tracking API (same `trackAwb()`/`mapBlueDartStatusToLfg()` integration LFG Connect already uses — one Blue Dart integration in the codebase, not two) and appends the scan history as a timeline, visible read-only to the customer on their own order page. Every other courier is manual-status only, same limitation as LFG Connect.

**Invoice.** Deliberately NOT an auto-generated GST document — Mahin said "we will input CRN number and GST invoice format to you", meaning the actual invoice layout is still to come. What ships now: staff types in the CRN number, invoice number, invoice date, and amount, and uploads the invoice PDF (produced in MMDI's existing GST/billing process) on the order page; the customer then sees a "Download Invoice" button on their own order. Fully working end to end today for whatever PDF staff hands it — the only open item is Mahin sending the real GST invoice format so a from-scratch generator could be built later if wanted, same "ships now, on hold pending a file" split as the LFG rate card (section 10) and the Distribution Tool's rate-card import.

**New tables**: `portal_order_shipments` / `portal_shipment_events` mirror `lfg_shipments` / `lfg_shipment_events` column-for-column (same `current_status` vocabulary). `portal_order_invoices` holds the CRN/invoice metadata + the R2 `relative_path` of the uploaded PDF. All three follow the same staff-write/customer-read-own-company RLS shape as every other `portal_order_*` table, reusing the existing `is_mmdi_staff()`/`portal_company_id()` helpers — no new RLS pattern introduced.

Verified: `npx tsc --noEmit` (clean) and `npx eslint` on every new/changed file (clean); the migration SQL parses cleanly under `pglast.parse_sql`.

**11 Sept 2026, later same day: pre-existing bug found while testing the above — MMDI staff couldn't actually reach `/portal/orders/[id]` at all.** Mahin tried previewing an order from Customer Portal → Orders (app.mmdi.in), landed on portal.mmdi.in signed in as staff, and got "No customer-portal account here" instead of the order page. Root cause, confirmed by reading the code (not guessed): `supabase-middleware.ts` deliberately lets staff (admin/editor/viewer) through to every `/portal/*` path — its own comment says "useful for previewing exactly what a customer sees" — but `src/app/portal/(app)/layout.tsx` never actually finished that: it gates ALL children behind `getPortalIdentity()` returning non-null, and that function returns `null` for anyone without a `portal_users` row, staff included. So the two null cases (not signed in vs. staff-with-no-portal-account) were indistinguishable, and staff always hit the same wall meant for genuine strangers — this predates today's shipping/invoice work entirely; the order page's existing staff actions (upload design proof, status changes) were equally unreachable by direct navigation before this fix. **Fixed**: the layout now separately checks `profiles.role` when `getPortalIdentity()` returns null, and lets admin/editor/viewer through to `children` — with a small amber `PortalStaffBar` (new component) instead of the customer `PortalTopBar`, since there's no company identity to show. Genuine non-staff, non-portal sign-ins still see the original "No customer-portal account here" message.

**11 Sept 2026, later still: two more rounds of feedback once the above was actually visible.** (1) "Tracking button is missing" on the customer's own view — the "Track via Blue Dart" button was staff-only by original design, but there's no reason a customer shouldn't be able to pull a fresh status on their own shipment. Requires `supabase-portal-shipment-tracking-customer-migration.sql` (new manual SQL step, run after the shipping/invoicing migration): mirrors LFG Connect's own precedent exactly — `lfg_shipments_write` already grants a partner full write access to their own site's shipments — with the equivalent RLS grant on `portal_order_shipments`/`portal_shipment_events` for a portal customer's own company. `/api/portal/shipments/[id]/track/route.ts` now checks staff OR the shipment's own order's company (matching the portal user's `company_id`, same shape as LFG's `site.partner_id === partnerUser.partner_id` check) instead of staff-only; `OrderDetailClient.tsx`'s button now shows for `isStaff || isCustomer`. (2) "I want invoice preview along with download" — the Invoice section had only a Download link. `order-invoices/[invoiceId]/download-url/route.ts` now takes an optional `?mode=download` query param: omitted, it signs a plain GET (opens in the browser's own PDF viewer — a Preview); `mode=download` additionally sets `ResponseContentDisposition: attachment` to force a real Save-As with the invoice's real file name. The Invoice row now shows both a Preview and a Download link, sharing one route.

**11 Sept 2026, one more round: invoice preview UX + shipment tracking visual redesign.** Task feedback (Mahin, verbatim): "Tracking is sitting just idle and preview is opening in another window lets open it in the same place. Tracking needs a beautiful horizontal card design." No schema change, no new API route — `OrderDetailClient.tsx` only. (1) **Invoice Preview now opens in place** instead of a new browser tab: clicking Preview signs the same `download-url` request (no `mode`) and opens the PDF in an in-page modal (`fixed inset-0` overlay, large `max-w-5xl`/`h-[90vh]` panel, an `<iframe>` body, an "Open in new tab" fallback, and a close button) — reusing the exact large-document-preview pattern LFG Connect's Site 360 already uses (`LfgSiteCardGrid.tsx`), so there's one such modal pattern in the app, not two. Download still opens a new tab/Save-As dialog, since that's a genuine file-save action rather than a view. (2) **Shipment tracking redesigned as a horizontal stepper card** in place of the old plain status badge: the 6 "happy path" statuses (Created → Dispatched → In Transit → At Hub → Out for Delivery → Delivered) render as connected step circles with a progress line — filled + checkmark for completed steps, a highlighted ring for the current step, muted for steps still ahead — so a shipment's live position reads at a glance instead of a single static badge. The 3 exception statuses (Delayed, Delivery Exception, Undelivered) aren't points on that line, so they instead show a red alert row with the status and last known location. Current location and last-tracked time now show with a location pin icon below the stepper.

Verified: `npx tsc --noEmit` (clean) and `npx eslint` on the changed file (clean).

**11 Sept 2026, one more round: coded hero banner on the Customer Portal home page.** Task feedback (Mahin, verbatim, attaching a reference banner mockup): "Take this reference banner to be place on our portal.mmdi.in where customer see our branding and works, make beautiful page instaed a jpeg upload. i will give nice image to insert." Confirmed via clarifying questions: goes on the signed-in customer home page (not the public login page), and as just the hero banner itself — not the reference's full storefront nav (Explore Products/Track Order/search/cart), since none of that is real functionality in the portal today. New component `PortalHeroBanner.tsx` (client component, used from `portal/(app)/page.tsx`, replacing the old plain "Welcome, {name}" line): headline ("Print Beyond **Possibilities.**", the second line in a gradient), a one-line pitch, a "Place Your Order" pill button linking to Products, a 4-item trust-badge row (Trusted Quality / Reliable Fulfilment / Sustainable Solutions / End-to-End Support, mirroring the reference's icons), and an image panel on the right. Every color used is one of `globals.css`'s existing semantic tokens (`primary`/`ai`/`success`) — no new brand hex introduced, per this app's "components must reference semantic tokens only" rule — so the gradient reads as MMDI's existing palette rather than a one-off color lifted from the mockup.

**The image panel is a placeholder until a real photo is supplied** ("i will give nice image to insert"): it tries to load `/brand/portal-hero.jpg` and, since that file doesn't exist yet, falls back to a coded gradient panel (soft color blobs + an "MMDI" watermark) rather than showing a broken-image icon. **To swap in the real photo, just save it as `apps/web/public/brand/portal-hero.jpg`** (same exact file name) and redeploy — no code change needed; the placeholder disappears automatically once that file is present.

Verified: `npx tsc --noEmit` (clean) and `npx eslint` on the new/changed files (clean). Full `next build` wasn't run this round — this sandbox has no outbound access to fonts.googleapis.com, which next/font needs at build time for the Roboto typeface used app-wide, unrelated to this change.

**11 Sept 2026, one more round: shared tracking stepper ported to LFG Connect, in-page "Mark Shipped" shipment-details popup, and a first look at a live Blue Dart 500.** Task feedback (Mahin, verbatim, with a screenshot of the Portal's new stepper card on a real order): "tracking is broken but i love the bar card. implement the same at lfg connect too. Also add this feature in lfg ocnnect cards when we are updating the status to shipped i pop up should open withing the screena nd give provisions to enter courier details AWB number etc details."

**(1) Shared stepper.** Pulled the horizontal tracking-stepper card out of `OrderDetailClient.tsx` into a new `ShipmentTrackingStepper.tsx` (used by both `status`/`statusLabel`/optional `exceptionLocation` props) so the Portal and LFG Connect render the exact same component instead of two copies drifting apart — matching this session's existing "one Blue Dart integration, one status enum" reuse pattern. `LfgSiteWorkspaceClient.tsx`'s `ShipmentCard` (Site 360 → Shipment tab) now shows this stepper at the top of its expanded view, above "Shipment Details", with a "Last tracked" line underneath; the old text-only "Latest known status" fallback block (shown when Blue Dart had a status but no scan-by-scan history yet) was simplified since the stepper now covers that.

**(2) In-page "Mark Shipped" popup.** `LfgPartnerQuickStatusButtons.tsx` (the single "what's next" button on a Site card, wherever it's used — LFG partner home and staff Site Master) previously advanced a site straight to Shipped from a plain yes/no confirm dialog, with no way to attach courier/AWB at that moment — that required a separate trip to Site 360's own Shipment tab. Marking Shipped now opens a richer in-page popup instead (same `Dialog` component already used elsewhere here, never a new tab/window, per "should open withing the screen") with Courier / AWB / Dispatch Date / Expected Delivery fields — all optional, same as the Shipment tab's own "New Shipment" form. Confirming it does both in one action: inserts an `lfg_shipments` row (same insert shape as `LfgSiteWorkspaceClient.tsx`'s existing `handleCreate`, so there's one insert shape, not two) and then calls the existing `lfg_change_site_status` RPC to advance the site to Shipped — previously two separate trips through two different screens. No schema change — `lfg_shipments` already had every column this needs.

**(3) The Blue Dart 500.** The screenshot showed "Blue Dart tracking call failed: 500 Internal Server Error -- {"status":500,"title":"Internal Server Error","error-response":[{"msg":"The server encountered an unexpected condition..."}]}" — a generic Apigee-gateway-shaped fault, not the 401/400/404 request-format bugs already fixed in this file's history (those came back with those exact codes, not 500). Nothing in the request this file builds looks wrong for that AWB, so this reads as a transient fault on Blue Dart's own side rather than a bug here. Added a one-time retry (a single retry after an ~800ms pause, only on a 5xx response, never on 4xx) to every Blue Dart call in `blueDart.ts` (auth, tracking, Location Finder, Transit Time) so a genuinely transient gateway hiccup doesn't surface as a hard failure on the first click. **If the 500 keeps happening on retry too, that's worth raising with Blue Dart support directly (via Chakra Pani, same contact as the original API access) with the exact AWB and timestamp** — a gateway-level "unexpected condition" on their own account/backend isn't something fixable from this side of the integration.

Verified: `npx tsc --noEmit` (clean) and `npx eslint` on every new/changed file (clean).

**11 Sept 2026, one more round: hero banner rebuilt as a diagonal photo collage, with a staff upload tool.** Task feedback (Mahin, re-attaching the same reference banner mockup): "Maintain the same design and recreate it, design looks flat, and give images upload tool so that i can place them nicely." The first pass (an earlier round this session) built the banner's copy/CTA/badges faithfully but used a single placeholder image panel — flat next to the reference's tessellated band of diagonally-cut photos. This round rebuilds the right-hand side as that same diagonal collage, and adds a real content-management tool for it instead of the earlier "drop a file at this exact path" approach.

**Requires a manual SQL step** — run `supabase-portal-hero-images-migration.sql` in the Supabase SQL Editor before this code goes live (adds `portal_hero_images` + RLS; safe to re-run; needs `supabase-customer-portal-schema.sql`'s `is_mmdi_staff()`/`is_portal_user()`/`user_role()` helpers, already in place). No new Vercel env vars — reuses the existing `R2_*` credentials.

**5 named photo slots** (Spaces / Vehicles / Signage / Displays / Graphics — the same category list shown as text beside the collage, matching the reference) render as one continuous diagonally-clipped strip (`clip-path` parallelograms, each panel overlapping the one before it) — verified visually via a standalone HTML/CSS prototype rendered with Playwright before porting into the real component, since this sandbox can't build/preview the Next.js app itself (no network access to fonts.googleapis.com, which next/font needs). A slot with nothing uploaded yet shows a soft gradient tile with a small category icon (Building2/Car/Signpost/Monitor/Palette) instead of a broken image or empty box — same graceful-placeholder principle as the first pass, just per-slot now instead of for the whole banner. Also added, closer to the reference: the "SPACES / VEHICLES / SIGNAGE / DISPLAYS / GRAPHICS / and more..." list with a gradient accent line and an "Ideas in Every Space" line, and a bottom "Graphics for a Brighter Tomorrow" tagline strip with line accents either side. Both fold away below the `lg` breakpoint rather than being squeezed onto narrow screens.

**The upload tool**: Customer Portal workspace (app.mmdi.in) → new "Hero Banner" tab, alongside Companies/Products/Orders. One card per slot with a live thumbnail and an Upload/Replace button — same presigned-PUT-to-R2 pattern as the Products tab's own preview-image upload (`portal-hero-images/<slot>/<uuid>.<ext>` in R2; `portal_hero_images` upserted by `slot_key`, so there's always at most one row per slot, not a history). Deliberately no manual drag/position controls — "placing nicely" just means picking which photo goes in which named slot; the diagonal layout itself is coded, not manually arranged. New routes `/api/portal/hero-images/[slotKey]/upload-url` (staff-only, admin/editor) and `.../preview-url` (any signed-in staff or portal customer, 900s presigned GET — same longer expiry as Products' own preview, since this is read-many on every home page visit, not a one-shot download).

Verified: `npx tsc --noEmit` (clean, apps/web and packages/shared both) and `npx eslint` on every new/changed file (clean); the migration SQL parses cleanly under `pglast.parse_sql`; the collage geometry was visually verified via a Playwright screenshot of a standalone prototype (both desktop and ~420px mobile widths) before being ported into the real component.

**11 Sept 2026, one more round: found and fixed a silent-failure bug behind "tracking stuck at Created."** Task feedback (Mahin, verbatim, with screenshots of order PORT-000013 showing the new stepper stuck at step 1 "Created" while steps 2-6 sat muted): "it si still nor showing actual tracking on bluedart website it is in transit but it istuck at crearted."

**Root cause, found by reading the code (not guessed):** neither of the two Supabase writes in `/api/portal/shipments/[shipmentId]/track/route.ts` (the `portal_shipment_events` insert and the `portal_order_shipments` update that actually moves `current_status`) ever checked for an error. Supabase/PostgREST returns HTTP 200 with **zero rows affected** — no thrown error — when an authenticated write is silently blocked by RLS. So if a customer's own session didn't satisfy `portal_order_shipments_update_customer`'s own-company check for some reason, the route would still call Blue Dart successfully, still respond 200, and the shipment's `current_status` would simply never move off its `shipment_created` default — with no error surfaced anywhere. That is exactly this symptom: a stepper that renders correctly (proving the *read* side works) but never advances past step 1 no matter how many times "Track via Blue Dart" is clicked. Ruled out first, by direct inspection, before landing on this: a missing-column issue (`portal_order_shipments` already had every column this route touches from its original migration) and a `mapBlueDartStatusToLfg()` mapping bug (its keyword logic correctly maps any status text containing "in transit" to `in_transit`).

**Fix**: both writes now check their own error, and the status update additionally re-selects the row it just touched (`.select("id").maybeSingle()`) so a silent 0-rows-affected RLS block is caught too, not just a hard Postgres error — either failure mode now sets a `warning` string returned in the route's JSON response instead of disappearing. `OrderDetailClient.tsx`'s `handleTrack()` now surfaces `data.warning` (previously only checked on a non-200 response, so a 200-with-warning response was dropped on the floor). Applied the identical hardening to LFG Connect's own `/api/lfg/shipments/[shipmentId]/track/route.ts` and its caller `handleTrackViaBlueDart()` in `LfgSiteWorkspaceClient.tsx` — that route wasn't the one reported broken, but had the exact same unchecked-write shape, so it gets fixed alongside rather than waiting for someone to hit it there too (preserved its existing optional-column fallback-retry logic; the retry's second attempt is now also re-selected and checked). No schema change — every column this touches already existed.

**Honesty note**: this sandbox has no way to call the live Blue Dart API or read Vercel's function logs, so this fix is based on a strong, code-verified root cause, not a reproduced-and-confirmed one. After this bundle is applied, please click "Track via Blue Dart" again on PORT-000013 (or whichever order is still showing this) and report exactly what happens — if a warning message now appears, that confirms this was it and says what to fix next (an RLS grant, most likely); if the status now updates correctly with no warning, that confirms the fix; if nothing changes and no warning appears either, the real cause is somewhere this sandbox genuinely can't see and Vercel's function logs for that request would be the next place to look.

Verified: `npx tsc --noEmit` (whole project, clean) and `npx eslint` on all four changed files (clean). No schema/migration changes in this round.

**Confirmed same day**: the new warning immediately surfaced the real cause on PORT-000013 — Blue Dart responded fine ("NETWORK DELAY, WILL IMPACT DELIVERY"), but the save was blocked, and it turned out `supabase-portal-shipment-tracking-customer-migration.sql` (delivered in an earlier round, the migration granting a portal customer write access to their own shipment) had never actually been run in Supabase. Running it there fixed the underlying permission gap. Worth remembering for any future "silently not saving" report: check whether every migration a feature depends on was actually applied before assuming the application code is wrong.

**11 Sept 2026, one more round: hero banner simplified — no badges, no collage compositing, single staff-uploaded image, ~40% shorter.** Task feedback (Mahin, verbatim): "Remove from ideas text, trusted quality, relaible fulfullment, sustainable solutins, end to end support also remove graphics for brighter tomorrow line. reduce height to 40% . make one image insert i will post the collage."

Pared the banner (`PortalHeroBanner.tsx`) back from the earlier diagonal 5-slot photo collage + trust badge row + "Ideas in Every Space" script line + bottom tagline strip down to: headline/pitch/CTA on the left, the category name list in the middle (unchanged), and a single image panel on the right — no more per-slot compositing, since Mahin is providing one pre-made collage image himself. Removed the 4 trust badges (Trusted Quality / Reliable Fulfilment / Sustainable Solutions / End-to-End Support) and their icons entirely, the "Ideas in Every Space" line, and the "Graphics for a Brighter Tomorrow" tagline strip. Overall height cut to roughly 40% of before — tighter padding throughout, smaller headline, and the image column's min-height reduced from `320px` to `130px` (`h-56`/`h-64` → `h-24`/`h-28` on mobile/tablet).

`portalHeroSlots.ts`'s `PORTAL_HERO_SLOTS` — previously 5 entries (spaces/vehicles/signage/displays/graphics) — is now a single `{ key: "collage", label: "Hero Collage" }` entry; kept as an array (not a bare constant) so the existing slot-keyed upload API routes (`/api/portal/hero-images/[slotKey]/...`) and `portal_hero_images` table (its `slot_key` column was always plain text, no check constraint — see that table's own migration) needed zero changes, just one fewer value flowing through them. **No new SQL migration needed.** Customer Portal workspace → Hero Banner tab (`HeroBannerTab.tsx`) now shows one upload card instead of 5, with its preview reshaped to a wide `3:1` aspect ratio (was `4:3`) to match a banner-shaped collage image rather than a single photo.

Verified: `npx tsc --noEmit` (clean) and `npx eslint` on all three changed files (clean); the reduced-height layout was visually checked via a standalone HTML/CSS prototype rendered with Playwright (this sandbox still can't build/preview the real Next.js app — no network access to fonts.googleapis.com).

**11 Sept 2026, one more round: Customer Portal re-themed with a new color palette, product catalog moved onto the home page, "Products" dropped from the nav.** Task feedback (Mahin, verbatim, attaching a reference color-palette moodboard image): "something is nt fittign in check all size they look different. also remove products tab and add the products here so that home page looks occupied and make it no compact design. also use this color pallette attached. make it stunning order page." Clarified via two quick questions: the new palette applies to the whole customer portal (not just the home page), and Products comes off the nav entirely rather than staying as a second destination.

**New palette.** Sampled directly from the reference image's swatches (not eyeballed): a warm near-black maroon `#2a1212`, a slate blue `#607586`, and a dusty mauve/pink `#a0656b`/`#f3dfe1`. Added as a new `[data-theme="portal"]` override block in `globals.css`, following the exact same scoping pattern LFG Connect's own `[data-theme="lfg"]` override already established (a `data-theme` attribute on each surface's root wrapper, not a global change) — applied to `portal/(app)/layout.tsx`, `portal/login/page.tsx`, and `portal/policies/layout.tsx`, so it's the whole customer-facing portal (signed-in pages, login, and the public policy pages) without touching app.mmdi.in or lfgconnect.mmdi.in at all. Functional status colors (success/warning/danger/info — used for order-status badges like Paid/Submitted) were deliberately left at their global defaults rather than reworked into the new palette, so those stay unambiguous. `PortalHeroBanner.tsx`'s gradient accents (headline, accent line, bottom bar, image placeholder) were changed from a 3-stop primary/ai/success blend to a 2-stop primary/ai blend, since the untouched green `success` no longer matched the new palette's warm tones.

**Products moved onto the home page.** `portal/(app)/page.tsx` now fetches and renders the exact same product query and `ProductGrid` component the old `/products` page used (so there's still one card-rendering implementation, not two) directly under a new "Shop the Catalog" heading, between the quick-action cards and Recent Orders. `PortalTopBar.tsx`'s nav dropped the "Products" entry entirely; the `/products` route file itself was left in place (no dead links break for anyone with it bookmarked), just unlinked from the nav. The hero banner's CTA and the "Browse the catalog" quick-link card now both point at `#products` (an anchor on the same page) instead of a separate route.

**"Not compact" / sizing.** The portal's main content container widened from `max-w-4xl` to `max-w-6xl` (both `portal/(app)/layout.tsx`'s `<main>` and `PortalTopBar.tsx`'s header, so they still align) — room for a 3-column product grid (`ProductGrid.tsx`: `sm:grid-cols-2` → `lg:grid-cols-3`) instead of squeezing everything into a form-width page. Normalized every card on the home page and product grid to the same `rounded-xl` radius and `p-5` padding (previously a mix of `rounded-lg`/`rounded-md` and `p-3`/`p-4` across different cards, likely the "sizes look different" Mahin flagged) so the page reads as one consistent scale rather than several ad-hoc card styles.

Verified: `npx tsc --noEmit` (clean) and `npx eslint` on all changed files (clean); the full re-themed layout (header, hero, quick-link cards, product grid) was visually checked via a standalone HTML/CSS prototype rendered with Playwright before porting into the real components, same as every other visual change this session that this sandbox can't build/preview directly.

**11 Sept 2026, one more round: product cards stretch to fill the row, footer widened to match.** Task feedback (Mahin, verbatim, with a screenshot of the re-themed home page): "make the terms and conditions too in same width should we? And increase the card width to match page width." (The trust-badge/tagline removal he also mentioned in the same message was already done in the previous round — confirmed against his screenshot, no change needed there.)

`ProductGrid.tsx`'s grid was a fixed `sm:grid-cols-2 lg:grid-cols-3` -- with only 2 real products in the catalog today, that left roughly a third of the row as dead empty space on `lg` screens (exactly what the screenshot showed). Switched to `grid-cols-[repeat(auto-fit,minmax(280px,1fr))]` -- CSS Grid's `auto-fit` collapses unused tracks and lets the actual cards stretch to fill the row, so 2 products now split the full row width evenly instead of sitting in a fixed-width 2-of-3 layout; naturally still stacks to 1 column on narrow screens without a separate mobile breakpoint. `PortalPolicyFooter.tsx`'s black policy-links band widened from `max-w-4xl` to `max-w-6xl` to match the page container it sits under (`portal/(app)/layout.tsx`'s `<main>`, widened to the same in the previous round) -- previously the only element on the page narrower than everything else, which is what read as "not fitting."

Verified: `npx tsc --noEmit` (clean) and `npx eslint` on both changed files (clean); the stretch behavior and footer width were visually confirmed via a standalone HTML/CSS prototype rendered with Playwright.

**11 Sept 2026, one more round: the pitch paragraph itself, finally actually removed.** Task feedback (Mahin, verbatim, with a screenshot circling the paragraph): "I have bee asking to remove the text." A misread on my part across two earlier rounds: "Remove from ideas text" in his original message meant the pitch paragraph itself ("From ideas to impact — place a new order, track design approval, and follow every shipment right through to your stores."), not the separate "Ideas in Every Space" script line that sat under the category list — I removed the latter (correctly, per its own explicit mention) but left the former in place both times. Removed now — `PortalHeroBanner.tsx`'s left column goes straight from the headline into the CTA button, nothing else changed.

Verified: `npx tsc --noEmit` (clean) and `npx eslint` on the changed file (clean).

**11 Sept 2026, one more round: hero banner is now just the uploaded image, no coded card around it.** Task feedback (Mahin, verbatim, after uploading his first real banner image via the Hero Banner tab): "lets place the complete banner in image format so remoce the card in banner header." The uploaded image (see his screenshot) is itself a complete, pre-designed banner graphic -- its own headline-style text, category list, and icons all baked into the image -- so the coded headline/CTA/category-list card wrapped around it was now duplicating what the image already shows.

`PortalHeroBanner.tsx` stripped down to just the uploaded image at full width, un-cropped (`h-auto w-full`, not `object-cover`, so it renders exactly as designed rather than being cropped to a fixed box) -- no headline, no category list, no visible CTA button. Wrapped the whole image in a link to `ctaHref` (`#products`) so the banner stays clickable-to-shop even with nothing visibly clickable drawn on top of it. The `greetingName` prop (used for the now-removed "Welcome back, ..." line) was dropped from the component and its caller (`portal/(app)/page.tsx`) rather than left unused. The no-image-yet placeholder (soft gradient + icon) is unchanged, still shown until an image is uploaded.

Verified: `npx tsc --noEmit` (clean) and `npx eslint` on both changed files (clean).
