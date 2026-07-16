# BuildIQ Health

BuildIQ Health is a wellness and fitness application focused on helping users build themselves physically, mentally, and spiritually through exercise tracking, nutrition tracking, progress history, and future AI coaching.

## Product Vision

BuildIQ Health helps people become stronger, healthier, and more consistent by combining workout tracking, nutrition tracking, wellness habits, progress insights, and personalized AI coaching in one simple platform.

## Core Concept

BuildIQ Health is built around the idea that health is wealth and that users are always building themselves for the present and the future.

## Current MVP Focus

The initial product focus is to create a strong foundation for:

- User accounts and authentication
- Strength training and workout logging
- Exercise templates
- Workout history
- Progress tracking
- Nutrition and macro tracking
- Secure database structure
- Mobile-friendly user experience

## Future Product Direction

Future versions may include:

- AI Wellness Coach
- Personalized workout generation
- Nutrition recommendations
- Habit tracking
- Recovery tracking
- Progress analytics
- Wearable integrations
- iOS and Android apps
- Tiered free and premium subscriptions

## Development Principles

All development should follow these principles:

1. Keep the app simple and easy to use.
2. Protect user data with proper authentication and database security.
3. Document every meaningful change.
4. Build mobile-first whenever possible.
5. Avoid unnecessary complexity until the MVP is stable.
6. Maintain a clear product roadmap.
7. Treat AI-generated code as code that must be reviewed and tested.

## Branch Strategy

Recommended branch setup:

- `develop` = active coding and AI development
- `main` = stable testing environment
- `production` = future live user environment

For now, if only `main` exists, create a `develop` branch before making major changes.

## Change Management

Every meaningful change should use a BuildIQ change number:

Example:

```text
BIQ-0001 Initial documentation foundation
BIQ-0002 Strength/team RLS security hardening
BIQ-0003 Workout history stability
BIQ-0004 Workout plan sections and exercise organization
BIQ-0005 Nutrition tracker foundation
BIQ-0006 AI Coach planning
```

Each change should update `CHANGELOG.md` and include testing steps.

## Recommended Cursor Workflow

Before coding, ask Cursor to:

```text
Review README.md, ROADMAP.md, CHANGELOG.md, DECISIONS.md, and .cursorrules before making changes. Follow the BuildIQ change management process. Create or use the next BIQ change number, document files changed, database changes, testing steps, and recommended commit message.
```

## Windows quick start (one-time per machine)

If `npm` is not recognized in PowerShell, use the repo setup script instead of fixing PATH manually each time:

```powershell
cd "C:\Users\YOU\path\to\buildiq"
powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
```

Or **double-click** `buildiq-setup.cmd` in the repo root.

**First time only:** install Node.js LTS if the script says it's missing.

**No admin rights?** Double-click these (work on locked-down corporate PCs):

1. `buildiq-install-node.cmd` — downloads portable Node once  
2. `buildiq-setup.cmd` — runs `npm install`  
3. `buildiq-import-guided.cmd` — guided library (~1,324 GIF exercises)  
4. `buildiq-import.cmd` — guided library + alternatives (needs `.env.local`)

If PowerShell shows *Constrained Language Mode*, use the `.cmd` files — not the `.ps1` scripts.

**With admin:** `winget install OpenJS.NodeJS.LTS`

**Exercise import (easiest — no npm):**

1. Add to `.env.local` in the repo root (get keys from Supabase → Project Settings → API):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   BUILDIQ_CATALOG_ADMIN_EMAILS=your@email.com
   ```
   On Vercel, add the same variables (including **Preview** if using preview deploys). Only emails in `BUILDIQ_CATALOG_ADMIN_EMAILS` see the Settings import card.
2. Start the app (`buildiq-npm.cmd run dev` or your hosted deploy with the same env vars).
3. Sign in → **Settings** → **Guided Exercise Library** → click **Import Guided Library** (~1,324 exercises with GIF demos).

No admin rights or npm required for the in-app import — only the service role key on the server.

**Windows CMD fallback (if you prefer double-click):**

1. `buildiq-install-node.cmd` — portable Node (no admin)  
2. `buildiq-setup.cmd` — `npm install` once  
3. `buildiq-import-guided.cmd` — guided library import (needs `.env.local`)  
4. `buildiq-import.cmd` — guided library + alternatives

**Legacy npm command:**

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1 -ImportExercises
```
