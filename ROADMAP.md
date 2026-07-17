# BuildIQ Health Roadmap

This roadmap tracks the planned development path for BuildIQ Health.

## Product Mission

BuildIQ Health helps users build long-term health, strength, discipline, and confidence through fitness tracking, nutrition tracking, progress insights, and personalized AI wellness coaching.

## Phase 1 — Product Foundation

Goal: Establish the basic app structure and development process.

### Priorities

- Confirm product name and brand direction
- Create documentation foundation
- Set up change tracking process
- Confirm branch strategy
- Review current codebase structure
- Identify security gaps
- Identify database gaps
- Confirm MVP feature scope

### Key Deliverables

- README.md
- ROADMAP.md
- CHANGELOG.md
- DECISIONS.md
- Cursor development rules
- Initial MVP feature list

## Phase 2 — Security and Database Stability

Goal: Make sure the foundation is safe before adding major features.

### Priorities

- Review Supabase row-level security policies
- Confirm users can only access their own data
- Review authentication flow
- Review database relationships
- Protect workout history from accidental overwrites
- Confirm template changes do not corrupt past workout history

### Key Deliverables

- Secure user profile table
- Secure workout tables
- Secure nutrition tables
- Documented RLS policies
- Tested authentication flow

## Phase 3 — Workout Tracking MVP

Goal: Complete the core workout logging experience.

### Priorities

- Workout creation
- Exercise selection
- Set and rep tracking
- Weight tracking
- Save completed workout
- View workout history
- Edit or duplicate previous workouts
- Support templates without damaging history

### Key Deliverables

- Workout logging screen
- Workout history screen
- Exercise template management
- Workout summary cards
- Testing checklist

### BIQ-0011 additions (planned)

- Confirm-before-add exercise panel with superset configuration
- Personal / Team sub-navigation within Training
- Coach member training dashboard
- Rule-based progression hints on future workouts (`lib/training/progression.ts`)
- Muscle focus program generation with weekly volume targets

### BIQ-0012 additions (completed)

- `exercise_type` with strength vs cardio adaptive logging UI
- Labeled supersets (Superset A / 1A / 1B) with rename and reorder
- Training tabs: Personal Training · Program Setup (Group management moved to **Groups** tab — BIQ-0043-P1)
- `st_program_assignments` with four assignment modes
- Enhanced member dashboard + coach co-logging permissions

## Phase 4 — Progress and Analytics

Goal: Help users see improvement over time.

### Priorities

- Strength progress charts
- Bodyweight tracking
- Workout frequency tracking
- Personal records
- Volume trends
- Progress dashboard

### Key Deliverables

- Progress dashboard
- Exercise progress detail screen
- Personal record tracking
- Weekly summary view

## Phase 5 — Nutrition Tracking MVP

Goal: Add macro and nutrition tracking that can support future AI features.

### Priorities

- Daily calorie tracking
- Protein, carbs, and fat tracking
- Food entries
- Food templates
- Copy previous meals
- Save custom foods
- Daily nutrition summary

### Key Deliverables

- Nutrition dashboard
- Add food screen
- Food template library
- Macro summary view
- Daily log history

## Phase 6 — AI Wellness Coach Foundation

Goal: Add useful AI features without overcomplicating the MVP.

### Priorities

- Define AI Coach role and safety boundaries
- Allow AI to read user goals and progress
- Generate workout recommendations
- Generate nutrition suggestions
- Explain progress trends
- Avoid medical diagnosis or unsafe advice

### Key Deliverables

- AI Coach planning document
- AI prompt structure
- User goal profile
- AI chat interface prototype
- AI recommendation history

## Phase 7 — Subscription and Product Tiers

Goal: Create a realistic business model.

### Possible Tiers

#### Free Tier

- Basic workout tracking
- Basic nutrition tracking
- Limited history
- Manual templates

#### Premium Tier

- AI Wellness Coach
- Personalized workout plans
- Progress insights
- Nutrition guidance
- Advanced analytics
- Habit and recovery tracking

### Key Deliverables

- Pricing model
- Feature gating plan
- Subscription provider decision
- Stripe or app store billing plan

## Phase 8 — Mobile Launch Preparation

Goal: Prepare BuildIQ Health for iOS and Android users.

### Priorities

- Mobile-first UI polish
- ~~PWA support or native app wrapper decision~~ (BIQ-0038 — PWA install shell shipped; native wrapper TBD)
- App Store readiness
- Google Play readiness
- Privacy policy
- Terms of service
- Support process

### Key Deliverables

- Mobile testing checklist
- App icon and branding assets
- Privacy policy
- Terms of service
- Store listing draft

## Current Recommended Next Step

Completed through **BIQ-0042** on `main`: iPhone-compatible live barcode scanner for PWA.

### Recently completed

**BIQ-0042 — iPhone-Compatible Live Barcode Scanner** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | `@zxing/browser` live camera decode for iPhone Safari / Home Screen PWA |
| 2 | BarcodeDetector progressive enhancement on Chrome/Android |
| 3 | Product review card with servings, image, extended nutrients |
| 4 | Structured not-found fallbacks (manual UPC, label OCR, custom food) |
| 5 | HTTPS-only camera with permission and error messaging |

See `CHANGELOG.md` BIQ-0042 for full scope and iPhone PWA test steps.

**BIQ-0041 — Barcode Lookup and Nutrition Label OCR** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | Open Food Facts barcode lookup API route |
| 2 | Nutrition Facts photo OCR via OpenAI vision |
| 3 | Camera barcode scan (BarcodeDetector) + manual UPC entry |
| 4 | Add food panel: lookup → prefilled macros; miss → label scan fallback |
| 5 | Reuses AI result chips for label OCR multi-item edge cases |

See `CHANGELOG.md` BIQ-0041 for full scope.

**BIQ-0040 — Profile-Based Macro Goal Suggestions** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | Mifflin-St Jeor BMR + goal-based macro math |
| 2 | Suggested goals banner from `st_profiles` |
| 3 | Apply / review / fill-from-profile in Edit goals |
| 4 | Wellness framing (not medical advice) |

See `CHANGELOG.md` BIQ-0040 for full scope.

**BIQ-0038 — Installable PWA App Shell** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | `manifest.webmanifest` with standalone display |
| 2 | Dynamic app icons (`app/icon.tsx`, `app/apple-icon.tsx`) |
| 3 | Layout metadata + Apple web app tags |
| 4 | Install prompt (Chrome + iOS guidance) |
| 5 | Safe-area CSS for notched phones in standalone mode |

See `CHANGELOG.md` BIQ-0038 for full scope.

**BIQ-0037 — AI Natural-Language Food Estimation** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | `POST /api/nutrition/estimate` with auth + OpenAI |
| 2 | Prompt + JSON validation + wellness disclaimer |
| 3 | Describe food → Estimate with AI in Add food panel |
| 4 | Use / Log all estimated items |
| 5 | AI notes on meal entries |

See `CHANGELOG.md` BIQ-0037 for full scope.

**BIQ-0036 — Starter Food Catalog Search** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | `st_food_catalog` system table + ~50 seeded foods |
| 2 | Ranked catalog search in Add food panel |
| 3 | Pick catalog item → prefill macros → log |
| 4 | Manual entry fallback when no match |
| 5 | Optional `food_catalog_id` on meal entries |

See `CHANGELOG.md` BIQ-0036 for full scope.

**BIQ-0035 — Nutrition UX Polish** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | Edit meal entries |
| 2 | Edit/archive saved foods |
| 3 | Meal templates (save + log in one tap) |
| 4 | Weekly nutrition chart |
| 5 | Dashboard refresh after logging |

See `CHANGELOG.md` BIQ-0035 for full scope, testing, and file list.

**BIQ-0034 — Nutrition Tracker Foundation** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | `st_nutrition_goals`, `st_food_library`, `st_meal_entries` + RLS |
| 2 | Daily macro summary with progress vs goals |
| 3 | Meal logging (breakfast/lunch/dinner/snacks) |
| 4 | Saved foods library + quick-add |
| 5 | Copy yesterday + dashboard nutrition card |

See `CHANGELOG.md` BIQ-0034 for full scope, testing, and file list.

### Previously completed

**BIQ-0016 — Mobility, Stretching, and Cooldown** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | **Cooldown / Stretch** section (third workout block after strength) |
| 2 | AI rules: mandatory mobility in warmup on every strength day |
| 3 | AI rules: default cooldown stretches (2–4) with user toggle |
| 4 | **Mobility** day type in schedule wizard + AI generation |
| 5 | Mobility catalog bias helper for stretch exercise selection |
| 6 | Sport-aware mobility presets in AI prompt (baseball throw/hit, etc.) |

See `CHANGELOG.md` BIQ-0016 for full scope, testing, and file list.

### Active change request

**BIQ-0013 — Exercise Intelligence Database** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | Import-ready fields (`external_source`, `external_id`, `media_url`, instructions) |
| 2 | BuildIQ intelligence columns (movement, goal, progression, volume %) |
| 3 | `st_exercise_alternatives` substitution graph + seed scripts |
| 4 | `coaching_metadata` JSONB for AI programming |
| 5 | Bulk import pipeline — Free Exercise DB (873 exercises) via `import:exercises:production` |

Run on each Supabase environment:

```bash
npm run import:exercises:production
npm run import:alternatives
```

See `CHANGELOG.md` BIQ-0013 and BIQ-0024 for full scope.

**BIQ-0014 — AI Program Generator** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | `POST /api/programs/generate` — server OpenAI + Supabase auth |
| 2 | `lib/training/aiProgramPlan.ts` — prompt, JSON validation, catalog matching |
| 3 | Program Setup prompt UI + **Generate with AI** |
| 4 | `st_programs` generation metadata migration |
| 5 | Template fallback (`generation_method: template`) |

**BIQ-0015 — AI-Guided Program Setup Wizard** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | `POST /api/programs/suggest-schedule` — AI split recommendations |
| 2 | `lib/training/scheduleSuggestion.ts` — prompt + validation |
| 3 | 3-step wizard UI (Goals · Schedule · Generate) |
| 4 | Cardio day types in schedule + AI generation |
| 5 | Schedule option cards + manual day override |

**BIQ-0012 — Cardio Logging, Superset UX v2, Training Navigation, Team Program Assignment** (Completed)

| Part | Deliverable |
|------|-------------|
| 1 | `exercise_type` + adaptive strength/cardio logging |
| 2 | Labeled supersets with rename/reorder |
| 3 | Personal / Program Setup tabs; group management on **Groups** tab (BIQ-0043-P1) |
| 4 | Program assignments (team, personal, individual, manual) |
| 5 | Enhanced member dashboard |
| 6 | Coach + member logging permissions |
| 7 | `st_program_assignments` migration |

### Next priorities

1. **Group Training platform (BIQ-0043)** — P1 nav + P2 schema shipped; Phases 3–8: My Groups hub, Assigned Workouts in Training, targeting UI, personal copy, member performance, AI hooks
2. ~~PR detection and strength trends on Progress tab~~ (BIQ-0026)
3. **App admin roles** — move beyond env-only catalog import admin (see below)
4. AI program regeneration / edit-from-prompt for existing programs
5. ~~Nutrition MVP placeholder → functional tracking~~ (BIQ-0034)
6. ~~Profile-based macro goal suggestions~~ (BIQ-0040)
7. ~~Barcode / label OCR for packaged foods~~ (BIQ-0041)
8. ~~iPhone PWA live barcode scanner~~ (BIQ-0042)
9. AI Coach hook-up (consumes `coaching_metadata` + program + nutrition context)
10. Progress tab nutrition trends
11. Split `page.tsx` into focused components

### Planned — Platform admin and catalog operations

**Current (shipped in PR #16):** Catalog import admin via `BUILDIQ_CATALOG_ADMIN_EMAILS` in Vercel / `.env.local`. Only allowlisted emails see **Settings → Guided Exercise Library** and can run `POST /api/catalog/import-guided`. Normal users get the unified exercise search with no import controls.

**Roadmap — proper admin model (not started):**

| Part | Deliverable |
|------|-------------|
| 1 | `is_admin` (or role) on `st_profiles` or Supabase custom claim — not email env var only |
| 2 | Admin-only Settings section: guided library import, future wger/other bulk imports |
| 3 | Optional: view catalog import status, re-import, dry-run stats without npm |
| 4 | Audit log for admin actions (who imported, when) |
| 5 | Document admin onboarding: first deploy sets `BUILDIQ_CATALOG_ADMIN_EMAILS`; later migrate to DB roles |

**Out of scope for v1 admin:** End-user library picking (removed — unified catalog is default).

Run pending Supabase migrations on each environment before testing:

- `20250707_001` through `20250707_009` (see prior list)
- `20250708_010_exercise_types_and_program_assignments.sql` (BIQ-0012)
- `20250708_011_exercise_intelligence_database.sql` (BIQ-0013)
- `20250713_017_exercise_alternatives_seed.sql` (BIQ-0013 / BIQ-0024)
- `20250709_013_program_generator_v2.sql` (BIQ-0014)
- `20250716_020_nutrition_tracker_foundation.sql` (BIQ-0034)
- `20250716_021_nutrition_ux_polish.sql` (BIQ-0035)
- `20250716_022_food_catalog.sql` (BIQ-0036)
