# Migration path — remote WebView bridge → local mobile assets

The MOB-01 remote Vercel WebView (`server.url`) is an **authorized development bridge only**. It is not the permanent production architecture.

## Phase A — MOB-01 (current)

- Capacitor shell with optional `server.url` → Preview/test host
- Existing Next.js UI/API remain on Vercel
- Shared business logic stays in `lib/**`
- No duplication of workout completion / session persistence

## Phase B — MOB-02 (next)

- Confirm a stable, SSO-free Preview/test host for device testing
- Android device install of the bridge against development Supabase
- Prepare iOS project generation (Mac or Codemagic)
- Harden deep links / auth storage seams already stubbed under `lib/mobile`

## Phase C — Local assets + hosted APIs

1. Produce a mobile web bundle strategy (dedicated mobile entry or static export of client surfaces — design in MOB-02+; not a full rewrite).
2. Set Capacitor `webDir` to that bundle; remove reliance on remote `server.url` for shipping builds.
3. Set `NEXT_PUBLIC_BUILDIQ_API_BASE_URL` (or equivalent) so `/api/*` calls hit Vercel while UI loads from the binary.
4. Keep OpenAI, service role, Resend, and admin tools server-side only.
5. Add offline-friendly logging queues later without changing the meaning of completed history.

## Phase D — Native platform value

- Push notifications
- HealthKit / Health Connect (private health tables; no automatic trainer/group share)
- Store-ready signing, privacy policy, account deletion

## Invariants

- One product: web + iOS + Android share BuildIQ rules and Supabase data
- Do not fork workout logging business logic into native-only code
- Do not ship server secrets inside the mobile application
