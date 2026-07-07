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

Completed through **BIQ-0010** on `main`: security (BIQ-0002), sections (BIQ-0004), history snapshots (BIQ-0003), exercise catalog (BIQ-0005), auth/profile (BIQ-0006), dashboard UX (BIQ-0007), supersets (BIQ-0008), team progress/member plans (BIQ-0009), Team tab + Training UX cleanup (BIQ-0010).

### Active change request

**BIQ-0011 — Training UX, Team Training Dashboard, Workout Progression, Muscle Focus Programs** (Completed)

### Next priorities (after BIQ-0011)

1. Plyometrics / Power workout section
2. PR detection and strength trends on Progress tab
3. Nutrition MVP placeholder → functional tracking
4. AI Coach progression hook-up (uses BIQ-0011 progression module)
5. Split `page.tsx` into focused components

Run pending Supabase migrations on each environment before testing:

- `20250707_001_tighten_strength_team_rls.sql`
- `20250707_002_fix_team_join_rls.sql`
- `20250707_003_exercise_sections.sql`
- `20250707_004_set_log_snapshots.sql`
- `20250707_005_exercise_catalog.sql`
- `20250707_006_expand_user_profiles.sql`
- `20250707_007_exercise_supersets.sql`
- `20250707_008_team_progress_and_plans.sql`
- `20250707_009_training_progression_and_focus.sql` (planned with BIQ-0011)
