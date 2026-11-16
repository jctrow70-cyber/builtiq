# Codemagic integration outline (future)

Use this when Windows-first development needs iOS binaries without a capable local Mac.

## When to use

- Old MacBook cannot run the Xcode version Capacitor 8 requires
- No Mac available for day-to-day archives
- TestFlight / device builds after Apple Developer Program enrollment (post–MOB-01)

## Suggested workflow

1. Keep Capacitor sources in git (`capacitor.config.ts`, `mobile/www`, later `ios/` after first `cap add ios` on CI or a Mac).
2. Create a Codemagic app linked to this GitHub repo.
3. Build workflow (sketch):

```yaml
# Illustrative only — finalize when enabling CI.
workflows:
  ios-dev:
    name: BuildIQ iOS Dev
    environment:
      vars:
        BUILDIQ_MOBILE_SERVER_URL: $BUILDIQ_MOBILE_SERVER_URL  # Preview/test only
      xcode: latest
    scripts:
      - name: Install
        script: npm ci
      - name: Capacitor iOS
        script: |
          npx cap add ios || true
          npx cap sync ios
      - name: Build IPA
        script: |
          # Use Codemagic automatic code signing once Apple Developer is available
          xcode-project build-ipa --project ios/App/App.xcodeproj --scheme App
    artifacts:
      - build/ios/ipa/*.ipa
```

4. Store signing secrets in Codemagic — never in the BuildIQ repo.
5. Point `BUILDIQ_MOBILE_SERVER_URL` at a **publicly reachable Preview/test** host using development Supabase. Do not inject production URLs or server secrets into the mobile job.

## MOB-01 boundary

Codemagic is documented only. No CI config is enabled in MOB-01. No Apple Developer account is required to land MOB-01.
