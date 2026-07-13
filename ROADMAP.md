# BuiltIQ Health Roadmap

This roadmap tracks the planned development path for BuiltIQ Health.

## Product Mission

BuiltIQ Health helps users build long-term health, strength, discipline, and confidence through fitness tracking, nutrition tracking, progress insights, and personalized AI wellness coaching.

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
- Training tabs: Personal Training · Team Training · Program Setup
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

Goal: Prepare BuiltIQ Health for iOS and Android users.

### Priorities

- Mobile-first UI polish
- PWA support or native app wrapper decision
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

Completed through **BIQ-0016** on `develop`: mobility warmup rules, cooldown / stretch section, Mobility day type in schedule wizard, and AI catalog bias for stretches.

### Recently completed

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
| 2 | BuiltIQ intelligence columns (movement, goal, progression, volume %) |
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
| 3 | Personal / Team / Program Setup tabs |
| 4 | Program assignments (team, personal, individual, manual) |
| 5 | Enhanced member dashboard |
| 6 | Coach + member logging permissions |
| 7 | `st_program_assignments` migration |

### Next priorities

1. ~~PR detection and strength trends on Progress tab~~ (BIQ-0026)
2. AI program regeneration / edit-from-prompt for existing programs
3. Nutrition MVP placeholder → functional tracking
4. AI Coach hook-up (consumes `coaching_metadata` + program context)
5. Split `page.tsx` into focused components

Run pending Supabase migrations on each environment before testing:

- `20250707_001` through `20250707_009` (see prior list)
- `20250708_010_exercise_types_and_program_assignments.sql` (BIQ-0012)
- `20250708_011_exercise_intelligence_database.sql` (BIQ-0013)
- `20250713_017_exercise_alternatives_seed.sql` (BIQ-0013 / BIQ-0024)
- `20250709_013_program_generator_v2.sql` (BIQ-0014)
