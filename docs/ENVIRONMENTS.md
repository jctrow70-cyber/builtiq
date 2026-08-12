# BuildIQ Health — Test and Live Environments

This guide sets up a **full test pipeline** without needing local `npm`. You push to GitHub; Vercel builds and deploys on their servers.

## Overview (recommended: one Vercel project)

Use your **existing** Vercel project (`builtiq`). Different branches get different deployment types:

| Layer | Test | Live |
| --- | --- | --- |
| **GitHub branch** | `Develop` | `main` |
| **Vercel deployment** | **Preview** (branch deploy) | **Production** |
| **Vercel URL** | `builtiq-duf7-git-develop-….vercel.app` | `https://builtiq-duf7.vercel.app` |
| **Supabase project** | Develop / test project | Production project |
| **When to use** | Every change while building | After you verify on test |

```text
  Push Develop  ──►  GitHub (Develop)  ──►  Vercel PREVIEW  ──►  Test Supabase
                                                      │
                                            verify here │
                                                      ▼
  Promote main  ──►  GitHub (main)      ──►  Vercel PRODUCTION ──►  Live Supabase
```

> **Note:** Your repo uses `Develop` (capital D) on GitHub. The docs and `.cursorrules` say `develop` — they mean the same test branch.

> **One Vercel project, two env scopes:** Preview deployments use **Preview** env vars (test Supabase). Production deployments use **Production** env vars (live Supabase). That separation is what keeps test data off live.

---

## One-time setup (about 20 minutes)

Do these steps once. After that, daily work is just push → test → promote.

### 1. Test Supabase project

If you do not already have a separate test Supabase project:

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project** (e.g. `buildiq-test`).
2. Run every file in `supabase/migrations/` in order in **SQL Editor** (oldest date first).
3. Optional: import the exercise catalog (Settings → Import in the app, or `buildiq-import-guided.cmd` with test keys in `.env.local`).
4. **Authentication → URL configuration** — add redirect URLs for preview deploys:
   - `https://builtiq-duf7-git-develop-*.vercel.app/**` (branch preview pattern)
   - Or the exact URL Vercel shows on a `Develop` deployment (see step 2 below)
   - `http://localhost:3000/**` (optional, for local testing)
5. Copy **Project URL**, **anon key**, and **service role key** for step 2.

Your live Supabase project stays untouched until you promote database changes.

### 2. Vercel project — one project, two scopes

Project **`builtiq`** (same repo: `jctrow70-cyber/builtiq`):

1. **Settings → Git → Production Branch** → **`main`** (live deploys only from `main`).
2. **Settings → Environment Variables** — add each variable **twice** with different scopes:

   | Variable | Preview (test) | Production (live) |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Test Supabase URL | Live Supabase URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Test anon key | Live anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Test service role | Live service role |
   | `BUILDIQ_ADMIN_EMAILS` | Your email(s) | Same or live-only admins |
   | `OPENAI_API_KEY` | Optional / shared | Production key |
   | `RESEND_API_KEY` | Optional | Live sender |
   | `BUILDIQ_EMAIL_FROM` | Optional | Live sender |

   When adding each variable in Vercel, check **Preview** for test values and **Production** for live values. Leave **Development** unchecked unless you run `vercel dev` locally.

3. Push once to **`Develop`** to trigger a preview build.
4. Vercel → **Deployments** → open the latest **`Develop`** deployment → copy its URL (often `builtiq-duf7-git-develop-jctrow70-cyber.vercel.app`).
5. Add that URL (or the wildcard pattern above) to **test Supabase** auth redirect URLs if login fails.

**Live Supabase** auth redirect URLs should include only:

- `https://builtiq-duf7.vercel.app/**`

If pushes to `main` do not deploy:

- [github.com/settings/installations](https://github.com/settings/installations) → **Vercel** → ensure `builtiq` repo access.
- Vercel → **Deployments → Redeploy**, or push an empty commit to `main`.

### 3. GitHub branch protection (optional but recommended)

On GitHub → **Settings → Branches**:

- Protect **`main`**: require pull request or restrict who can push (so live only updates on purpose).
- Leave **`Develop`** open for day-to-day pushes.

---

## Daily workflow (no npm required)

### Push to test

From the repo folder in **Command Prompt** or **PowerShell**:

```text
buildiq-push-test.cmd
```

Or manually:

```text
git checkout Develop
git add .
git commit -m "Your message"
git push origin Develop
```

Within ~1–2 minutes, Vercel creates a **Preview** deployment for `Develop`. Open it from **Vercel → Deployments** (filter by branch `Develop`) or use the stable branch URL if shown.

Bookmark the `Develop` preview URL so you do not hunt for it each time.

### Database changes

If a change includes a new file in `supabase/migrations/`:

1. Run the migration SQL on **test Supabase** first.
2. Verify on the preview URL (Preview env → test DB).
3. When promoting to live, run the **same** migration on **live Supabase**, then promote code.

Never run experimental migrations on live first.

### Promote to live

When the preview site looks good:

```text
buildiq-promote-live.cmd
```

Type **`LIVE`** when prompted. This merges `Develop` into `main` and pushes — Vercel **Production** deploys to `https://builtiq-duf7.vercel.app`.

Or use a GitHub Pull Request: **Develop → main**, review, merge.

---

## Environment variable checklist

Audit in **Vercel → builtiq → Settings → Environment Variables**:

| Variable | Preview scope | Production scope |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Test project | Live project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Test anon | Live anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Test service role | Live service role |
| `BUILDIQ_ADMIN_EMAILS` | Your admin email(s) | Same or live-only |
| `OPENAI_API_KEY` | Test or shared | Production |
| `RESEND_API_KEY` | Optional | Live sender |

**Common mistake:** Preview scope missing or still pointing at live Supabase — preview site shows real user data. Fix Preview vars and **Redeploy** the `Develop` branch.

---

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Push to `Develop` but no preview build | Vercel **Settings → Git** connected; preview deployments enabled for the repo |
| Push to `main` but live site unchanged | Production branch is `main`; check **Production** deployment tab |
| Preview shows live user data | **Preview** env vars still use live Supabase keys — update and redeploy |
| Auth login loops on preview | Test Supabase redirect URLs include the preview domain |
| Auth fails on live only | Live Supabase redirect URLs include `builtiq-duf7.vercel.app` |
| Build fails on Vercel | **Deployments** → failed build → read log |
| `Develop` vs `develop` confusion | Remote branch is `Develop`; scripts use that name |

---

## Optional: second Vercel project

Use this only if you want a **dedicated stable test URL** (e.g. `builtiq-test.vercel.app`) instead of branch preview URLs.

1. **Add New → Project** → same GitHub repo.
2. Name it **`builtiq-test`**.
3. **Production Branch** → **`Develop`** (this project’s “production” *is* test).
4. Env vars → **Production** scope only, all pointing at **test** Supabase.

Live stays on the original **`builtiq`** project with **Production Branch** = `main`.

Most teams skip this and use **one project + Preview/Production scopes** (recommended above).

---

## Optional: separate test GitHub repo

Only if you want complete repo isolation. Otherwise **one repo + `Develop` + `main`** is simpler.

---

## Quick reference

| Action | Command / target |
| --- | --- |
| Deploy to test | `git push origin Develop` or `buildiq-push-test.cmd` |
| Test URL | Vercel **Preview** for branch `Develop` |
| Deploy to live | `buildiq-promote-live.cmd` or merge to `main` |
| Live URL | `https://builtiq-duf7.vercel.app` |
| Test database | Supabase test project (via **Preview** env vars) |
| Live database | Supabase production project (via **Production** env vars) |
