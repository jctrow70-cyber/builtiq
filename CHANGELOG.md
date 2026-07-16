# BuildIQ Health Change Log

All meaningful product, code, database, design, and documentation changes should be tracked here.

Use the format:

```text
BIQ-0001 - Change Title
Date:
Branch:
Status:
```

## BIQ-0001 - Documentation Foundation

Date: 2026-07-06  
Branch: develop  
Status: Completed

### Summary

Created the initial documentation foundation for BuildIQ Health so development can be tracked consistently as the app grows.

### Purpose

The goal is to make sure all future Cursor and GitHub work follows a clear change management process.

### Changes

- Added README.md
- Added ROADMAP.md
- Added CHANGELOG.md
- Added DECISIONS.md
- Added recommended Cursor workflow language
- Added recommended branch strategy
- Added change numbering system using BIQ numbers

### Files Changed

- README.md
- ROADMAP.md
- CHANGELOG.md
- DECISIONS.md
- .cursorrules or Cursor rules file if used

### Database Changes

None.

### Testing Steps

- Confirm all documentation files exist in the root of the repository.
- Confirm Cursor can read the files.
- Confirm future changes use BIQ numbering.
- Confirm GitHub commit message references BIQ-0001.

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0001 Add documentation foundation
```

---

## BIQ-0002 - Strength/Team RLS Security Hardening

Date: 2026-07-07  
Branch: develop  
Status: Completed

### Summary

Tightened Supabase row-level security for the strength/team MVP so users can only access teams and programs they belong to, while owners/editors retain template edit access and members can log only their own set data.

### Purpose

Phase 2 security work. The previous policies allowed any authenticated user to modify workout templates if they knew record IDs. Team membership and invite join were not enforced at the database level.

### Changes

- Added RLS helper functions for program read/edit and team membership checks
- Replaced permissive `st_workouts`, `st_exercises`, and `st_planned_sets` policies with program-scoped access
- Restricted `st_teams` and `st_team_members` reads to owners and active members
- Added `st_join_team_by_invite` RPC with transaction-local approval for secure invite joins
- Updated app join flow to use RPC instead of direct team lookup + insert
- Fixed stale team/invite state when switching accounts (derive active team from current user's team list)

### Files Changed

- `app/page.tsx`
- `supabase/migrations/20250707_001_tighten_strength_team_rls.sql`
- `supabase/migrations/20250707_002_fix_team_join_rls.sql`

### Database Changes

Run in Supabase SQL Editor (in order):

1. `supabase/migrations/20250707_001_tighten_strength_team_rls.sql`
2. `supabase/migrations/20250707_002_fix_team_join_rls.sql`

Adds helper functions, replaces `st_*` policies, and adds `st_join_team_by_invite`. No tables dropped. No data deleted.

### Testing Steps

- Personal user: create program, log sets, refresh — data persists
- Team owner: create team, generate program, edit exercises
- Team editor: edit shared program templates
- Team member: view program, log sets, cannot edit templates (UI and direct API)
- User A cannot read User B's personal program or list all teams
- Join team with valid invite code succeeds
- Join without valid invite code fails
- Sign out and sign in as different user — invite code matches only that user's teams
- Mobile layout still usable on Training and Teams screens

### Known Issues

- Existing programs are unaffected; RLS applies immediately after migration
- `st_join_team_by_invite` must exist before deploying app code that calls it

### Recommended Commit Message

```text
BIQ-0002 Harden strength/team RLS and secure team join flow
```

---

## BIQ-0003 - Workout History Stability

Date: 2026-07-07  
Branch: develop  
Status: Completed

### Summary

Completed workout logs now store snapshot metadata at save time and survive template edits or exercise removal. Progress tab shows saved lift history from snapshots.

### Purpose

Workout history must be reliable. A completed workout should represent exactly what the user did at that time, even when program templates change later.

### Changes

- Added snapshot columns to `st_set_logs` (exercise name, muscle, section, set info, targets, workout day/type)
- Backfill snapshots for existing logs where template data still exists
- Changed `planned_set_id` foreign key to `ON DELETE SET NULL` so logs are not deleted when templates change
- Updated set log RLS to allow reading snapshot-only rows after template removal
- `saveLog()` writes snapshot fields on every upsert
- Lift history (`Last time`, placeholders) prefers snapshot fields with legacy join fallback
- Progress tab lists completed sets grouped by date and exercise using snapshots

### Files Changed

- `app/page.tsx`
- `app/globals.css`
- `supabase/migrations/20250707_004_set_log_snapshots.sql`
- `CHANGELOG.md`
- `DECISIONS.md`

### Database Changes

Run in Supabase SQL Editor:

- `supabase/migrations/20250707_004_set_log_snapshots.sql`

Adds snapshot columns, backfills existing logs, changes FK to `SET NULL`, updates set log RLS policies.

### Testing Steps

- Run migration `20250707_004_set_log_snapshots.sql`
- Log sets for an exercise in Training
- Open Progress — confirm date, exercise, and logged weight/reps appear
- As owner/editor, rename or remove that exercise from the template
- Refresh Progress — logged history still shows original exercise name and numbers
- Training placeholders (`last 185`, etc.) still work for remaining template exercises
- Sign out/in — history persists for the same user only

### Known Issues

- Logs saved before migration rely on backfill; orphaned logs without snapshots may not appear in history
- Editing a log after its planned set was removed is not supported (read-only orphaned rows)
- PR charts and trends still planned for a later phase

### Recommended Commit Message

```text
BIQ-0003 Stabilize workout history with set log snapshots
```

---

## BIQ-0004 - Workout Plan Sections and Exercise Organization

Date: 2026-07-07  
Branch: develop  
Status: Completed

### Summary

Improved program generation and workout editing with distinct **Warm Up / Prep** and **Strength** sections, inline exercise management, and separate planned-target vs log inputs for sets.

### Purpose

Phase 3 workout MVP work. Generated plans previously mixed warmup sets into every lift and used browser prompts for editing. Workouts needed clearer structure aligned with BuildIQ training module design.

### Changes

- Added `section` column to `st_exercises` (`warmup`, `strength`)
- Updated program templates to generate warmup exercises and strength exercises separately
- Removed auto-generated per-lift warmup sets from strength exercises in new programs
- Grouped Training UI by section with counts and section-scoped reorder
- Replaced `prompt()` exercise editing with inline add/edit controls
- Added editable planned targets (weight, reps, RPE) separate from log inputs for owners/editors
- Improved `+ Set` to append the next working set with sensible defaults

### Files Changed

- `app/page.tsx`
- `app/globals.css`
- `supabase/migrations/20250707_003_exercise_sections.sql`

### Database Changes

Run in Supabase SQL Editor:

- `supabase/migrations/20250707_003_exercise_sections.sql`

Adds `st_exercises.section` (default `strength`) and index on `(workout_id, section, sort_order)`. Existing exercises default to `strength`.

### Testing Steps

- Run migration `20250707_003_exercise_sections.sql`
- Generate a **new** program — confirm Warm Up / Prep and Strength sections appear
- Add exercise to each section via inline form
- Reorder exercises within a section — order does not cross sections
- Edit planned targets and log actuals — both persist after refresh
- Existing pre-migration programs show exercises under Strength (expected)
- Mobile layout: section headers, add row, and set grid remain usable

### Known Issues

- Programs created before this change do not automatically get warmup section exercises
- Plyometrics / Power section not added yet (future change)

### Recommended Commit Message

```text
BIQ-0004 Add workout sections and improve exercise/set organization
```

---

## BIQ-0005 - Exercise Catalog (System + User Exercises)

Date: 2026-07-07  
Branch: develop  
Status: Completed

### Summary

Added a shared exercise catalog with BuildIQ system exercises and per-user custom exercises. Workout templates and logging now link to catalog entries so progress history aggregates by exercise identity, not free-text names alone.

### Purpose

Progress, PR tracking, and “last time” placeholders need a stable exercise identity. Free-text names split history when spelling differs or a user renames an exercise. A catalog gives canonical IDs while snapshots preserve the name shown at log time.

### Changes

- Added `st_exercise_catalog` with system and user-owned exercises
- Seeded BuildIQ system exercises (template lifts + common starter library)
- Added `catalog_exercise_id` on `st_exercises`
- Added `snapshot_catalog_exercise_id` on `st_set_logs` (with existing name snapshots)
- RLS: all users read system exercises; users read/write only their own custom exercises
- Training: search system + personal catalog when adding exercises; create custom exercises inline
- Settings: manage custom exercises (edit, archive, restore)
- Program generation links template exercises to catalog entries by name
- Lift history keys prefer catalog ID, with name fallback for legacy logs

### Files Changed

- `supabase/migrations/20250707_005_exercise_catalog.sql`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `DECISIONS.md`

### Database Changes

- `supabase/migrations/20250707_005_exercise_catalog.sql`

Creates `st_exercise_catalog`, seeds system exercises, adds FK columns, backfills existing workout exercises and log snapshots where names match.

### Testing Steps

1. Run migration `20250707_005_exercise_catalog.sql` in Supabase
2. **System catalog** — open Training, search “Bench Press”, add from results; confirm BuildIQ badge and muscle/equipment metadata
3. **Create custom exercise** — use “Create custom exercise” in Training or Settings; save and add to workout
4. **Search** — confirm custom exercise appears in your search results but not for another user account
5. **Edit custom exercise** — Settings → My Exercise Catalog → Edit name/metadata; confirm changes save
6. **Archive / restore** — archive a custom exercise; confirm it disappears from Training search; restore from Settings
7. **System protection** — confirm system exercises cannot be edited or archived in Settings
8. **Logging snapshots** — log sets for a catalog-linked exercise; rename the workout exercise display name; refresh Progress — history still shows logged name and numbers
9. **Cross-program history** — log the same catalog exercise in two programs; confirm “Last time” in Training uses shared history when catalog IDs match
10. **Generate program** — create a new program; confirm template exercises receive `catalog_exercise_id` links
11. **Mobile** — catalog search, result list, and custom form remain usable on narrow screens

### Known Issues

- Legacy logs without catalog links still fall back to name-based matching
- Workout inline name edits change display name only; catalog link drives progress aggregation
- No duplicate-name prevention for user custom exercises yet
- System catalog is seed data only; admin tooling for BuildIQ-managed exercises not built yet
- **Superseded by BIQ-0013:** manual catalog growth → bulk import + intelligence fields

### Recommended Commit Message

```text
BIQ-0005 Add exercise catalog with system and user exercises
```

---

## BIQ-0006 - Streamline Auth and Expand User Profiles

Date: 2026-07-07  
Branch: main  
Status: Completed

### Summary

Fixed the login profile-screen flash for returning users, added remembered email and browser-friendly sign-in forms, and expanded account onboarding with height, weight, and profile metrics.

### Purpose

Returning users should land in the app immediately after sign-in. New users need a clearer onboarding path with profile data that supports future personalization and progress tracking.

### Changes

- Added loading state while session and profile load (eliminates setup-screen flash)
- Sign In / Create Account tabs with `autocomplete` attributes for browser password managers
- Remember email via localStorage (password saved by browser, not app code)
- Expanded profile fields: name, height, weight, birth year, sex, experience, goal, units
- Settings profile section saves all fields to Supabase
- `profile_completed` flag controls whether onboarding is shown

### Files Changed

- `supabase/migrations/20250707_006_expand_user_profiles.sql`
- `app/page.tsx`
- `app/globals.css`
- `DECISIONS.md`
- `ROADMAP.md`

### Database Changes

- `supabase/migrations/20250707_006_expand_user_profiles.sql`

Adds profile metric columns and `profile_completed` to `st_profiles`. Backfills `profile_completed = true` for existing users with a display name.

### Testing Steps

1. Run migration `20250707_006_expand_user_profiles.sql` in Supabase
2. Returning user sign-in shows loading spinner only, then app opens (no setup flash)
3. Remember email checkbox prefills email after sign out
4. Browser offers to save password on sign-in
5. Create Account tab collects email, password, confirm, and profile fields
6. Settings saves and persists profile fields
7. Mobile auth layout remains usable

### Known Issues

- Height/weight stored in inches and pounds; full metric input conversion is future work
- Email confirmation flow depends on Supabase auth settings

### Recommended Commit Message

```text
BIQ-0006 Streamline auth flow and expand user profiles
```

---

## BIQ-0007 - Dashboard UX Redesign

Date: 2026-07-07  
Branch: main  
Status: Completed

### Summary

Redesigned BuildIQ from a configuration sidebar layout into a premium wellness dashboard with top navigation, personalized home cards, and program setup moved into Training.

### Purpose

BuildIQ should feel like a wellness product on login — not a builder tool. Users land on a dashboard with today's workout and progress snapshot, while program setup lives in Training.

### Changes

- Removed left sidebar layout
- Added top navigation: Dashboard, Training, Nutrition, Progress, AI Coach, Settings
- Dashboard: personalized greeting, today's workout, weekly progress, nutrition placeholder, AI Coach insight placeholder
- Moved program creation, team mode, and program selection into Training → Program setup
- Moved Teams management into Settings (functionality preserved)
- Mobile-first responsive dashboard grid and scrollable top nav
- Preserved BIQ-0005 exercise catalog search, custom exercises, and logging

### Files Changed

- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `DECISIONS.md`
- `ROADMAP.md`

### Database Changes

None.

### Testing Steps

1. Sign in and confirm top navigation appears (no left sidebar)
2. Dashboard shows greeting with your display name
3. Today's Workout card shows scheduled workout or rest-day message
4. Weekly Progress shows 7-day set count and workout days after logging
5. Nutrition and AI Coach cards show placeholders
6. Training → Program setup creates/selects programs
7. Exercise catalog search, custom exercises, and set logging still work
8. Settings → Profile, Exercise Catalog, and Teams still work
9. AI Coach nav opens placeholder page
10. Mobile: top nav scrolls horizontally; dashboard cards stack in one column

### Known Issues

- Today's workout uses program week/day mapping, not calendar auto-advance
- AI Coach and Nutrition are placeholders only
- Dashboard weekly stats depend on completed set logs

### Recommended Commit Message

```text
BIQ-0007 Redesign dashboard UX with top navigation
```

---

## BIQ-0008 - Exercise Supersets

Date: 2026-07-07  
Branch: main  
Status: Completed

### Summary

Added superset support so 2–3 exercises can be grouped back-to-back in workouts. Supersets can be created when adding exercises in Training or generated automatically from built-in program templates.

### Purpose

Athletes and coaches commonly program antagonist or complementary pairs (e.g. leg curl + leg extension). BuildIQ needed a first-class way to represent, display, and log supersets without breaking future-week edit sync or set-log snapshots.

### Changes

- Added `superset_group_id` on `st_exercises` and `snapshot_superset_group_id` on `st_set_logs`
- Program generation reads `{ superset: [...] }` blocks in `WORKOUT_TEMPLATES` (Lower/Upper Body templates updated)
- Training UI: grouped superset blocks with visual styling, break-superset action, and catalog picker to pick 2–3 exercises
- Set log snapshots preserve superset group at save time
- Removing an exercise from a superset auto-ungroups if only one remains

### Files Changed

- `supabase/migrations/20250707_007_exercise_supersets.sql`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `DECISIONS.md`
- `ROADMAP.md`

### Database Changes

Run in Supabase SQL editor (after prior migrations):

- `20250707_007_exercise_supersets.sql`

### Testing Steps

1. Run migration `20250707_007_exercise_supersets.sql` in Supabase
2. Generate a new Lower Body or Upper Body program — confirm supersets appear grouped in Strength
3. In Training, use **Add superset** to pick 2–3 catalog exercises and add them as a group
4. Log sets within a superset — confirm logs save normally
5. Use **Break superset** — exercises become standalone again
6. Remove one exercise from a 2-exercise superset — remaining exercise is ungrouped

### Known Issues

- Reorder (↑↓) moves individual exercises, not whole superset blocks
- Existing programs created before this migration have no supersets until edited or regenerated

### Recommended Commit Message

```text
BIQ-0008 Add exercise supersets for training and program templates
```

---

## BIQ-0009 - Team Progress and Member Workout Plans

Date: 2026-07-07  
Branch: main  
Status: Completed

### Summary

Team mode now supports tracking teammate progress, choosing team vs personal training plans, and coach read-only views of member workouts and logged sets.

### Purpose

Teams need more than a shared program template — coaches must see who is logging, which plan each member follows, and what they actually lifted. Members should follow the team workout or keep a personal plan without leaving the team.

### Changes

- Added `training_source` on `st_team_members` (`team` | `personal`)
- Added `default_program_id` on `st_teams` for the active team program
- Added `team_id` on `st_set_logs` for team-scoped progress queries
- RLS: owners/editors can read teammate personal programs and set logs (view-only)
- RPCs: `st_set_my_training_source`, `st_set_member_training_source`
- Training UI: My training plan toggle, team roster with 7-day stats, click member to view plan/logs
- Owners/editors can assign team vs personal plan per member

### Files Changed

- `supabase/migrations/20250707_008_team_progress_and_plans.sql`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `DECISIONS.md`
- `ROADMAP.md`

### Database Changes

Run in Supabase SQL editor (after prior migrations):

- `20250707_008_team_progress_and_plans.sql`

### Testing Steps

1. Run migration `20250707_008_team_progress_and_plans.sql`
2. Switch to Team mode — confirm **My training plan** toggle (Team workout / Personal plan)
3. As owner/editor, set **Team active program** in Program setup
4. Log sets on team program — confirm they appear in roster 7-day stats
5. Click a teammate — view their program template and logged sets (read-only)
6. Assign a member to Personal plan — confirm their personal program loads when viewed
7. Confirm members cannot edit another user’s logs

### Known Issues

- Team dashboard aggregates are Training-only (no separate team analytics page yet)
- Personal-plan logs are not tagged with `team_id` (coach access uses membership-based RLS)

### Recommended Commit Message

```text
BIQ-0009 Add team progress tracking and member workout plans
```

---

## BIQ-0010 - Team Tab, Compliance Summary, and Training UX Cleanup

Date: 2026-07-07  
Branch: main  
Status: Completed

### Summary

Added a dedicated Team tab with compliance metrics and member roster. Simplified Training logging to weight and reps only, compact typeahead exercise search with inline superset checkbox, and dashboard team compliance widget.

### Changes

- New **Team** nav tab: plan toggle, compliance summary, member list with coach view
- Dashboard **Team Compliance** card (7-day active members, total sets)
- Removed target weight/reps/RPE columns from Training UI; removed RPE from logging
- Compact typeahead exercise search (name or muscle group)
- Superset via **SS** checkbox when adding exercises (replaces separate superset builder)

### Files Changed

- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None.

### Recommended Commit Message

```text
BIQ-0010 Add Team tab, compliance summary, and streamlined Training UX
```

---

## BIQ-0011 - Training UX, Team Training Dashboard, Workout Progression, and Muscle Focus Programs

Date: 2026-07-07  
Branch: develop  
Status: **Completed**

> **Note:** Requestor referenced “BIQ-0007” for this scope; BIQ-0007 is already assigned to Dashboard UX Redesign. This change request is numbered **BIQ-0011** as the next available BIQ.

### Summary

Improve the core training experience before adding more surface area: confirm-before-add exercise flow, Personal/Team sub-navigation inside Training, coach member dashboard, rule-based workout progression from logged history, and muscle-focus program generation using hypertrophy volume principles.

### Purpose

The current training flow is functional but confusing. Exercises feel auto-added before setup is finalized, team training requires leaving Training to use the Team tab, future weeks do not show last performance or next targets, and program generation does not support user-selected muscle emphasis. This BIQ consolidates UX polish and progression foundations into one coherent training upgrade.

### Scope

#### Part 1 — Improve Add Exercise UX

**Problem:** User must choose set/superset options before the exercise is clearly finalized; selecting from catalog feels like immediate add.

**Desired flow:**

1. User clicks **Add Exercise**
2. Modal or slide-over panel opens
3. User searches catalog or creates custom exercise
4. After selection, user configures:
   - Normal exercise **or** superset membership
   - If superset: join existing group or create new group
   - Starting sets / reps / weight / rest (where applicable)
5. User clicks **Add Exercise** to confirm
6. Exercise is written to workout **only** on confirm

**Requirements:**

- No auto-add on catalog pick alone
- Custom exercise creation preserved (BIQ-0005 catalog)
- Intentional, simple flow; mobile-friendly panel
- Preserve snapshot-based history integrity (BIQ-0003)
- Superset grouping continues via `superset_group_id` (BIQ-0008)

**Proposed UI:**

- Replace inline typeahead + SS checkbox with **Add Exercise** button per section
- Panel states: `search` → `configure` → confirm
- Show summary line before confirm: e.g. “Bench Press · 3 sets · Superset with Face Pull”

---

#### Part 2 — Personal vs Team Training Inside Training

**Problem:** Team workflow requires Team tab → select team → return to Training.

**Desired structure:**

Training is the root training area with sub-navigation:

| Sub-tab | Content |
|---------|---------|
| **Personal Training** | User’s plan, today’s workout, week view, exercise history |
| **Team Training** | Team list/selector, roster, today’s team overview — without leaving Training |

**Requirements:**

- Team selector and mode live under Training sub-nav (Team tab may remain for compliance/roster admin or link into Team Training)
- Preserve `training_source`, `default_program_id`, coach read-only member view (BIQ-0009)
- No regression to personal logging or team program editing permissions

---

#### Part 3 — Team Member Training Dashboard

**Problem:** Clicking a member today opens read-only Training; coaches need at-a-glance compliance.

**Desired dashboard (coach view on member select):**

| Section | Data |
|---------|------|
| Header | Member name, plan type (team/personal), role |
| Today | Assigned workout (day label, type), status: Not started / In progress / Completed |
| Exercises | Today’s exercises with planned sets |
| Logging | Per-set weight, reps, completion status for selected log date |
| History | Last completed workout summary |
| Notes | Recent performance notes (placeholder field OK for v1) |
| Progress | Simple indicators when data exists (sets/week, streak) |

**Requirements:**

- Coach-only for other members; member can view own dashboard
- Read-only for coach on member logs; no impersonation
- Uses existing `st_set_logs` + snapshots; optional `coach_notes` table deferred to sub-task if needed

---

#### Part 4 — Workout History and Next-Week Progression Logic

**Problem:** Logging today does not inform week 3+ views; no “last time” or “next target” on future workouts.

**Data to leverage (existing + extensions):**

| Field | Source |
|-------|--------|
| exercise_id / catalog id | `st_exercises`, snapshots |
| exercise_name_snapshot | `snapshot_exercise_name` on log |
| date, week, day | `log_date`, program week, workout `day_order` |
| sets/reps/weight | `actual_*` on `st_set_logs` |
| RPE / difficulty | Optional; re-introduce as optional field if stored |
| completion | `completed` flag |

**Future workout display:**

```
Last time: Bench Press — 3×8 @ 135 lb
Next target: Bench Press — 3×8 @ 140 lb
Progression note: All reps completed — increase weight 5 lb
```

**Rule-based progression v1:**

| Condition | Action |
|-----------|--------|
| All prescribed reps completed, manageable difficulty | Increase weight slightly (e.g. +5 lb upper / +10 lb lower default) |
| Weight cannot increase | Increase reps within target range |
| Reps missed | Repeat same target |
| Multiple missed sets | Reduce load slightly |

**Architecture placeholder for AI progression:**

- Add `lib/progression/` (or `lib/training/progression.ts`) with:
  - `getLastPerformance(exerciseKey, beforeDate)`
  - `recommendNextTarget(lastPerformance, plannedTemplate)`
  - `ProgressionResult { lastSummary, nextTarget, note, ruleApplied }`
- UI reads from this module only — swap rules for AI later without UI rewrite

**Requirements:**

- Do not mutate historical logs when templates change
- Recommendations are **display hints** on future weeks; user still logs actuals
- Works for personal and coach member view

---

#### Part 5 — Muscle Focus Program Generation

**Problem:** Generated programs ignore user emphasis preferences.

**Desired behavior:**

At program generation, user selects focus muscle groups, e.g.:

Chest · Hamstrings · Quads · Lats · Traps · Shoulders · Glutes · Arms · Core

**Rule-based hypertrophy guidance (v1):**

- Target ~**10–15 quality working sets per week** per focus muscle (starting point)
- Spread volume across 2–3 sessions when possible
- Balance agonist/antagonist (e.g. chest + back; hamstrings + quads/glutes)
- Avoid stacking same joint pattern on consecutive days
- Include mobility/prehab in warmup sections

**Examples:**

- **Chest focus:** Extra pressing + fly work across 2–3 days; maintain back volume
- **Hamstrings focus:** Hip hinge + knee flexion; balance quads/glutes; avoid back-to-back posterior-chain overload

**Requirements:**

- Store `focus_muscles text[]` (or JSON) on `st_programs`
- Template engine adjusts exercise selection and set counts from focus list
- Show user-visible summary: “This program emphasizes: Chest, Hamstrings (~12 sets/week each)”
- No AI generation in v1; deterministic rules only
- Extensible for AI Coach (Phase 6)

---

### Proposed Database Changes

| Change | Purpose |
|--------|---------|
| `st_programs.focus_muscles text[]` | Persist muscle focus selections |
| Optional `st_programs.progression_profile jsonb` | Future AI/rule profile metadata |
| Optional `st_coach_notes` | Member notes on dashboard (Part 3); defer if placeholder UI suffices |
| Optional `snapshot_week`, `snapshot_day_order` on logs | Faster progression queries (or derive from workout join) |
| Re-optional `actual_rpe` or `difficulty` on logs | Part 4 if user wants difficulty signal again |

Migration file (planned): `20250707_009_training_progression_and_focus.sql`

### Proposed Files to Change

| File | Changes |
|------|---------|
| `app/page.tsx` | Split or refactor: add-exercise panel, Training sub-nav, member dashboard, progression display |
| `app/globals.css` | Panel/modal, sub-nav, member dashboard, progression cards |
| `lib/training/progression.ts` | **New** — rule engine + types |
| `lib/training/programGenerator.ts` | **New** — muscle focus volume logic |
| `lib/training/focusMuscles.ts` | **New** — focus muscle constants + mappings |
| `supabase/migrations/20250707_009_*.sql` | Schema for focus muscles + optional fields |
| `CHANGELOG.md`, `DECISIONS.md`, `ROADMAP.md` | This request + implementation notes |

### Dependencies

- BIQ-0003 set log snapshots (required)
- BIQ-0005 exercise catalog (required)
- BIQ-0008 supersets (required)
- BIQ-0009 team plans + coach visibility (required for Part 3)
- BIQ-0010 current Training UI (baseline to refactor, not duplicate Team tab work)

### Out of Scope (this BIQ)

- Full AI Coach progression
- Nutrition integration
- Plyometrics/Power section (separate BIQ)
- Splitting entire `page.tsx` into components (recommended parallel refactor, not blocker)

### Testing Steps

1. **Add normal exercise** — open panel, search, configure sets, confirm; exercise appears only after confirm
2. **Add custom exercise** — create in panel, configure, confirm; appears in catalog and workout
3. **Add to superset** — select existing group or new group in panel; 2–3 exercises grouped correctly
4. **Personal vs Team sub-nav** — switch inside Training without visiting Team tab; correct program loads
5. **Member dashboard** — coach clicks member; sees today’s workout, status, logged sets/reps/weight
6. **Log sets/reps/weight** — personal workout; logs persist with snapshots
7. **Future week progression** — view week N+1; see last performance + next target + note per exercise
8. **Muscle focus generation** — select Chest + Hamstrings; program generates with visible emphasis summary
9. **Weekly volume** — confirm focus muscles receive ~10–15 working sets/week in generated plan

### Mobile / UX Acceptance

- Add-exercise panel usable on 375px width
- Sub-nav tabs scroll horizontally if needed
- Member dashboard readable without horizontal scroll for core metrics
- Progression text concise (two lines max per exercise in list view)

### Known Issues / Risks

- Large `page.tsx` refactor may conflict with in-flight UI changes — implement in feature branch
- Progression rules are simplified; edge cases (deload weeks, injuries) need future BIQ
- Re-adding optional RPE must not clutter BIQ-0010 simplified grid unless user opts in
- Team tab vs Training sub-nav overlap must be designed to avoid duplicate controls

### Files Changed

- `app/page.tsx`
- `app/globals.css`
- `lib/training/focusMuscles.ts` (new)
- `lib/training/progression.ts` (new)
- `lib/training/programGenerator.ts` (new)
- `supabase/migrations/20250707_009_training_progression_and_focus.sql` (new)
- `CHANGELOG.md`, `DECISIONS.md`, `ROADMAP.md`

### Database Changes

Run migration `20250707_009_training_progression_and_focus.sql`:
- `st_programs.focus_muscles text[]`
- `st_programs.progression_profile jsonb`
- `st_set_logs.snapshot_week`, `snapshot_day_order`

### Testing Steps

1. Add normal exercise via panel → search → configure → **Add Exercise**
2. Add custom exercise from panel custom step → configure → confirm
3. Add to superset (new or existing group) via configure step
4. Switch **Personal Training** / **Team Training** sub-tabs inside Training
5. Team Training → click member → dashboard with status and today’s sets
6. Log sets/reps/weight on personal workout
7. View week 2+ → see Last / Next progression hints on exercises
8. Generate program with Chest + Hamstrings focus → see focus summary
9. Confirm generated plan includes extra focus-muscle volume

### Recommended Commit Message

```text
BIQ-0011 Add training UX panel, team dashboard, progression hints, and muscle focus programs
```

### Follow-on

Phase 2 training platform requirements captured in **BIQ-0012** (cardio logging, superset UX v2, three-tab Training nav, program assignments, coach logging).

---

## BIQ-0012 - Cardio Logging, Superset UX v2, Training Navigation, and Team Program Assignment

Date: 2026-07-08  
Branch: develop  
Status: **Completed**

> **Note:** Requestor asked to add these to **BIQ-0007**. Official **BIQ-0007** is Dashboard UX Redesign. The Training UX epic started as **BIQ-0011** (phase 1, completed). This document is **BIQ-0012** (phase 2).

### Summary

Extend BuildIQ training with multi-type exercise logging (strength + cardio), faster labeled superset UX, three-tab Training navigation (Personal / Team / Program Setup), flexible team program assignment, enhanced member dashboards, and coach-or-member logging with clear permission rules.

### Purpose

BIQ-0011 improved the training shell but still treats all exercises as strength-style sets. Team assignment is limited to team vs personal toggle. Coaches need richer assignment flows, cardio support, and clearer superset management before scaling team features.

---

### Part 1 — Cardio Exercise Support

**Problem:** All exercises log sets/reps/weight only. Cardio (walk, run, bike, row, elliptical, swim) needs different fields.

**Add `exercise_type` enum:**

| Type | Examples |
|------|----------|
| `strength` | Bench, squat, curls |
| `cardio` | Walk, run, bike, row, elliptical, swim |
| `mobility` | Stretch, foam roll |
| `bodyweight` | Push-ups, pull-ups |
| `timed` | Plank, carries |
| `custom` | User-defined |

**Strength logging fields:** sets, reps, weight, RPE (optional), rest

**Cardio logging fields:** duration, distance, pace/speed, heart rate (optional), calories (optional), notes

**Requirements:**

- Do not require weight for cardio exercises
- Catalog entries and custom exercises carry `exercise_type`
- Workout log UI adapts fields by `exercise_type`
- Snapshots on save preserve type-specific values for history integrity (BIQ-0003)
- Preserve BIQ-0005 catalog search; filter/tag by type

**Proposed schema additions:**

- `st_exercise_catalog.exercise_type text`
- `st_exercises.exercise_type text` (copied from catalog on add)
- `st_set_logs`: optional columns or JSONB `log_payload` for cardio metrics + snapshots

---

### Part 2 — Better Superset UX

**Problem:** Superset creation works but lacks labels, in-group management, and visual clarity.

**Desired add flow:**

1. Add Exercise → select exercise
2. Choose **Normal Exercise** or **Superset**
3. If Superset: **Create New Superset** or **Add to Existing Superset**
4. Continue adding exercises to same group until 2–3 (BIQ-0008 limit)

**Desired display:**

```text
Superset A
  1A Dumbbell Bench Press
  1B Chest-Supported Row

Superset B
  2A Walking Lunge
  2B Plank
```

**User actions:**

- Add another exercise to superset
- Remove exercise from superset (without deleting from workout optional)
- **Rename superset** (display label; keep `superset_group_id` as key)
- Reorder exercises inside superset

**Proposed additions:**

- `st_exercises.superset_label text` (e.g. "Superset A") shared by group id
- `st_exercises.superset_order smallint` (1A, 1B ordering within group)
- UI: grouped block with label, drag/reorder, rename inline

---

### Part 3 — Training Navigation Update

**Problem:** Program setup is mixed into Personal/Team views. Team tab duplicates some controls.

**Three Training sub-sections:**

| Tab | Content |
|-----|---------|
| **Personal Training** | Own plan, today's workout, history, progression recommendations |
| **Team Training** | Team list, roster, member dashboards, team workout assignments |
| **Program Setup** | Create/edit program, goals, days/week, muscle focus, generate, assign to personal or team |

**Requirements:**

- Move program generation UI from collapsible panel into **Program Setup** tab
- Personal and Team tabs focus on execution/logging, not template editing
- Team top-level nav may remain for compliance/admin; daily work lives under Training → Team

---

### Part 4 — Team Member Program Assignment

**Problem:** Members only choose team vs personal (`training_source`). Coaches need richer assignment.

**Assignment options:**

| Option | Description |
|--------|-------------|
| **A. Follow Team Plan** | Member uses team shared program (`default_program_id`) |
| **B. Use Existing Personal Plan** | Pull member's personal program into team view |
| **C. Generate Individual Team Plan** | Coach generates program scoped to member |
| **D. Manual Assignment** | Coach builds/ad-hoc workouts, exercises, sets, cardio, notes |

**Logging:**

- Coach/admin **or** member can log results (see Part 6 permissions)
- Assignment visible on member dashboard

**Extends BIQ-0009** `training_source` with full `program_assignments` model (Part 7).

---

### Part 5 — Team Member Dashboard Enhancements

**When clicking a team member, show:**

| Section | Data |
|---------|------|
| Plan | Current assigned plan name |
| Assignment type | Team Plan · Personal Plan · Individual Team Plan · Manual |
| Today | Workout, completion status |
| Logging | Sets/reps/weight (strength); duration/distance (cardio) |
| History | Last workout, missed workouts |
| Forward | Next recommended workout, progression suggestions |
| Coach | Coach notes (editable by coach) |

---

### Part 6 — Permission Rules

| Role | Can |
|------|-----|
| **Coach/admin** | Assign programs, generate member programs, log/edit workouts for members, view dashboards |
| **Team member** | View assigned workouts, log own results, view own progress |
| **Member (default)** | Cannot edit master team program |

**Implementation:**

- Extend RLS: coaches write member logs when `assignment` active and role is owner/editor
- Members write only own `user_id` logs
- Program template edits require `st_user_can_edit_program` on team program

---

### Part 7 — Database / Architecture

**New table: `st_program_assignments`**

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `user_id` | Assignee |
| `team_id` | Nullable; set for team-scoped assignments |
| `assigned_by` | Coach user id |
| `assignment_type` | `personal` \| `team` \| `individual_team` \| `manual` |
| `program_id` | FK to `st_programs` |
| `start_date` | When assignment begins |
| `is_active` | Current assignment flag |
| `notes` | Coach assignment notes |

**Optional:**

- `st_coach_notes` (member_id, team_id, note, created_by, date)
- `st_superset_metadata` (group_id, label, workout_id) if not on `st_exercises`

**Keep existing:**

- `st_programs`, `st_workouts`, `st_exercises`, `st_planned_sets`, `st_set_logs` (with snapshots)
- `st_team_members` — may add `assignment_id` FK or derive from `st_program_assignments`

**Migration (planned):** `20250708_010_exercise_types_and_program_assignments.sql`

---

### Proposed Files to Change

| Area | Files |
|------|-------|
| Schema | `supabase/migrations/20250708_010_*.sql` |
| Types/logging | `lib/training/logFields.ts`, extend `progression.ts` |
| Superset UI | `app/page.tsx` or split components |
| Training nav | `app/page.tsx`, `app/globals.css` |
| Assignments | RPCs for assign/generate individual plan |
| Docs | `CHANGELOG.md`, `DECISIONS.md`, `ROADMAP.md` |

### Dependencies

- BIQ-0003 snapshots, BIQ-0005 catalog, BIQ-0008 supersets, BIQ-0009 team plans, BIQ-0011 training shell

### Out of Scope (this BIQ)

- Full AI program generation
- Nutrition integration
- Native mobile app

### Testing Steps

1. Log strength exercise with weight, reps, optional RPE
2. Log cardio (e.g. run) with duration/distance — no weight required
3. Create superset with label "Superset A"
4. Add second exercise to existing superset
5. Rename superset and reorder exercises within group
6. Navigate Personal / Team / Program Setup tabs
7. Assign team plan to member (option A)
8. Pull member personal plan into team view (option B)
9. Generate individual team plan for member (option C)
10. Coach logs workout results for a member
11. Member logs own workout from their login
12. Verify member cannot edit master team program

### Recommended Commit Message

```text
BIQ-0012 Add cardio logging, superset UX v2, program assignments, and Training nav
```

### Files Changed

- `app/page.tsx` — three-tab Training nav, adaptive log fields, superset labels, coach logging, program assignments UI
- `app/globals.css` — superset slot/label styles, adaptive set grid, member assignment panel
- `lib/training/exerciseTypes.ts` (new)
- `lib/training/logFields.ts` (new)
- `supabase/migrations/20250708_010_exercise_types_and_program_assignments.sql` (new)
- `CHANGELOG.md`, `ROADMAP.md`

### Database Changes

Run migration `20250708_010_exercise_types_and_program_assignments.sql` in Supabase:

- `st_exercise_catalog.exercise_type`, `st_exercises.exercise_type`, `st_exercises.superset_label`, `st_exercises.superset_order`
- `st_set_logs` cardio/RPE fields, `logged_by_user_id`, `snapshot_exercise_type`
- `st_program_assignments` table + RLS
- `st_assign_member_program` RPC
- Coach insert/update policies on `st_set_logs`

### Known Issues

- Individual team plan generation (option C) uses existing program picker; full per-member generator deferred
- Reorder within superset uses existing move up/down on exercise cards
- Migration must be applied before cardio fields and assignments work in production

---

## BIQ-0013 - Exercise Intelligence Database

Date: 2026-07-08  
Branch: main  
Status: **Completed** (production import pipeline ready; run `import:exercises:production` on each Supabase environment)

> **Note:** Requestor referenced BIQ-0008 for import; official **BIQ-0008** is supersets (unchanged). Catalog intelligence is **BIQ-0013**.

### Summary

Evolve `st_exercise_catalog` into a scalable **Exercise Intelligence Database** prepared for importing 1000+ exercises from external datasets, enriched with BuildIQ programming fields, substitution links, and AI coaching metadata. BuildIQ value is not the raw exercise list — it is how exercises are classified, substituted, and used to build smarter plans.

### Purpose

The BIQ-0005 seed (~40 exercises) was sufficient for MVP templates but does not scale. Manually curating a small catalog is the wrong long-term strategy. BuildIQ needs import-ready storage, intelligence columns, and alternative exercise graphs so future AI Coach and program generation can reason about movement patterns, volume, progression type, and substitutions (e.g. Bench Press → Dumbbell Press when no barbell).

### Strategy Shift

| Old (BIQ-0005 follow-on) | New (BIQ-0013) |
|--------------------------|----------------|
| Hand-add system exercises in SQL seeds | Bulk import from external dataset |
| Name + muscle + equipment only | Full media, instructions, intelligence fields |
| No substitution model | `st_exercise_alternatives` graph |
| Catalog as list | Catalog as programming knowledge base |

### Part 1 — Import-Ready External References

Support large third-party exercise libraries:

| Field | Purpose |
|-------|---------|
| `external_source` | Origin key (`wger`, `exercisedb`, `builtiq_curated`, etc.) |
| `external_id` | Stable id for idempotent re-import |
| `media_url` | Primary media asset |
| `image_url` | Still image |
| `video_url` | Video demo |
| `gif_url` | Animated demo |
| `instructions` | Execution steps |

Unique index on `(external_source, external_id)` prevents duplicate imports.

### Part 2 — BuildIQ Intelligence Fields

| Field | Values / purpose |
|-------|------------------|
| `movement_pattern` | `squat`, `hinge`, `push_horizontal`, `push_vertical`, `pull_horizontal`, `pull_vertical`, `carry`, `rotation`, `isolation`, `cardio` |
| `training_goal` | `strength`, `hypertrophy`, `endurance`, `power`, `mobility` |
| `progression_type` | `weight`, `reps`, `duration`, `distance`, `intensity` |
| `primary_muscle_percentage` | Volume attribution (0–100) |
| `secondary_muscle_percentage` | Volume attribution (0–100) |
| `muscle_targets` | JSONB fine-grained `[{muscle, percentage, role}]` |
| `coaching_metadata` | JSONB AI hints (fatigue, skill, cues, pairing, triggers) |

### Part 3 — Exercise Alternatives

Table `st_exercise_alternatives`:

| Column | Purpose |
|--------|---------|
| `exercise_id` | Primary catalog exercise |
| `alternative_id` | Substitute exercise |
| `reason` | `equipment_unavailable`, `injury`, `skill_level`, `preference`, `similar_stimulus` |
| `priority` | Ranked recommendation order |
| `notes` | Coach-facing explanation |

Example: **Bench Press** → **Dumbbell Bench Press** when `reason = equipment_unavailable`.

### Part 4 — AI Coaching Metadata (`coaching_metadata` JSONB)

Structured hints for future AI programming (not user-facing prose):

```json
{
  "programming_role": "primary_compound",
  "fatigue_cost": "high",
  "skill_demand": "moderate",
  "equipment_constraints": ["barbell", "rack"],
  "substitution_triggers": ["shoulder_pain", "no_barbell"],
  "rep_range_hints": { "strength": "3-6", "hypertrophy": "8-12" },
  "superset_pairing_hints": ["antagonist_pull_horizontal"],
  "coaching_cues": ["brace core", "controlled eccentric"],
  "contraindications": ["acute_shoulder_injury"]
}
```

### Part 5 — Import Pipeline (scaffolded)

CLI script imports JSON/JSONL datasets into `st_exercise_catalog`:

| Feature | Behavior |
|---------|----------|
| Upsert key | `(external_source, external_id)` |
| Dry run | `--dry-run` validates + reports without writes |
| Safety | Only `is_system = true`, `user_id = null`; never touches user custom exercises |
| Legacy seeds | Skips when name matches BIQ-0005 system row without `external_source` |
| Logging | Total found, imported, skipped, duplicates in file, errors + skip reasons |

```bash
npm run import:exercises:dry -- --file scripts/import-exercises/sample-dataset.json
npm run import:exercises -- --file path/to/dataset.json
```

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` for live import.

### Files Changed (this phase)

| Area | Files |
|------|-------|
| Schema | `supabase/migrations/20250708_011_exercise_intelligence_database.sql`, `20250708_012_fix_movement_pattern_constraint.sql` |
| Types | `lib/training/exerciseIntelligence.ts` |
| Import | `scripts/import-exercises/importExercises.ts`, `mapImportRecord.ts`, `types.ts`, `sample-dataset.json`, `README.md` |
| Config | `package.json` (`import:exercises`, `import:exercises:dry`), `.env.example` |
| Docs | `CHANGELOG.md`, `DECISIONS.md`, `ROADMAP.md` |

### Out of Scope (this phase)

- Training search UI for 1000+ exercises / media browsing
- AI program generator consuming metadata (future BIQ)
- Removing BIQ-0005 seed rows (kept for backward compatibility)
- Auto-generating `st_exercise_alternatives` at import time

### Testing Steps

**Schema**

1. Run migration `20250708_011_exercise_intelligence_database.sql`
2. If movement_pattern CHECK fails, run `20250708_012_fix_movement_pattern_constraint.sql`
3. Confirm new columns on `st_exercise_catalog` and `st_exercise_alternatives` table exists

**Import pipeline (dry run)**

4. `npm install` (adds `tsx` dev dependency)
5. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (not required for dry run)
6. Run `npm run import:exercises:dry -- --file scripts/import-exercises/sample-dataset.json`
7. Confirm report shows: 4 total, 3 would import, 1 duplicate in file skipped, 0 errors

**Import pipeline (live)**

8. Run same command without `--dry-run` via `npm run import:exercises -- --file scripts/import-exercises/sample-dataset.json`
9. Re-run live import — confirm 0 inserted, 3 updated (idempotent upsert)
10. Confirm BIQ-0005 seed exercises (e.g. Bench Press) unchanged — sample uses different names
11. Create a custom user exercise in Settings — re-run import — confirm user row untouched
12. Query: `select external_source, external_id, name, image_url from st_exercise_catalog where external_source = 'builtiq_sample'`

**Regression**

13. Training search still works with existing + imported exercises (no UI changes expected)
14. Custom exercises still private to owner account

### Recommended Commit Message

```text
BIQ-0013 Add exercise intelligence database schema for scalable imports
```

### Dependencies

- BIQ-0005 `st_exercise_catalog` (foundation)
- BIQ-0012 `exercise_type` on catalog (complementary)

### Known Issues

- Legacy `movement_pattern` values (`push`, `pull`, etc.) allowed until import normalizes rows
- Full-text search index requires PostgreSQL `english` config
- System alternative rows require service-role or migration for bulk curation

---

## BIQ-0014 - AI Program Generator

Date: 2026-07-09  
Branch: develop  
Status: Completed

### Summary

Replaced static template photocopying as the primary program path with **AI-driven generation**. Users describe goals in natural language (e.g. baseball throw/hit power); a server-side OpenAI call builds a periodized multi-week plan grounded in the exercise catalog, validates JSON, and inserts programs/workouts/exercises. Template generation remains as a secondary fallback.

### Purpose

Users need sport- and goal-specific programming without hand-picking every exercise. Rule-based sport profiles alone cannot cover the variety of athlete prompts. AI interprets intent, varies workouts week to week, and maps exercises to the BuildIQ catalog for logging and history integrity.

### Scope

- **API** `POST /api/programs/generate` — Supabase session auth, profile + catalog load, OpenAI JSON plan, validation, persistence
- **`lib/training/aiProgramPlan.ts`** — prompt builder, schema validation, fuzzy catalog matching, DB insert
- **`lib/supabaseServer.ts`** — server auth helper from Bearer token
- **Program Setup UI** — prompt textarea, **Generate with AI** (primary), quick template fallback
- **Migration** — `generation_prompt`, `generation_method`, `program_summary`, `program_style` on `st_programs`
- **Env** — `OPENAI_API_KEY` (server only); optional `OPENAI_MODEL` (default `gpt-4o-mini`)

### Files Changed

- `app/api/programs/generate/route.ts` (new)
- `lib/training/aiProgramPlan.ts` (new)
- `lib/supabaseServer.ts` (new)
- `app/page.tsx` — AI prompt UI, `generateWithAi()`, template `generation_method`
- `app/globals.css` — AI prompt textarea styles
- `.env.example` — `OPENAI_API_KEY` documentation
- `package.json` — `openai` dependency
- `supabase/migrations/20250709_013_program_generator_v2.sql` (new)
- `CHANGELOG.md`, `DECISIONS.md`, `ROADMAP.md`

### Database Changes

Run in Supabase SQL Editor:

`supabase/migrations/20250709_013_program_generator_v2.sql`

Adds to `st_programs`:

- `generation_prompt text`
- `generation_method text` (`ai` | `template` | `manual`)
- `program_summary text`
- `program_style text` (`general` | `hypertrophy` | `strength` | `athletic_performance`)

Existing programs without these fields continue to load normally (columns nullable).

### Environment Setup

Add to `.env.local` (never commit):

```text
OPENAI_API_KEY=sk-...
```

Optional: `OPENAI_MODEL=gpt-4o-mini`

Restart `npm run dev` after adding the key.

### Testing Steps

**Prerequisites**

1. Run migration `20250709_013_program_generator_v2.sql`
2. Set `OPENAI_API_KEY` in `.env.local`
3. `npm install` then `npm run build` — must pass

**AI personal program**

4. Sign in, open Training → Program Setup
5. Enter prompt: `I'm a baseball player trying to throw harder and hit harder`
6. Set weeks (e.g. 6) and days (Mon/Tue/Fri)
7. Click **Generate with AI** — wait for completion
8. Confirm program loads in Training with exercises on Week 1 vs Week 2 **not identical**
9. Confirm summary text appears after generation
10. Log sets on a workout — history snapshots still work

**AI team program**

11. As team owner/editor, switch to Team program mode
12. Generate with AI — confirm program attaches to team
13. Member can view/log; member cannot edit templates

**Error states**

14. Remove `OPENAI_API_KEY` — API returns 503 with clear message
15. Empty/short prompt — client validation alert
16. Sign out — cannot call generate API

**Template fallback**

17. Click **Quick template program** — `generation_method` is `template`; same static template behavior as before

**Mobile**

18. Program Setup prompt textarea and buttons usable on narrow viewport

### Known Issues

- Large catalogs send up to 500 exercise names to OpenAI (token/cost tradeoff); full 859+ list not sent in one prompt
- AI may occasionally omit a day — validation rejects severely incomplete plans but may accept minor gaps
- Incomplete AI JSON returns 422; user must retry
- `OPENAI_API_KEY` must be server-side only — not prefixed with `NEXT_PUBLIC_`
- Team AI generation requires owner/editor role (enforced server-side)

### Recommended Commit Message

```text
BIQ-0014 Add AI-driven program generation with natural-language prompts
```

### Dependencies

- BIQ-0005 exercise catalog
- BIQ-0011 Program Setup tab and muscle focus
- BIQ-0013 catalog intelligence fields (optional enrichment in prompts)
- Decision 023 — AI-driven program generation

---

## BIQ-0015 - AI-Guided Program Setup Wizard

Date: 2026-07-09  
Branch: develop  
Status: Completed

### Summary

Replaced the single-screen Program Setup flow with a **3-step AI-guided wizard**: Goals → Schedule → Generate. AI recommends 2–4 weekly splits tailored to the user's goals, with optional cardio days. Users pick a schedule (or customize days/types), then confirm weeks/name and generate the full program.

### Purpose

Users need AI to drive split recommendations (training days, upper/lower/full/cardio) instead of manually toggling days before writing a prompt. Separating goals from schedule improves clarity and lets the coach message guide schedule selection.

### Scope

- **API** `POST /api/programs/suggest-schedule` — goals + optional cardio preference → schedule options JSON
- **`lib/training/scheduleSuggestion.ts`** — prompt builder, validation, types
- **`lib/training/aiProgramPlan.ts`** — `Cardio` workout type; cardio-focused session rules in generation prompt; relaxed min exercise count for cardio days
- **Program Setup UI** — stepped wizard with schedule option cards, cardio preference chips, manual day override, review step
- **CSS** — wizard progress, schedule cards, day chips

### Files Changed

- `app/api/programs/suggest-schedule/route.ts` (new)
- `lib/training/scheduleSuggestion.ts` (new)
- `lib/training/aiProgramPlan.ts` — Cardio day support
- `app/page.tsx` — wizard state, `fetchScheduleSuggestions()`, stepped UI
- `app/globals.css` — wizard and schedule card styles
- `CHANGELOG.md`, `ROADMAP.md`

### Database Changes

None.

### Testing Steps

**Prerequisites**

1. `OPENAI_API_KEY` set in `.env.local`
2. `npm run build` — must pass

**Wizard flow**

3. Sign in → Training → Program Setup
4. Step 1: enter goals (e.g. baseball throw/hit power) → **Next: Plan my schedule**
5. Step 2: confirm coach message; try cardio chips (Yes / No / Let AI decide) — options refresh
6. Select a schedule card (recommended badge visible); optionally **Customize days** and add Cardio type
7. **Next: Review & generate** — summary shows goals + weekly chips
8. Set weeks/name → **Generate with AI** — program loads in Training with correct days/types

**Cardio**

9. Pick or customize a schedule with Cardio days → generated workouts use conditioning exercises on those days

**Error states**

10. Remove `OPENAI_API_KEY` — schedule step returns 503 with clear message
11. Short goals text — client validation alert
12. Invalid AI JSON — API returns 422

**Regression**

13. **Quick template program** still works from review step
14. Team program mode + AI generate unchanged
15. Mobile: wizard steps, option cards, and chips usable on narrow viewport

### Known Issues

- Changing cardio preference re-fetches all schedule options (extra OpenAI call)
- Manual day override does not sync back to `selectedScheduleId` label (days/types still apply correctly to generation)
- Cardio template fallback is basic compared to AI cardio sessions

### Recommended Commit Message

```text
BIQ-0015 Add AI-guided program setup wizard for schedule and cardio
```

### Dependencies

- BIQ-0014 AI program generator
- BIQ-0012 cardio exercise logging types


### Follow-up (2026-07-09)

- **Stronger AI volume** — system prompt now requires 6–10 strength exercises per session with compound lifts + accessories; validates minimum 6 per workout with one automatic retry
- **Smarter catalog slice** — `selectCatalogForAi()` scores exercises by form guides, prompt keywords, and import source instead of alphabetical slice; sends `has_form_guide` to OpenAI
- **Custom exercise exclusion** — user-built exercises excluded from AI generation and Add Exercise search; `builtinCatalogItems()` helper; Settings **Remove all custom exercises** bulk archive button
- **Fuzzy match tie-break** — catalog matching prefers exercises with form guides when scores tie

---

## BIQ-0016 - Mobility, Stretching, and Cooldown in Program Design

Date: 2026-07-09  
Branch: develop  
Status: **Completed**

### Summary

Make mobility and stretching a first-class part of every program: mandatory dynamic warmup stretches, an optional **Cooldown / Stretch** section after strength work, and a **Mobility** day type in the schedule wizard — all driven by AI rules and catalog-aware exercise selection.

### Purpose

Warmup today is labeled “prep” but stretches are inconsistent. AI favors strength exercises with form guides; stretching entries in the catalog (`exercise_type: mobility`, imported `stretching` category) are underused. Athletes (e.g. baseball) need reliable hip, shoulder, and thoracic mobility without typing it into every prompt. A dedicated cooldown section supports recovery and flexibility goals without cramming stretches into the strength block.

### Scope

#### Part 1 — Cooldown / Stretch workout section

**Problem:** Only `warmup` and `strength` sections exist. No post-workout stretch block.

**Desired behavior:**

| Section | Label | Sort order base | Typical content |
|---------|-------|-----------------|-----------------|
| `warmup` | Warm Up / Prep | 0 | Dynamic mobility, activation, light cardio |
| `strength` | Strength | 100 | Lifts, accessories, supersets |
| `cooldown` | Cooldown / Stretch | 200 | Static/dynamic stretches, foam roll, breathing |

**Requirements:**

- Extend `SECTIONS` and `SECTION_SORT_BASE` in `app/page.tsx`
- Render cooldown block in Training workout view (same card/grid patterns as warmup; mobility logging fields via `logFieldsForType`)
- Add Exercise panel supports `cooldown` section
- Cross-week edit matching uses `section` + `sort_order` (existing pattern)
- Snapshot fields: `snapshot_section` already supports any section string — no migration required for logs
- `st_exercises.section` is unconstrained text — **no DB migration** unless we add a check constraint documenting allowed values

**Template fallback (`WORKOUT_TEMPLATES`):**

- Add `cooldown` arrays to Lower / Upper / Full Body / Cardio templates (2–3 stretches each)
- Example: World's Greatest Stretch, pigeon pose, band shoulder distraction — names matched to catalog where possible

---

#### Part 2 — AI warmup mobility rules (every strength day)

**Problem:** AI prompt says “2–4 prep items” without requiring stretches or sport-specific mobility.

**Desired AI rules (add to `buildProgramGenerationPrompt` in `aiProgramPlan.ts`):**

1. **Every strength day warmup must include:**
   - 1 light cardio/activation item (bike, walk, jump rope — optional on mobility-only days)
   - **2–3 mobility/stretch items** from catalog (`exercise_type: mobility` or stretching names)
   - At least one item targeting **hips**, **thoracic spine/rotation**, or **shoulders** when goals mention throwing, hitting, or rotational sport

2. **Catalog bias for warmup/cooldown picks:**
   - New helper `selectMobilityCatalogForAi(catalog, userPrompt, limit)` — boost `category: warmup`, `exercise_type: mobility`, `training_goal: mobility`, name contains stretch/mobility
   - Pass separate `mobility_catalog_sample` (top 80–120) in generation user JSON alongside main strength catalog

3. **Rep prescription for mobility:** duration-based (`30 sec`, `45 sec each side`, `10 reps`) not heavy sets

4. **Validation:** each strength-day workout must have `warmup.length >= 3` with at least **2** items classified as mobility when parsed (match catalog `exercise_type` or keyword list)

---

#### Part 3 — AI cooldown block (optional but default-on)

**Problem:** No post-workout stretching in generated plans.

**Desired behavior:**

- AI JSON schema adds `cooldown` array (same shape as warmup items)
- **Default:** include `cooldown` on all strength days — **2–4 stretches** targeting muscles worked that session (e.g. lower day → hip flexor, hamstring, glute stretches)
- **Cardio days:** optional shorter cooldown (1–2 items) or omit
- **Mobility days:** cooldown may merge into main work (see Part 4)

**User toggle (Program Setup review step):**

- Checkbox: **Include cooldown stretches** (default: on)
- Passed to `/api/programs/generate` as `includeCooldown: boolean`
- When off, AI omits cooldown array; UI hides empty cooldown section

**Validation:** when `includeCooldown` true, strength days need `cooldown.length >= 2`

---

#### Part 4 — Mobility day type in schedule wizard

**Problem:** Schedule options only offer Lower / Upper / Full Body / Cardio. No dedicated recovery/mobility session.

**Desired behavior:**

**Schedule suggestion (`scheduleSuggestion.ts` + `/api/programs/suggest-schedule`):**

- Add `Mobility` to valid `day_types`
- AI offers schedules that may include 1 mobility day per week when goals imply high training load, rotational sport, or user selects **Include mobility day** chip (alongside cardio chips)
- Example option: `Mon Upper · Wed Lower · Fri Full · Sun Mobility`

**Program generation (`aiProgramPlan.ts`):**

- `VALID_WORKOUT_TYPES` includes `Mobility`
- Mobility day rules:
  - `workout_type: "Mobility"`
  - Warmup: 1–2 light items
  - Strength section: **6–10 mobility/stretch exercises** (treated as main work, not lifts)
  - Cooldown: optional 1–2 breathing/relaxation items
  - No barbell compound lifts on mobility days
  - Min exercise validation: 6 mobility items (relaxed set counts; duration/reps)

**Wizard UI (`app/page.tsx` step 2):**

- Chip group: **Include a mobility day?** — Yes / No / Let AI decide (mirrors cardio pattern)
- Day type dropdown includes **Mobility**
- Schedule option cards show mobility day chips (e.g. `Sun Mobility`)

---

#### Part 5 — Sport-aware mobility presets (prompt context, not hardcoded plans)

Embed in AI system prompt as **reference patterns** (AI adapts, does not copy blindly):

| Sport / goal | Warmup emphasis | Cooldown emphasis |
|--------------|-----------------|-------------------|
| Baseball throw | Shoulder IR/ER, scap activation, thoracic rotation, hip hinge prep | Pec/lat, shoulder capsule, forearm |
| Baseball hit | Hip mobility, anti-rotation prep, thoracic rotation | Hip flexors, glutes, T-spine |
| General strength | Hip opener, T-spine, shoulder CARs | Muscles trained that day |
| Fat loss / conditioning | Dynamic full-body | Lower intensity static stretch |

User goals prompt still primary; presets inform AI when keywords match.

---

#### Part 6 — UI polish

- Section headers: icon or color distinction for Cooldown (e.g. green/teal vs purple strength)
- Mobility exercises show **duration** field prominently in log grid (existing `mobility` / `timed` log fields)
- Form guide button on mobility items when catalog has `image_url` / instructions (many stretches have images from Free Exercise DB)
- Dashboard “Today’s Workout” exercise count includes cooldown items

---

### Proposed Files to Change

| File | Changes |
|------|---------|
| `lib/training/aiProgramPlan.ts` | Cooldown schema, mobility catalog helper, warmup/cooldown/mobility-day rules, validation |
| `lib/training/scheduleSuggestion.ts` | `Mobility` day type, mobility-day schedule options |
| `app/api/programs/generate/route.ts` | Accept `includeCooldown`, `includeMobilityDay` |
| `app/api/programs/suggest-schedule/route.ts` | Mobility preference in request body |
| `app/page.tsx` | `cooldown` section UI, wizard chips, review toggle, template cooldown arrays |
| `app/globals.css` | Cooldown section styling |
| `lib/training/logFields.ts` | Confirm mobility/cooldown logging UX (extend only if gaps) |
| `CHANGELOG.md`, `DECISIONS.md`, `ROADMAP.md` | This BIQ + Decision 024 |

### Database Changes

**None required** — `st_exercises.section` already accepts new section values; snapshots store `snapshot_section` as text.

Optional future: `st_programs.include_cooldown boolean` to persist preference on program row.

### Dependencies

- BIQ-0014 AI program generator
- BIQ-0015 schedule wizard + Cardio day type
- BIQ-0013 exercise catalog (stretching/mobility entries from import)
- BIQ-0012 adaptive logging by `exercise_type`

### Out of Scope (this BIQ)

- Dedicated foam-rolling video library
- PNF / partner stretching flows
- Separate mobile “stretch timer” UX
- AI Coach readiness-based stretch adjustments (Phase 6)
- Plyometrics section (separate BIQ)

### Testing Steps

1. **Wizard** — goals for baseball → schedule step → enable mobility day → option includes `Mobility` day
2. **AI generate** — strength day has warmup with ≥2 mobility items + cooldown with ≥2 stretches
3. **Mobility day** — Sunday (or chosen) is all mobility exercises; no heavy squats/bench
4. **Cooldown toggle** — uncheck on review → generated plan has no cooldown section
5. **Training UI** — cooldown section renders; log duration/reps on mobility exercises
6. **Form guides** — stretch with catalog image shows thumbnail + Form guide
7. **Template fallback** — quick template includes cooldown arrays
8. **History** — completed cooldown logs retain snapshots if template later edited
9. **Mobile** — three sections scroll cleanly on 375px width
10. `npm run build` passes

### Known Issues / Risks

- More exercises per session increases AI token usage and generation time
- Stretch names in catalog vary; fuzzy match may miss — mobility catalog helper mitigates
- Existing programs lack cooldown until regenerated or manually edited
- Validation stricter → more 422 retries; keep one retry path

### Recommended Commit Message

```text
BIQ-0016 Add mobility warmup rules, cooldown section, and mobility day type
```

### Implementation notes (2026-07-09)

- Added `cooldown` as third workout section in UI (`SECTIONS`, templates, training view, dashboard counts).
- `selectMobilityCatalogForAi()` biases stretch/mobility catalog picks for AI generation.
- AI prompt: mandatory warmup mobility on strength days, optional default-on cooldown (2–4 stretches), Mobility day type (6–10 mobility exercises).
- Schedule wizard: mobility day preference chips (Yes/No/Let AI decide), Mobility in day-type dropdown, review-step cooldown toggle.
- Validation: strength-day warmup ≥3 with ≥2 mobility items; cooldown ≥2 when `includeCooldown` true; Mobility day ≥6 mobility-classified exercises.
- No database migration — `st_exercises.section` accepts `cooldown` as text.

---

## BIQ-0017 - Available Equipment Filter and Exercise Replace UX

Date: 2026-07-09  
Branch: develop  
Status: **Completed**

### Summary

Users can specify available gym equipment on their profile and in Program Setup. Catalog search (Add/Change exercise) and AI program generation filter exercises to match. Replacing an exercise from the catalog now refreshes name, muscle, thumbnail, and form guide in the UI.

### Purpose

Home-gym and limited-equipment users were shown barbell/cable exercises they cannot perform. Exercise "Change" updated the database but uncontrolled `defaultValue` inputs did not remount, so the card looked unchanged.

### Files changed

- `lib/training/equipmentFilter.ts` — equipment options, matching, filter helpers
- `lib/training/catalogSearch.ts` — `availableEquipment` filter in search
- `lib/training/aiProgramPlan.ts` — equipment-aware catalog slice + AI prompt rule
- `lib/training/scheduleSuggestion.ts` — equipment in schedule context
- `app/api/programs/generate/route.ts` — `availableEquipment` body param
- `app/api/programs/suggest-schedule/route.ts` — `availableEquipment` body param
- `app/page.tsx` — equipment chips (Settings + Program Setup Goals), `cardKey` remount on replace, catalog panel filter hint, `persistEquipmentPreference`
- `supabase/migrations/20250709_014_profile_available_equipment.sql` — `st_profiles.available_equipment text[]`

### Database changes

- `st_profiles.available_equipment` — text array, default `{}`; empty or `full_gym` = no filter

### Testing steps

1. Run migration `20250709_014_profile_available_equipment.sql` on Supabase
2. Settings → select Dumbbell + Bench → Save Profile
3. Training → Change exercise → catalog search excludes barbell-only exercises; active filter message shown
4. Pick replacement → name, muscle badge, thumbnail, Form guide update without page refresh
5. Program Setup Goals → equipment chips visible; selections persist when advancing wizard
6. Generate with AI respects equipment in program exercises
7. `npm run build` passes

### Known issues

- Equipment matching is heuristic (string contains); unusual catalog equipment labels may need tuning
- Users must run migration before profile equipment saves

### Recommended commit message

```text
BIQ-0017 Add available equipment filter and fix exercise replace UI refresh
```

---

## BIQ-0018 - Plan Generation Reliability, Richer AI Text, and In-App Bug Reports

Date: 2026-07-11  
Branch: cursor/plan-gen-bug-report-bf79  
Status: **Completed**

### Summary

Hardened AI program generation so incomplete warmup/cooldown/mobility plans are auto-repaired instead of hard-failing; asked the model for longer `program_summary` + `coaching_notes` and showed them in larger text boxes; added an in-app **Bug** reporter so signed-in users can file issues with page context for Cursor/agent follow-up.

### Purpose

Plan generation under a real login was erroring when OpenAI returned plans that failed strict mobility/cooldown validation. Users also wanted more AI-written coaching text in the UI, plus a way to report bugs from the app so frontend issues can be captured and fixed in later agent runs.

### Scope

- **Plan repair** — `repairAiPlan()` pads warmup/cooldown/mobility and clones missing week/day slots from the nearest prior workout
- **Richer AI text** — schema asks for 3–5 sentence summaries + 4–8 sentence coaching notes; goals textarea enlarged (8 rows) and editable on Review; notes shown after generate and on Training
- **API hardening** — higher `max_tokens`, longer prompt limit (6000), clearer 422 hints, graceful fallback if `coaching_notes` column not migrated yet
- **Bug reporter** — floating **Bug** button → modal → `POST /api/bug-reports` → `st_bug_reports` (RLS: user inserts/selects own rows)
- **Frontend testing** — agents can exercise UI when the app is running with credentials; bug reports give reproducible context between runs

### Files Changed

- `lib/training/aiProgramPlan.ts` — repair layer, coaching_notes, softer validation
- `lib/training/scheduleSuggestion.ts` — longer coach_message guidance
- `app/api/programs/generate/route.ts` — tokens, hints, coaching_notes response
- `app/api/programs/suggest-schedule/route.ts` — 6000-char goals limit
- `app/api/bug-reports/route.ts` — new
- `app/page.tsx` — larger prompt box, notes UI, bug FAB/modal
- `app/globals.css` — summary/coaching/bug styles
- `supabase/migrations/20250711_015_coaching_notes_and_bug_reports.sql` — new
- `CHANGELOG.md`

### Database Changes

Run in Supabase SQL Editor:

`supabase/migrations/20250711_015_coaching_notes_and_bug_reports.sql`

- `st_programs.coaching_notes text`
- `st_bug_reports` table + RLS (insert/select own)

### Testing Steps

1. Run migration `20250711_015_coaching_notes_and_bug_reports.sql`
2. Confirm `OPENAI_API_KEY` is set on the server
3. Sign in → Training → Program Setup
4. Enter a longer goals paragraph → Plan schedule → Generate with AI
5. Confirm generation succeeds (no false 422 on short warmup/cooldown)
6. Confirm **AI plan write-up** and **Coaching notes** appear on Training
7. Force a known failure (optional) or tap **Bug** FAB → submit a report → confirm success message
8. In Supabase, confirm a row in `st_bug_reports` for your user
9. Mobile: large goals textarea + Bug button usable on narrow viewport
10. `npm run build` passes with env vars set

### Known Issues

- Repair may clone week N from week N−1 when AI omits a day (structure preserved; intensity variation may be weaker for that day)
- Bug reports are user-visible only to the reporter until an admin/service-role viewer is added
- Cloud agent frontend testing still requires deployed URL + test credentials (or local env)

### Follow-up (same PR)

- Clearer sign-in/sign-up errors when Safari reports **Load failed** (usually missing Vercel Supabase env vars or Site URL not allowlisted)

### Recommended Commit Message

```text
BIQ-0018 Harden AI plan generation, richer coaching text, in-app bug reports
```

### Frontend testing with Cursor agents

Yes — cloud agents can help test the frontend when:

1. The app is running (local `npm run dev` or a deployed preview) with Supabase + OpenAI configured
2. You share a test login or use bug reports from your own login as the signal

Practical workflow:

- Reproduce an issue in the app → tap **Bug** and describe steps/error
- Ask a Cursor cloud agent to fix from that report (or paste the error text)
- Agent implements, builds, and opens a PR; you re-test in the browser

Automated browser E2E (Playwright) can be added later; for now bug reports + manual steps are the lightest reliable loop.

---

## BIQ-0019 - Fix Sign Out Client Crash

Date: 2026-07-11  
Branch: cursor/fix-signout-crash-bf79  
Status: **Completed**

### Summary

Fixed a client-side crash when tapping **Sign Out** (`Application error: a client-side exception has occurred`). Sign-out cleared the session while render/effects still touched `session.user`.

### Purpose

Users on the Vercel deploy (`buildiq-duf7.vercel.app`) hit a white error screen after Sign Out instead of returning to the login screen.

### Changes

- Guard roster `isSelf` checks with `session?.user`
- Clear local app state before calling Supabase `signOut`
- Prevent `loadLogs` / `loadLiftHistory` / `loadPrograms` / `loadTeams` / `loadProfile` from running without a session
- Harden `canLog` / `canEdit` and set-log save against null session

### Files changed

- `app/page.tsx`
- `CHANGELOG.md`

### Database changes

None.

### Testing steps

1. Sign in on the deployed app
2. Tap **Sign Out**
3. Confirm login screen appears (no Application error)
4. Sign in again successfully
5. Mobile Safari and Chrome

### Recommended commit message

```text
BIQ-0019 Fix sign-out client crash from null session access
```

---

---

## BIQ-0020 - Restore Exercise Form Guide Thumbnails

Date: 2026-07-11  
Branch: cursor/exercise-form-guide-thumbnails-8e87  
Status: **Completed**

### Summary

Form guide still photos were missing or unreliable on exercise cards and in the Form guide panel. Media helpers now normalize Free Exercise DB image URLs to jsDelivr, treat GIFs as images (not blank `<video>` tags), always render stills in the guide panel, and fall back to still `media_url` for card thumbnails.

### Purpose

On the workout logging redesign, users reported no thumbnails in exercise form guides. Root causes: (1) guide UI hid all stills whenever any `media_url` was classified as video — including GIFs, which browsers do not show in `<video>`; (2) card thumbs only read `image_url` and ignored still `media_url`; (3) `raw.githubusercontent.com` hotlinks are less reliable than a CDN mirror.

### Files changed

- `lib/training/exerciseMedia.ts` — CDN URL resolve, thumb fallback, GIF-as-image, stills always collected
- `app/page.tsx` — always show guide stills; eager load + `referrerPolicy`; clickable card thumb opens guide; catalog thumbs use resolved URLs
- `app/globals.css` — thumb button styles; explicit thumb display sizing
- `scripts/import-exercises/sources/freeExerciseDb.ts` — new imports store jsDelivr image URLs
- `CHANGELOG.md` — this entry

### Database changes

- None (client-side URL rewrite covers existing `raw.githubusercontent.com` rows)

### Testing steps

1. Training → open a workout with catalog-linked exercises that have form guides
2. Confirm each exercise shows a thumbnail beside the name (not an empty dark square)
3. Tap thumbnail or **Form guide** → panel shows form photo(s); multi-angle when available
4. Exercises with video demos still show the still thumbnails above/alongside video
5. Add/Change exercise search results show thumbnails
6. Mobile: thumbs remain visible in the exercise header
7. `npm run build` passes

### Known issues

- Exercises with instructions only (no `image_url` / still `media_url`) correctly have no thumbnail
- Existing DB rows keep raw GitHub URLs; display rewrites them — re-import optional for permanent CDN URLs

### Recommended commit message

```text
BIQ-0020 Restore exercise form guide thumbnails and still media display
```

---

## BIQ-0021 - Branch Consolidation

Date: 2026-07-13  
Branch: cursor/branch-consolidation-976f  
Status: **Completed**

### Summary

Merged remaining open feature branches into `main` via a consolidation branch: workout logging redesign and exercise form-guide thumbnail fixes. Confirmed older branches (`Develop`, `cursor/biq-0005-exercise-catalog`) and already-merged PRs are superseded by current `main`.

### Purpose

User requested merging all branches. Several remotes were stale or already landed; this change brings the two remaining unique feature branches onto one PR targeting `main`.

### Branches included

| Branch | Result |
|--------|--------|
| `feature/workout-logging-redesign` | Merged (PR #4 work) |
| `cursor/exercise-form-guide-thumbnails-8e87` | Merged (PR #3 / BIQ-0020) |
| `cursor/fix-signout-crash-bf79` | Already on `main` (PR #2) |
| `cursor/plan-gen-bug-report-bf79` | Already on `main` (PR #1) |
| `cursor/biq-0005-exercise-catalog` | Superseded — BIQ-0005 already on `main`; skipped (conflicts + Office lock junk) |
| `Develop` | Superseded — lift history already evolved on `main`; skipped (conflicts) |

### Files changed

- Merged from workout logging redesign: `WorkoutSetLogger.tsx`, `logFieldUI.ts`, `logFields.ts`, related CSS/page wiring; removed stray Office lock migration files
- Merged from BIQ-0020: `exerciseMedia.ts`, form-guide UI, Free Exercise DB import URL fix
- `CHANGELOG.md` — this entry

### Database changes

None.

### Testing steps

1. Sign in → Training → open a workout and log sets with the redesigned logger UI
2. Confirm form-guide thumbnails appear and open the guide panel
3. Confirm Sign Out still returns to login (BIQ-0019)
4. Confirm Bug FAB still works (BIQ-0018)
5. Mobile layout check
6. `npm run build` passes

### Known issues

- After this PR merges, close obsolete open PRs #3 and #4 and delete stale remote branches
- Remaining `~$*.sql` Office lock files under `supabase/migrations/` should be deleted in a follow-up cleanup

### Recommended commit message

```text
BIQ-0021 Consolidate open feature branches into main
```

---

## BIQ-0022 - Reliable Set Logging, Copy Last, and Week/Date Alignment

Date: 2026-07-13  
Branch: cursor/fix-logging-week-dates-976f  
Status: **Completed**

### Summary

Fixed inconsistent set/reps persistence caused by stale React state during sequential upserts (including **Copy last** wiping earlier fields). Aligned program week numbers with calendar dates via `st_programs.start_date`, so Training date, week selector, and day tabs stay in sync. Improved previous-session lookup so next-week logging shows last weight/reps and Copy last fills them correctly.

### Purpose

Users reported logged sets/reps not sticking, Copy last not filling prior values, and generated plans not lining up with real calendar weeks.

### Changes

- **Atomic log upserts** — `upsertSetLog` merges from `logsRef` and writes all fields in one DB upsert; Copy last no longer loops field-by-field
- **History matching** — index prior logs by catalog ID *and* exercise name; fallback by set number / latest performance
- **Week ↔ date** — `start_date` on programs; changing date updates week; changing week/day tab updates date; day tabs show MM-DD
- **Program start control** — editable Program start date on Training (editors)
- New helpers in `lib/training/programCalendar.ts`

### Files changed

- `app/page.tsx`
- `app/components/WorkoutSetLogger.tsx`
- `lib/training/programCalendar.ts` (new)
- `lib/training/aiProgramPlan.ts`
- `supabase/migrations/20250713_016_program_start_date.sql` (new)
- `CHANGELOG.md`
- `DECISIONS.md`

### Database changes

Run in Supabase SQL Editor:

`supabase/migrations/20250713_016_program_start_date.sql`

- Adds `st_programs.start_date date`
- Backfills from `created_at` for existing programs

### Testing steps

1. Run migration `20250713_016_program_start_date.sql`
2. Sign in → Training → log weight then reps on a set; refresh page; confirm both values remain
3. Tap **Copy last** on the same exercise in a later week/date; confirm weight *and* reps populate
4. Change **Date** → Week selector updates; change **Week** → Date moves by 7 days keeping weekday
5. Tap a day tab (e.g. Fri) → Date jumps to that Friday in the selected week
6. Generate a new program → Program start defaults to today; Week 1 matches that week
7. Mobile: date/week controls usable; logs still save
8. `npx tsc --noEmit` passes

### Known issues

- Existing programs use `created_at` as start until Program start is edited
- Copy last still requires a prior log before the selected date (same-day earlier sessions are not used)

### Recommended commit message

```text
BIQ-0022 Fix set log persistence, Copy last, and week/date alignment
```

---

## BIQ-0023 - mm/dd/yy Date Format and Monday Week Start

Date: 2026-07-13  
Branch: cursor/date-format-monday-week-7d3b  
Status: Completed

### Summary

Switched user-facing dates to **mm/dd/yy** and aligned program and dashboard weeks to **Monday–Sunday** (Sunday is the last day of the week).

### Purpose

Users wanted US-style dates and calendar weeks that start on Monday instead of rolling 7-day windows or ISO-style `YYYY-MM-DD` display.

### Changes

- **Display format** — `formatDisplayDate` / `parseDisplayDate` in `programCalendar.ts`; Progress, Dashboard, Training, and team views show mm/dd/yy
- **Date inputs** — new `DateInput` component accepts mm/dd/yy while storing `YYYY-MM-DD` internally for Supabase
- **Monday week blocks** — program weeks anchor to the Monday of the week containing `start_date`; week ranges run Mon–Sun
- **Program start** — new and AI-generated programs snap `start_date` to Monday; editing Program start also snaps to Monday
- **Weekly stats** — dashboard compliance and weekly progress use the current calendar week (Mon–Sun), not a rolling last-7-days window

### Files changed

- `lib/training/programCalendar.ts`
- `lib/training/aiProgramPlan.ts`
- `app/components/DateInput.tsx` (new)
- `app/page.tsx`
- `CHANGELOG.md`

### Database changes

None.

### Testing steps

1. Open Training — Date and Program start fields accept **mm/dd/yy** (e.g. `07/13/26`)
2. Confirm week selector shows ranges like `07/07/26 – 07/13/26` (Mon–Sun)
3. Confirm day tabs show mm/dd/yy next to each workout day
4. Change week — weekday stays aligned; Sunday tabs appear at the end of the week block
5. Dashboard — today’s date and weekly set counts reflect the current Mon–Sun week
6. Progress — history dates display as mm/dd/yy
7. Create a new program — Program start should land on the Monday of the current week
8. Mobile — date fields remain usable with numeric keyboard

### Known issues

- Native browser locale is no longer used for date pickers; users type mm/dd/yy manually
- Existing `start_date` values are unchanged in the database; week math normalizes to Monday via `programWeekAnchor`

### Recommended commit message

```text
BIQ-0023 Use mm/dd/yy dates and Monday–Sunday week alignment
```

---

## BIQ-0024 - Complete Exercise Intelligence Database (BIQ-0013)

Date: 2026-07-13  
Branch: cursor/finish-biq-0013-7d3b  
Status: Completed

### Summary

Finished BIQ-0013 by hardening the production import pipeline for the Free Exercise DB (873 exercises), enriching legacy BIQ-0005 seed rows, inferring `training_goal` and richer `coaching_metadata`, and adding curated + auto-generated exercise alternatives.

### Purpose

BIQ-0013 schema and CLI were scaffolded but production data was never imported. This change delivers the full operational workflow so each environment can load 800+ exercises with form guides, intelligence fields, and substitution links.

### Changes

- **Production import commands** — `import:exercises:production` and `import:exercises:production:dry` (convert + import in one step)
- **Legacy enrichment** — `--enrich-legacy` updates 13 exact-name BIQ-0005 staples with `external_source`, images, and instructions instead of skipping
- **Richer converter** — `freeExerciseDb.ts` infers `training_goal`, `programming_role`, `fatigue_cost`, `skill_demand`, and `rep_range_hints` in `coaching_metadata`
- **Alternatives pipeline** — `importAlternatives.ts` + `import:alternatives` scripts; migration `20250713_017_exercise_alternatives_seed.sql` for curated pairs
- **Docs** — updated `scripts/import-exercises/README.md`

### Files changed

- `scripts/import-exercises/importExercises.ts`
- `scripts/import-exercises/importAlternatives.ts` (new)
- `scripts/import-exercises/sources/freeExerciseDb.ts`
- `scripts/import-exercises/README.md`
- `supabase/migrations/20250713_017_exercise_alternatives_seed.sql` (new)
- `package.json`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database changes

- New migration: `20250713_017_exercise_alternatives_seed.sql` (curated substitution rows)

### Production import steps (run per environment)

1. Apply migrations through `20250713_017`
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
3. `npm run import:exercises:production:dry` — expect 873 records, 0 errors
4. `npm run import:exercises:production` — inserts ~860 new rows; enriches ~13 legacy staples
5. `npm run import:alternatives` — seeds curated + movement-pattern alternatives
6. Verify: `select count(*) from st_exercise_catalog where external_source = 'free_exercise_db';`

### Testing steps

1. `npm run import:exercises:production:dry` passes with 873 records, 0 errors
2. `npx tsc --noEmit` passes
3. After live import: training search returns imported exercises with thumbnails
4. Legacy staples (Goblet Squat, Dumbbell Bench Press, etc.) show form guides after `--enrich-legacy`
5. `st_exercise_alternatives` contains Bench Press → Dumbbell Bench Press and related pairs

### Known issues

- Live import requires service role key (not run in cloud agent environment)
- Auto-generated alternatives can be broad; curated pairs are preferred for common staples
- `coaching_metadata` is stored but not yet consumed by AI Coach prompts (future BIQ)

### Recommended commit message

```text
BIQ-0024 Complete exercise intelligence import pipeline and alternatives
```

---

## BIQ-0025 - Windows One-Click Dev Setup

Date: 2026-07-13  
Branch: cursor/windows-setup-7d3b  
Status: Completed

### Summary

Added Windows setup shortcuts so developers do not need to manually fix Node/npm PATH every session.

### Changes

- `scripts/setup-windows.ps1` — finds repo root, refreshes PATH, locates npm, runs `npm install`
- `buildiq-setup.cmd` — double-click setup
- `buildiq-import.cmd` — double-click exercise import (after `.env.local`)
- `README.md` — Windows quick start section

### Recommended commit message

```text
BIQ-0025 Add Windows one-click dev and import setup
```

---

## BIQ-0026 - Progress PRs and Strength Volume Trends

Date: 2026-07-13  
Branch: cursor/progress-prs-trends-7d3b  
Status: Completed

### Summary

Added personal record tracking and an 8-week strength volume trend chart to the Progress tab, using completed set snapshots (catalog ID + exercise name keys).

### Purpose

Users need to see improvement over time, not only a flat workout history list. Phase 4 analytics starts with PR detection and weekly volume trends before full charting and bodyweight tracking.

### Changes

- **`lib/training/progressAnalytics.ts`** — PR computation (max weight, est. 1RM Epley, best volume), Mon–Sun weekly volume buckets, summary stats
- **`app/components/ProgressInsights.tsx`** — Strength overview, PR list with “New PR” badges (14d), CSS bar chart for weekly volume
- **Progress tab** — Insights section above existing workout history; history relabeled “Workout history”
- Increased progress log fetch limit to 500 sets

### Files changed

- `lib/training/progressAnalytics.ts` (new)
- `app/components/ProgressInsights.tsx` (new)
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database changes

None.

### Testing steps

1. Log completed strength sets with weight + reps across multiple weeks
2. Open **Progress** — confirm Strength overview metrics
3. Confirm **Personal records** shows best lifts per exercise; recent PRs get “New PR” badge
4. Confirm **Weekly volume** bar chart shows last 8 Mon–Sun weeks
5. **Workout history** section still lists day-by-day sets below insights
6. Mobile — chart uses 4-column grid on narrow screens

### Known issues

- Volume uses logged numbers as entered (lb assumed in labels; metric preference shows kg label only)
- Cardio/mobility sets excluded from PR/volume analytics (strength-like types only)
- No per-exercise detail drill-down yet

### Recommended commit message

```text
BIQ-0026 Add Progress personal records and weekly volume trends
```

---

---

## BIQ-0027 - Team Training Coach Platform Architecture

Date: 2026-07-15  
Branch: `preview/team-coach-biq-0027` (also `cursor/team-coach-architecture-7d3b`)  
Status: **Preview branch only** — reverted from `main` pending preview QA (see BIQ-0028)

### Summary

Redesigned Team Training around the coach workflow while preserving a separate athlete experience. Personal Training remains the athlete logging view; Team Training becomes a coach management platform (dashboard, roster, athlete performance dashboard, structured program assignment) built on the same workout engine and set-log pipeline.

### Purpose

Support scalable athletic program management — high school teams, college programs, and performance facilities — without mirroring Personal Training UI for coaches or exposing other athletes’ data to members.

### Changes

- Added `lib/training/teamCoach/` module: types, permissions, program resolution, workout status, coach metrics
- Added coach UI: `CoachTeamDashboard`, `CoachRoster`, `AthleteCoachDashboard`, `ProgramAssignmentPanel`, `TeamAthleteView`
- Coaches see team overview metrics, alerts, roster cards, and per-athlete dashboards with strength trends
- Athletes on Team Training see plan toggle + start workout (routes to Personal Training logger)
- Four assignment modes surfaced via structured assignment panel (AI individual generate = future placeholder)
- Shared permissions via `canAccessCoachPlatform`, `canLogWorkout`, `canEditProgramTemplate`

### Files Changed

- `lib/training/teamCoach/types.ts` (new)
- `lib/training/teamCoach/permissions.ts` (new)
- `lib/training/teamCoach/programResolution.ts` (new)
- `lib/training/teamCoach/workoutStatus.ts` (new)
- `lib/training/teamCoach/coachMetrics.ts` (new)
- `lib/training/teamCoach/index.ts` (new)
- `app/components/CoachTeamDashboard.tsx` (new)
- `app/components/CoachRoster.tsx` (new)
- `app/components/AthleteCoachDashboard.tsx` (new)
- `app/components/ProgramAssignmentPanel.tsx` (new)
- `app/components/TeamAthleteView.tsx` (new)
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `DECISIONS.md`
- `ROADMAP.md`

### Database changes

None.

### Testing steps

1. Check out `preview/team-coach-biq-0027` (or deploy that branch on Vercel)
2. Sign in as team **owner** or **editor**
3. Open **Team** — confirm coach dashboard shows athlete count, training today, compliance %, PRs, alerts
4. Confirm roster cards show status, program, compliance, PR/notes indicators
5. Click an athlete — athlete dashboard with program, assignment panel (4 options), strength trends
6. **Open workout** — coach can co-log sets; athlete log updates shared `st_set_logs`
7. Sign in as **member** — Team Training shows athlete-only view (plan toggle, start workout); no other athletes’ roster
8. Member **Start my workout** — switches to Personal Training logger
9. Mobile — coach dashboard metrics and roster cards stack on narrow screens

### Known issues

- Full team analytics suite (volume graphs, compliance ranking, coach KPIs) not implemented — hooks only
- AI individualized program generation for `individual_team` is a future placeholder
- Cardio/bodyweight/nutrition sections on athlete dashboard are placeholders
- Coach snapshot reloads on member/assignment changes; large rosters may need pagination later
- Not on `main` until preview sign-off (BIQ-0028)

### Recommended commit message

```text
BIQ-0027 Team Training coach platform architecture
```

---

## BIQ-0028 - Revert BIQ-0027 from Main for Preview-First Rollout

Date: 2026-07-15  
Branch: main  
Status: **Completed**

### Summary

Reverted the BIQ-0027 merge (PR #15) from `main` so the team coach platform ships on `preview/team-coach-biq-0027` first. `main` returns to pre-BIQ-0027 behavior until preview QA passes.

### Purpose

User requested preview-branch validation before promoting the team overhaul to stable `main` / production deploy.

### Changes

- `git revert -m 1 0c083d9` on `main` — removes coach platform code from stable branch
- BIQ-0027 remains available on `preview/team-coach-biq-0027` and `cursor/team-coach-architecture-7d3b`

### Files changed

- Revert commit `08ed998` (16 files — coach components, `teamCoach` lib, `page.tsx`, `globals.css`, docs)

### Database changes

None.

### Testing steps

1. On `main` (or production deploy): confirm Team Training uses pre-BIQ-0027 UI (no coach dashboard/roster split)
2. On `preview/team-coach-biq-0027`: confirm BIQ-0027 coach platform still works
3. After preview sign-off: merge or cherry-pick BIQ-0027 back onto `main`

### Known issues

- `preview/team-coach-biq-0027` must be pushed to origin for Vercel preview deploy if not already
- Re-merging BIQ-0027 to `main` later may need conflict resolution if `main` diverges

### Recommended commit message

```text
BIQ-0028 Revert BIQ-0027 from main for preview-first rollout
```

---

> **Note:** BIQ numbers **0027** and **0028** on `main` refer to the **team coach** workstream. The same numbers on `cursor/superset-catalog-collapse-23ec` refer to **superset/catalog** work — distinct parallel changes documented below.

## BIQ-0027 - Superset Set Removal, Basic Catalog, and Exercise Collapse

Date: 2026-07-15  
Branch: cursor/superset-catalog-collapse-23ec  
Status: Completed

### Summary

Fixed removing planned sets from the second (or third) exercise in a superset, added a **Basic Gym** exercise library alongside existing Essentials and the full imported database, and added per-exercise collapse/expand plus section and workout-level collapse controls to reduce scrolling.

### Purpose

Users reported set removal failing on later superset exercises (caused by shared `sort_order` across superset members breaking cross-week exercise matching). The large imported exercise database also surfaced obscure exercise names; users wanted simpler libraries while keeping the full DB available. Workout plans with many exercises required too much scrolling.

### Changes

- **`matchingExercise` / `matchingSet` / `removeSet`** — Match superset exercises by `superset_order` first; prefer set id on the current workout; surface DB errors on failed removal
- **`confirmAddExercise`** — New superset members use the group's shared `sort_order` (not a new sort slot)
- **`lib/training/catalogSources.ts`** — Source packs: BuildIQ Essentials, Basic Gym, Guided Library
- **`lib/training/catalogSearch.ts`** — Unified catalog merge + dedupe by exercise name
- **Migration `20250715_018_basic_catalog_and_sources.sql`** — Tag legacy system seed as `builtiq_essentials`; seed ~45 `builtiq_basic` exercises
- **Training UI** — Collapse/Expand per exercise; Collapse/Expand per section; Collapse all / Expand all on workout header

### Files changed

- `app/page.tsx`
- `app/globals.css`
- `lib/training/catalogSearch.ts`
- `lib/training/catalogSources.ts` (new)
- `supabase/migrations/20250715_018_basic_catalog_and_sources.sql` (new)
- `CHANGELOG.md`

### Database changes

- `st_profiles.catalog_sources text[]` (column retained; app no longer uses per-user library toggles as of BIQ-0031)
- Existing system catalog rows tagged `external_source = 'builtiq_essentials'`
- New `builtiq_basic` system exercises inserted (idempotent by `external_id`)

### Testing steps

1. Apply migration `20250715_018_basic_catalog_and_sources.sql` in Supabase
2. Open a workout with a **superset** (2 exercises, 3+ sets each)
3. Remove a set from the **second** exercise — confirm it disappears (bug fix)
4. **Training** — Collapse one exercise; **Collapse all** / **Expand all** on workout header
5. Section-level **Collapse** / **Expand** buttons affect only that section
6. Mobile — collapsed cards show summary line; buttons remain tappable

### Known issues

- Collapse state resets on page refresh (session-only, not persisted)

### Recommended commit message

```text
BIQ-0027 Fix superset set removal, add basic catalog, exercise collapse
```

---

## BIQ-0028 - ExerciseDB Guided Library (GIF demos + form guides)

Date: 2026-07-15  
Branch: cursor/superset-catalog-collapse-23ec  
Status: Completed

### Summary

Integrated **ExerciseDB v1** as the primary **Guided Library** (~1,324 exercises) with animated GIF demos, thumbnails, and step-by-step instructions. Added bulk import pipeline, `gif_url` catalog support, search ranking/filter for exercises with guides, and updated default library preferences.

### Purpose

Users need a comprehensive exercise database with form guides and visual demos — not just text-only Essentials/Basic entries or the legacy still-photo library with odd names.

### Changes

- **`scripts/import-exercises/sources/exerciseDb.ts`** — ExerciseDB API + bulk mirror converter
- **`scripts/import-exercises/fetchExerciseDb.ts`** — Bulk download (recommended) or paginated API fetch
- **`npm run import:exercises:exercisedb`** — One-command fetch + Supabase import
- **`lib/training/catalogSources.ts`** — New `exercisedb` Guided Library source (default on)
- **`lib/training/exerciseMedia.ts`** — `gif_url` support; GIF demos show as animated form guides
- **`lib/training/catalogSearch.ts`** — `guidesOnly` filter; boost guided exercises in search results
- **Add Exercise panel** — Default “With form guide” filter; library list in search
- **Migration `20250715_019_exercisedb_catalog_defaults.sql`** — Default `catalog_sources` includes `exercisedb`

### Files changed

- `scripts/import-exercises/sources/exerciseDb.ts` (new)
- `scripts/import-exercises/fetchExerciseDb.ts` (new)
- `scripts/import-exercises/types.ts`
- `scripts/import-exercises/mapImportRecord.ts`
- `scripts/import-exercises/README.md`
- `lib/training/catalogSources.ts`
- `lib/training/catalogSearch.ts`
- `lib/training/exerciseMedia.ts`
- `app/page.tsx`
- `app/globals.css`
- `package.json`
- `supabase/migrations/20250715_019_exercisedb_catalog_defaults.sql` (new)
- `CHANGELOG.md`

### Database changes

- Run migration `20250715_019_exercisedb_catalog_defaults.sql`
- Import ~1,324 rows: `npm run import:exercises:exercisedb` (requires `.env.local` service role key)
- Rows use `external_source = 'exercisedb'` with `gif_url`, `image_url`, `media_url`, `instructions`

### Testing steps

1. Apply migrations `018` and `019`
2. Run `npm run import:exercises:exercisedb:dry` then `npm run import:exercises:exercisedb`
3. Verify SQL count for `exercisedb` source (~1324)
4. Training → Add Exercise → search “bench press” — results show GIF thumbnails
5. Pick exercise → **Watch form** / **Preview form guide** shows animated GIF + instructions
6. Workout card for guided exercise shows thumbnail + form guide button

### Known issues

- Free OSS tier uses 180p GIFs (not MP4 video); animated GIFs play in form guide panel
- API paginated fetch rate-limits (~250 requests); use bulk import (`npm run import:fetch:exercisedb`) instead
- Attribution to ExerciseDB/AscendAPI required per OSS license

### Recommended commit message

```text
BIQ-0028 Add ExerciseDB guided library with GIF form guides
```

---

## BIQ-0029 - One-click guided library import (no npm)

Date: 2026-07-15  
Branch: cursor/superset-catalog-collapse-23ec  
Status: Completed

### Summary

Added **Settings → Import Guided Library** so operators can load ~1,324 exercises with GIF form guides **without npm**. Server uses `SUPABASE_SERVICE_ROLE_KEY`. Improved Windows `buildiq-import-guided.cmd` double-click flow.

### Purpose

User reported npm never works and they lack admin privileges — needed a path that only requires the running app + Supabase service role key.

### Changes

- **`POST /api/catalog/import-guided`** — authenticated one-click import from ExerciseDB bulk dataset
- **`GET /api/catalog/import-guided`** — status (count, whether server is configured)
- **`lib/training/guidedCatalogImport.ts`** — shared server import logic
- **`lib/training/catalogImportMap.ts`** — moved import mapping into `lib/` for app + CLI reuse
- **Settings UI** — Guided Exercise Library card with import button and setup instructions
- **`buildiq-import-guided.cmd`** — Windows double-click import with portable Node
- **README** — no-npm import steps documented first

### Files changed

- `app/api/catalog/import-guided/route.ts` (new)
- `app/page.tsx`
- `app/globals.css`
- `lib/training/guidedCatalogImport.ts` (new)
- `lib/training/catalogImportMap.ts` (new)
- `lib/training/catalogImportTypes.ts` (new)
- `lib/training/exerciseDbImport.ts` (new)
- `scripts/import-exercises/*.ts` (re-export from lib)
- `buildiq-import.cmd`
- `buildiq-import-guided.cmd` (new)
- `README.md`
- `CHANGELOG.md`

### Database changes

None (uses existing `st_exercise_catalog` schema).

### Testing steps

1. Add `SUPABASE_SERVICE_ROLE_KEY` to Vercel env vars, redeploy
2. Sign in as admin → Settings → **Import Guided Library**
3. Training → Add Exercise → search "squat" — GIF thumbnails appear

### Known issues

- Import requires redeploy after adding env vars
- Large import may timeout on very slow hosting — re-run import (upserts safely)

### Recommended commit message

```text
BIQ-0029 Add one-click guided library import without npm
```

---

## BIQ-0030 - Restrict guided catalog import to admins

Date: 2026-07-15  
Branch: cursor/superset-catalog-collapse-23ec  
Status: Completed

### Summary

Guided library import remains a **shared system catalog** for all users, but the Settings import UI and API are now limited to emails listed in `BUILDIQ_CATALOG_ADMIN_EMAILS`.

### Purpose

User imported the guided library successfully but did not want normal users to see or run the import controls in Settings.

### Changes

- **`lib/training/catalogAdmin.ts`** — admin email allowlist helper
- **`GET/POST /api/catalog/import-guided`** — returns `isCatalogAdmin`; POST requires admin
- **Settings UI** — Guided Exercise Library card hidden unless `isCatalogAdmin`
- **`.env.example` / README** — document `BUILDIQ_CATALOG_ADMIN_EMAILS`

### Files changed

- `lib/training/catalogAdmin.ts` (new)
- `app/api/catalog/import-guided/route.ts`
- `app/page.tsx`
- `.env.example`
- `README.md`
- `CHANGELOG.md`

### Database changes

None.

### Testing steps

1. Set `BUILDIQ_CATALOG_ADMIN_EMAILS=your@email.com` in Vercel (Preview + Production), redeploy
2. Sign in as admin → Settings shows Guided Exercise Library card
3. Sign in as another user → card is hidden; POST import returns 403

### Known issues

- Admin list is env-based (no in-app admin UI yet)

### Recommended commit message

```text
BIQ-0030 Restrict guided catalog import to admin emails
```

---

## BIQ-0031 - Unified seamless exercise library (no user library picker)

Date: 2026-07-15  
Branch: cursor/superset-catalog-collapse-23ec  
Status: Completed

### Summary

Removed per-user exercise library toggles. All users now search one merged BuildIQ catalog (Essentials + Basic + Guided + legacy photo library), with duplicate names collapsed to the best version (prefers GIF guides).

### Purpose

User wants a seamless experience — extensive library without asking users to pick sources.

### Changes

- **`builtinCatalogItems()`** — merges all system libraries; dedupes by exercise name
- **Settings Profile** — removed Exercise libraries chip picker
- **Add Exercise search** — full catalog by default; optional “With form guide” filter off by default
- Search ranking still boosts exercises with GIFs/instructions

### Files changed

- `lib/training/catalogSources.ts`
- `lib/training/catalogSearch.ts`
- `app/page.tsx`
- `CHANGELOG.md`

### Database changes

None (`catalog_sources` column retained but no longer used by the app).

### Testing steps

1. Settings → Profile has no Exercise libraries picker
2. Training → Add Exercise → search “squat” — one entry per name when possible, guided version preferred
3. Exercise count in search placeholder reflects merged catalog (~1,400+ depending on imports)
4. Optional “With form guide” filter still works

### Recommended commit message

```text
BIQ-0031 Unify exercise catalog search without user library picker
```

---

## BIQ-0032 - Roadmap: platform admin roles

Date: 2026-07-15  
Branch: cursor/superset-catalog-collapse-23ec  
Status: Completed (documentation)

### Summary

Added **Platform admin and catalog operations** to `ROADMAP.md`: current env-based catalog import admin (BIQ-0030) and planned database-backed admin roles for imports and ops.

### Purpose

User asked to track admin capabilities on the product roadmap beyond the temporary email allowlist.

### Files changed

- `ROADMAP.md`
- `CHANGELOG.md`

### Database changes

None.

### Recommended commit message

```text
BIQ-0032 Add platform admin roles to roadmap
```

---

## BIQ-0033 - Fix workout logs not showing after logging

Date: 2026-07-15  
Branch: cursor/workout-log-persist-23ec  
Status: Completed

### Summary

Fixed workout values disappearing after logging and the dashboard always showing **Start Training** even when today's workout was already logged.

### Purpose

Users reported entering set data during a workout, then returning to find empty fields and the dashboard unchanged. Root causes: saves only fired on input blur (easy to miss on mobile), the dashboard never loaded today's log status, the active workout tab could drift from the selected date (wrong set IDs), and saves only looked up sets on the currently visible workout tab.

### Files changed

- `app/page.tsx` — sync active workout to selected date; load dashboard today logs; show Completed / In progress / Start / Continue; save sets via full-program lookup; refresh dashboard cache on save
- `app/components/WorkoutSetLogger.tsx` — debounced auto-save while typing; flush pending saves on blur/unmount
- `CHANGELOG.md`

### Database changes

None.

### Testing steps

1. Sign in and open **Training** for today's scheduled workout.
2. Enter weight/reps on a set — wait ~1 second without leaving the field.
3. Switch to **Dashboard** — badge should show **In progress** or **Completed**; button should say **Continue Workout** or **View Workout** (not always Start Training).
4. Return to **Training** — entered values should still appear on today's workout.
5. Change the date picker to another day, then back to today — correct workout tab and values should load.
6. On mobile, type values and tap another nav tab immediately — values should still persist after refresh.
7. **Progress** tab should list completed sets after logging.

### Known issues

- Dashboard "Sets today" metric still counts only `completed=true` rows (unchanged); status badge uses performance data too.

### Recommended commit message

```text
BIQ-0033 Fix workout log persistence and dashboard workout status
```

---

## BIQ-0034 - Nutrition Tracker Foundation

Date: 2026-07-15  
Branch: main  
Status: Completed

### Summary

Replaced the Nutrition placeholder with a functional macro tracking MVP: daily meal logging, saved foods library, macro goals, copy-yesterday, and a live dashboard nutrition card.

### Purpose

Phase 5 nutrition work. Users need to log calories, protein, carbs, and fat by meal before AI Coach can consume nutrition context. Meal entries snapshot macros at log time so saved-food edits do not rewrite history.

### Changes

- Added `st_nutrition_goals`, `st_food_library`, and `st_meal_entries` tables with user-scoped RLS
- Added `lib/nutrition/macros.ts` for macro math, meal grouping, and goal helpers
- Added `NutritionTracker` component: date navigation, daily summary, meals (breakfast/lunch/dinner/snacks), add food, edit goals, saved foods quick-add, copy yesterday
- Wired Nutrition tab and Dashboard nutrition card to show today's totals vs goals
- Mobile-friendly nutrition styles in `globals.css`

### Files Changed

- `supabase/migrations/20250716_020_nutrition_tracker_foundation.sql`
- `lib/nutrition/macros.ts`
- `app/components/NutritionTracker.tsx`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

Run in Supabase SQL Editor:

- `supabase/migrations/20250716_020_nutrition_tracker_foundation.sql`

### Testing Steps

1. Run migration `20250716_020` on your Supabase project.
2. Sign in → **Nutrition** → confirm date picker and empty daily summary.
3. **Edit goals** → save targets → confirm progress bars update.
4. **Add food** → log breakfast item with macros → confirm totals update.
5. Check **Save to my foods** → quick-add from **My foods**.
6. **Copy yesterday** after logging prior day.
7. **Dashboard** → Nutrition card shows today's macros.
8. Test on mobile width.
9. Second user cannot see another user's meals.

### Recommended Commit Message

```text
BIQ-0034 Add nutrition tracker foundation with meal logging and macro goals
```

---

## BIQ-0035 - Nutrition UX Polish

Date: 2026-07-16  
Branch: main  
Status: Completed

### Summary

Extended the nutrition tracker with edit flows, saved-food management, meal templates, a weekly macro summary chart, and dashboard refresh after logging.

### Purpose

Complete Phase 5 MVP polish from BIQ-0034. Users need to fix logged entries, manage saved foods, reuse whole meals, and see weekly compliance without leaving the Nutrition tab.

### Changes

- **Edit meal entries** — update name, meal, servings, and macros on existing logs
- **Manage saved foods** — edit serving/macros and archive items in My foods
- **Meal templates** — save a logged meal section as a template; log all items in one tap
- **Weekly nutrition view** — 7-day calorie chart, days logged, avg calories, protein goal %
- **Dashboard sync** — dashboard nutrition card refreshes after any log/edit/delete when viewing today
- Added `st_meal_templates` table with user-scoped RLS and JSONB item snapshots

### Files Changed

- `supabase/migrations/20250716_021_nutrition_ux_polish.sql`
- `lib/nutrition/macros.ts`
- `lib/nutrition/weeklySummary.ts`
- `app/components/NutritionTracker.tsx`
- `app/components/NutritionWeeklySummary.tsx`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

Run in Supabase SQL Editor (after BIQ-0034 migration):

- `supabase/migrations/20250716_021_nutrition_ux_polish.sql`

Creates `st_meal_templates` for reusable meal snapshots.

### Testing Steps

1. Run migration `20250716_021` on Supabase.
2. **Nutrition** → log a breakfast item → **Edit** → change calories → confirm totals update.
3. Save a food to **My foods** → **Edit** → change macros → quick-add again → confirm new macros log correctly; past entries unchanged.
4. Archive a saved food → confirm it disappears from quick-add list.
5. Log 2+ items under Lunch → **Save as template** → **Log today** from templates → confirm all items appear.
6. Archive a template → confirm it is removed from the list.
7. Log meals on multiple days this week → confirm **This week** chart shows bars and tap a day to jump dates.
8. Log food for today → switch to **Dashboard** without changing date → nutrition card reflects new totals.
9. Test mobile layout for weekly chart and entry action buttons.
10. Second user cannot see or edit another user's templates or foods.

### Known Issues

- Meal templates store item snapshots; editing a template after save is not implemented (archive + recreate).
- Weekly chart uses calendar Mon–Sun for the week containing the selected log date.
- No food database search or AI estimation yet (BIQ-0036+).

### Recommended Commit Message

```text
BIQ-0035 Add nutrition UX polish with templates, edits, and weekly view
```

---

## BIQ-0036 - Starter Food Catalog Search

Date: 2026-07-16  
Branch: main  
Status: Completed

### Summary

Added a searchable BuildIQ starter food catalog (~50 common whole foods) so users can find and log foods faster without typing macros manually.

### Purpose

Phase 5 nutrition logging UX. Manual macro entry is too slow for daily use. A curated starter catalog gives immediate search value before external APIs or AI food estimation (BIQ-0037).

### Changes

- Added `st_food_catalog` system food table with RLS (read-only for all users)
- Seeded ~50 common foods with serving labels and approximate macros
- Added optional `food_catalog_id` on `st_meal_entries` for catalog-sourced logs
- Added `lib/nutrition/foodCatalogSearch.ts` for ranked name/category search
- **Add food** panel now includes catalog search → pick result → prefill macros → log (manual entry still supported)

### Files Changed

- `supabase/migrations/20250716_022_food_catalog.sql`
- `lib/nutrition/foodCatalogSearch.ts`
- `lib/nutrition/macros.ts`
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

Run in Supabase SQL Editor (after BIQ-0034/0035 migrations):

- `supabase/migrations/20250716_022_food_catalog.sql`

Creates `st_food_catalog`, seeds starter foods, adds `st_meal_entries.food_catalog_id`.

### Testing Steps

1. Run migration `20250716_022` on Supabase.
2. **Nutrition** → **Add food** → search `chicken` → pick **Chicken breast** → confirm macros prefilled.
3. Adjust servings → **Log food** → confirm entry totals scale correctly.
4. Search `rice` → pick **Brown rice** → log → confirm `food_catalog_id` stored (optional Supabase check).
5. Search nonsense term → confirm manual entry fallback message appears.
6. Edit prefilled macros manually → log → confirm catalog link cleared if values changed.
7. **Save to my foods** still works after catalog pick (manual flow).
8. App works gracefully if migration not run yet (empty catalog, manual entry only).
9. Mobile: catalog results scroll and tap targets work.
10. Users cannot insert/update system catalog rows (RLS).

### Known Issues

- Starter catalog is approximate USDA-style values, not brand-specific packaged foods.
- No barcode scanning or external API yet.
- Catalog search only on Add food panel (not edit entry yet).
- AI natural-language food logging planned for BIQ-0037.

### Recommended Commit Message

```text
BIQ-0036 Add starter food catalog search for nutrition logging
```

---

## BIQ-0037 - AI Natural-Language Food Estimation

Date: 2026-07-16  
Branch: main  
Status: Completed

### Summary

Added server-side AI macro estimation so users can describe food in plain language (e.g. “6 oz chicken breast and rice”) and get calories, protein, carbs, and fat prefilled for logging.

### Purpose

Complete the nutrition logging UX vision from BuildIQ_Context.md. Catalog search (BIQ-0036) covers common staples; AI handles free-form descriptions and combined meals before AI Coach consumes nutrition context.

### Changes

- Added `lib/nutrition/aiFoodEstimate.ts` — prompt, JSON validation, macro clamping, wellness disclaimer
- Added `POST /api/nutrition/estimate` — authenticated OpenAI route (same pattern as program generator)
- **Add food** panel: describe food → **Estimate with AI** → review items → **Use** or **Log all**
- Single-item estimates auto-fill the manual form; multi-item estimates can log all at once
- AI notes stored on meal entries (`notes` column) for transparency
- Safety framing: general wellness estimates only, not medical or dietary advice

### Files Changed

- `lib/nutrition/aiFoodEstimate.ts`
- `app/api/nutrition/estimate/route.ts`
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

None (uses existing `st_meal_entries.notes`).

Requires `OPENAI_API_KEY` on the server (same as program generator).

### Testing Steps

1. Confirm `OPENAI_API_KEY` is set locally / on Vercel.
2. **Nutrition** → **Add food** → describe `6 oz chicken breast and 1 cup rice` → **Estimate with AI**.
3. Confirm calories/protein/carbs/fat appear with a disclaimer and optional notes.
4. **Use** an item → confirm manual form prefills → **Log food**.
5. Describe `2 eggs, 2 slices toast, and coffee with milk` → estimate → **Log all** if multiple items returned.
6. Empty/short description → validation error.
7. Sign out → AI button shows sign-in message.
8. Remove API key temporarily → friendly 503 error.
9. Mobile: textarea and result chips usable.
10. Verify logged entries include AI note in database when applicable.

### Known Issues

- Estimates are approximate; no brand-specific packaged food accuracy.
- No AI estimate on edit-entry flow yet.
- Uses `OPENAI_MODEL` env or defaults to `gpt-4o-mini`.

### Recommended Commit Message

```text
BIQ-0037 Add AI natural-language food macro estimation
```

---

## BIQ-0038 - Installable PWA App Shell

Date: 2026-07-16  
Branch: main  
Status: Completed

### Summary

Turned BuildIQ Health into an installable mobile app via PWA support: web manifest, generated app icons, standalone display mode, safe-area layout, and an install prompt for Android and iOS.

### Purpose

Phase 8 mobile launch prep. Users should be able to add BuildIQ to their home screen and use it full-screen like a native app without waiting for App Store / Play Store wrappers.

### Changes

- Added `public/manifest.webmanifest` with standalone display, theme colors, and icon references
- Added dynamic `app/icon.tsx` and `app/apple-icon.tsx` (BuildIQ branded PNG icons)
- Expanded `app/layout.tsx` metadata: manifest link, Apple web app tags, viewport fit for notched devices
- Added `InstallAppPrompt` — Chrome install button + iOS Share → Add to Home Screen guidance
- Safe-area CSS for sticky header and body padding in standalone mode
- `next.config.js` serves manifest with correct content type

### Files Changed

- `public/manifest.webmanifest`
- `app/icon.tsx`
- `app/apple-icon.tsx`
- `app/layout.tsx`
- `app/components/InstallAppPrompt.tsx`
- `app/globals.css`
- `next.config.js`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

None.

### Testing Steps

1. Run `npm run build && npm run start` (or deploy to Vercel with HTTPS).
2. Open on Android Chrome → confirm install banner appears → **Install** → app opens standalone without browser chrome.
3. Open on iPhone Safari → confirm banner shows Share → Add to Home Screen instructions → add icon → launch full-screen.
4. Confirm home screen icon shows BuildIQ branding.
5. Sign in, log a workout and meal → confirm sticky header respects notch/safe area.
6. Dismiss install banner → refresh → banner stays hidden until localStorage cleared.
7. After installing, banner should not show in standalone mode.

### Known Issues

- No offline service worker yet (requires auth-aware caching strategy).
- iOS does not expose a native install API; users must use Share → Add to Home Screen manually.
- App Store / Google Play native wrappers not started (future Phase 8 work).

### Recommended Commit Message

```text
BIQ-0038 Add installable PWA shell with manifest, icons, and install prompt
```

---

## BIQ-0039 - Rebrand BuiltIQ to BuildIQ

Date: 2026-07-16  
Branch: develop  
Status: Completed

### Summary

Renamed the product brand from BuiltIQ to **BuildIQ** across the app UI, PWA metadata, AI prompts, documentation, and Windows helper scripts.

### Purpose

Product naming uses **BuildIQ** as a single brand word (replacing BuiltIQ / BuiltIQ Health).

### Changes

- App header, auth screens, settings copy, install banner, and metadata now say **BuildIQ** / **BuildIQ Health**
- PWA manifest, layout metadata, and app icons updated for new branding
- Renamed Windows helper scripts: `buildiq-npm.cmd`, `buildiq-setup.cmd`, `buildiq-import.cmd`, etc.
- Renamed `BuiltIQ_Context.md` → `BuildIQ_Context.md`, `CURSOR_RULES_BUILTIQ.md` → `CURSOR_RULES_BUILDIQ.md`
- Env var `BUILDIQ_CATALOG_ADMIN_EMAILS` (legacy `BUILTIQ_CATALOG_ADMIN_EMAILS` still supported)
- Package name → `buildiq-app-shell-strength-functional`

### Files changed

- `app/page.tsx`, `app/layout.tsx`, `app/icon.tsx`, `app/apple-icon.tsx`
- `app/components/InstallAppPrompt.tsx`
- `lib/supabaseClient.ts`, `lib/training/catalogAdmin.ts`, `lib/training/catalogSources.ts`
- `lib/training/aiProgramPlan.ts`, `lib/training/scheduleSuggestion.ts`, `lib/nutrition/aiFoodEstimate.ts`
- `public/manifest.webmanifest`, `package.json`, `package-lock.json`, `.env.example`
- `buildiq-*.cmd` (replaced `builtiq-*.cmd`)
- `scripts/install-node-portable.cmd`, `scripts/install-node-portable.ps1`, `scripts/setup-windows.ps1`
- `scripts/import-exercises/*`
- `README.md`, `ROADMAP.md`, `DECISIONS.md`, `CHANGELOG.md`, `.cursorrules`, `.cursor/rules.md`
- `BuildIQ_Context.md`, `CURSOR_RULES_BUILDIQ.md`
- Selected migration SQL comments

### Database changes

None. Internal catalog source keys (`builtiq_essentials`, `builtiq_basic`, etc.) unchanged for data compatibility.

### Testing steps

1. Sign in — confirm header shows **BuildIQ** (Build with purple IQ).
2. Check browser tab title: **BuildIQ Health**.
3. Open install prompt — copy says **Install BuildIQ**.
4. Settings, AI Coach, and bug report copy reference **BuildIQ**.
5. Catalog source label shows **BuildIQ Essentials**.
6. Double-click `buildiq-setup.cmd` — npm install still works.
7. If using catalog admin import, set `BUILDIQ_CATALOG_ADMIN_EMAILS` (or keep legacy `BUILTIQ_CATALOG_ADMIN_EMAILS`).

### Known issues

- GitHub repo folder and remote URL still use `builtiq` (infrastructure rename not included).
- Portable Node installs to `%LOCALAPPDATA%\buildiq-node` — existing `builtiq-node` folder is not migrated automatically.
- Remembered email / install-dismiss localStorage keys changed; users may need to re-check remember-email or see install prompt once more.

### Recommended commit message

```text
BIQ-0039 Rebrand BuiltIQ to BuildIQ across app, docs, and scripts
```

---

## BIQ-0040 - Profile-Based Macro Goal Suggestions

Date: 2026-07-16  
Branch: main  
Status: Completed

### Summary

Nutrition goals can now be suggested from the user profile (weight, height, age, sex, primary goal, experience level) using Mifflin-St Jeor BMR and goal-based calorie/macro targets.

### Purpose

Reduce friction for new nutrition users and align macro targets with BuildIQ profile data instead of generic defaults only.

### Changes

- Added `lib/nutrition/goalSuggestions.ts` — BMR/TDEE estimates, goal adjustments, wellness framing
- **Nutrition** tab shows **Suggested macro goals** banner when profile has height/weight and goals are unset or still defaults
- **Apply suggested goals** saves to `st_nutrition_goals`; **Review & edit** opens goals form
- **Edit goals** includes **Fill from profile suggestion** when profile data is available

### Files Changed

- `lib/nutrition/goalSuggestions.ts`
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

None (reads existing `st_profiles`; writes existing `st_nutrition_goals`).

### Testing Steps

1. Sign in with a profile that has weight and height in **Settings → Profile**.
2. Open **Nutrition** with no custom goals (or default 2000/150/200/65) → confirm suggestion banner appears.
3. **Apply suggested goals** → confirm totals/progress bars use new targets.
4. Change primary goal in profile (fat loss vs muscle) → reload Nutrition → confirm suggestion shifts.
5. Profile missing height/weight → banner explains to complete profile; no crash.
6. **Edit goals** → **Fill from profile suggestion** prefills draft without saving until **Save goals**.
7. Mobile: banner and goal tiles readable; buttons tappable.

### Known Issues

- Activity level uses experience level as a proxy, not explicit daily activity input.
- Suggestions are general wellness guidance, not medical or dietitian prescriptions.
- No automatic re-sync when profile changes after goals are already customized.

### Recommended Commit Message

```text
BIQ-0040 Add profile-based macro goal suggestions for nutrition tracking
```

---

## BIQ-0041 - Barcode Lookup and Nutrition Label OCR

Date: 2026-07-16  
Branch: main  
Status: Completed

### Summary

Packaged foods can be logged by UPC/EAN barcode lookup (Open Food Facts) or by photographing the Nutrition Facts panel (OpenAI vision OCR).

### Purpose

Speed up logging for packaged foods where catalog search and AI text estimates are less accurate than the product label or barcode database.

### Changes

- Added `lib/nutrition/barcodeLookup.ts` — Open Food Facts lookup with serving/per-100g fallback
- Added `lib/nutrition/labelOcr.ts` — vision prompt and validation for Nutrition Facts photos
- Added `POST /api/nutrition/barcode` — authenticated barcode lookup
- Added `POST /api/nutrition/scan-label` — authenticated label OCR (requires `OPENAI_API_KEY`)
- **Add food** panel: manual barcode entry, camera scan (BarcodeDetector where supported), label photo upload
- Barcode miss → user guided to label OCR or manual entry; label OCR reuses AI result chips (**Use** / **Log all**)

### Files Changed

- `lib/nutrition/barcodeLookup.ts`
- `lib/nutrition/labelOcr.ts`
- `app/api/nutrition/barcode/route.ts`
- `app/api/nutrition/scan-label/route.ts`
- `app/components/NutritionBarcodeScanner.tsx`
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

None.

Requires network access to Open Food Facts for barcode lookup and `OPENAI_API_KEY` for label OCR.

### Testing Steps

1. **Nutrition** → **Add food** → enter a known UPC (e.g. common grocery item) → **Look up** → confirm name and macros prefilled.
2. On Chrome/Android (or desktop with webcam), **Scan with camera** → point at barcode → confirm auto lookup.
3. Unknown barcode → confirm friendly not-found message and label scan hint.
4. Take/upload a clear photo of a Nutrition Facts panel → confirm macros extracted → **Log food**.
5. Blurry or partial label → confirm readable error, manual entry still works.
6. Sign out → lookup/scan require sign-in message.
7. Mobile: barcode row, file input with camera capture, and scanner layout usable.
8. Verify logged entries store expected food name and macro values.

### Known Issues

- Camera barcode scan uses native `BarcodeDetector` (Chrome/Edge/Android; not Safari iOS) — manual UPC entry fallback on iOS.
- Open Food Facts coverage varies by region and brand; many US products present, not all.
- Label OCR accuracy depends on photo quality, glare, and dual-column labels.
- No USDA FoodData Central barcode API yet (Open Food Facts only).
- Barcode/label flows on edit-entry panel not added yet.

### Recommended Commit Message

```text
BIQ-0041 Add barcode lookup and nutrition label OCR for packaged foods
```

