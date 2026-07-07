# BuiltIQ Health Change Log

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

Created the initial documentation foundation for BuiltIQ Health so development can be tracked consistently as the app grows.

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

Phase 3 workout MVP work. Generated plans previously mixed warmup sets into every lift and used browser prompts for editing. Workouts needed clearer structure aligned with BuiltIQ training module design.

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

Added a shared exercise catalog with BuiltIQ system exercises and per-user custom exercises. Workout templates and logging now link to catalog entries so progress history aggregates by exercise identity, not free-text names alone.

### Purpose

Progress, PR tracking, and “last time” placeholders need a stable exercise identity. Free-text names split history when spelling differs or a user renames an exercise. A catalog gives canonical IDs while snapshots preserve the name shown at log time.

### Changes

- Added `st_exercise_catalog` with system and user-owned exercises
- Seeded BuiltIQ system exercises (template lifts + common starter library)
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
2. **System catalog** — open Training, search “Bench Press”, add from results; confirm BuiltIQ badge and muscle/equipment metadata
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
- System catalog is seed data only; admin tooling for BuiltIQ-managed exercises not built yet

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

Redesigned BuiltIQ from a configuration sidebar layout into a premium wellness dashboard with top navigation, personalized home cards, and program setup moved into Training.

### Purpose

BuiltIQ should feel like a wellness product on login — not a builder tool. Users land on a dashboard with today's workout and progress snapshot, while program setup lives in Training.

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
