# iOS setup (post–MOB-01)

MOB-01 does **not** require an Apple Developer account and does **not** assume the existing MacBook can run current Xcode.

## What MOB-01 prepared

- Capacitor config: `capacitor.config.ts` (`com.buildiq.health.dev`)
- iOS package present: `@capacitor/ios`
- Local web stub: `mobile/www`
- Scripts: `npm run cap:sync`, `npm run cap:ios`

The `ios/` native project is generated on macOS (or CI) with:

```bash
npm install
# Optional bridge target — Preview/test only, never production:
# export BUILDIQ_MOBILE_SERVER_URL=https://your-accessible-preview.vercel.app
npx cap add ios
npx cap sync ios
npx cap open ios
```

## macOS / Xcode prerequisites (verify on the machine you use)

1. Record Mac model, chip, RAM, and macOS version.
2. Confirm App Store / developer Xcode version required by Capacitor 8 (check Capacitor iOS getting-started for the pinned Xcode).
3. If the old MacBook cannot install that Xcode, use cloud macOS (Codemagic) instead — see `CODEMAGIC.md`.

## Without an Apple Developer Program membership

- You can generate the Xcode project and compile for the **Simulator** with a free Apple ID on a Mac that supports the required Xcode.
- Physical device installs and TestFlight need a paid Apple Developer Program membership later (not MOB-01).

## Do not do in MOB-01 / early iOS prep

- Production bundle ID / App Store Connect app record (until IDs approved)
- Distribution certificates / provisioning for production
- HealthKit entitlements
- Push (APNs) certificates
