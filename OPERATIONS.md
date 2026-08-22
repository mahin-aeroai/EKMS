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
| Supabase service-role key | — | **Nowhere in this codebase, on purpose** | Never put this in an env var an app ships with; if ever needed for an admin script, keep it off any client bundle entirely |
| `ANTHROPIC_API_KEY` | AI Copilot's server-side model calls | Vercel env vars only | Srinivas creates/rotates this directly in Vercel; the assistant never sees the raw key |
| Google OAuth client ID/secret | Gmail search/draft in AI Copilot | Vercel env vars | Standard OAuth app credentials from Google Cloud Console |
| Apple Developer account | EAS local iOS builds | Srinivas's own Apple ID / Keychain, used implicitly by `eas build --local` | Individual enrollment — see section 5 for what that limits |

**Rule of thumb:** if a task seems to need a credential, the answer is
either "it's already configured where the table above says" or "it needs
Srinivas to create/paste it directly into Vercel/Supabase/Keychain
himself" — never into a chat message, terminal echo, or committed file.

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
