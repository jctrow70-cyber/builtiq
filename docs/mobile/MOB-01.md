# MOB-01 — Mobile Foundation

Status: implemented locally on `cursor/mob-01-mobile-foundation-cb92`. Not committed/pushed until approved.

## Goal

Add Capacitor scaffolding for iOS/Android while keeping the existing Next.js + Vercel + Supabase web platform unchanged.

## Approved architecture (MOB-01)

| Layer | Choice |
| --- | --- |
| Web | Existing Next.js app on Vercel |
| APIs / secrets | Remain on Vercel Route Handlers |
| Auth / data | Supabase (anon in client; service role server-only) |
| Native shell | Capacitor 8.x |
| MOB-01 bridge | Optional remote `server.url` → **Preview / test** host only |
| Permanent target | Locally bundled mobile assets + hosted APIs (see `MIGRATION_PATH.md`) |

## Development identifiers (temporary)

- Application ID: `com.buildiq.health.dev`
- Display name: `BuildIQ Health Dev`

Final store identifiers are not configured in MOB-01.

## Development server target (verify before use)

Capacitor resolves the bridge URL in this order:

1. `BUILDIQ_MOBILE_SERVER_URL`
2. `mobile/dev-target.json` (gitignored; copy from `mobile/dev-target.example.json`)
3. Otherwise local `mobile/www` stub (no remote bridge)

### Verification performed during MOB-01

| Check | Result |
| --- | --- |
| Documented Develop preview `builtiq-duf7-git-develop-jctrow70-cyber.vercel.app` | **404** `DEPLOYMENT_NOT_FOUND` (stale docs URL) |
| GitHub branch `Develop` tip | **2026-07-04** — not the current product baseline |
| Production `https://builtiq-duf7.vercel.app` | Reachable; client bundle references `https://qruiwfzzrylrirlxzdqx.supabase.co` |
| Recent Vercel Preview deployment URLs | Redirect to **Vercel SSO** (Deployment Protection) — not usable inside a device WebView without auth cookies |

**Do not** point the Capacitor bridge at production.

**Required operator step before device bridge testing:** publish or expose a Preview (or dedicated test) deployment that:

1. Uses Vercel **Preview** env vars bound to the **development** Supabase project.
2. Is reachable from a phone/emulator without Vercel SSO (disable Deployment Protection for that test host, or use a public `builtiq-test` project as described in `docs/ENVIRONMENTS.md`).
3. Is recorded in `mobile/dev-target.json` or `BUILDIQ_MOBILE_SERVER_URL`.

## Commands

```bash
npm install
npm run test:mobile-foundation
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-DEV-PROJECT.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_DEV_ANON_KEY \
  npm run build
npx cap sync
# android/ already generated on this branch; re-run only if missing:
# npx cap add android
cd android && ./gradlew assembleDebug
npx cap open android  # requires Android Studio (optional)
```

Android debug APK was verified with `assembleDebug` during MOB-01 on the agent (SDK 35).

iOS project generation requires macOS + Xcode — see `IOS_SETUP.md` and `CODEMAGIC.md`.

## Out of scope (do not start)

- MOB-02
- HealthKit / Health Connect
- Push notifications
- Mobile UI redesign
- Production signing
- Database migrations
- Workout completion / session persistence changes
