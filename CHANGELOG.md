# BuildIQ Health Change Log

All meaningful product, code, database, design, and documentation changes should be tracked here.

Use the format:

```text
BIQ-0001 - Change Title
Date:
Branch:
Status:
```

## BIQ-0147 - Push Group Program Design to Selected Members

Date: 2026-09-03  
Branch: cursor/group-push-to-members-eaa7  
Status: Completed

### Summary

Group Program Design now works like personal design: build the week (AI or manual), then **Push to members**. Owners/managers pick specific athletes and either assign the shared group program or give each member a personal copy. Optional: also set as the group default for Follow Team Plan.

### Purpose

Coaches need to design one weekly health calendar, then send it only to the members who should use it — not rely on members discovering and following a shared program.

### How it works

1. Programs → Groups → create/edit a group program (same AI wizard + calendar as personal)
2. Open the calendar → **Push to members**
3. Choose Shared program (everyone uses this plan) or Personal copy each
4. Select one or more members (or Select all)
5. Optional: set as group default
6. Push — publishes the program if needed, assigns via existing `st_assign_member_program` / `st_customize_program_for_member`, and copies calendar activities onto personal copies

### Files Changed

- `lib/programDesign/pushToMembers.ts` (new)
- `app/components/programDesign/PushToMembersSheet.tsx` (new)
- `app/components/programDesign/ProgramCalendarEditor.tsx`
- `app/components/programDesign/ProgramDesignHome.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None. Reuses existing assignment RPCs and `st_program_activities`.

### Testing Steps

1. Programs → Groups → Create Group Program → build week with AI or manually
2. Calendar → Push to members → select 1–2 athletes → Shared → Push
3. Those members should see the assigned program in Groups / Training assignment
4. Repeat with Personal copy each — each gets an independent plan with calendar activities
5. Optional checkbox sets team default_program_id
6. Members without selection are unchanged

### Known Issues

- Members still load assigned programs through Groups/team assignment context; personal Training follow is separate
- Personal copies depend on `st_customize_program_for_member` existing in Supabase

### Recommended Commit Message

```text
BIQ-0147 Push group Program Design to selected members
```

---

## BIQ-0146 - Fix Import: Strip Missing Columns Dynamically

Date: 2026-09-03  
Branch: cursor/fix-import-column-fallback-eaa7  
Status: Completed

### Summary

Import still failed with `column st_planned_sets.rest_seconds does not exist` because the previous "safe" select still requested `rest_seconds`. That column is not in the base schema. The fetch now starts with core + optional columns and strips each missing column from the query until it succeeds. Planned set inserts only use base-schema fields (set_number, set_type, target_reps/weight/rpe).

### Purpose

Unblock attaching an existing strength program to Program Design strength days on databases that have not applied every optional column migration.

### Files Changed

- `lib/programDesign/importWorkouts.ts`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Programs → open calendar program → Import exercises from program
2. Select a published program with workouts (e.g. ET Full Body Push)
3. Preview shows week workouts and exercise names — no column error
4. Import exercises into my strength days → succeeds
5. Follow program → Training → Start Workout → exercises present

### Recommended Commit Message

```text
BIQ-0146 Fix import by stripping missing planned-set columns
```

---

## BIQ-0145 - Fix Vercel Build: Set Spread TypeScript Error

Date: 2026-09-03  
Branch: cursor/fix-set-spread-build-eaa7  
Status: Completed

### Summary

Fixes Vercel build failure: `Type 'Set<number>' can only be iterated through when using the '--downlevelIteration' flag`. Replaced `[...new Set()]` with `Array.from(new Set())` in import workout code.

### Files Changed

- `app/components/programDesign/ImportWorkoutsSheet.tsx`
- `lib/programDesign/importWorkouts.ts`
- `CHANGELOG.md`

### Recommended Commit Message

```text
BIQ-0145 Fix Vercel build Set spread TypeScript error
```

---

## BIQ-0144 - Fix Import: Missing Database Columns and Week Matching

Date: 2026-09-03  
Branch: cursor/fix-import-missing-columns-eaa7  
Status: Completed

### Summary

Fixes two bugs in the Import Exercises feature:
1. **"column st_planned_sets.target_duration_seconds does not exist"** — the import query requested columns that may not exist in all databases. Now retries with progressively fewer columns.
2. **"This program has no week 1 workouts to import"** — programs where workouts start at week numbers other than 1 were unusable. Now uses the lowest available week.

### Purpose

The import feature assumed all optional columns existed and that workouts always start at week 1. Real databases may not have all migration columns applied, and some programs use different week numbering.

### Files Changed

- `lib/programDesign/importWorkouts.ts` (modified — resilient column fallbacks for select, insert exercises, insert planned sets; flexible week matching)
- `app/components/programDesign/ImportWorkoutsSheet.tsx` (modified — show actual source week number; updated empty state message)
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Open import sheet → select a program → no column errors
2. Programs with workouts on week 2+ now show their workouts in preview
3. Import completes even when target_duration_seconds, exercise_type, superset columns don't exist
4. Preview shows "Week N workouts from …" with the correct week number

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0144 Fix import: resilient column fallbacks and flexible week matching
```

---

## BIQ-0143 - Auto-Prompt Import After Adding Strength Activity

Date: 2026-09-03  
Branch: cursor/attach-program-from-activity-sheet-eaa7  
Status: Completed

### Summary

When manually adding a Strength activity in the Calendar Editor, the "Import exercises from program" sheet now opens automatically right after the activity is saved. A hint in the Add Activity sheet tells users what will happen. This eliminates the confusion of adding a blank strength day and not knowing how to attach exercises.

### Purpose

Users who skip the AI wizard and add strength activities manually had no obvious path to connect their existing strength programs. Now the import prompt appears immediately after adding a strength day.

### Files Changed

- `app/components/programDesign/ProgramCalendarEditor.tsx` (modified — auto-open import sheet after new strength activity)
- `app/components/programDesign/AddActivitySheet.tsx` (modified — hint when strength type selected)
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Program Design → open a program → Calendar Editor
2. Tap "+" on any day → select Strength → see hint about importing
3. Save the activity → Import sheet opens automatically
4. Pick a source program → import exercises
5. If no programs available, sheet shows helpful message and can be closed
6. Non-strength activities (cardio, rest, etc.) do NOT trigger the import prompt

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0143 Auto-prompt import after adding strength activity
```

---

## BIQ-0142 - Bridge Strength Programs into Program Design Calendar

Date: 2026-09-03  
Branch: cursor/bridge-strength-workouts-eaa7  
Status: Completed

### Summary

Users can now import exercises from an existing strength program into their Program Design calendar's strength days. This bridges the gap between the old Program Setup (which builds full workouts with exercises, sets, and reps) and the new Program Design calendar (which schedules activities by day).

### Purpose

When a user creates a program in Program Design with strength days, those days had empty workout shells with no exercises. If they already built a strength program in Training → Program Setup, there was no way to connect it. This change adds an "Import exercises from program" button that copies week 1 workouts (exercises + planned sets) from any existing program into the matching strength days on the calendar.

### How it works

1. Open a program in Program Design → Calendar Editor
2. If the current week has strength activities, an "Import exercises from program" button appears
3. Click it → pick a source program from your library
4. Preview shows week 1 workouts with exercise counts and names
5. Click "Import exercises into my strength days" → exercises and planned sets are copied in
6. Matching is by day of week when possible (Mon→Mon), then by order for remaining days
7. Activity titles update to match the source workout type (e.g. "Upper Body", "Lower Body")

### Files Changed

- `lib/programDesign/importWorkouts.ts` (new — fetch source workouts, copy exercises + sets into target)
- `app/components/programDesign/ImportWorkoutsSheet.tsx` (new — program picker + preview + import UI)
- `app/components/programDesign/ProgramCalendarEditor.tsx` (modified — import button + sheet wiring)
- `app/globals.css` (modified — import sheet styles)
- `CHANGELOG.md`

### Database Changes

None. Reads from `st_workouts`, `st_exercises`, `st_planned_sets` and writes new rows into the same tables under the target program's workout IDs.

### Testing Steps

1. Build a strength program via Training → Program Setup (with exercises)
2. Create a new program in Program Design with strength days (via AI wizard or manually)
3. Open the calendar editor → "Import exercises from program" button visible
4. Click it → your old program appears in the list
5. Select it → preview shows week 1 workouts with exercise names
6. Click Import → exercises copied into your strength days
7. Follow the program → Training → open a strength day → exercises are there
8. Start Workout → exercises, sets, reps all present
9. Non-strength days (cardio, rest, etc.) are unaffected

### Known Issues

- Only week 1 workouts are imported; multi-week periodization requires Copy Week in the calendar
- If source program has more workout days than target strength days, extra workouts are skipped

### Recommended Commit Message

```text
BIQ-0142 Bridge strength programs into Program Design calendar
```

---

## BIQ-0141 - AI-Powered Program Activity Setup

Date: 2026-09-03  
Branch: cursor/ai-activity-setup-wizard-eaa7  
Status: Completed

### Summary

When creating a new program in Program Design, users now go through an AI-powered setup wizard before the calendar editor. Users describe their weekly plan in natural language (e.g. "strength training 3 days a week, cardio Tuesday Thursday, stretching Tuesday Thursday") and AI automatically creates activities on the correct days. After AI compiles the schedule, users review each day of the week and can drag activities between days or remove them before confirming.

### Purpose

Eliminate the need for manual activity-by-activity setup. The AI interprets the user's description and populates the weekly calendar automatically. Users review and adjust the result before it's saved, keeping them in control while removing tedious repetition.

### Files Changed

- `app/api/programs/suggest-activities/route.ts` (new — AI endpoint for parsing activity descriptions)
- `app/components/programDesign/AIProgramSetupWizard.tsx` (new — two-step wizard: describe → review week)
- `app/components/programDesign/ProgramDesignHome.tsx` (modified — wire AI wizard between program creation and calendar editor)
- `app/globals.css` (modified — wizard styles)
- `CHANGELOG.md`

### Database Changes

None. Uses existing `st_program_activities` table.

### Testing Steps

1. Program Design → Create Program → fill name, dates, cycle → Continue
2. AI wizard appears — type "strength training 3 days a week, cardio Tuesday Thursday"
3. Click "Build my week with AI" — loading state, then review screen
4. Review screen shows 7 days with activities placed by AI
5. Drag an activity from one day to another — it moves
6. Click × on an activity — it's removed, empty day becomes Rest
7. Click "Confirm and create calendar" — activities saved, calendar editor opens
8. Click "Skip — I'll add activities manually" — goes straight to calendar editor
9. Example buttons fill the description textarea
10. Mobile (~390px) — wizard and review cards stack vertically

### Known Issues

- AI suggestions depend on OPENAI_API_KEY being configured on the server
- Drag-and-drop is touch-unfriendly on mobile (tap-to-move planned for follow-up)

### Recommended Commit Message

```text
BIQ-0141 AI-powered program activity setup wizard
```

---

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

---

## BIQ-0042 - iPhone-Compatible Live Barcode Scanner (PWA)

Date: 2026-07-16  
Branch: main  
Status: Completed

### Summary

Replaced BarcodeDetector-only scanning with a cross-browser live camera scanner using `@zxing/browser` on iPhone Safari and Home Screen PWA, with native `BarcodeDetector` as progressive enhancement on supported browsers. Added full product review UI, serving adjustment, extended nutrients, and structured fallback flows.

### Purpose

BIQ-0041 barcode lookup worked on desktop/Android Chrome but failed as the primary iPhone PWA experience because iOS Safari does not support `BarcodeDetector`. Users need live rear-camera scanning from the installed app without choosing a scanning engine.

### Changes

- Added `@zxing/browser` for UPC-A, UPC-E, EAN-8, and EAN-13 decode from live video frames
- **Progressive enhancement:** `BarcodeDetector` when available; automatic ZXing fallback when not (no user engine choice)
- Camera starts only after **Scan Barcode** tap; rear camera via `facingMode: { ideal: "environment" }`; HTTPS required
- Live preview with visible scan guide; camera tracks stopped on close or successful read; duplicate reads locked after first decode
- Extended Open Food Facts lookup: alternate UPC-A/EAN-13 candidates without stripping meaningful leading zeros; fiber, sugar, sodium, product image
- **Product found UI:** name, brand, serving, image, macros, servings control, add to log, save food & log, review & edit
- **Product not found UI:** scan again, enter UPC manually, label photo, manual entry, save as custom food (fallbacks only — not primary flow)
- Specific error messages for permission denied, insecure context, camera unavailable, scanner init failure, etc.
- Label OCR remains server-side (`OPENAI_API_KEY` on Vercel only); scanner does not use OpenAI

### Files Changed

- `package.json`, `package-lock.json` — `@zxing/browser`
- `lib/nutrition/barcodeLookup.ts` — extended product model, UPC/EAN candidates, extra nutrients
- `lib/nutrition/barcodeScannerErrors.ts` — scanner error codes and messages
- `app/components/NutritionBarcodeScanner.tsx` — live scanner rewrite
- `app/components/NutritionBarcodeProduct.tsx` — product found / not found cards
- `app/components/NutritionTracker.tsx` — scan-first UX, product review, fallbacks
- `app/globals.css`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

None.

Requires HTTPS (Vercel production). Label OCR still requires `OPENAI_API_KEY` on the server.

### Testing Steps

#### iPhone Safari (browser)

1. Open `https://builtiq-duf7.vercel.app` (or latest production URL) in **Safari** over HTTPS.
2. Sign in → **Nutrition** → **Add food** or **+ Add to Lunch**.
3. Tap **Scan Barcode** → allow camera when prompted.
4. Confirm rear-camera live preview with purple scan guide (not a static “unsupported” message).
5. Scan a packaged **UPC-A** product → confirm lookup loading → product card with name, brand, serving, calories, protein, carbs, fat.
6. Change **Servings** → confirm macros scale → **Add to Lunch** → entry appears under Lunch.
7. Scan an unknown barcode → **Product not found** card with fallback buttons (not the primary flow).
8. Deny camera permission → confirm specific permission-denied message and fallback options.
9. Close scanner → reopen → confirm camera restarts cleanly.

#### iPhone Home Screen PWA

1. Install BuildIQ to Home Screen (Share → Add to Home Screen) if not already installed.
2. Launch from Home Screen icon (standalone mode).
3. Repeat steps 3–9 above in the installed PWA.
4. Confirm scanner works the same as Safari browser (live preview + successful UPC scan).

#### Android Chrome

1. Open production URL in Chrome → **Nutrition** → **Scan Barcode**.
2. Confirm scan works (may use native `BarcodeDetector` path).
3. Successful EAN-13 scan → product card → log food.

#### Desktop fallback

1. Open on desktop Chrome/Edge with webcam.
2. **Scan Barcode** → scan a product or confirm ZXing/BarcodeDetector initializes.
3. Use **Fallback options** → manual UPC entry → lookup succeeds.

#### Other cases

1. **Permission denial:** deny camera → readable error + fallbacks visible.
2. **Close/reopen:** close scanner mid-scan → tracks stop → reopen works.
3. **Label photo fallback:** unknown barcode → **Photograph nutrition label** → confirm OCR prefills manual form (requires `OPENAI_API_KEY`).
4. **Manual entry fallback:** product not found → **Enter nutrition manually** → manual form focused.
5. **Save as custom food:** not found → **Save as custom food** → form opens with save-to-library checked.

### Known Issues

- ZXing continuous decode may use more battery than native BarcodeDetector on Android.
- Open Food Facts coverage still varies; unknown products require fallbacks.
- UPC-E expansion to UPC-A not implemented (8-digit compressed codes may miss unless database has UPC-E form).
- Extended nutrients (fiber/sugar/sodium) stored in entry notes, not separate DB columns.

### Recommended Commit Message

```text
BIQ-0042 Add iPhone-compatible live barcode scanner with ZXing and product review UI
```

---

## BIQ-0043-P1 - Group Training Nav Foundation (Phase 1)

Date: 2026-07-17  
Branch: preview/groups-v2-biq-0043  
Status: Completed

### Summary

Introduced the Group Training platform foundation: shared permissions module (Owner / Manager / Member), renamed user-facing Team → Group, replaced the Team tab with a Groups management tab, and unified Training to Personal Training + Program Setup only.

### Purpose

Separate group management from workout logging so Training becomes the unified logging hub (personal + assigned group workouts in later phases) while Groups handles roster, compliance, and member performance for owners and managers.

### Changes

- Added `lib/groups/` — `types.ts`, `permissions.ts`, `index.ts` with `normalizeRole`, `roleLabel`, `canManageGroup`, `canLogWorkout`, `roleForDatabase` / `roleForUi` (DB keeps `editor` for RLS)
- Top nav: **Team** → **Groups**; removed legacy Team tab and Training → Team Training sub-tab
- **Groups tab:** group selector, invite code, compliance, roster, member dashboard (managers), plan source toggle
- **Training tab:** Personal Training + Program Setup; Assigned Workouts placeholder for Phase 4
- User-facing copy: Team → Group; editor → Manager; coach → manager where shown
- Settings: Groups create/join; role dropdown Owner / Manager / Member
- Dashboard: Group Compliance card links to Groups
- `assignmentTypeLabel`: Group Plan labels in `lib/training/exerciseTypes.ts`
- AI generate route accepts `manager` role and updated error copy

### Files Changed

- `lib/groups/types.ts` (new)
- `lib/groups/permissions.ts` (new)
- `lib/groups/index.ts` (new)
- `app/page.tsx`
- `lib/training/exerciseTypes.ts`
- `app/api/programs/generate/route.ts`
- `CHANGELOG.md`
- `DECISIONS.md`
- `ROADMAP.md`

### Database Changes

None. Tables remain `st_teams`, `st_team_members`, `st_program_assignments`.

### Testing Steps

- Sign in; confirm top nav shows **Groups** (not Team)
- Settings → Create Group / Join Group; confirm invite code and role labels (Owner / Manager / Member)
- Groups tab: select group, view compliance and roster; as manager, click member → dashboard → Open workout → lands in Training
- Training tab: only **Personal Training** and **Program Setup** sub-tabs; Assigned Workouts placeholder visible when in a group
- Log a personal workout; confirm set logs save
- Manager: open member workout from Groups, log a set on their behalf
- Dashboard Group Compliance card opens Groups tab
- Program Setup → Group program (manager only); AI/template generate still works
- Mobile: nav tabs and Groups roster readable on narrow viewport

### Known Issues

- Assigned Workouts section is a placeholder until BIQ-0043 Phase 4
- Internal code still uses `mode: 'team'` and table name `st_teams` (user-facing label is Group)
- Member invite/remove UI not yet built (Phase 3+)

### Recommended Commit Message

```text
BIQ-0043-P1 Add groups permission module and Group Training nav foundation
```

---

## BIQ-0043-P2 - Group Training Schema (Phase 2)

Date: 2026-07-17  
Branch: preview/groups-v2-biq-0043  
Status: Completed

### Summary

Added database foundation for Group Training: member participation flag, group classifications, workout assignments with recipient rows, program-assignment targeting columns, manager role backfill (`editor` → `manager`), and three RPCs. **No UI changes** — app behavior unchanged until Phase 3+.

### Purpose

Enable future Assigned Workouts delivery (P4), classification targeting (P5), and participation controls without another breaking schema pass. Keeps RLS aligned with Owner / Manager / Member.

### Changes

- `st_team_members.is_active_participant` (default `true`) — permission role vs training participation
- Backfill `role = 'manager'` where `role = 'editor'`; CHECK constraint `owner | manager | member`
- **`st_group_classifications`** — group-scoped tags (Pitchers, JV, Rehab, etc.)
- **`st_group_member_classifications`** — many-to-many member ↔ classification
- **`st_workout_assignments`** — one-time workout delivery with `target_type`, schedule/due dates, snapshot version
- **`st_assignment_recipients`** — per-user delivery + status (personal copy column reserved for P6)
- **`st_program_assignments`** — `target_type`, `target_classification_id`; existing rows backfilled to `individual`
- Updated `st_user_can_edit_team`, coach-read helpers, program/set-log RLS for `manager` role
- RPCs: `st_assign_workout_to_targets`, `st_promote_member_to_manager`, `st_set_member_participation`
- Updated `st_assign_member_program` to set `target_type = 'individual'`
- `lib/groups/schema.ts` — TypeScript types/constants for new tables
- `roleForDatabase()` now persists `manager` (not `editor`)

### Files Changed

- `supabase/migrations/20250717_023_group_training_schema.sql` (new)
- `lib/groups/types.ts`
- `lib/groups/permissions.ts`
- `lib/groups/schema.ts` (new)
- `lib/groups/index.ts`
- `CHANGELOG.md`
- `DECISIONS.md`
- `ROADMAP.md`

### Database Changes

**Apply migration:** run `20250717_023_group_training_schema.sql` in Supabase SQL Editor (or `supabase db push` if linked).

| Object | Action |
|--------|--------|
| `st_team_members.is_active_participant` | Added |
| `st_team_members.role` | Backfill + CHECK |
| `st_group_classifications` | New table + RLS |
| `st_group_member_classifications` | New table + RLS |
| `st_workout_assignments` | New table + RLS |
| `st_assignment_recipients` | New table + RLS |
| `st_program_assignments.target_type` | Added + backfill |
| `st_program_assignments.target_classification_id` | Added |
| RPCs | 3 new + 2 updated |

### Testing Steps (SQL — run in Supabase as authenticated users)

Use two test accounts: **Owner/Manager** (User A) and **Member** (User B) in the same group.

**1. Migration smoke**
- [ ] Migration runs without error on dev Supabase
- [ ] `select role, is_active_participant from st_team_members` — no `editor` rows remain; all active members `is_active_participant = true`
- [ ] `select target_type from st_program_assignments where is_active` — all `individual` or null backfilled

**2. Classifications (manager)**
- [ ] As User A: `insert into st_group_classifications (team_id, name, slug) values (...)` succeeds
- [ ] Link User B: insert into `st_group_member_classifications` succeeds
- [ ] As User B: can `select` classifications for their group
- [ ] As User B: cannot insert/update classifications (RLS denied)

**3. Participation RPC**
- [ ] As User A: `select st_set_member_participation(team_id, user_b, false)` — User B row updates
- [ ] As User B: same RPC fails with "Not authorized"

**4. Promote manager RPC**
- [ ] As Owner: `select st_promote_member_to_manager(team_id, user_b)` when User B is `member` → role becomes `manager`
- [ ] As Manager (non-owner): RPC fails "Only owner can promote"

**5. Workout assignment RPC**
- [ ] As User A: `select st_assign_workout_to_targets(team_id, workout_id, ..., 'individual', null, array[user_b]::uuid[], ...)` returns assignment UUID
- [ ] Verify `st_assignment_recipients` has one row for User B
- [ ] As User B: `select * from st_workout_assignments` — sees only assignments where they are a recipient
- [ ] As User B: cannot see other members' recipient rows for assignments not theirs
- [ ] As User A: `target_type = 'group'` creates recipients for all `is_active_participant = true` members

**6. Regression (P1 behavior)**
- [ ] `st_assign_member_program` still works from Groups UI
- [ ] Manager can still co-log member sets on group programs
- [ ] Settings role dropdown saves Owner / Manager / Member (writes `manager`, not `editor`)
- [ ] `npm run build` passes locally

**7. App UI (unchanged — expect no new screens)**
- [ ] Training / Groups / Settings behave as after P1
- [ ] Assigned Workouts placeholder still shows (no live assignments yet)

### Known Issues

- No UI for classifications, workout assignments, or participation toggle until P3–P5
- `st_assignment_instances` and copy-to-personal flow deferred to P6
- `st_assign_workout_to_targets` does not snapshot workout template yet (`template_snapshot_version` reserved)

### Recommended Commit Message

```text
BIQ-0043-P2 Add group classifications and workout assignment schema
```

---

## BIQ-0043-P3 - My Groups Hub (Phase 3)

Date: 2026-07-17  
Branch: preview/groups-v2-biq-0043  
Status: Completed

### Summary

Built the **My Groups** hub on the Groups tab: create/join forms (no `prompt()`), multi-group list/detail navigation, Owner/Manager vs Member views, roster management (remove member, participation toggle, role change), and extracted member dashboard. Removed group management from Settings and Program Setup create/join buttons.

### Purpose

Centralize all group lifecycle and roster management in the Groups tab so Training stays focused on logging and program setup. Managers get compliance and member dashboards in one place; members see a simplified view with Open Training.

### Changes

- **`app/components/groups/GroupsHub.tsx`** — list/detail hub, role-based panels, roster actions
- **`app/components/groups/GroupCreateJoinPanel.tsx`** — create/join forms with validation
- **`app/components/groups/GroupMemberDashboard.tsx`** — extracted manager member dashboard
- **`app/page.tsx`** — wire `GroupsHub`; `createTeam`/`joinTeam` accept form args; `removeMember`, `setMemberParticipation`; remove Settings Groups card and inline group panels
- **`supabase/migrations/20250717_024_group_remove_member.sql`** — `st_remove_group_member` RPC
- **`app/globals.css`** — `.groups-hub`, group cards, roster action layout

### Files Changed

- `app/components/groups/GroupsHub.tsx` (new)
- `app/components/groups/GroupCreateJoinPanel.tsx` (new)
- `app/components/groups/GroupMemberDashboard.tsx` (new)
- `app/page.tsx`
- `app/globals.css`
- `supabase/migrations/20250717_024_group_remove_member.sql` (new)
- `CHANGELOG.md`

### Database Changes

**Apply migration:** run `20250717_024_group_remove_member.sql` in Supabase SQL Editor before testing remove member.

| Object | Action |
|--------|--------|
| `st_remove_group_member(team_id, user_id)` | Added RPC — soft-removes member (`status = 'removed'`) |

### Testing Steps

1. **Empty state:** Sign in with no groups → Groups tab shows create/join forms (not Settings redirect).
2. **Create group:** Enter name → group created, lands on detail view with invite code and owner role.
3. **Join group:** Second account joins via invite code → appears in roster.
4. **Multi-group:** User in 2+ groups sees list → tap card → detail → “All groups” back.
5. **Manager view:** Owner/manager sees compliance metrics, member dashboard on row click, plan dropdown, participation checkbox, Remove button.
6. **Owner role:** Owner can change member roles via roster dropdown.
7. **Member view:** Regular member sees plan toggle, activity stats, limited roster; no compliance or remove controls.
8. **Open Training:** Member “Open Training” navigates to Training tab.
9. **Settings:** No Groups section; profile and catalog only.
10. **Program Setup:** Group program mode with no groups shows link to Groups tab (no Create/Join buttons).
11. **Remove member:** After migration 024, manager removes member → member disappears from roster.
12. **Mobile:** Groups list, forms, and roster actions readable on narrow viewport.

### Known Issues

- Classifications UI and workout assignment delivery still Phase 4–5
- Leave-group (self-remove) flow not built — owners cannot remove themselves via Remove button (by design)

### Recommended Commit Message

```text
BIQ-0043-P3 Add My Groups hub and move group management from Settings
```

---

## BIQ-0043-P4 - Assigned Workouts in Training (Phase 4)

Date: 2026-07-20  
Branch: preview/groups-v2-biq-0043  
Status: Completed

### Summary

Members see group-assigned workouts in **Training → Assigned Workouts**, can start/continue logging with the existing workout logger, and auto-complete recipient status when all sets are logged. Managers assign workouts from the **Groups** tab (whole group or selected members) via `st_assign_workout_to_targets`.

### Purpose

Deliver one-time group workout assignments into the unified Training logger — the core product split from Decision 026. Managers assign; members log in one place alongside their personal program.

### Changes

- **`AssignedWorkoutsPanel`** — member inbox in Training (pending/started/completed)
- **`GroupAssignWorkoutPanel`** — manager assign form on Groups detail (group or selected members)
- **`lib/groups/assignments.ts`** — assignment helpers, workout resolution, display labels
- **`app/page.tsx`** — load assignments, open/close assigned workout context, log with group `team_id`, auto-complete recipient
- **`GroupsHub`** — assign workout panel for managers
- **`app/globals.css`** — assigned workout + assign form styles

### Files Changed

- `app/components/groups/AssignedWorkoutsPanel.tsx` (new)
- `app/components/groups/GroupAssignWorkoutPanel.tsx` (new)
- `app/components/groups/GroupsHub.tsx`
- `lib/groups/assignments.ts` (new)
- `lib/groups/index.ts`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None — uses P2 schema and `st_assign_workout_to_targets` RPC. Ensure migration `20250717_023_group_training_schema.sql` is applied.

### Testing Steps

1. **Manager setup:** Owner/manager creates a group program in Training → Program Setup (Group program mode).
2. **Assign whole group:** Groups tab → Assign workout → pick workout → Whole group → Assign.
3. **Member inbox:** Member opens Training → Assigned Workouts shows the assignment with group name and date.
4. **Start logging:** Member taps Start → assigned workout banner appears, logger loads (read-only template).
5. **Complete:** Log all sets → recipient status becomes Completed; appears under Recently completed.
6. **Back to personal:** Back to personal program restores member's personal program below.
7. **Selected members:** Manager assigns to 1–2 members only → only those members see it.
8. **Regression:** Personal program logging still works; manager co-log on member view unchanged.

### Known Issues

- No workout template snapshot on assign yet (`template_snapshot_version` reserved)
- Personal copy of assigned workout deferred to Phase 6

### Recommended Commit Message

```text
BIQ-0043-P4 Add assigned workouts delivery in Training and manager assign UI
```

---

## BIQ-0043-P5 - Classification Targeting UI (Phase 5)

Date: 2026-07-20  
Branch: preview/groups-v2-biq-0043  
Status: Completed

### Summary

Managers can create **classifications** (Pitchers, JV, Rehab, etc.), tag members on the roster, and assign workouts to a **classification** target — in addition to whole group or selected members. Uses P2 `st_group_classifications`, `st_group_member_classifications`, and `st_assign_workout_to_targets` with `target_type = 'classification'`.

### Purpose

Enable segment-based coaching (sport teams, training groups, rehab tracks) without assigning workouts one member at a time. Completes the targeting model from Decision 026 / P2 schema.

### Changes

- **`GroupClassificationsPanel`** — create/delete classifications with member counts
- **Roster tag chips** — managers toggle member ↔ classification links; all members see tags on roster
- **`GroupAssignWorkoutPanel`** — new **Classification** send target with member count preview
- **`lib/groups/classifications.ts`** — slug helper, member count, display helpers
- **`app/page.tsx`** — load/save classifications and member links

### Files Changed

- `app/components/groups/GroupClassificationsPanel.tsx` (new)
- `app/components/groups/GroupAssignWorkoutPanel.tsx`
- `app/components/groups/GroupsHub.tsx`
- `lib/groups/classifications.ts` (new)
- `lib/groups/index.ts`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None — uses P2 tables and RPC. Ensure `20250717_023_group_training_schema.sql` is applied.

### Testing Steps

1. **Create classification:** Groups → Classifications → add "Pitchers".
2. **Tag members:** On roster, check Pitchers for 2 members → tags show in member subtitle.
3. **Assign to classification:** Assign workout → Classification → Pitchers → Assign.
4. **Recipient check:** Only tagged members see assignment in Training → Assigned Workouts.
5. **Untagged member:** Member not tagged does not receive assignment.
6. **Delete classification:** Delete tag → member links removed; assign dropdown updates.
7. **Duplicate slug:** Adding classification with same slug name fails gracefully (unique constraint).
8. **Member read-only:** Regular member sees tags on roster but cannot edit classifications.

### Known Issues

- Program assignment by classification not in UI yet (workout assignments only)
- No bulk import of classifications

### Follow-up fix (same branch)

- **Group program not showing in Training:** P1 accidentally forced `mode='personal'` on the Personal Training tab, hiding existing group programs. Fixed by syncing mode from `training_source`, adding an **Active plan** toggle on Training, and ensuring `setMyTrainingSource` reloads the correct program.

### Recommended Commit Message

```text
BIQ-0043-P5 Add group classifications and classification workout targeting
```

---

## BIQ-0043-P6 - Personal Copy of Assigned Workouts (Phase 6)

Date: 2026-07-21  
Branch: preview/groups-v2-biq-0043  
Status: Completed

### Summary

Members can **copy an assigned group workout into a personal one-week program**, customize exercises and sets, and still log against the group assignment. The copy is linked on `st_assignment_recipients.personal_copy_program_id` and reused on reopen.

### Purpose

Coaches assign a shared template; athletes often need to swap exercises (equipment, injury, preference) without losing assignment tracking. Personal copy keeps the group assignment context while allowing member-owned edits.

### Changes

- **`st_copy_assignment_to_personal` RPC** — atomic copy of one workout (exercises, planned sets, supersets) into a personal program; idempotent if copy already exists
- **`lib/groups/assignments.ts`** — `personal_copy_program_id` on row type, `assignedHasPersonalCopy`, `copyAssignmentToPersonal`
- **`openAssignedWorkout` / `canEdit`** — load personal copy when present; enable structure edits on copy only; group template stays read-only
- **`AssignedWorkoutsPanel`** — Copy action + personal copy badge on open assignments
- **Assigned workout banner** — copy CTA, read-only vs personal-copy messaging
- **Logging** — unchanged: logs still attach group `team_id` from the assignment

### Files Changed

- `supabase/migrations/20250717_025_copy_assignment_to_personal.sql` (new)
- `lib/groups/assignments.ts`
- `app/page.tsx`
- `app/components/groups/AssignedWorkoutsPanel.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

- New RPC: `st_copy_assignment_to_personal(p_recipient_id uuid) returns uuid`
- Uses existing `st_assignment_recipients.personal_copy_program_id` column from P2

Apply migration `20250717_025_copy_assignment_to_personal.sql` in Supabase before testing.

### Testing Steps

1. **Assign workout:** Manager assigns a group workout to a member (P4/P5 flow).
2. **Read-only open:** Member taps Start → sees assigned banner with read-only template (no add/remove exercise).
3. **Copy:** Tap **Copy to personal plan** (banner or Assigned Workouts row) → personal copy loads; member can add/replace exercises and edit sets.
4. **Reopen:** Back out and Continue → same personal copy loads (not group template).
5. **Log & complete:** Log all sets on personal copy → recipient status becomes Completed; group `team_id` on logs preserved.
6. **Idempotent copy:** Tap Copy again on same assignment → no duplicate program; existing copy reused.
7. **Regression:** Personal program and group program logging unchanged when not in assigned context.

### Known Issues

- Logs started on the group template before copy do not transfer to the personal copy (new planned set IDs)
- `st_assignment_instances` deferred; copy is one program per recipient per assignment

### Recommended Commit Message

```text
BIQ-0043-P6 Add personal copy of assigned workouts for member customization
```

---

## BIQ-0043-P7 - Member Performance Dashboard (Phase 7)

Date: 2026-07-21  
Branch: preview/groups-v2-biq-0043  
Status: Completed

### Summary

Managers see **assignment compliance, PRs, 8-week volume trends, and recent workout history** when opening a member from the Groups roster. Roster rows show **New PR**, open assignment count, and overdue badges.

### Purpose

Complete the Groups management hub with performance visibility — compliance for assigned workouts plus strength progress reused from the Progress tab analytics.

### Changes

- **`lib/groups/memberPerformance.ts`** — fetch logs/assignments, compliance math, history, roster meta
- **`MemberPerformancePanel.tsx`** — assignment compliance + reuses `ProgressInsights` + history list
- **`GroupMemberDashboard.tsx`** — embeds performance panel for managers
- **`GroupsHub.tsx`** — roster badges (PR, assigned, overdue)
- **`app/page.tsx`** — load member performance bundle and roster meta

### Files Changed

- `lib/groups/memberPerformance.ts` (new)
- `lib/groups/index.ts`
- `app/components/groups/MemberPerformancePanel.tsx` (new)
- `app/components/groups/GroupMemberDashboard.tsx`
- `app/components/groups/GroupsHub.tsx`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

None — uses existing `st_set_logs`, `st_assignment_recipients`, `st_workout_assignments`.

### Testing Steps

1. Manager opens member from roster → sees assignment compliance, PRs, trends, history.
2. Member with recent max weight → roster shows **New PR** badge.
3. Member with open assignments → roster shows assignment count; overdue if past due date.
4. Member with no logs → empty states, no errors.
5. Regression: member self-view and Training logging unchanged.

### Known Issues

- PR/trend analytics use all member logs (not group-scoped only) for richer history
- Roster meta refreshes on Groups tab load / member refresh, not live on every log

### Recommended Commit Message

```text
BIQ-0043-P7 Add member performance dashboard for group managers
```

---

## BIQ-0043-P8 - AI Readiness Metadata Hooks (Phase 8)

Date: 2026-07-21  
Branch: preview/groups-v2-biq-0043  
Status: Completed

### Summary

Added **`coaching_metadata` JSONB** on group assignments, program assignments, and teams. Extended assign RPCs to accept metadata. **No AI UI** — structure only for future AI Coach integration.

### Purpose

Prepare group/program assignment rows for future AI progression and coaching without shipping AI features in this epic.

### Changes

- **Migration `20250717_026_group_ai_metadata_hooks.sql`** — columns + RPC param `p_coaching_metadata`
- **`lib/groups/aiMetadata.ts`** — TypeScript types and normalize helpers
- **`lib/groups/schema.ts`** — `coaching_metadata` on workout assignment type
- **`app/page.tsx`** — passes `{}` on assign calls (defaults preserved)

### Files Changed

- `supabase/migrations/20250717_026_group_ai_metadata_hooks.sql` (new)
- `lib/groups/aiMetadata.ts` (new)
- `lib/groups/schema.ts`
- `lib/groups/index.ts`
- `app/page.tsx`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

- `st_workout_assignments.coaching_metadata jsonb default '{}'`
- `st_program_assignments.coaching_metadata jsonb default '{}'`
- `st_teams.coaching_metadata jsonb default '{}'`
- `st_assign_workout_to_targets` + `st_assign_member_program` accept `p_coaching_metadata`

Apply migration `20250717_026_group_ai_metadata_hooks.sql` in Supabase.

### Testing Steps

1. Apply migration; existing rows default to `{}`.
2. Assign workout / member program → succeeds (metadata defaults empty).
3. App behavior unchanged for users.
4. Optional SQL: set metadata on assignment row → persists.

### Known Issues

- No UI to edit assignment metadata yet (future AI/admin work)
- `st_assignment_instances` still deferred

### Recommended Commit Message

```text
BIQ-0043-P8 Add coaching_metadata hooks on group assignments for future AI
```

---

## BIQ-0043-P3 follow-up - Remove duplicate plan toggle from Groups

Date: 2026-07-21  
Branch: preview/groups-v2-biq-0043  
Status: Completed

### Summary

Removed the **My training plan** card from the Groups tab (duplicate of Training → **Active plan**). Per Decision 026, Groups is management-only; members choose group vs personal program in Training.

### What stayed

- `training_source` in database and **Active plan** toggle on Training
- Manager roster dropdown (Group / Personal per member)
- Compliance metrics (On group plan / Personal plan)

### Files Changed

- `app/components/groups/GroupsHub.tsx`
- `app/page.tsx`
- `docs/BIQ-0043-QA-Checklist.csv`
- `CHANGELOG.md`

### Recommended Commit Message

```text
BIQ-0043 Remove duplicate My training plan card from Groups tab
```

### Deploy note

2026-07-21: Commit `93a881b` reached GitHub but did not appear in Vercel; follow-up push with this changelog entry to trigger preview redeploy.

---

## BIQ-0044 - Nutrition Dashboard Circular Progress Rings

Date: 2026-07-21  
Branch: preview/groups-v2-biq-0043  
Status: Completed

### Summary

Replaced the top-of-page numeric tiles and horizontal macro bars with a responsive 2×2 grid of animated circular progress rings for calories, protein, carbs, and fat. Reordered the Nutrition screen so daily progress is visible first, followed by remaining calories, meal logs, food library tools, and weekly history.

### Purpose

Users should understand daily nutrition progress within seconds of opening Nutrition. Visual rings communicate goal status faster than tables of numbers while preserving all logging, barcode, AI, and history features.

### Changes

- Added `NutritionMacroRing` and `NutritionMacroDashboard` components with SVG rings
- Added `lib/nutrition/macroRing.ts` for arc math, status colors, and remaining-calorie copy
- Ring colors: primary purple (0–89%), green (90–100%), amber when over goal
- Added compact daily calories remaining strip below the dashboard
- Reordered sections: dashboard → remaining → meals → templates/my foods → weekly chart
- Removed legacy `MacroBar` horizontal progress bars from the summary card

### Files Changed

- `app/components/NutritionMacroRing.tsx` (new)
- `app/components/NutritionMacroDashboard.tsx` (new)
- `app/components/NutritionTracker.tsx`
- `lib/nutrition/macroRing.ts` (new)
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

- Open Nutrition on mobile and desktop; confirm four rings fit above the fold on common phone sizes
- Log food and confirm rings animate smoothly when totals change
- Set goals and verify ring fill matches consumed ÷ goal
- Confirm purple below 90%, green from 90–100%, amber when slightly over goal
- Confirm remaining calories strip shows “X Remaining” or “X Over”
- Verify meal cards, Add food modal, barcode scan, templates, my foods, and weekly history still work
- Change dates and confirm rings reflect the selected day

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0044 Add circular macro progress dashboard to Nutrition screen
```

---

## BIQ-0045 - Paginate exercise catalog load (fix missing search results)

Date: 2026-07-21  
Branch: main  
Status: Completed

### Summary

Fixed exercise search missing entries (e.g. **Seated Calf Raise**) that exist in Supabase but not in the app. The client loaded only the first 1,000 catalog rows (PostgREST default); with Guided + Photo libraries combined (~2,200 rows), exercises late in the alphabet were never fetched.

### Purpose

Users reported exercises visible in the database SQL editor but not findable in Add Exercise search.

### Changes

- **`lib/training/catalogFetch.ts`** — `fetchAllExerciseCatalog()` paginates in 1,000-row chunks until the full catalog is loaded
- **`app/page.tsx`** — `loadCatalog()` uses paginated fetch
- **`app/api/programs/generate/route.ts`** — AI program generation uses the same paginated fetch

### Files changed

- `lib/training/catalogFetch.ts` (new)
- `app/page.tsx`
- `app/api/programs/generate/route.ts`
- `CHANGELOG.md`

### Database changes

None.

### Testing steps

1. Confirm Supabase has 1,000+ system exercises (Guided + Photo libraries imported)
2. Refresh the app (or open Settings to trigger catalog reload)
3. Training → Add Exercise → search **seated calf** — **Seated Calf Raise** should appear
4. Search placeholder count should reflect full catalog (~2,000+ if both libraries imported)
5. Generate an AI program — verify it can still pick catalog exercises normally

### Known issues

- Add Exercise search still respects profile **equipment** filters. Seated Calf Raise requires **Machines** (or Full gym); home-gym profiles without machines will not show machine-only exercises even after this fix.

### Recommended commit message

```text
BIQ-0045 Paginate exercise catalog load to fix missing search results
```

---

## BIQ-0046 - Use BuildIQ Health as full product name in UI

Date: 2026-07-21  
Branch: develop  
Status: Completed

### Summary

Updated user-facing branding so the product reads as **BuildIQ Health** (not BuildIQ alone): header logo, in-app copy, PWA short name, install prompt, and related error messages.

### Purpose

The full product name should consistently include **Health** after BuildIQ for clearer wellness positioning.

### Changes

- Header brand: `BuildIQ Health` (Build + purple IQ + Health)
- Profile setup, AI Coach, Settings, bug report, and catalog search copy use **BuildIQ Health**
- PWA `short_name` and Apple web app title → **BuildIQ Health**
- Install prompt, Supabase config error, barcode camera hints updated
- Decision 001 and `BuildIQ_Context.md` aligned with full name

### Files changed

- `app/page.tsx`, `app/layout.tsx`, `app/components/InstallAppPrompt.tsx`
- `public/manifest.webmanifest`
- `lib/supabaseClient.ts`, `lib/nutrition/barcodeScannerErrors.ts`, `lib/training/aiProgramPlan.ts`
- `app/api/catalog/import-guided/route.ts`
- `buildiq-setup.cmd`, `buildiq-import-guided.cmd`
- `DECISIONS.md`, `BuildIQ_Context.md`, `.cursor/rules.md`
- `CHANGELOG.md`

### Database changes

None.

### Testing steps

1. Sign in — header shows **BuildIQ Health**
2. Browser tab and home screen install name: **BuildIQ Health**
3. Install banner: **Install BuildIQ Health**
4. Profile setup button: **Continue to BuildIQ Health**
5. iOS camera hint references **BuildIQ Health** in Settings path

### Known issues

- App icons still show **BuildIQ** only (limited space on 180px icon)
- Catalog pack label remains **BuildIQ Essentials** (library name, not app name)

### Recommended commit message

```text
BIQ-0046 Show BuildIQ Health as full product name in app UI and PWA
```

---

## BIQ-0047 - Compact Workout Logging UI

Date: 2026-07-21  
Branch: develop  
Status: Completed

### Summary

Refined the Training workout logger for faster mobile logging: compact weight/reps fields, reorganized set rows, exercise-level notes, and auto-collapse when an exercise is fully logged.

### Purpose

Reduce scrolling and visual clutter during active training so users can log sets quickly with fewer taps while preserving all existing log functionality.

### Changes

- **Field sizing:** Weight, reps, duration, HR, and similar numeric fields use compact inputs sized for typical values
- **Set row layout:** Weight and reps sit side-by-side; Copy last is inline with metrics; delete (×) sits next to set type; Done stays on the right
- **Exercise notes:** Single notes field above the first set (saved on set 1) instead of repeating per set
- **Auto-collapse:** When all sets for an exercise are completed, the card collapses with a ✓ summary and the next exercise expands + scrolls into view
- **CSS:** Tighter set cards, flex-based compact field rows that stay side-by-side on mobile

### Files changed

- `app/components/WorkoutSetLogger.tsx`
- `lib/training/logFieldUI.ts`
- `app/globals.css`
- `app/page.tsx`
- `CHANGELOG.md`

### Database changes

None.

### Testing steps

1. Open Training → log a strength exercise on a phone-width viewport
2. Confirm weight and reps appear compact on one row; Copy last is beside them
3. Confirm delete (×) is next to set type; Done is on the right
4. Confirm notes appear once above set 1, not on every set
5. Log all sets for an exercise — card should collapse with ✓ and next exercise should expand
6. Verify RPE chips, copy last, auto-save, and set type editing still work
7. Test cardio/bodyweight/mobility exercise types for layout regressions

### Known issues

- Exercise notes are stored on the first set’s log row only (existing data model); older per-set notes on sets 2+ are not merged into the exercise notes field automatically

### Recommended commit message

```text
BIQ-0047 Compact workout logging UI for faster mobile set entry
```

---

## BIQ-0048 - Set Row Layout and Set Type Acronyms

Date: 2026-07-21  
Branch: develop  
Status: Completed

### Summary

Refined set row controls: Copy last beside set type, remove (×) after Copy last, Done checkbox to the right of RPE/intensity chips, and compact set-type acronyms during logging with full names in the type picker.

### Purpose

Further reduce header clutter and make set types scannable during active training while keeping full descriptive labels when choosing a set type.

### Changes

- Set header order: **Set # → type acronym → Copy last → ×**
- **Done** moved to the right of RPE / intensity / side chip rows
- New set type acronyms: WU, WK, BO, DS, AMRAP (full names in picker menu)
- `SetTypePicker` shows acronym when closed; dropdown lists acronym + full label
- Auto-advance scroll targets the **exercise header** (`block: start`) so the next exercise name stays visible above the set logger

### Files changed

- `lib/training/setTypes.ts` (new)
- `app/components/WorkoutSetLogger.tsx`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database changes

None (set_type values unchanged: warmup, working, backoff, dropset, amrap).

### Testing steps

1. Log a strength set — type shows **WK** (or current acronym); tap to open picker with full names
2. Confirm **Copy last** is beside set type; **×** is to its right (when editing program)
3. Confirm **Done** sits to the right of RPE chips
4. Test cardio (intensity chips) and mobility (side chips) for Done placement
5. Test timed/custom exercises (no chips) — Done stays in set header
6. Complete the last set of an exercise — view scrolls to the **next exercise name** at the top, not the first set row

### Known issues

None.

### Recommended commit message

```text
BIQ-0048 Set row layout tweaks and set type acronyms for logging
```

---

## BIQ-0049 - Set Row Actions Rail Alignment

Date: 2026-07-21  
Branch: develop  
Status: Completed

### Summary

Aligned remove (×) and Done in a shared right rail; placed Done beside RPE chips; added 5ch gap between weight and reps.

### Files changed

- `app/components/WorkoutSetLogger.tsx`
- `app/globals.css`

### Database changes

None.

### Recommended commit message

```text
BIQ-0049 Align set row actions rail with RPE and widen weight-reps gap
```

---

## BIQ-0050 - Stabilize Workout Logging UX

Date: 2026-07-22  
Branch: develop  
Status: Completed

### Summary

Fixed jumpy set inputs, manual-only Done completion, smoother exercise advance scroll, clearer exercise context, and a streamlined warmup list view.

### Purpose

Make active workout logging feel stable on mobile: keep focus while typing, only collapse after explicit Done, and reduce friction for warmup/stretch work.

### Changes

- **Input stability:** Local draft state so auto-save no longer kicks users out of fields
- **Previous values:** Last weight/reps show as dim placeholders (no "Last" prefix)
- **Manual Done only:** Typing no longer auto-completes sets or collapses exercises
- **Auto-advance:** Only when Done is checked on the final set; scroll uses `block: center`
- **Exercise context:** Readable Last session / Suggested next / Logged today panel
- **Warmup section:** Target list + optional notes, no per-set Done checkboxes

### Files changed

- `app/components/WorkoutSetLogger.tsx`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database changes

None.

### Testing steps

1. Type in weight/reps without losing focus
2. Previous values show as faint placeholders only
3. Sets do not auto-complete until Done is checked
4. Last set Done collapses exercise and scrolls next name into view
5. Warm Up section shows list view without Done checkboxes

### Recommended commit message

```text
BIQ-0050 Stabilize workout logging inputs and streamline warmup view
```

---

## BIQ-0051 - Nutrition Dashboard Swipe Refinement

Date: 2026-07-22  
Branch: preview/workout-logging-biq-0047  
Status: Completed

### Summary

Tightened nutrition day-change swipe so only deliberate horizontal swipes on the circular progress dashboard change dates, preventing accidental day switches while scrolling meal logs.

### Purpose

Subtle touches anywhere on the Nutrition screen were advancing or going back a day. Swipe should feel intentional and limited to the macro rings header area.

### Changes

- Moved swipe handlers from the full Nutrition page to the dashboard header + rings zone only
- Raised minimum horizontal distance and require horizontal movement to dominate vertical drift
- Ignore swipes while a day refresh is in progress; reset touch state on cancel

### Files Changed

- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

- Swipe lightly on meal cards or weekly chart — day should not change
- Scroll vertically through meals — no accidental day change
- Deliberate horizontal swipe on the macro rings area — previous/next day with animation
- Tap ‹ › arrows — still changes day normally
- Swipe during day load — ignored until refresh completes

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0051 Refine nutrition dashboard swipe to prevent accidental day changes
```

---

## BIQ-0052 - Mobility Context Cleanup and PR Celebration Toast

Date: 2026-07-22  
Branch: main  
Status: Completed

### Summary

Hides last-session context and previous-set hints for mobility and stretching exercises. Shows a congratulatory toast when a completed strength set beats a personal record.

### Purpose

Mobility and stretch work should not show strength progression boxes. Athletes should get immediate positive feedback when they hit a new PR during active logging.

### Changes

- **`isMobilityStretchExercise`:** Detects mobility type and stretching/mobility catalog categories
- **Exercise context panel:** Hidden for mobility/stretch exercises (Last session, Suggested next, Logged today)
- **Set logger:** Hides Copy last and dim previous-value placeholders for mobility/stretch
- **`detectSetPersonalRecord`:** Compares completed sets against prior history for weight, reps, volume, and est. 1RM PRs
- **PR toast:** Purple celebration banner appears when Done is checked on a new PR (auto-dismiss ~4.5s)

### Files Changed

- `lib/training/exerciseTypes.ts`
- `lib/training/progressAnalytics.ts`
- `app/components/WorkoutSetLogger.tsx`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

- Open a Mobility day or cooldown stretch — confirm no Last session / Logged today panel
- Log a stretch — confirm no Copy last button or dim previous placeholders
- Log a strength exercise and check Done with a weight/reps combo above your history — PR toast appears
- Re-check Done on the same set without changing values — toast should not repeat
- Uncheck Done — no toast

### Known Issues

- PR toast uses lb/kg from profile units; est. 1RM uses standard formula from Progress tab
- Bodyweight exercises count toward PR detection when weight/reps are logged

### Recommended Commit Message

```text
BIQ-0052 Hide mobility last-session hints and celebrate set PRs with toast
```

---

## BIQ-0053 - Program Draft and Publish Workflow

Date: 2026-07-22  
Branch: main  
Status: Completed

### Summary

Programs can be created and saved as **drafts** in Program Setup before they appear in Personal Training or as a group active program. Owners and managers edit draft workouts, then **publish** when ready.

### Purpose

Let coaches and athletes build an exercise plan privately, refine it, and only make it available to themselves or their group when finalized.

### Changes

- **`st_programs.status`:** New column (`draft`, `published`, `archived`); existing programs backfilled to `published`
- **RLS:** Team members cannot read draft group programs; owners/managers can
- **Program Setup:** AI and template creation save as draft; wizard step renamed to Create; draft card with Edit workouts / Publish actions
- **Training:** Published programs only, except when explicitly editing a draft
- **Group active program:** Dropdown lists published programs only

### Files Changed

- `supabase/migrations/20250722_027_program_draft_status.sql`
- `lib/training/programStatus.ts`
- `lib/training/aiProgramPlan.ts`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

Apply migration `20250722_027_program_draft_status.sql` in Supabase.

### Testing Steps

1. Program Setup → create draft with AI or template — stays in Setup with Draft badge
2. Edit workouts on draft — exercises editable; not visible in normal Personal Training until published
3. Publish program — appears in Personal Training (or group active dropdown)
4. Group: publish & set group active — members on group plan see the program
5. Member cannot see manager's draft group program

### Known Issues

- Archived status exists in schema but has no UI yet
- Migration required for full draft/publish workflow; without `20250722_027`, programs save as published with a one-time notice

### Follow-up fix (2026-07-22)

- Template/AI create retries without `status` when migration 027 is not applied yet (fixes insert error on Create draft from template)
- Clearer validation if schedule days are missing

### Recommended Commit Message

```text
BIQ-0053 Add program draft and publish workflow in Program Setup
```

---

## BIQ-0054 - Bug Report Admin Inbox and Email Alerts

Date: 2026-07-22  
Branch: develop  
Status: Completed

### Summary

Platform admins can review all in-app bug reports from **Settings → Bug reports**, update status, and receive email alerts when users submit new reports.

### Purpose

Make bug reports actionable without opening Supabase manually, and notify admins immediately when something breaks in production.

### Changes

- **`BUILDIQ_ADMIN_EMAILS`:** Shared platform admin allowlist (falls back to legacy `BUILDIQ_CATALOG_ADMIN_EMAILS`)
- **Admin API:** `GET/PATCH /api/bug-reports/admin` lists all reports and updates status via service role
- **Email alerts:** New reports trigger Resend email to `BUILDIQ_BUG_REPORT_NOTIFY_EMAILS` (or admin emails)
- **Settings UI:** Admin-only bug report inbox with status workflow (`open`, `triaged`, `resolved`, `closed`)

### Files Changed

- `lib/appAdmin.ts` — new
- `lib/email/sendEmail.ts` — new (Resend HTTP API)
- `lib/email/bugReportNotification.ts` — new
- `lib/supabaseServer.ts` — shared `createServiceRoleSupabase`
- `lib/training/catalogAdmin.ts` — delegates to `appAdmin`
- `lib/training/guidedCatalogImport.ts` — re-export service role helper
- `app/api/bug-reports/route.ts` — send email after insert
- `app/api/bug-reports/admin/route.ts` — new
- `app/components/BugReportsAdmin.tsx` — new
- `app/page.tsx` — Settings admin inbox
- `app/globals.css` — bug admin styles
- `.env.example`
- `CHANGELOG.md`

### Database Changes

None (uses existing `st_bug_reports` table).

### Testing Steps

1. Add your email to `BUILDIQ_ADMIN_EMAILS` in `.env.local`
2. Add `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and `BUILDIQ_EMAIL_FROM`
3. Restart the app and sign in as an admin
4. Open **Settings** — confirm **Bug reports** card appears
5. Submit a bug from the floating **Bug** button as a test user
6. Confirm the report appears in the admin inbox with reporter email and context
7. Change status to **triaged** and save
8. Confirm admin notification email arrives (check spam if using Resend sandbox)
9. Sign in as a non-admin — confirm the Bug reports card is hidden
10. `npm run build` passes

### Known Issues

- Admin access is still env-based (same as catalog import); database-backed roles remain on the roadmap (BIQ-0032)
- Email requires a Resend account and verified sender domain for production
- Bug report submission still succeeds if email delivery fails (logged server-side)

### Recommended Commit Message

```text
BIQ-0054 Add bug report admin inbox and email alerts
```

---

## BIQ-0055 - Fix AI Program Generation 504 Timeouts

Date: 2026-07-22  
Branch: develop  
Status: Completed

### Summary

Fixed AI program generation timing out with **504** on multi-week plans by batching database writes and tightening OpenAI/retry time budgets.

### Purpose

Users reported `Generation failed (504)` during Program Setup. The route was exceeding hosting timeouts because OpenAI generated large multi-week JSON payloads and persistence issued hundreds of sequential Supabase inserts.

### Changes

- **Batch persist:** AI program save now bulk-inserts all exercises and planned sets (2–3 DB round trips instead of hundreds)
- **OpenAI timeout:** 45s client timeout with clearer 502 message when the model is slow
- **Retry guard:** Skip validation retry when less than ~18s remains in the route budget
- **UI:** 504 errors suggest trying fewer weeks (e.g. 4) before retrying

### Files Changed

- `lib/training/aiProgramPlan.ts`
- `app/api/programs/generate/route.ts`
- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Program Setup → Generate with AI using default **6 weeks** and 3 training days
2. Confirm generation completes without 504
3. Open the saved draft — verify workouts, exercises, and planned sets exist
4. Retry with 8–12 weeks on a deployed preview and confirm success or a JSON error (not 504)
5. `npm run build` passes

### Known Issues

- Very large plans (12 weeks × many days) may still hit the 60s hosting limit on some platforms; reduce weeks if needed
- OpenAI latency spikes can still cause timeouts during peak load

### Recommended Commit Message

```text
BIQ-0055 Batch AI program persistence to fix 504 timeouts
```

---

## BIQ-0056 - Expand Long AI Programs From Week 1 Template

Date: 2026-07-23  
Branch: main  
Status: Completed

### Summary

Plans **longer than 4 weeks** no longer ask OpenAI for every week at once. The API generates **week 1 only**, then BuildIQ expands it into the full program — avoiding 504 timeouts on 6-week plans.

### Purpose

Users still hit **504** at 6 weeks even after BIQ-0055 batching, because the model was outputting 18 full workouts in one JSON payload.

### Changes

- **`aiGenerationWeeks()`:** 1–4 weeks = full AI generation; 5+ weeks = week 1 template only
- **`expandPlanToFullWeeks()`:** Clones week 1 into remaining weeks via existing `repairAiPlan`
- **Route:** Lower max_tokens for template mode; skip validation retry when expanding; `maxDuration` 120s
- **UI:** Review step explains 5+ week behavior; clearer timeout message (no “use 4 weeks” dead-end)

### Files Changed

- `lib/training/aiProgramPlan.ts`
- `app/api/programs/generate/route.ts`
- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Program Setup → **6 weeks**, 3 days → Create draft with AI — completes without 504
2. Open draft — verify **6 weeks** of workouts exist
3. **4 weeks** — still generates all weeks from AI (more variety week-to-week)
4. Retry after deploy if a stale 504 message still mentions “4 weeks or fewer”

### Recommended Commit Message

```text
BIQ-0056 Expand 5+ week AI programs from week 1 template to fix 504s
```

---

## BIQ-0057 - Relax AI Program Exercise Count Validation

Date: 2026-07-23  
Branch: main  
Status: Completed

### Summary

Removed the strict **6-exercise minimum** that blocked AI program generation. Plans with 4–5 solid exercises now save successfully; BuildIQ auto-fills only when a workout is nearly empty.

### Purpose

Users hit validation errors like “Too few strength exercises in week 1 Mon (5; minimum 6)” even when OpenAI returned a usable plan. Generation should accept reasonable AI output, not fail on arbitrary counts.

### Changes

- Dropped hard-fail validation for exercise counts (strength, cardio, mobility, warmup, cooldown)
- Only fail when a workout has **zero** exercises after repair
- Auto-pad sparse strength sessions from the exercise catalog (minimum target 3, not 6)
- Softened AI prompt from “6–10 exercises” to “4–8 exercises”
- Friendlier API error hint: “Please try again in a moment.”

### Files Changed

- `lib/training/aiProgramPlan.ts`
- `app/api/programs/generate/route.ts`

### Database Changes

None

### Testing Steps

1. Program Setup → AI generate with 6 weeks and a normal goals prompt
2. Confirm generation completes even when AI returns ~5 exercises per strength day
3. Verify week 1 expands to full program length
4. Open generated draft — each workout should have exercises; warmups/cooldowns present on strength days

### Known Issues

None

### Recommended Commit Message

```text
BIQ-0057 Relax AI program exercise count validation
```

---

## BIQ-0058 - Fallback When start_date Column Missing

Date: 2026-07-23  
Branch: main  
Status: Completed

### Summary

AI program generation no longer fails when Supabase is missing the `st_programs.start_date` column (migration 016 not applied). Inserts retry without optional columns automatically.

### Purpose

Bug report at 2026-07-23 3:04 PM EDT: `Could not find the 'start_date' column of 'st_programs' in the schema cache` during AI plan generation.

### Changes

- **`missingProgramColumnFromError()`** — parse PostgREST missing-column errors
- **`insertProgramRecord()`** — strip missing optional columns (`status`, `start_date`, etc.) and retry
- **`persistAiProgramPlan()`** — uses shared insert helper instead of raw insert

### Files Changed

- `lib/training/programStatus.ts`
- `lib/training/aiProgramPlan.ts`

### Database Changes

None (apply `20250713_016_program_start_date.sql` in Supabase for full week/date sync).

### Testing Steps

1. AI generate a program on a project without migration 016 — should succeed
2. With migration applied — `start_date` should be set to Monday of current week
3. Settings → Bug reports — mark report `3bb00883…` resolved after deploy

### Recommended Commit Message

```text
BIQ-0058 Fallback when st_programs.start_date column missing
```

---

## BIQ-0059 - Keep Draft Programs on Program Setup Tab

Date: 2026-07-23  
Branch: main  
Status: Completed

### Summary

Draft programs no longer appear on **Personal Training** for logging. Drafts stay on **Program Setup**; **Edit workouts** opens the editor there instead of switching tabs.

### Purpose

Users expected drafts to live in Program Setup until published. Drafts were leaking onto Personal Training (including AI notes) because `Edit workouts` switched tabs and training loaded unpublished programs when no published plan existed.

### Changes

- Personal Training loads **published programs only**
- **Edit workouts** stays on Program Setup and shows the workout editor below setup
- AI program notes on Personal Training only for published plans
- Clearer empty state when only a draft exists

### Files Changed

- `app/page.tsx`

### Database Changes

None

### Testing Steps

1. Generate AI draft → stays on Program Setup with draft card and AI write-up
2. Click **Edit workouts** → editor appears on Setup tab (not Personal Training)
3. Personal Training → shows last published plan or “No published program”
4. **Publish** → plan appears on Personal Training for logging

### Recommended Commit Message

```text
BIQ-0059 Keep draft programs on Program Setup until publish
```

---

## BIQ-0060 - Training Screen UI Redesign & Theme System (Phase 1)

Date: 2026-07-28  
Branch: develop  
Status: Completed

### Summary

Introduced a semantic theme system with five appearance options (Calm default), redesigned the app header and primary navigation, and rebuilt the Training screen as the design-system prototype with a consolidated Active Plan card, compact stats, and secondary placement for Program Setup and bug reporting.

### Purpose

Make BuildIQ Health feel premium, welcoming, and performance-capable without intimidating beginners — using one shared layout with theme-driven visual personality.

### Changes

- **Theme system:** Semantic CSS tokens (`background`, `surface`, `accent`, etc.) with `ThemeProvider`, localStorage persistence, and optional `st_profiles.ui_theme` sync
- **Themes:** Calm (default), Performance, Energy, Nature, Minimal — preview picker in Settings → Appearance
- **Header:** Compact brand row, notification placeholder, avatar menu (Settings, Progress, AI Coach, Report issue, Sign out)
- **Navigation:** Icon + label primary nav for Dashboard, Training, Groups, Nutrition
- **Training screen:** Section header, Personal/Group segmented control, Manage program secondary action, `ActivePlanCard` with stats row and date/week controls, edit-scope only while editing structure
- **Experience preference:** Friendlier fitness experience labels in profile (beginner through athlete)
- **Bug report:** Smaller scroll-revealed floating button + account menu entry

### Files Changed

- `app/page.tsx`
- `app/layout.tsx`
- `app/providers.tsx`
- `app/globals.css`
- `app/components/theme/ThemeProvider.tsx`
- `app/components/theme/ProfileThemeSync.tsx`
- `app/components/layout/AppHeader.tsx`
- `app/components/layout/PrimaryNav.tsx`
- `app/components/training/ActivePlanCard.tsx`
- `app/components/settings/AppearanceSettings.tsx`
- `app/components/ui/Card.tsx`
- `app/components/ui/SegmentedControl.tsx`
- `app/components/ui/StatItem.tsx`
- `app/components/ui/IconButton.tsx`
- `app/components/ui/SectionHeader.tsx`
- `lib/theme/themes.ts`
- `supabase/migrations/20250728_020_profile_ui_theme.sql`

### Database Changes

Optional migration adds `st_profiles.ui_theme` for cross-device theme sync. App works with localStorage until migration is applied.

### Testing Steps

1. Open Training — verify compact header, 4-item primary nav, Training title, Personal/Group control
2. Confirm Active Plan card shows badge, optional group row, workout type toggle, compact stats, date/week controls
3. Tap Manage program — Program Setup opens; Back to training returns to logging view
4. Settings → Appearance — switch Calm and Performance; confirm smooth color transition
5. Refresh page — theme persists (localStorage; profile if migration applied)
6. Edit workout structure (Manage program / add exercise) — edit-scope selector appears; hidden during normal logging
7. Scroll down — small ? bug button appears; account menu → Report an issue also works
8. Sign out — only available from avatar menu, not main header
9. Mobile width (~390px) — no horizontal overflow on week selector or stats row
10. Profile — update fitness experience level; beginners see simplified stats on Active Plan card

### Known Issues

- Dashboard, Groups, Nutrition, Progress, and Program Setup still use legacy card styles (Phase 2 rollout)
- Notification icon is a placeholder
- Energy, Nature, and Minimal themes are selectable but Calm/Performance received the most polish pass

### Recommended Commit Message

```text
BIQ-0060 Training UI redesign with theme system phase 1
```

---

## BIQ-0061 - Streamline Training Screen Context & Layout

Date: 2026-07-28  
Branch: develop  
Status: Completed

### Summary

Removed duplicated Personal/Group controls and statistics from the Training screen. The top-level Personal | Group selector now drives the entire page; plan summary, week selector, and workout days follow in a compact vertical flow.

### Purpose

Reduce confusion from nested mode toggles, duplicate Manage actions, and redundant Plan/Week/Sets/Logged stats that pushed workout content too far down the page.

### Changes

- Top `mode` (`personal` | `team`) is the single source of truth for Training context
- Removed nested Group Workout / Personal Plan toggle from Active Plan card
- Removed four-box stats row, date/start fields, badges, and helper logging text from main view
- One Manage action on plan summary (permission-gated)
- Group row only in Group mode; native select when multiple groups
- Compact week selector with optional “Log a different day” date picker
- Workout day list with prominent active-day styling

### Files Changed

- `app/page.tsx`
- `app/globals.css`
- `app/components/training/TrainingGroupRow.tsx` (new)
- `app/components/training/TrainingPlanSummary.tsx` (new)
- `app/components/training/TrainingWeekSelector.tsx` (new)
- `app/components/training/TrainingWorkoutDays.tsx` (new)
- `app/components/training/ActivePlanCard.tsx` (removed)

### Database Changes

None

### Testing Steps

1. Training → Personal — no group row, no nested toggles, personal program loads
2. Training → Group — group name row appears; program refreshes for selected group
3. Multiple groups — tap row / select switches group and reloads group program
4. Only one Manage button visible (on plan summary when permitted)
5. Week selector changes week; “Log a different day” reveals date picker only when needed
6. Workout days appear immediately below week; tapping selects day and shows exercises sooner
7. Switch Personal ↔ Group — plan and workouts refresh correctly

### Recommended Commit Message

```text
BIQ-0061 Streamline Training screen and remove duplicated context controls
```

---

## BIQ-0062 - Theme Visual Polish (Apple Fitness & Whoop Styles)

Date: 2026-07-28  
Branch: develop  
Status: Completed

### Summary

Aligned Calm and Performance themes with the provided visual mockups: Calm is now a light Apple Fitness-style theme (white surfaces, purple accent, soft shadows); Performance is a Whoop-style dark theme (true black, electric blue glow, gradient controls).

### Purpose

Match the intended visual personalities from design references while preserving the streamlined Training layout from BIQ-0061.

### Changes

- Calm theme: light background, dark text, purple accent, elevated card shadows
- Performance theme: black background, cyan accent, bordered/glowing cards, uppercase section labels
- Segmented control active state: solid purple (Calm) / gradient blue with glow (Performance)
- Legacy `.card`, `.panel`, inputs, and buttons wired to semantic theme tokens
- Training plan block wrapped in elevated card container
- ThemeProvider sets `color-scheme: light` for Calm, `dark` for others
- Appearance picker preview swatches updated

### Files Changed

- `app/globals.css`
- `app/components/theme/ThemeProvider.tsx`
- `lib/theme/themes.ts`
- `app/page.tsx`

### Database Changes

None

### Testing Steps

1. Settings → Appearance → Calm — app shows light background, purple accents, soft card shadows
2. Switch to Performance — black background, blue accent glow on active segmented item and cards
3. Training screen — plan card elevated; Personal | Group toggle matches theme active style
4. Verify streamlined layout unchanged (no stats row, no nested toggle)
5. Mobile — header, nav, and training card readable in both themes

### Known Issues

- Dashboard, Groups, Nutrition, and Program Setup still use legacy layouts; full light/dark token rollout is phase 2

### Recommended Commit Message

```text
BIQ-0062 Align Calm and Performance themes with Apple Fitness and Whoop visual styles
```

---

## BIQ-0063 - Fix Theme Switching & Soften Calm Input Fields

Date: 2026-07-28  
Branch: develop  
Status: Completed

### Summary

Fixed Appearance theme picker not applying changes, and softened Calm theme form fields from harsh dark backgrounds to white inputs with light borders.

### Purpose

Users could not switch themes because profile sync immediately reset the selection; Calm also inherited legacy dark input styles that clashed with the light theme.

### Changes

- `ProfileThemeSync` only reacts to profile loads/updates, not local theme picks
- Profile `ui_theme` updates in app state when theme is persisted
- Calm inputs use white backgrounds and soft gray borders
- Calm-specific CSS overrides for legacy hardcoded dark field styles

### Files Changed

- `app/components/theme/ProfileThemeSync.tsx`
- `app/page.tsx`
- `app/globals.css`
- `app/components/settings/AppearanceSettings.tsx`

### Database Changes

None

### Testing Steps

1. Settings → Appearance → tap Performance — UI switches to dark blue theme immediately
2. Tap Calm — UI returns to light theme; profile/settings fields are white, not black
3. Refresh page — selected theme persists
4. Training log fields on Calm — inputs are light, readable

### Recommended Commit Message

```text
BIQ-0063 Fix theme picker and soften Calm input field styling
```

---

## BIQ-0064 - Simplify Warmup Exercise Display

Date: 2026-07-28  
Branch: develop  
Status: Completed

### Summary

Warmup exercises now show a compact card with exercise name, sets/reps prescription, GIF thumbnail, and form guide — without muscle badges, progression stats, notes fields, or full set logging UI.

### Purpose

Warmup is instructional prep, not heavy logging. Reduce clutter so athletes can quickly see what to do and watch form demos.

### Changes

- New `WarmupExerciseCard` component for Warm Up / Prep section
- Prescription line (e.g. `2 sets · 12` or `1 set · 3 min`)
- GIF thumbnail opens form guide when available
- Program editors retain Change / + Set / Remove actions when editing
- Removed warmup-specific logger UI from `WorkoutSetLogger`

### Files Changed

- `app/components/training/WarmupExerciseCard.tsx` (new)
- `app/page.tsx`
- `app/components/WorkoutSetLogger.tsx`
- `app/globals.css`

### Database Changes

None

### Testing Steps

1. Open Training → select a workout with warmup exercises
2. Warm Up section shows name, sets/reps, GIF, and Form guide button only
3. Tap GIF or Form guide — modal opens with demo/instructions
4. Strength section unchanged (full logging UI)
5. Program Setup edit mode — warmup cards still show Change / + Set / Remove

### Recommended Commit Message

```text
BIQ-0064 Simplify warmup exercise cards to name, sets/reps, GIF, and form guide
```

---

## BIQ-0065 - Theme Description Copy Update

Date: 2026-07-28  
Branch: develop  
Status: Completed

### Summary

Removed third-party brand references from Calm and Performance theme descriptions in Appearance settings.

### Purpose

Theme picker copy should describe BuildIQ Health’s own visual styles, not reference external products.

### Files Changed

- `lib/theme/themes.ts`
- `app/globals.css` (comment only)

### Database Changes

None

### Testing Steps

1. Settings → Appearance — Calm and Performance descriptions no longer mention external brands
2. Theme switching still works as before

### Recommended Commit Message

```text
BIQ-0065 Update theme descriptions to remove third-party brand references
```

---

## BIQ-0066 - Option D Single Theme (Dark Navy + Electric Blue)

Date: 2026-07-28  
Branch: develop  
Status: Completed

### Summary

Locked BuildIQ Health to Option D — a single dark navy/charcoal theme with vibrant electric blue accents and glow on active elements — and removed the Appearance theme picker from Settings.

### Purpose

User requested one fixed visual style (Option D mockup) and removal of alternate theme choices that were not working well in practice.

### Option D palette

- Background: `#0a0f18` / `#12141D` (dark navy, not pure black)
- Accent: `#0066FF` / `#22d3ee` with glow on active nav, cards, and segmented controls
- Cards: dark blue gradients, subtle borders, soft glow when active
- Inputs: deep charcoal/navy fields integrated with surfaces
- Typography: white headings, light gray secondary text
- Border radius: 12–16px

### Changes

- Single theme id `performance` in `lib/theme/themes.ts`; all legacy ids map to it
- Rewrote `:root` CSS tokens to Option D palette; legacy theme blocks alias same tokens
- Removed Settings → Appearance section and theme picker entirely
- `ThemeProvider` always applies dark color-scheme and fixed theme
- `resolveThemeId()` always returns `performance`
- Preserved streamlined Training layout from BIQ-0061

### Files Changed

- `lib/theme/themes.ts`
- `app/components/theme/ThemeProvider.tsx`
- `app/components/settings/AppearanceSettings.tsx`
- `app/components/theme/ProfileThemeSync.tsx`
- `app/layout.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None (existing `ui_theme` column still accepts values; app always uses `performance`)

### Testing Steps

1. Settings → Appearance shows static note only — no theme picker
2. Entire app uses dark navy background with electric blue accents
3. Active primary nav shows blue glow and underline
4. Segmented controls use solid blue active fill with white text
5. Users with old `calm`/`energy`/etc. in profile or localStorage see Option D
6. Training screen layout unchanged from BIQ-0061
7. `npm run build` succeeds

### Known Issues

None

### Recommended Commit Message

```text
BIQ-0066 Lock app to Option D dark theme and remove theme picker
```

---

## BIQ-0067 - Vercel Build Fix (WarmupExerciseCard Set iteration)

Date: 2026-07-28  
Branch: develop  
Status: Completed

### Summary

Fixed TypeScript build failure on Vercel caused by spreading `Set` in `formatWarmupPrescription`.

### Purpose

Vercel's TypeScript target does not allow `[...new Set()]` without `downlevelIteration`.

### Files Changed

- `app/components/training/WarmupExerciseCard.tsx`

### Database Changes

None

### Testing Steps

1. `npm run build` completes without type errors

### Recommended Commit Message

```text
BIQ-0067 Fix WarmupExerciseCard Set spread for Vercel TypeScript build
```

---

## BIQ-0068 - Barcode Review Scroll to Manual Entry

Date: 2026-07-28  
Branch: main  
Status: Completed

### Summary

After scanning a barcode and tapping **Review & edit**, the Add food panel now scrolls directly to the manual entry form with fields pre-filled, instead of leaving the user at the product card.

### Purpose

Users had to hunt and scroll to edit scanned product values on mobile. Review & edit should feel like one step into the form.

### Changes

- **Review & edit** clears the product preview, fills manual entry from barcode data, scrolls to **Manual entry**, and focuses the food name field
- **Enter manually** on not-found card uses the same scroll behavior

### Files Changed

- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Nutrition → Add food → Scan Barcode → scan a known product
2. Tap **Review & edit** — panel scrolls to Manual entry with name and macros filled
3. Food name field receives focus without extra scrolling
4. From not-found card, tap **Enter manually** — same scroll to Manual entry

### Recommended Commit Message

```text
BIQ-0068 Scroll to manual entry after barcode Review and edit
```

---

## BIQ-0069 - Fix Program Setup Split Selection Errors

Date: 2026-07-30  
Branch: main  
Status: Completed

### Summary

Fixed AI schedule split selection failing during Program Setup. Hardened schedule JSON parsing, added server-side retries, and simplified draft edit mode so users are not stuck in the create wizard while editing a draft.

### Purpose

Users editing a draft or picking a weekly split saw errors when AI returned day labels/types in non-exact formats (e.g. `monday`, `lower body`, `Push`). Validation rejected the whole response, blocking split selection and plan generation.

### Changes

- **`scheduleSuggestion.ts`:** Case-insensitive day labels, day-type aliases, fuzzy mapping, auto-fix recommended option id
- **`suggest-schedule` API:** Retry up to 3 times when AI JSON fails validation
- **`page.tsx`:** Inline schedule error message, safer split selection, hide create wizard while editing draft workouts, guard against double-fetch while loading

### Files Changed

- `lib/training/scheduleSuggestion.ts`
- `app/api/programs/suggest-schedule/route.ts`
- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Program Setup → enter goals → **Next: Plan my schedule** — options load
2. Click different split cards — selection highlights without error
3. Toggle cardio/mobility chips — options refresh or keep selection
4. **Next: Review & generate** → create draft with AI or template
5. **Edit workouts** on draft — wizard hides; draft editor shows below
6. **Start new program wizard** — returns to goals/schedule flow

### Recommended Commit Message

```text
BIQ-0069 Fix program setup split selection and draft wizard flow
```

---

## BIQ-0070 - Fix Draft Exercise Replace Reloading Setup Wizard

Date: 2026-07-21  
Branch: main  
Status: Completed

### Summary

Fixed replacing an exercise on a draft program jumping back to the Program Setup “Create draft with AI” review step (blank / looks like regenerate).

### Purpose

After AI generated a draft, using **Change** on an exercise reloaded programs in **training** mode, which filters out drafts. The UI lost the draft context and showed the setup wizard review step again.

### Changes

- **`page.tsx`:** `programLoadContext()` helper; `reloadKeepDay()` uses setup context when editing drafts; `loadPrograms()` forces setup context when `draftEditProgramId` is active on Program Setup

### Files Changed

- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Program Setup → generate AI draft → **Edit workouts**
2. On any exercise, click **Change** → pick a catalog exercise
3. Confirm you stay on the draft editor (workout list below), not the create/review wizard
4. Repeat for add set, remove exercise, rename — draft view should stay stable

### Recommended Commit Message

```text
BIQ-0070 Keep draft editor stable when replacing exercises
```

---

## BIQ-0071 - Team Workspace Redesign (Groups Tab)

Date: 2026-07-21  
Branch: main  
Status: Completed

### Summary

Redesigned the Groups tab into a compact **Team workspace**: team selector dropdown, tabbed workspace (Members, Programs, Progress, Settings), inline team program wizard, program assign/duplicate/customize flows, and leave/delete team support.

### Purpose

Make team management easier on mobile: switch teams quickly, manage members and programs in one place, assign shared or individual plans, and view progress without losing navigation context after saves.

### Changes

- **UI:** `TeamSelector`, workspace tabs, member detail sub-tabs, Programs tab with inline wizard, Settings with classifications + assign workout + leave/delete
- **Copy:** User-facing **Team/Teams** and **Editor** role label (DB still `manager`); nav stays **Groups**
- **API/helpers:** `duplicateTeamProgram`, `customizeProgramForMember`, `leaveTeam`, `deleteTeam`, `buildTeamProgramRows`
- **Migration `20250803_030`:** `source_program_id`, `is_archived`, RPCs `st_duplicate_program`, `st_leave_team`, `st_delete_team`, `st_customize_program_for_member`

### Files Changed

- `app/components/groups/` — new team workspace components; `GroupsHub.tsx` rewrite
- `app/page.tsx` — handlers, inline wizard state, GroupsHub wiring
- `lib/groups/` — permissions, programRoster, teamProgramTools
- `app/globals.css` — team workspace styles
- `supabase/migrations/20250803_030_team_workspace_program_tools.sql`
- `CHANGELOG.md`

### Database Changes

Apply migration `20250803_030_team_workspace_program_tools.sql` in Supabase.

### Testing Steps

1. Groups tab → team selector shows all teams with role; Create/Join in dropdown
2. Members tab → compact roster; tap member → detail tabs (Overview, Assigned, History, Progress)
3. Programs tab → Generate/Create opens inline wizard; Duplicate, Publish, Assign (entire/selected/one)
4. Progress tab → team compliance + member status rows
5. Settings → invite code, classifications, leave team (member) / delete team (owner)
6. Apply migration; duplicate program and customize-for-member RPCs succeed
7. Mobile 375px: selector, tabs, sheets usable

### Recommended Commit Message

```text
BIQ-0071 Redesign Groups tab into tabbed Team workspace
```

---

## BIQ-0072 - Inline Member Workout in Groups Tab

Date: 2026-07-21  
Branch: main  
Status: Completed

### Summary

Opening a member&apos;s workout from Groups now stays on the **Groups** tab with the full workout logger inline, plus a **Close workout** button at the top.

### Purpose

Managers and editors should log or review member workouts without being sent to the Training tab, keeping group context while coaching.

### Changes

- **`openMemberView`:** Keeps `appNav` on Groups; sets team mode and member program/week
- **Groups render:** When viewing a member workout, replaces `GroupsHub` with inline week selector, day picker, and exercise logger
- **`goNav`:** Clears member workout view when leaving Groups
- **Training:** Member workout view removed from Training (Groups-only flow)

### Files Changed

- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Groups → Members → open a member → **Open workout**
2. Confirm you stay on Groups (nav highlight unchanged)
3. Week selector, workout days, and exercises render inline
4. Log a set for the member — saves under member user id
5. **Close workout** returns to the Groups hub
6. Switch to Training tab while viewing member workout — member view clears; Training shows your program

### Recommended Commit Message

```text
BIQ-0072 Open member workouts inline in Groups tab
```

---

## BIQ-0073 - Fix Groups Workspace Tab Switching

Date: 2026-08-03  
Branch: main  
Status: Completed

### Summary

Programs, Progress, and Settings tabs in the Groups workspace now switch content correctly. Team selector and workspace tabs stay visible while viewing a member workout inline.

### Purpose

After BIQ-0072, opening a member workout replaced the entire Groups hub (hiding tabs), and an open member detail view blocked all non-Members tab content even when tabs appeared selected.

### Changes

- **`GroupsHub`:** Tab content is driven by `workspaceTab`; member detail and inline workout render only on the Members tab
- **`page.tsx`:** Always render `GroupsHub`; pass `memberWorkoutPanel` instead of replacing the hub; clear member detail/workout when switching to Programs, Progress, or Settings (restores team program context)

### Files Changed

- `app/components/groups/GroupsHub.tsx`
- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Groups → tap **Programs** — team programs list appears
2. Tap **Progress** — compliance metrics appear
3. Tap **Settings** — invite code, classifications, leave/delete team appear
4. Members → tap a member → member detail opens; tap **Programs** — detail closes and programs list shows
5. Member detail → **Open workout** — workout logger appears under tabs; team selector and all tabs remain visible
6. While viewing member workout, tap **Programs** — workout closes and team programs load
7. **Close workout** returns to Members roster

### Known Issues

None identified.

### Recommended Commit Message

```text
BIQ-0073 Fix Groups workspace tab switching with member views
```

---

## BIQ-0074 - Fix Generate Program from Member Detail

Date: 2026-08-03  
Branch: main  
Status: Completed

### Summary

**Generate program** on a member&apos;s Assigned Program tab opens the AI wizard **inline on the member detail view** (Members tab). No tab switching. Publishing auto-assigns the program to that member.

### Purpose

Managers should generate a member plan without leaving the member context. Switching to the Programs tab was confusing.

### Changes

- **`TeamMemberDetail`:** Inline program wizard with Cancel; stays on member view
- **`GroupsHub`:** Member-scoped wizard on Members tab; Programs tab wizard only for team-level generate/create
- **`openGroupsProgramWizard`:** Optional `memberUserId` for member-scoped generation
- **`publishProgram`:** When generating for a member, publishes then assigns via `individual_team` and closes wizard

### Files Changed

- `app/page.tsx`
- `app/components/groups/GroupsHub.tsx`
- `app/components/groups/TeamMemberDetail.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Groups → Members → open a member → **Assigned Program** → **Generate program**
2. Confirm you stay on the member view (Members tab active) and the wizard appears inline
3. **Cancel** returns to member detail without changing tabs
4. Generate → publish → confirm assignment to member and return to member detail
5. Programs tab **Generate** still opens wizard on Programs (not member-scoped)

### Recommended Commit Message

```text
BIQ-0074 Fix Generate program from member detail in Groups
```

---

## BIQ-0075 - Honor Explicit Workout Split in AI Schedule

Date: 2026-08-03  
Branch: main  
Status: Completed

### Summary

When goals text specifies a concrete weekly split (e.g. pull upper, pull lower, 2 full-body days, 4 weeks), BuildIQ now builds that split as the recommended schedule option and passes pull/push emphasis through to exercise generation.

### Purpose

Users were describing exact splits in the goals field but the AI schedule coach returned generic 3–4 day templates (e.g. upper/lower) that ignored pull emphasis and full-body day counts.

### Changes

- **`parseExplicitScheduleFromGoals`:** Detects pull upper/lower, push upper/lower, full-body counts, and weeks from goals text
- **Schedule API:** Injects **Your requested split** as `opt_requested` (recommended); falls back to parser if AI fails
- **Program generation:** `dayEmphasis` passed to AI so pull-focused days use appropriate exercises
- **Wizard:** Auto-sets weeks when goals mention duration (e.g. "4 weeks")

### Files Changed

- `lib/training/scheduleSuggestion.ts`
- `lib/training/aiProgramPlan.ts`
- `app/api/programs/suggest-schedule/route.ts`
- `app/api/programs/generate/route.ts`
- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Goals: `I need a pull lower body and a pull upper body. Need 2 full body workouts in the week for 4 weeks`
2. Next: Plan my schedule → confirm **Your requested split (4-day)** is recommended
3. Days should be Mon/Tue/Thu/Fri with pull upper, full body, pull lower, full body
4. Weeks field should show 4
5. Generate program → pull days should emphasize rows/RDLs/hamstrings not generic push splits

### Recommended Commit Message

```text
BIQ-0075 Honor explicit workout splits in AI schedule generation
```

---

## BIQ-0076 - Delete Draft and Old Programs

Date: 2026-08-03  
Branch: main  
Status: Completed

### Summary

Users can delete draft programs and old published programs from Program Setup and the Groups Programs tab. Completed workout history is preserved; the program template and planned workouts are removed.

### Purpose

Drafts and outdated programs accumulated with no way to remove them from the library.

### Changes

- **Migration `20250803_031`:** `programs_delete` RLS policy for personal owners and team editors
- **`deleteProgramRecord`:** Supabase delete helper in `programStatus.ts`
- **`deleteProgramHandler`:** Confirm dialog, blocks deleting team active program, clears draft edit state
- **`ProgramLibraryPanel`:** Manage programs list in Training → Program Setup
- **`TeamProgramsTab`:** Delete button on each program row (disabled for team active program)
- Draft card and editing banner include **Delete draft**

### Files Changed

- `supabase/migrations/20250803_031_program_delete_policy.sql` (new)
- `lib/training/programStatus.ts`
- `app/components/training/ProgramLibraryPanel.tsx` (new)
- `app/components/groups/TeamProgramsTab.tsx`
- `app/components/groups/GroupsHub.tsx`
- `app/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

- Apply migration `20250803_031_program_delete_policy.sql` in Supabase (adds `programs_delete` RLS on `st_programs`)

### Testing Steps

1. Training → Manage program → create or open a draft → **Delete draft** on draft card or editing banner
2. Confirm draft removed from program list; wizard state clears if open
3. Groups → Programs → **Delete** on an old program (not team active)
4. Try deleting team active program → blocked with message
5. Delete a published program with logged sets → Progress history still shows completed sets
6. Personal program delete works for program owner

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0076 Add delete for draft and old programs
```

---

## BIQ-0077 - Keep Generate Wizard Open After Draft Delete

Date: 2026-08-03  
Branch: main  
Status: Completed

### Summary

Deleting a draft from Program Setup or the Groups generate wizard no longer closes the wizard and returns you to the Programs list.

### Purpose

Removing an old draft while generating a new program incorrectly called `closeGroupsProgramWizard()`, kicking the user out of the generate flow.

### Changes

- **`deleteProgramHandler`:** Removed wizard close on delete; reload programs in setup context when wizard or Program Setup is active

### Files Changed

- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Groups → Programs → **Generate** → scroll to Manage programs → delete an old draft
2. Confirm you stay on the generate wizard (Goals step), not bumped to Programs list
3. Member detail → Generate program → delete a draft from manage list → confirm inline wizard stays open
4. Training → Manage program (no wizard) → delete draft still works normally

### Recommended Commit Message

```text
BIQ-0077 Keep generate wizard open when deleting a draft
```

---

## BIQ-0078 - Workout Day Picker After AI Draft Generation

Date: 2026-08-03  
Branch: main  
Status: Completed

### Summary

After generating a draft program with AI, clickable workout day pills now appear so you can switch between Mon/Tue/etc. and review each day&apos;s exercises. Draft editing UI lives inside Program Setup (including Groups generate wizard).

### Purpose

Post-generation draft editing showed one workout&apos;s exercises but no day picker — clicking workout days appeared to do nothing because `TrainingWorkoutDays` was only rendered on Personal Training, not Program Setup.

### Changes

- **`programSetupPanel`:** When editing a draft, renders week selector, workout day pills, apply scope, and exercise sections
- **`generateWithAi`:** Opens draft for editing via `openDraftForEditing`; stays in Groups wizard when generating from Groups

### Files Changed

- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Generate a draft with AI (Training → Manage program or Groups → Generate)
2. Confirm workout day pills appear (e.g. Mon · Pull Upper, Tue · Full Body)
3. Click each day — exercises update for that workout
4. Groups generate wizard: same day picker works inline without leaving Groups

### Recommended Commit Message

```text
BIQ-0078 Add workout day picker to draft editing after AI generation
```

---

## BIQ-0079 - Fix Program Delete from Manage Programs List

Date: 2026-08-03  
Branch: main  
Status: Completed

### Summary

Delete in **Manage programs** (Program Setup / Groups generate wizard) now reliably removes programs and updates the list immediately. Previously, deletes could silently fail when the RLS delete policy was missing — Supabase returned success with zero rows deleted.

### Purpose

Clicking **Delete** on draft programs in the wizard&apos;s manage list appeared to do nothing: no error, program stayed in the list.

### Changes

- **`st_delete_program` RPC:** Security-definer delete with owner/team-editor checks and team-active-program guard
- **`deleteProgramRecord`:** Uses RPC first; falls back to direct delete with `.select('id')` verification and a clear error when no row is removed
- **`deleteProgramHandler`:** Optimistically removes program from local state after successful delete
- **`ProgramLibraryPanel`:** Stop click propagation on Delete button

### Files Changed

- `supabase/migrations/20250803_032_program_delete_rpc.sql` (new)
- `lib/training/programStatus.ts`
- `app/page.tsx`
- `app/components/training/ProgramLibraryPanel.tsx`
- `CHANGELOG.md`

### Database Changes

- Apply `20250803_031_program_delete_policy.sql` (RLS) and `20250803_032_program_delete_rpc.sql` (RPC) in Supabase

### Testing Steps

1. Groups → Programs → Generate → scroll to **Manage programs**
2. Delete a draft → confirm → row disappears immediately
3. Refresh page → deleted program stays gone
4. Try deleting team active program → blocked with message
5. If RPC not applied yet, user sees clear error instead of silent no-op

### Recommended Commit Message

```text
BIQ-0079 Fix silent failure when deleting programs from manage list
```

---

## BIQ-0080 - Fix Member Generate Wizard Schedule and Post-Generation View

Date: 2026-08-03  
Branch: main  
Status: Completed

### Summary

Generating a program for a member (e.g. Ethan) now keeps you on the inline wizard after generation so you can review the draft plan. Schedule split cards respond to clicks with visible selection feedback. Manage programs list is hidden during the generate wizard until a draft exists.

### Purpose

- Clicking a suggested workout split during schedule step appeared to do nothing (no visible selection change)
- After AI generation completed, the app cleared the member context and returned to Ethan&apos;s member tabs instead of showing the generated draft

### Root cause

`openDraftForEditing` set `trainingSubNav` to `setup`, which triggered a `useEffect` that cleared `memberDashboard` — closing the inline member wizard.

### Changes

- **`useEffect` (trainingSubNav):** Preserve `memberDashboard` when generating for a member (`groupsAssignMemberUserId`)
- **`openDraftForEditing`:** Optional `keepMemberWizard` skips training sub-nav switch for member inline wizard
- **`generateWithAi`:** Captures member context before async work; keeps Groups wizard open and shows draft after generation
- **`applyScheduleOption`:** Ensures schedule step stays active; adds selected-split summary below cards
- **Schedule cards:** Disabled during loading; stop propagation on click
- **`GroupsHub` / `TeamMemberDetail`:** Wizard stays open while member draft is being edited; updated subtitle after generation
- **Manage programs:** Hidden during active generate wizard (shown after draft is created)

### Files Changed

- `app/page.tsx`
- `app/components/groups/GroupsHub.tsx`
- `app/components/groups/TeamMemberDetail.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Groups → Members → Ethan → Generate program
2. Goals → Plan schedule → click different split cards → confirm **Selected split** updates and card highlights
3. Create draft with AI → confirm you stay on Ethan&apos;s wizard with workout day pills and exercises (not Ethan tabs)
4. Publish → assigns to Ethan and closes wizard
5. Cancel during wizard → returns to Ethan member detail

### Recommended Commit Message

```text
BIQ-0080 Fix member generate wizard schedule picks and post-generation draft view
```

---

## BIQ-0081 - Enforce Push/Pull Focus for Full-Body Programs from Goals

Date: 2026-08-03  
Branch: develop  
Status: Completed

### Summary

Goals like "full body with focus on push" now drive schedule emphasis and AI exercise selection so pull patterns (rows, pulldowns, hip hinges) are excluded on push-focused full-body days.

### Purpose

Users describing push- or pull-focused full-body training were still getting balanced push/pull workouts (e.g. Barbell Bent Over Row on a push-focused full body day) because day emphasis was not merged from goals into generation.

### Changes

- **`scheduleSuggestion.ts`:** `detectPushPullFocusFromGoals`, `buildDayEmphasisFromGoals`, `mergeDayEmphasisFromGoals`; push/pull full-body parsing in `parseExplicitScheduleFromGoals`
- **`aiProgramPlan.ts`:** Strict push/pull prompt rules when `dayEmphasis` is set; filter and refill strength exercises by movement pattern in `repairAiPlan`; emphasis-aware `strengthFallbackExercises`
- **`app/page.tsx`:** Merge goal-derived emphasis in `applyScheduleOption`, `fetchScheduleSuggestions`, and `generateWithAi`

### Files Changed

- `lib/training/scheduleSuggestion.ts`
- `lib/training/aiProgramPlan.ts`
- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Program setup → goals: "full body push focus 3 days" → Plan schedule
2. Confirm recommended split shows push-focused full body days with emphasis labels
3. Generate program → confirm strength days use press/squat patterns only (no bent-over rows, pulldowns, or RDLs on push-focused days)
4. Repeat with "full body pull focus 3 days" → confirm rows/hinges appear and heavy pressing is minimized
5. Upper/lower push/pull splits still work as before (not treated as full-body focus)

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0081 Enforce push/pull focus for full-body programs from goals
```

---

## BIQ-0082 - Fix Program Name on Generate and Publish Assignment UX

Date: 2026-08-03  
Branch: develop  
Status: Completed

### Summary

Custom program names entered in the setup wizard are now saved on AI generation and before publish. Member publish-and-assign no longer shows a success message when assignment fails.

### Purpose

- "New program name" was ignored because AI `program_name` took priority over the user-entered name
- Publish for a member could show an error alert even when the program published, or show success when assignment failed

### Changes

- **`persistAiProgramPlan`:** Prefer `config.programName` over AI `program_name`
- **`generate` API:** Return user-provided name in response when set
- **`saveDraftProgramName`:** Persist name from wizard state before publish
- **`publishProgram`:** Save name first; resolve draft from `program` state fallback; capture member assign target before state clears; separate publish vs assign error messages
- **`assignMemberProgram`:** Returns error string; optional `quiet` flag to avoid duplicate alerts
- **Draft editing UI:** Editable program name field while reviewing a draft

### Files Changed

- `lib/training/aiProgramPlan.ts`
- `app/api/programs/generate/route.ts`
- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Groups → member → Generate program → on review step enter a custom name → Create draft with AI → confirm draft uses your name
2. Edit name in draft banner → Publish → confirm published program keeps the updated name
3. Publish for member → if assignment fails, confirm you see a clear partial-success message (not a false success)
4. Successful member publish → single success alert and assignment on member

### Recommended Commit Message

```text
BIQ-0082 Fix program name on AI generate and publish assignment alerts
```

---

## BIQ-0083 - Isolate Member Workout View from Manager Training State

Date: 2026-08-03  
Branch: develop  
Status: Completed

### Summary

Viewing a member&apos;s workout in Groups no longer hijacks your own program, week, or day selection. Clicking Thursday on Ethan&apos;s plan stays on Ethan&apos;s exercises.

### Purpose

Member workout logging reused the manager&apos;s global `program`, `week`, `logDate`, and `activeWorkout`. Selecting a different day could reload the manager&apos;s group program (including async `loadPrograms` races) and show the wrong workout.

### Changes

- **Isolated member workout state:** `memberWorkoutProgram`, `memberWorkoutWeek`, `memberWorkoutLogDate`, `memberWorkoutActiveId`
- **`openMemberView`:** Loads member program into isolated state; does not overwrite manager training context
- **Member day/week handlers:** `onSelectMemberWorkoutDay`, `onMemberWeekChange`, `onMemberLogDateChange`
- **`loadPrograms`:** Re-checks member view after async fetch before updating program state
- **Calendar sync effects:** Skipped while viewing a member workout
- **Logging:** Uses member program and log date when coaching a member

### Files Changed

- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Training → start your group workout on one day
2. Groups → Ethan → Open workout → click Thursday
3. Confirm Ethan&apos;s Thursday exercises show (not your in-progress group workout)
4. Close workout → Training tab still shows your original program/day
5. Log a set on Ethan&apos;s workout → saves to Ethan on the selected date

### Recommended Commit Message

```text
BIQ-0083 Keep member workout view isolated from manager training state
```

---

## BIQ-0084 - Fix Apply Assignment on Member Detail

Date: 2026-08-03  
Branch: develop  
Status: Completed

### Summary

Apply assignment on a member&apos;s Assigned Program tab no longer errors. Individual/manual assignments validate that a published program is selected, and the Supabase RPC is compatible with projects that have not applied all prior migrations.

### Purpose

Clicking **Apply assignment** could fail when the client sent `p_coaching_metadata` to an RPC/database that did not match, when an empty program id was sent for individual assignments, or when the program dropdown listed invalid options.

### Changes

- **`assignMemberProgram`:** Validates assignment type; requires a program for individual/manual types; omits optional RPC args that caused schema mismatches; shows success confirmation
- **`reloadMemberWorkoutProgram`:** Refreshes inline member workout after assignment without resetting manager training state
- **Assignment dropdown:** Uses published team programs only (`assignableTeamPrograms`)
- **Migration `20250803_033`:** Hardens `st_assign_member_program` with `st_user_can_edit_team`, validation, and `coaching_metadata` column guard

### Files Changed

- `app/page.tsx`
- `app/components/groups/GroupMemberDashboard.tsx`
- `app/components/groups/GroupsHub.tsx`
- `app/components/groups/TeamMemberDetail.tsx`
- `supabase/migrations/20250803_033_fix_member_program_assign.sql`
- `CHANGELOG.md`

### Database Changes

Apply migration `20250803_033_fix_member_program_assign.sql` in Supabase.

### Testing Steps

1. Groups → member → Assigned tab
2. Set **Individual Team Plan** → pick a published program → **Apply assignment** → confirm success (no error)
3. Set **Follow Team Plan** → Apply → member follows team default
4. Individual/manual without a program selected → friendly validation message (no RPC error)
5. If inline member workout is open, assignment refresh keeps member context

### Recommended Commit Message

```text
BIQ-0084 Fix member Apply assignment RPC and validation
```

---

## BIQ-0085 - Restore Group Workout History After Program Redo

Date: 2026-08-04  
Branch: cursor/restore-group-workout-history-964e  
Status: Completed

### Summary

Recovered the ability to see and use completed group workout logs after regenerating / replacing group programming. Training no longer looks empty when logs still exist under old planned-set IDs; history can be rematched onto the current program.

### Purpose

Regenerating a group program creates new `st_planned_sets` rows. Completed `st_set_logs` still belong to the user (snapshots + `user_id`), but Training loaded logs only by current planned-set IDs — so weeks of logging appeared wiped even when Progress still had the data (or when logs were orphaned after template delete).

### Changes

- Added `lib/training/reattachLogs.ts` to match historical logs onto a program by calendar date, exercise (catalog/name), and set number
- Training `loadLogs` overlays same-date snapshot matches so past days show immediately
- Auto-rematch once per program/session when ≥5 unlinked completed sets are found in the past ~8 weeks; manual **Restore history** banner as backup
- Migration re-asserts `planned_set_id ON DELETE SET NULL` so deleting templates cannot cascade-wipe history
- Diagnostic SQL for Supabase SQL Editor to confirm whether logs still exist

### Files Changed

- `lib/training/reattachLogs.ts` (new)
- `app/page.tsx`
- `app/globals.css`
- `supabase/migrations/20250804_034_preserve_set_logs_on_program_delete.sql` (new)
- `supabase/scripts/20250804_diagnose_missing_group_logs.sql` (new)
- `scripts/test-reattach-logs.mjs` (new)
- `CHANGELOG.md`

### Database Changes

Apply in Supabase SQL Editor:

1. `supabase/migrations/20250804_034_preserve_set_logs_on_program_delete.sql`  
   (safe; re-asserts SET NULL + index — no data deleted)

Optional diagnostic:

2. `supabase/scripts/20250804_diagnose_missing_group_logs.sql`  
   (read-only checks for the affected account)

### Testing Steps

1. Open **Progress** — confirm past completed sets still appear (snapshots)
2. Open **Training → Group** on the new program — past log dates should show matched sets (overlay)
3. If a **Restore logged workouts** banner appears, tap **Restore history** (or wait for auto-restore) and confirm sets stick after refresh
4. **Groups → Programs** — if the previous program still exists, re-assign it as team default to restore the original linkage immediately
5. Mobile: Training group context + Progress history remain usable
6. If Progress is also empty, run the diagnostic SQL; if count is 0, restore from Supabase PITR/backups

### Known Issues

- Logs only rematch when exercise names/catalog IDs align with the new program; unmatched sets remain visible under Progress
- If production still had `ON DELETE CASCADE` and the old program was deleted, rows may already be gone — rematch cannot recreate deleted rows (use Supabase backup/PITR)
- Auto-rematch runs once per program id per browser session

### Recommended Commit Message

```text
BIQ-0085 Restore group workout history after program redo
```

---

## BIQ-0086 - Fix Member Progress After Manual Group Program Redo

Date: 2026-08-04  
Branch: cursor/restore-group-workout-history-964e  
Status: Completed

### Summary

Fixed Groups → member → Progress showing no history after replacing a manually built group program. Owners can open their own member detail, Progress/History tabs load completed set logs reliably, and managers can Restore history onto the current program.

### Purpose

Member Progress was empty for two reasons: (1) clicking yourself jumped away from member detail, and (2) performance loading could abort if the program query failed. Manual program redos leave logs on old planned-set IDs the same way AI regenerations do.

### Changes

- Allow owners/editors to open their own member detail (Progress / History)
- Dedicated History and Progress tab panels with Refresh + Restore history
- Always load member performance even when program fetch fails
- Overlay same-date logs on member today workout after program replace
- Migration `20250804_035` hardens coach read/update of teammate set logs (including orphaned snapshot rows; accepts `editor` + `manager`)

### Files Changed

- `app/components/groups/TeamMemberDetail.tsx`
- `app/components/groups/GroupMemberDashboard.tsx`
- `app/components/groups/MemberPerformancePanel.tsx`
- `app/components/groups/GroupsHub.tsx`
- `app/components/ProgressInsights.tsx`
- `app/page.tsx`
- `supabase/migrations/20250804_035_member_progress_coach_log_access.sql` (new)
- `supabase/scripts/20250804_diagnose_missing_group_logs.sql`
- `CHANGELOG.md`

### Database Changes

Apply in Supabase SQL Editor (in addition to BIQ-0085 migration 034):

1. `supabase/migrations/20250804_035_member_progress_coach_log_access.sql`

### Testing Steps

1. Groups → Members → tap yourself (owner) → Progress tab shows your lift history
2. Tap another member → Progress / History show their completed sets
3. After replacing a manually built group program, Progress still lists prior sets; tap **Restore history** to reconnect them to the new program
4. Refresh on Progress reloads logs
5. Mobile member detail tabs usable

### Known Issues

- Restore only rematches when exercise names/catalog IDs align with the new program
- Hard-deleted logs (CASCADE before SET NULL) still need Supabase PITR

### Recommended Commit Message

```text
BIQ-0086 Fix member Progress after manual group program redo
```

---

## BIQ-0087 - Progress Restore Button + Fix Apply Assignment

Date: 2026-08-04  
Branch: cursor/progress-restore-and-assign-fix-964e  
Status: Completed

### Summary

Added a always-visible **Restore history** button on the main Progress tab, and fixed Apply assignment failures caused by legacy `editor` roles / missing assign RPC.

### Purpose

Users looking at the bottom-nav Progress tab could not find Restore history (it was only on Groups → member Progress / Training). Apply assignment could return Not authorized when `st_user_can_edit_team` did not accept legacy editor roles.

### Changes

- Progress tab header: **Restore history** + clearer empty-state copy
- Restore works even when Training program is not loaded (loads team/personal published program)
- Friendlier Apply assignment error messages with migration guidance
- Migration `20250804_036`: `st_user_can_edit_team` accepts owner/manager/editor; re-asserts `st_assign_member_program`

### Files Changed

- `app/page.tsx`
- `supabase/migrations/20250804_036_fix_assign_and_edit_team_roles.sql` (new)
- `CHANGELOG.md`

### Database Changes

Apply in Supabase SQL Editor:

1. `supabase/migrations/20250804_036_fix_assign_and_edit_team_roles.sql`

(Also keep 034 + 035 from BIQ-0085/0086 if not applied yet.)

### Testing Steps

1. Progress tab → see **Restore history** next to Refresh → tap it
2. Groups → member → Assigned → Apply assignment succeeds for Follow Team Plan / Individual with program selected
3. Individual/manual without program still shows validation message

### Recommended Commit Message

```text
BIQ-0087 Add Progress Restore history button and fix Apply assignment
```

---

## BIQ-0088 - Groups Progress Restore + Assign Workout From Any Program

Date: 2026-08-04  
Branch: cursor/groups-progress-restore-assign-workout-964e  
Status: Completed

### Summary

Added **Restore history** to Groups → Progress, and fixed Assign workout so you can pick workouts from any published team program (not only the new active one). Clarified that Assign workout is for templates, not restoring logged history.

### Purpose

Users looked for Restore on Groups → Progress (not the bottom-nav Progress tab). After replacing group programming, Assign workout only listed the new program’s days, so the workout they had been doing was missing — and RPC errors were unclear.

### Changes

- Groups → Progress: Restore history button
- Assign workout: program picker across all published team programs
- Assign workout RPC: fallback without `p_coaching_metadata`; clearer auth/migration errors
- Copy clarifying Restore vs Assign workout

### Files Changed

- `app/components/groups/TeamProgressTab.tsx`
- `app/components/groups/GroupAssignWorkoutPanel.tsx`
- `app/components/groups/TeamSettingsTab.tsx`
- `app/components/groups/GroupsHub.tsx`
- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None new beyond BIQ-0087 (`20250804_036`). If Assign workout still says Not authorized, run that migration in Supabase.

### Testing Steps

1. Groups → Progress → see **Restore history** → tap it
2. Groups → Settings → Assign workout → Program dropdown lists older published programs + team active
3. Select older program → workout days appear → Assign to whole group succeeds
4. If old program was deleted, workouts won’t list — use Restore history for logs instead

### Recommended Commit Message

```text
BIQ-0088 Groups Progress restore and assign workout from any program
```

---

## BIQ-0089 - Progress Bottom Nav + Own Lift History Visibility

Date: 2026-08-04  
Branch: cursor/progress-nav-and-history-964e  
Status: Completed

### Summary

Put **Progress** on the primary bottom nav (it was easy to miss — only Groups had a Progress-like tab). Made personal Progress load logged sets with performance even when `completed` was never toggled, and fixed RLS so users always see their own `st_set_logs`. Renamed Groups → Progress to **Team status** so it is not confused with personal lift history.

### Purpose

Users only saw a Progress control under Groups (team weekly status) and could not find personal logged sets. Progress also filtered too strictly / RLS could hide orphaned own rows after a program replace.

### Changes

- Bottom nav: Dashboard / Training / Groups / Nutrition / **Progress**
- Progress query: include rows with weight/reps/etc., not only `completed = true`
- Clearer Progress empty-state copy vs Groups team status
- Groups workspace tab label: Progress → **Team status**
- Migration: own set logs always selectable by `user_id = auth.uid()`

### Files Changed

- `app/components/layout/PrimaryNav.tsx`
- `app/globals.css`
- `app/page.tsx`
- `app/components/groups/TeamWorkspaceTabs.tsx`
- `app/components/groups/TeamProgressTab.tsx`
- `supabase/migrations/20250804_037_own_set_logs_always_visible.sql`
- `CHANGELOG.md`

### Database Changes

Run in Supabase SQL Editor:

- `supabase/migrations/20250804_037_own_set_logs_always_visible.sql`

Also ensure earlier survival migrations are applied if not already:

- `20250804_034_preserve_set_logs_on_program_delete.sql`
- `20250804_035_member_progress_coach_log_access.sql`

If rows were hard-deleted by an old CASCADE FK, this cannot recreate them — only new logs (and any surviving rows) will show.

### Testing Steps

1. Bottom nav shows five items including **Progress**
2. Open Progress → workout history lists recent logged sets (or empty state explaining Training)
3. Log weight/reps in Training (even before marking complete) → Refresh Progress → day appears
4. Groups → **Team status** (not Progress) shows weekly member activity
5. After applying migration 037, orphaned own logs (null planned_set_id) still appear on Progress

### Known Issues

- Rematching exercises to a new program template is out of scope here (manual redo)
- Permanently deleted set-log rows cannot be restored from the app

### Recommended Commit Message

```text
BIQ-0089 Add Progress to bottom nav and fix own lift history visibility
```

---

## BIQ-0090 - Fix Individual Assign Not Moving Whole Group

Date: 2026-08-04  
Branch: cursor/fix-individual-assign-team-default-964e  
Status: Completed

### Summary

Publishing a program and assigning it to one member (e.g. Ehan) no longer makes the rest of the group train on that plan. Training stopped falling back to “newest published” when the team default was empty or stale, Assign defaults to **One Member**, and Entire Team requires an explicit confirm that it sets the group active program.

### Purpose

Users assigned a new program to one athlete and the whole Follow Team Plan roster appeared to move because Training auto-picked the newest published program whenever `default_program_id` was missing.

### Changes

- `pickProgram` / `pickProgramForMember`: team resolution uses only the explicit team default or an individual/manual assignment — never newest-published fallback
- Training load uses the signed-in user’s individual assignment when present
- Group active program dropdown no longer pretends the open program is the default
- Assign modal defaults to One Member; clearer copy + confirmations
- Program list summary shows `Only: Name` for individual assigns

### Files Changed

- `app/page.tsx`
- `app/components/groups/TeamAssignProgramModal.tsx`
- `lib/groups/programRoster.ts`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Keep an existing published program as group active (or leave No team default)
2. Publish a new draft without Publish & set group active
3. Programs → Assign → One Member → Ehan → confirm → only Ehan listed as `Only: Ehan`
4. Other members on Follow Team Plan still see the previous team default (or no program if none set)
5. Assign → Entire Team → confirm → group active updates; list shows Entire team (default)

### Known Issues

- If the team default was already switched earlier, reset it under Program Setup → Group active program
- Members who already received an individual override stay on that plan until reassigned

### Recommended Commit Message

```text
BIQ-0090 Fix individual program assign so it does not move the whole group
```

---

## BIQ-0091 - Fix Custom Exercise Movement Pattern Constraint Error

Date: 2026-08-04  
Branch: develop  
Status: Completed

### Summary

Creating a custom exercise no longer fails with `st_exercise_catalog_movement_pattern_check` when movement pattern is left blank.

### Purpose

The add-exercise flow sent an empty string for `movement_pattern`, but the database only allows `null` or specific enum values — not `""`.

### Changes

- Normalize blank movement patterns to `null` before catalog insert/update
- Validate non-empty movement patterns against allowed BIQ-0013 values
- Settings custom exercise forms use a dropdown for movement pattern instead of free text

### Files Changed

- `app/page.tsx`

### Database Changes

None.

### Testing Steps

- Training → Add exercise → Create custom → enter name only → Save & continue (should succeed)
- Settings → Create Custom Exercise with no movement pattern → Save (should succeed)
- Settings → Create with a movement pattern selected → Save (should persist pattern)
- Settings → Edit custom exercise → clear movement pattern → Save (should succeed)
- Settings → Edit with invalid legacy text if present → should normalize or show friendly error

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0091 Fix custom exercise movement_pattern check constraint error
```

---

## BIQ-0092 - Show Custom Exercises in Training Search

Date: 2026-08-04  
Branch: develop  
Status: Completed

### Summary

Custom exercises saved in Settings now appear when searching to add exercises to a program.

### Purpose

Training add-exercise search only queried the built-in library (`builtinCatalogItems`), so user-created catalog entries were invisible despite showing under Settings → My Exercise Catalog.

### Changes

- Added `userCustomCatalogItems()` and `workoutSearchCatalogItems()` in catalog search helpers
- Add Exercise panel and inline exercise rename search use built-in + own custom exercises
- AI program generation still uses built-in catalog only

### Files Changed

- `lib/training/catalogSearch.ts`
- `app/page.tsx`

### Database Changes

None.

### Testing Steps

- Settings → Create Custom Exercise → save with a unique name
- Training → Add exercise → search for that name → custom exercise appears
- Pick it and add to workout — saves with `catalog_exercise_id` linked
- Built-in exercises still appear in search
- AI program generation unchanged (no custom exercises injected)

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0092 Show custom exercises in Training add-exercise search
```

---

## BIQ-0093 - Fix Assign Program RPC Overload Ambiguity

Date: 2026-08-04  
Branch: develop  
Status: Completed

### Summary

Assigning a program to a group member no longer fails with PostgreSQL "Could not choose the best candidate function" for `st_assign_member_program`.

### Purpose

Two overloaded RPC signatures existed (5-arg from BIQ-0010 and 6-arg with `p_coaching_metadata` from BIQ-0027). Calls with five named parameters matched both, so Apply assignment failed.

### Changes

- Migration drops the legacy 5-arg overload and keeps the 6-arg function
- App RPC call passes `p_coaching_metadata: {}` explicitly
- Friendlier alert when overload ambiguity is detected

### Files Changed

- `supabase/migrations/20250804_038_drop_assign_member_program_overload.sql`
- `supabase/scripts/20250804_fix_apply_assignment.sql`
- `app/page.tsx`

### Database Changes

- `drop function st_assign_member_program(uuid, uuid, text, uuid, text)`
- Re-assert single 6-arg `st_assign_member_program` RPC

### Testing Steps

- Run migration `20250804_038` in Supabase SQL Editor (or apply via CLI)
- Groups → open member → Assign → pick Individual Team Plan + published program → Apply
- Confirm success alert and member assignment updates
- No "Could not choose the best candidate function" error

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0093 Fix st_assign_member_program RPC overload ambiguity
```

---

## BIQ-0094 - Save Draft Program Name While Editing Workouts

Date: 2026-08-04  
Branch: develop  
Status: Completed

### Summary

Renaming a draft program while editing workouts now persists to the database instead of reverting on the next exercise change.

### Purpose

The draft name field updated local React state only. The name was written to Supabase on publish, but `loadPrograms` / `reloadKeepDay` after workout edits reset the field from the old database value.

### Changes

- Save draft program name on blur and before leaving draft edit / reloading workouts
- Do not overwrite in-progress name edits when reloading the same draft
- Sync program dropdown selection with the name field

### Files Changed

- `app/page.tsx`

### Database Changes

None.

### Testing Steps

- Create or open a draft program → Edit workouts
- Change program name → click outside the field (blur) or edit an exercise
- Confirm name stays updated in the draft banner and program dropdown
- Publish — published program uses the new name

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0094 Save draft program name while editing workouts
```

---

## BIQ-0095 - Fix Groups Program Edit, Assign, and Draft Visibility

Date: 2026-08-04  
Branch: develop  
Status: Completed

### Summary

Groups program editing, individual assignment, and draft listing are reliable again — workouts show when editing, assigned programs appear immediately in Training, and drafts no longer vanish from the Programs list after refresh.

### Purpose

Three related state bugs: published program Edit opened the create wizard without workouts; assignment used stale React state so Training kept the old team default; Groups navigations loaded training-only program lists that excluded drafts.

### Changes

- Groups Edit opens inline program editor with workout days (draft and published)
- `loadMemberAssignments` returns fresh map; program pickers accept override to avoid stale closure after assign
- Groups navigation loads setup context (includes drafts) for managers
- After individual assign, refresh member dashboard and assignee Training view immediately
- Published program Edit button labeled “Edit workouts”

### Files Changed

- `app/page.tsx`
- `app/components/groups/TeamProgramsTab.tsx`

### Database Changes

None.

### Testing Steps

- Groups → Programs → Edit draft → see workout days and exercises inline
- Groups → Programs → Edit workouts on published program → see workout editor
- Assign program to one member (including yourself) → Training → Group shows new program
- Groups → Programs list shows drafts after page refresh
- Member dashboard shows updated assigned program name after assign

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0095 Fix Groups program edit, assign refresh, and draft visibility
```

---

## BIQ-0096 - Fix Incomplete Workout Days After Program Assign

Date: 2026-08-04  
Branch: main  
Status: Completed

### Summary

Assigned programs now load all workout days immediately (e.g. Wednesday and Friday together) instead of showing one day first and filling in the rest after a long delay.

### Purpose

Bulk Supabase nested queries across every team program can hit PostgREST row limits, returning truncated `st_workouts` arrays. Member workout views also reused stale assignment state and could flash partial program data while a second fetch completed.

### Changes

- Added `lib/training/programFetch.ts` with lightweight program index + per-program full fetch
- `loadPrograms`, `reloadMemberWorkoutProgram`, and `loadMemberDashboardData` fetch one program at a time with full workout tree
- `openMemberView` clears stale workout state and uses fresh assignments from `loadMemberAssignments`
- Effect refreshes member workout when assignments change while a member view is open
- `openAssignedWorkout` uses shared full-program fetch helper

### Files Changed

- `lib/training/programFetch.ts` (new)
- `app/page.tsx`

### Database Changes

None.

### Testing Steps

1. Create or pick a published program with multiple workout days (e.g. Wednesday + Friday)
2. Assign that program to a group member
3. Open the member workout from Groups — both days should appear immediately
4. Switch weeks and days — all scheduled workouts for that week should be listed
5. Assignee Training tab should show the same full program without delayed day appearance
6. Open an assigned single-workout assignment — workout loads completely

### Known Issues

None identified.

### Recommended Commit Message

```text
BIQ-0096 Fix incomplete workout days after program assign
```

---

## BIQ-0097 - Exercise Session History From Last Session

Date: 2026-08-04  
Branch: main  
Status: Completed

### Summary

Tap **Last session** on a strength exercise to open a popup with prior weeks of that exercise from the same workout day (e.g. all Wednesday bench sessions across the program).

### Purpose

Athletes need a quick way to compare prior weeks for the same exercise without leaving Training or digging through Progress.

### Changes

- **Last session** is clickable when history exists; shows “View all weeks” hint
- Modal lists sessions by program week and date with per-set weight/reps
- History scoped to the current workout day (Wednesday → prior Wednesdays)
- Includes today’s in-progress logs when viewing the current session

### Files Changed

- `lib/training/exerciseSessionHistory.ts` (new)
- `app/components/training/ExerciseSessionHistoryModal.tsx` (new)
- `app/page.tsx`
- `app/globals.css`

### Database Changes

None.

### Testing Steps

1. Log an exercise across multiple program weeks on the same day (e.g. Week 1 Wed and Week 2 Wed)
2. Open Week 3 of that day in Training
3. Expand the exercise — **Last session** should show the most recent prior week
4. Tap **Last session** — modal lists all prior weeks with set details
5. Close modal with Close or backdrop tap
6. Exercise with no prior logs — **Last session** is plain text (not clickable)
7. Mobile — modal slides up as bottom sheet

### Known Issues

- Older logs without `snapshot_day_label` may appear when day metadata was not saved at log time

### Recommended Commit Message

```text
BIQ-0097 Add exercise session history popup from Last session
```

---

## BIQ-0098 - Fix Login When start_date Column Missing

Date: 2026-08-05  
Branch: main  
Status: Completed

### Summary

Training loads again on production when Supabase has not yet applied the `st_programs.start_date` migration. Program list queries retry without optional columns instead of blocking login with an alert.

### Purpose

Recent program index queries selected `start_date` explicitly. Production DB without migration `20250713_016` returned `column st_programs.start_date does not exist`, which triggered an alert on login and left Training with no workouts.

### Changes

- `fetchProgramIndex` retries without missing optional columns (same pattern as `insertProgramRecord`)
- `missingProgramColumnFromError` parses PostgreSQL `column … does not exist` messages
- `updateProgramStartDate` no-ops quietly when column is absent

### Files Changed

- `lib/training/programFetch.ts`
- `lib/training/programStatus.ts`
- `app/page.tsx`

### Database Changes

Apply in Supabase SQL Editor for full week/date sync:

`supabase/migrations/20250713_016_program_start_date.sql`

### Testing Steps

1. Without migration — sign in, open Training; no error alert, workouts load
2. With migration — week selector and date tabs stay aligned to program start
3. Change program start date — saves when column exists

### Known Issues

Without migration, week/date sync falls back to `created_at` (existing behavior)

### Recommended Commit Message

```text
BIQ-0098 Fix Training load when start_date column missing
```

---

## BIQ-0099 - Fix Groups Edit Workouts Program Load

Date: 2026-08-06  
Branch: main  
Status: Completed

### Summary

Groups → Programs → **Edit workouts** now opens the correct program with its name and exercises visible.

### Purpose

A React state timing bug: `loadPrograms()` ran before `draftEditProgramId` updated, so the editor loaded the wrong program (or the create wizard) without workout data. The program dropdown also set index-only rows without fetching exercises.

### Changes

- Pass `editProgramId` directly into `loadPrograms` from Groups edit flow
- Pre-fill program name from roster while full program loads
- Hide create wizard when editing; show loading state until workouts fetch
- Program dropdown fetches full program tree via `selectSetupProgram`

### Files Changed

- `app/page.tsx`

### Database Changes

None.

### Testing Steps

1. Groups → Programs → **Edit workouts** on a published program with exercises
2. Program name field and dropdown match the selected program
3. Week selector, day tabs, and exercises appear below
4. Change program in dropdown — exercises reload for that program
5. **Back to programs list** returns to roster

### Known Issues

None identified.

### Recommended Commit Message

```text
BIQ-0099 Fix Groups edit workouts program name and exercises
```

---

## BIQ-0100 - Hide Personal Mode in Groups Programs Editor

Date: 2026-08-06  
Branch: main  
Status: Completed

### Summary

Groups → Programs no longer shows the confusing **Personal program** tab or personal programs in the picker. The editor is group-only with a **Group program** title and group name in the header.

### Purpose

The Groups program wizard reused Training’s Program Setup panel, which includes Personal/Group tabs meant for the Training → Manage program flow — not for group managers editing team plans.

### Changes

- Hide Personal/Group tabs when editing from Groups → Programs
- Title reads **Group program** instead of Program setup
- Program dropdown and library list only team programs for the active group
- Header context on Groups tab shows group name (not “Personal”)

### Files Changed

- `app/page.tsx`

### Database Changes

None.

### Testing Steps

1. Groups → Programs → Edit workouts or Generate/Create
2. Confirm no **Personal program** tab
3. Program picker lists only this group’s programs
4. Header shows your name · group name
5. Training → Manage program still shows Personal/Group tabs

### Known Issues

None identified.

### Recommended Commit Message

```text
BIQ-0100 Hide personal program UI in Groups programs editor
```

---

## BIQ-0101 - Drafts Button on Groups Programs Screen

Date: 2026-08-06  
Branch: main  
Status: Completed

### Summary

Groups → Programs has a **Drafts** button beside **Generate**. The main list shows published programs; drafts open in a dedicated view where you can edit, publish, or delete them.

### Purpose

Draft team programs were mixed into the main programs list. Coaches need a clear place to find unfinished plans without cluttering published/assignable programs.

### Changes

- **Drafts** button next to Generate (shows count when drafts exist)
- Main Programs view lists published team programs only
- Drafts view lists draft programs with Edit, Publish, Duplicate, Delete
- **Back to programs** returns to the published list

### Files Changed

- `app/components/groups/TeamProgramsTab.tsx`
- `app/globals.css`

### Database Changes

None.

### Testing Steps

1. Groups → Programs — published programs show on main list; drafts hidden
2. Tap **Drafts** — see draft programs (or empty state)
3. Tap **Edit** on a draft — workout editor opens
4. Tap **Back to programs** — return to published list
5. Publish a draft — it appears on main list, removed from Drafts

### Known Issues

None identified.

### Recommended Commit Message

```text
BIQ-0101 Add Drafts view on Groups programs screen
```

---

## BIQ-0102 - Fix Final Set Log Failures and Group Dashboard Status

Date: 2026-08-06  
Branch: main  
Status: Completed

### Summary

Marking the last set complete no longer races with auto-save. Dashboard **Today's Workout** reflects group-assigned programs (not started / in progress / completed).

### Purpose

Logging the final exercise could fail when Done was tapped before debounced weight/reps saves finished — two upserts collided and one overwrote the other. Dashboard only looked at the personal `program` state, so group trainees saw no workout or wrong status.

### Changes

- Serialize set-log upserts per planned set (queue waits for prior save)
- **Done** checkbox flushes pending field saves before marking complete
- Dashboard resolves the user's effective program (group assignment or personal plan)
- Start/Continue opens Training in **Group** mode when on a team program

### Files Changed

- `app/page.tsx`
- `app/components/WorkoutSetLogger.tsx`

### Database Changes

None.

### Testing Steps

1. Log weight/reps on the last set and tap **Done** quickly — should save without error
2. Complete all sets on a group program workout — dashboard shows **Completed**
3. Start a group workout, log partial sets — dashboard shows **In progress**
4. Group member with team plan — dashboard shows today's workout and **Start Training**
5. Personal-only user — dashboard unchanged

### Known Issues

None identified.

### Recommended Commit Message

```text
BIQ-0102 Fix final set log races and group dashboard workout status
```

---

## BIQ-0103 - Quick-Pick Weight and Reps for Faster Logging

Date: 2026-08-06  
Branch: main  
Status: Completed

### Summary

Weight and reps fields now show tap-to-fill number chips (based on last session / target values). Enter or **Next** on the mobile keyboard advances to the next field without dismissing the keypad first. Free-text entry still works in every field.

### Purpose

Logging sets on mobile required too many taps: typing every value, and closing the number pad before moving weight → reps or to the next set. Quick picks and keyboard **Next** reduce friction while keeping full manual entry.

### Changes

- Tap chips under **Weight** (near last logged weight ± plate increments) and **Reps** (near last/target reps)
- Tapping a weight chip saves immediately and focuses **Reps**
- `enterKeyHint="next"` / **Enter** advances weight → reps → next set
- `onMouseDown` preventDefault on chips so taps do not blur the active field

### Files Changed

- `app/components/WorkoutSetLogger.tsx`
- `app/page.tsx`
- `app/globals.css`
- `lib/training/logQuickPick.ts` (new)

### Database Changes

None.

### Testing Steps

1. Open a strength exercise with prior session data — weight chips should cluster near last weight
2. Tap a weight chip — value saves and reps field focuses
3. Tap a reps chip — value saves without opening keyboard
4. Type a custom weight/reps value — still saves on blur / debounce
5. On mobile: enter weight, tap keyboard **Next** — reps field focuses without closing keypad
6. On mobile: enter reps, tap **Next** / Enter — first field of next set focuses
7. Bodyweight **Added** and **Assist** fields show weight quick picks

### Known Issues

None identified.

### Recommended Commit Message

```text
BIQ-0103 Add quick-pick weight and reps for faster mobile logging
```

---

## BIQ-0104 - Program Setup Calendar Fix and Generation Options

Date: 2026-08-09  
Branch: main  
Status: Completed

### Summary

Editing an exercise in Program Setup no longer jumps to a different workout day. The generation wizard adds start date, weeks, computed end date, and optional exercise/superset counts (or let AI decide).

### Purpose

After AI generation, changing one exercise triggered a full reload that realigned the calendar to “today” instead of the workout being edited — the active workout ID no longer matched the displayed week, so the UI fell back to the first workout of the week. Users also needed program dates and control over workout density at generation time.

### Changes

- **Bug fix:** In setup/edit mode, `loadPrograms` and `reloadKeepDay` preserve the active workout and sync week + log date from that workout instead of today’s calendar
- Skip auto calendar sync effects while `draftEditProgramId` is set
- **Wizard:** Start date, weeks (1–12), estimated end date, workout structure mode (AI decide vs custom counts)
- **Custom structure:** Exercises per strength day, supersets per day, exercises per superset (2–3) passed to AI prompt
- **Editing draft:** Editable start date and weeks with computed end date display
- `programEndDate()` helper in `programCalendar.ts`

### Files Changed

- `app/page.tsx`
- `app/api/programs/generate/route.ts`
- `lib/training/aiProgramPlan.ts`
- `lib/training/programCalendar.ts`

### Database Changes

None (uses existing `st_programs.start_date` and `weeks`).

### Testing Steps

1. Generate a program, open **Edit workouts**, pick Week 2 / a non-today day
2. Change or replace an exercise — same workout day should stay selected
3. In wizard step 3, set start date and weeks — end date should update
4. Choose **Set counts**, generate — strength days should reflect approximate exercise/superset targets
5. Choose **Let AI decide** — generation should behave as before
6. While editing a draft, change start date — week tabs should stay aligned to the workout you were editing

### Known Issues

Changing `weeks` on an existing draft updates the program length field but does not auto-add/remove workout rows — use generation for new multi-week plans.

### Recommended Commit Message

```text
BIQ-0104 Fix program edit workout jump and add generation date/structure options
```

---

## BIQ-0105 - Superset Linking and Catalog Duplicate Merge

Date: 2026-08-09  
Branch: main  
Status: Completed

### Summary

Standalone exercises can be joined to supersets, paired with another exercise, or turned into a new superset. Duplicate catalog names (e.g. Pull Up vs Pull-ups) merge in search and history; unused duplicates can be archived without deleting rows that have logged history.

### Purpose

Coaches need to reorganize generated workouts into supersets without re-adding exercises. Duplicate catalog entries split lift history and search results — history should unify by exercise name while preserving any catalog row tied to logged sets.

### Changes

- **Superset controls** on each standalone exercise: Join superset, Pair with…, New superset (+ add from catalog)
- **History merge** via normalized catalog name keys (Pull Up / Pull-ups / Pull Ups share history)
- **Search dedupe** uses stronger name normalization
- **Settings → Merge duplicate exercises** (catalog admin): archives unused duplicates, remaps program references; skips any catalog id with logged history

### Files Changed

- `app/page.tsx`
- `app/globals.css`
- `app/api/catalog/dedupe/route.ts` (new)
- `lib/training/catalogDedupe.ts` (new)
- `lib/training/catalogSources.ts`
- `lib/training/aiProgramPlan.ts`

### Database Changes

None (uses existing `is_archived` on `st_exercise_catalog`).

### Testing Steps

1. Edit a workout — use **Join superset**, **Pair with…**, or **New superset** on a standalone exercise
2. Log sets under “Pull Ups” and “Pull-up” variants — **Last session** should show combined history
3. Exercise search should show one Pull Up entry (guided library preferred)
4. Catalog admin: Settings → **Merge duplicate exercises** — confirm unused dupes archived; dupes with logs remain

### Known Issues

None identified.

### Recommended Commit Message

```text
BIQ-0105 Add superset linking and safe catalog duplicate merge
```

---

## BIQ-0106 - Focus Overlay for Weight and Reps Logging

Date: 2026-08-09  
Branch: main  
Status: Completed

### Summary

Replaced always-visible quick-pick chips with a small overlay that appears when you tap/focus weight or reps. Shows up to five values near last logged (or target reps).

### Purpose

Inline chips added clutter; users wanted a cleaner field that reveals nearby numbers only when logging.

### Changes

- Tap **Weight** or **Reps** → compact overlay with values near last session
- Overlay dismisses on pick, outside tap, Escape, or Enter
- Free-text entry unchanged; keyboard **Next** still advances fields
- Weight/reps suggestions prioritize last logged value over current draft

### Files Changed

- `app/components/WorkoutSetLogger.tsx`
- `app/globals.css`
- `lib/training/logQuickPick.ts`

### Database Changes

None.

### Testing Steps

1. Open a logged exercise — set rows should not show chip rows under fields
2. Tap **Weight** — overlay appears with values near last weight
3. Tap a value — saves and moves to reps (weight field)
4. Tap **Reps** — overlay with values near last reps
5. Type a custom value — still works; overlay closes on blur

### Known Issues

None identified.

### Recommended Commit Message

```text
BIQ-0106 Replace inline log chips with focus overlay for weight and reps
```

---

## BIQ-0107 - Nutrition Recent Foods and Save Logged Items to My Foods

Date: 2026-08-10  
Branch: main  
Status: Completed

### Summary

Logged meal items can now be saved to **My foods** after the fact. Add food and the **My foods & recent** overlay search both saved foods and your last 90 days of logged items for one-tap reuse on any day.

### Purpose

Users wanted everything they log to be easy to find and add again later, not only items explicitly saved when first logged.

### Changes

- **Save** on each meal entry adds that item to My foods and links the log entry
- **Recent & saved** search in Add food panel for quick one-tap logging
- **My foods & recent** overlay combines saved library + deduped recent history
- Loads last 90 days of meal history for recent food suggestions (no database migration)

### Files Changed

- `lib/nutrition/recentFoods.ts` (new)
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Log a food without “Save to my foods” — it appears under Recent in Add food
2. Tap **Save** on a past meal entry — item moves to My foods; entry shows **Saved**
3. Change to another day → Add food → search and add the same item from Recent & saved
4. Open **My foods & recent** → search and add to any meal
5. Confirm logged macros still snapshot correctly on the new day

### Recommended Commit Message

```text
BIQ-0107 Add recent foods search and save logged items to My foods
```

---

## BIQ-0112 - Dedupe Exercise History Alias Rows

Date: 2026-08-12  
Branch: main  
Status: Completed

### Summary

History modal was listing the same logged sets multiple times (e.g. 3 sets shown as 9) because lift history is indexed under several exercise alias keys and those lists were concatenated without deduping.

### Purpose

Each set log should appear once per session when reviewing History, especially on Groups member workouts.

### Changes

- Deduplicate history rows by log id (fallback: planned set + date + set number + values) before building the History modal

### Files Changed

- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Groups → member workout → expand an exercise with prior logs → **History**
2. Confirm each session shows the real set count once (3 sets → 3 rows, not 9)

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0112 Deduplicate exercise history rows across alias keys
```

---

## BIQ-0111 - Member Workout History, Placeholders, and Log Date Calendar

Date: 2026-08-12  
Branch: main  
Status: Completed

### Summary

Fixed Groups member workout view so prior set history loads for the member (History + dimmed previous weight/reps), and made Logging date a always-visible native calendar picker that stays independent of which workout day is selected.

### Purpose

Coaches reviewing a member’s workout from last week need to see what that member logged, change the logging date to today via a calendar, and keep Monday’s plan selected while logging on another date.

### Changes

- Load lift history for the viewed member (was skipped for non-self member views)
- History / previous-set placeholders use the member’s logging date as the cutoff
- Logging date uses a native calendar (`type="date"`) and is always shown under Week
- Selecting a workout day or week in member view no longer overwrites the logging date
- Opening a member workout resets logging date to today
- History falls back to all weeks for the exercise if same-day filter returns empty

### Files Changed

- `app/page.tsx`
- `app/components/DateInput.tsx`
- `app/components/training/TrainingWeekSelector.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Groups → open a member workout who logged last week
2. Expand a strength exercise — weight/reps placeholders should show prior values; **Copy last** available when prior exists
3. Tap **History** — weekly sessions appear
4. Under Week, use **Logging date** calendar — change from Monday to today; date updates and logs reload for that date
5. Switch workout day chips (e.g. Mon → Wed) — logging date stays put
6. Personal Training logging date also uses the calendar picker

### Known Issues

- If the program was fully regenerated and exercises renamed without catalog IDs, history may still miss some older rows until names/IDs align

### Recommended Commit Message

```text
BIQ-0111 Fix member workout history/placeholders and calendar log date
```

---

## BIQ-0110 - Exercise Weekly Log History Button

Date: 2026-08-11  
Branch: main  
Status: Completed

### Summary

Added a compact **History** button on each strength exercise card that opens a week-by-week view of what was logged for that exercise in the plan (same day of week across weeks).

### Purpose

Users still need a quick way to review prior weekly loads while logging, without bringing back the old always-visible last-session / suggested-next box.

### Changes

- **History** button on expanded non-mobility exercises (next to Form guide)
- Opens existing session history modal titled **Logged by week**, grouped by week with set details
- Includes today’s logged sets plus prior history for the matching workout day

### Files Changed

- `app/page.tsx`
- `app/components/training/ExerciseSessionHistoryModal.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Open Training → expand a strength exercise → tap **History**
2. Confirm modal lists prior weeks (Week N · day · date) with set summaries
3. Log sets today, reopen History — today’s session appears
4. Mobility/stretch exercises do not show History
5. Modal Close and overlay tap dismiss correctly on mobile

### Known Issues

- History is filtered to the same workout day label when available; other-day logs for the same exercise name may not appear

### Recommended Commit Message

```text
BIQ-0110 Add History button to show weekly logged sets per exercise
```

---

## BIQ-0109 - Simplify Workout Logging Controls

Date: 2026-08-10  
Branch: main  
Status: Completed

### Summary

Streamlined Training exercise cards: weight/reps are free-text again (no quick-pick overlay), removed the last-session / suggested-next context box and Restore logged workouts banner, and tucked Join/Pair/New superset actions under an Edit button.

### Purpose

Reduce clutter while logging so the set inputs stay primary. Superset linking remains available when editing, without crowding every exercise head.

### Changes

- Removed weight/reps quick-pick overlay; inputs are plain free text (previous values still show as placeholders; Copy last remains)
- Removed per-exercise Last session / View all weeks / Suggested next box
- Removed Training “Restore logged workouts” banner and Progress “Restore history” button (silent auto-reattach after program reload still runs; Groups restore tools unchanged)
- Join superset / Pair with / New superset now appear under an Edit → Done toggle on standalone exercises

### Files Changed

- `app/components/WorkoutSetLogger.tsx`
- `app/page.tsx`
- `app/globals.css`
- `lib/training/logQuickPick.ts` (deleted)
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Open Training → expand a strength exercise — no Last session / Suggested next box under the name
2. Tap a weight or reps field — no quick-pick chips; type a value and blur/Enter to save
3. Confirm previous session values still appear as placeholders and **Copy last** still works
4. With program edit access, tap **Edit** on a standalone exercise — Join superset, Pair with, and New superset appear; tap **Done** to hide
5. Confirm Restore logged workouts banner no longer shows on Training; Progress tab has Refresh only (no Restore history)
6. Check mobile width: exercise head actions wrap cleanly with Edit / Change / arrows / + Set / Remove

### Known Issues

- Groups member/team “Restore history” buttons remain for coaches after program redo
- Exercise session history modal component remains in the repo but is unused in Training UI

### Recommended Commit Message

```text
BIQ-0109 Simplify workout logging: free-text weight, hide restore banner, tuck supersets under Edit
```

---

## BIQ-0110 - Serving Size Number Separate from Amount

Date: 2026-08-12  
Branch: main  
Status: Completed

### Summary

Food logging now uses three serving fields: **Serving size** (number), **Unit**, and **Amount** (how many of that serving size you had). Example: serving size `1` + unit `cup` + amount `0.5` = half a cup; macros scale by amount.

### Purpose

Users need to define what one serving is on the label (size + unit) separately from how much they actually ate.

### Changes

- Form fields: Serving size, Unit, Amount (with helper text)
- Calories/macros are entered per defined serving (size + unit); totals multiply by amount
- Entry rows display e.g. `0.5 × 1 cup`
- New `serving_size` column on `st_meal_entries` (default `1`); `serving_qty` stores amount eaten

### Files Changed

- `lib/nutrition/servingUnits.ts`
- `lib/nutrition/macros.ts`
- `lib/nutrition/recentFoods.ts`
- `lib/nutrition/aiFoodEstimate.ts`
- `lib/nutrition/barcodeLookup.ts`
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `supabase/migrations/20250812_040_meal_entry_serving_size.sql` (new)
- `CHANGELOG.md`

### Database Changes

- `st_meal_entries.serving_size` numeric not null default `1`

### Testing Steps

1. Run migration `20250812_040_meal_entry_serving_size.sql` in Supabase
2. Log food: serving size `1`, unit `cup`, amount `0.5`, enter calories per 1 cup — verify half the calories log
3. Edit entry inline — all three fields load correctly
4. Entry row shows `0.5 × 1 cup`
5. Save to My foods — serving label reflects size + unit

### Recommended Commit Message

```text
BIQ-0110 Separate serving size number from amount eaten
```

---

## BIQ-0108 - Inline Food Edit and Serving Amount + Unit

Date: 2026-08-10  
Branch: main  
Status: Completed

### Summary

Editing a logged food now opens inline on the meal row instead of jumping to a form at the top of the page. Logging and editing food includes **Amount** (number) and **Unit** (serving, cup, oz, g, etc.) fields.

### Purpose

Users wanted to edit items where they appear in the meal list, and to log foods with a clear serving size and unit of measure rather than only a generic servings count.

### Changes

- Inline edit form replaces the top-of-page edit card; scroll stays near the item
- **Amount** + **Unit** fields on add and edit food forms
- Meal entries store `serving_unit`; entry rows show amount + unit (e.g. `2 cups`)
- New migration adds `serving_unit` to `st_meal_entries` (default `serving`)

### Files Changed

- `lib/nutrition/servingUnits.ts` (new)
- `lib/nutrition/macros.ts`
- `lib/nutrition/recentFoods.ts`
- `lib/nutrition/aiFoodEstimate.ts`
- `lib/nutrition/barcodeLookup.ts`
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `supabase/migrations/20250810_039_meal_entry_serving_unit.sql` (new)
- `CHANGELOG.md`

### Database Changes

- `st_meal_entries.serving_unit` text not null default `'serving'`

### Testing Steps

1. Run migration `20250810_039_meal_entry_serving_unit.sql` in Supabase
2. Log a food with amount `2` and unit `cup` — row shows `· 2 cups`
3. Tap **Edit** on a meal entry — form opens inline; page does not jump to top
4. Change amount/unit/macros and save — totals and display update correctly
5. Copy yesterday / duplicate entry — serving unit preserved
6. Add food panel manual entry still works with amount + unit on mobile

### Known Issues

- Existing entries without migration applied will fail on save until `serving_unit` column exists

### Recommended Commit Message

```text
BIQ-0108 Inline food edit and serving amount with unit field
```

---

## BIQ-0111 - Test and Live Environment Pipeline

Date: 2026-08-11  
Branch: main  
Status: Completed

### Summary

Documented and scripted a full test → live workflow: push to `Develop` for a Vercel **Preview** deploy + test Supabase, promote to `main` for **Production** + live Supabase — all on the same Vercel project (`builtiq`).

### Purpose

Enable safe iteration on a dedicated test site without touching live users, using GitHub + Vercel only (no local npm required).

### Changes

- Added `docs/ENVIRONMENTS.md` — one-time Vercel/Supabase setup and daily operator steps
- Added `buildiq-push-test.cmd` — push `Develop` to trigger test deploy
- Added `buildiq-promote-live.cmd` — merge `Develop` → `main` with confirmation for live deploy
- Updated README branch/deployment section and `.env.example` comments
- Added Decision 027 in DECISIONS.md

### Files Changed

- `docs/ENVIRONMENTS.md` (new)
- `buildiq-push-test.cmd` (new)
- `buildiq-promote-live.cmd` (new)
- `README.md`
- `.env.example`
- `DECISIONS.md`
- `CHANGELOG.md`

### Database Changes

None (operator runs existing migrations on test Supabase during one-time setup).

### Testing Steps

1. Follow `docs/ENVIRONMENTS.md` one-time setup: set **Preview** env vars (test Supabase) and **Production** env vars (live Supabase) on Vercel project `builtiq`
2. Commit on `Develop`, run `buildiq-push-test.cmd` — confirm a Preview deployment builds
3. Verify preview URL loads, login works (test Supabase redirect URLs include preview domain)
4. Run `buildiq-promote-live.cmd`, type `LIVE` — confirm `main` push triggers Production deploy
5. Confirm live site still uses production Supabase (not test data)

### Known Issues

- Remote test branch is named `Develop` (capital D); scripts handle `develop` as fallback
- Preview URL is longer than the live domain; bookmark the `Develop` branch preview URL
- Optional second Vercel project documented for teams wanting a stable test domain
- SQL migrations must still be applied manually per environment (test first, then live)

### Recommended Commit Message

```text
BIQ-0111 Add test-to-live deployment pipeline docs and helper scripts
```

---

## BIQ-0112 - Fix Barcode Calorie Scaling from Open Food Facts

Date: 2026-08-12  
Branch: main  
Status: Completed

### Summary

Barcode scans no longer treat **per 100 g** calories as a full serving when the package serving is smaller (e.g. blue corn tortillas showing 220 cal instead of ~170). Per-serving values are scaled using OFF serving weight, and Review & edit no longer double-counts servings.

### Purpose

Open Food Facts often stores nutrition per 100 g while the package serving is smaller; some products also copy the 100 g calorie value into the per-serving field. Users were logging inflated calories.

### Changes

- Scale per-100 g nutrients by parsed serving weight (`serving_quantity` / grams in `serving_size`)
- Detect when OFF per-serving equals per-100 g for a sub-100 g serving and recalculate
- `barcodeResultToDraft` passes **per-serving** macros to the manual form (amount field handles quantity)
- Barcode log entries store parsed serving size + unit (e.g. 50 g) on the meal entry
- My foods save from barcode stores per-serving macros, not pre-multiplied totals

### Files Changed

- `lib/nutrition/barcodeLookup.ts`
- `app/components/NutritionTracker.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Scan a product where OFF has ~220 kcal/100 g and a ~77 g serving — card should show ~170 cal, not 220
2. Log directly from barcode card — logged calories match the card
3. Use **Review & edit** with servings = 2 — logged total = 2× per-serving (no double scale)
4. El Milagro-style products with correct OFF per-serving data still show unchanged values
5. Products with only per-100 g data and no serving weight still show a per-100 g warning

### Recommended Commit Message

```text
BIQ-0112 Fix barcode calories scaled from per-100g Open Food Facts data
```

---

## BIQ-0113 - Barcode Serving Size Matches Package Label (28 g Tortillas)

Date: 2026-08-12  
Branch: main  
Status: Completed

### Summary

Barcode **Review & edit** no longer defaults to the wrong gram weight (e.g. 50 g for a 2-tortilla pack when the label is **1 tortilla / 28 g**). Serving size now prefers packaging text, infers grams from nutrient ratios, and uses **per-tortilla** weight for multi-pack tortillas.

### Purpose

Open Food Facts often stores total pack serving weight (`serving_quantity` = 50 g for 2 tortillas) while the nutrition label is per single tortilla (~28 g).

### Changes

- Prefer grams parsed from `serving_size` text over stale `serving_quantity`
- Infer actual OFF serving weight from per-serving vs per-100 g nutrients
- For tortillas sold as multiples (e.g. `2 tortillas (55 g)`), use per-tortilla grams (~28 g)
- Scale calories/macros when display serving is smaller than OFF’s multi-serving basis

### Files Changed

- `lib/nutrition/barcodeLookup.ts`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Scan blue corn tortillas with label **1 tortilla (28 g)** — Review & edit shows serving size **28**, unit **g**
2. Scan a product listed as `2 tortillas (50–55 g)` — serving size shows **~25–28 g** (one tortilla), not 50 g
3. Confirm calories scale down proportionally (half of a 2-tortilla OFF serving when using 1 tortilla)
4. Scan a product with correct matching OFF fields — values unchanged

### Recommended Commit Message

```text
BIQ-0113 Fix barcode serving size to match single-tortilla label grams
```

---

## BIQ-0114 - Fix Barcode 220 cal When Label Shows 130

Date: 2026-08-13  
Branch: main  
Status: Completed

### Summary

Fixed barcode scans showing **220 calories** (Open Food Facts per-100 g value) when the package label says **130 calories** for one tortilla (~28 g).

### Root cause

When OFF copies per-100 g calories into the per-serving field (both 220), we inferred a 100 g serving and returned 220 kcal unchanged.

### Changes

- Reject per-serving values that match per-100 g (bad OFF copy)
- Scale per-100 g calories by label serving grams (e.g. 28 g → ~62 cal, or use trusted per-serving when available)
- For **1 tortilla (28 g)** labels, use trusted OFF per-serving calories directly (e.g. 130 kcal)
- Disable long-lived fetch cache on OFF API calls during lookup

### Files Changed

- `lib/nutrition/barcodeLookup.ts`
- `scripts/test-barcode-parse.ts`
- `CHANGELOG.md`

### Testing Steps

1. Run `npx tsx scripts/test-barcode-parse.ts` — all cases pass
2. Redeploy or restart local dev server (required — previous fixes may not be live yet)
3. Scan tortillas — should **not** show 220 cal if OFF has 130 kcal per serving
4. Review & edit — serving size **28 g**, calories **~130** when label matches
5. If still wrong, use **Review & edit** to match label exactly (OFF data varies by product)

### Recommended Commit Message

```text
BIQ-0114 Fix barcode showing per-100g calories instead of label serving
```

---

## BIQ-0115 - Garden Fresh Chips Barcode 4767100030 (28 g / ~130 cal)

Date: 2026-08-13  
Branch: main  
Status: Completed

### Summary

Fixed barcode **4767100030** (Garden Fresh Blue Corn Tortilla **Chips**) showing **220 calories** from stale Open Food Facts data (50 g / 20 chips) instead of the package label (**28 g / ~130 cal**).

### Root cause

- Manual 10-digit UPC did not match OFF EAN-13 (`0647671000306`)
- OFF lists a bulk chip serving (50 g, 220 kcal) while current labels use the standard **28 g (1 oz)** serving (~130 kcal)

### Changes

- Expand 10-digit barcode lookup to EAN-13 (`06` + code + check digit)
- Normalize multi-unit chip servings to **28 g** and scale nutrients from OFF per-serving basis

### Files Changed

- `lib/nutrition/barcodeLookup.ts`
- `scripts/test-barcode-parse.ts`
- `CHANGELOG.md`

### Testing Steps

1. Run `npx tsx scripts/test-barcode-parse.ts`
2. Deploy to Vercel, force-quit Safari on iPhone, rescan or enter **4767100030**
3. Expect **~123 cal** at **28 g** (OFF per-100 g rounding; label may show 130 — use Review & edit or label photo for exact match)

### Recommended Commit Message

```text
BIQ-0115 Fix Garden Fresh chip barcode serving 50g→28g and 10-digit UPC lookup
```

---

## BIQ-0116 - Dismiss Assigned Workouts, Default Group, Log Date Hint

Date: 2026-08-13  
Branch: main  
Status: Completed

### Summary

- **Remove assigned workout** — athletes can dismiss pending/started group assignments (marks recipient as skipped)
- **Default group** — save preferred group on profile; restored on reload instead of arbitrary first team
- **Logging date hint** — explains how calendar date relates to workout day tabs (Mon/Tue/…)

### Purpose

Users in multiple groups need a stable default group. Assigned workouts could only be hidden, not removed from the list. Logging date vs program day was unclear.

### Files Changed

- `app/page.tsx` — dismiss assignment, default team load/save, sorted teams
- `app/components/groups/AssignedWorkoutsPanel.tsx` — Remove button
- `app/components/groups/TeamSelector.tsx` — Set as default group
- `app/components/groups/GroupsHub.tsx` — wire default team props
- `app/components/training/TrainingWeekSelector.tsx` — log date hint
- `app/globals.css` — hint styling
- `supabase/migrations/20250813_041_profile_default_team.sql`
- `CHANGELOG.md`

### Database Changes

- `st_profiles.default_team_id` (nullable FK to `st_teams`, ON DELETE SET NULL)

Run migration `20250813_041_profile_default_team.sql` on test Supabase, then production.

### Testing Steps

1. Run migration on Supabase
2. **Dismiss assignment:** Training → Assigned Workouts → Remove on pending assignment → confirm gone; if open, returns to personal program
3. **Default group:** Groups → team menu → Set as default group → reload app → same group selected
4. **Log date hint:** Training → read hint under Logging date; change date → week/day tabs sync; pick Mon tab → date moves to that weekday in current program week
5. Mobile: Remove button and default group action usable on phone

### Known Issues

- Coach cannot cancel assignments for the whole group yet (athlete dismiss only)
- Default group not shown on Training group dropdown (Groups selector only)

### Recommended Commit Message

```text
BIQ-0116 Dismiss assigned workouts, default group preference, log date hint
```

---

## BIQ-0117 - Garden Fresh Chip Barcode 130 cal Label Alignment

Date: 2026-08-13  
Branch: main  
Status: Completed

### Summary

Fixed barcode **4767100030** (Garden Fresh Blue Corn Tortilla Chips) showing **123 calories** at **28 g** after BIQ-0115 serving normalization; package label reports **130 cal / 28 g**.

### Root cause

- BIQ-0115 correctly normalized OFF bulk serving **20 chips (50 g) / 220 kcal** to the standard **28 g** chip serving
- Linear scaling from OFF **440 kcal/100g** yields **123 kcal @ 28g** (`220 × 28/50` or `440 × 0.28`)
- US chip labels commonly round calories up to the nearest **10 kcal** above 50 (label shows **130**, equivalent to ~**464 kcal/100g**)

### Changes

- After bulk→28 g chip normalization, apply label-aligned calorie rounding (`ceil` to nearest 10 kcal) so typical snack labels match scan results

### Files Changed

- `lib/nutrition/barcodeLookup.ts`
- `scripts/test-barcode-parse.ts`
- `CHANGELOG.md`

### Database Changes

None

### Testing Steps

1. Run `npx tsx scripts/test-barcode-parse.ts` — Garden Fresh case expects **130 cal @ 28 g**
2. Scan or enter barcode **4767100030** (OFF **0647671000306**)
3. Confirm **130 calories** at **28 g** serving
4. Verify other barcode cases in test script still pass

### Known Issues

- Macros (protein, carbs, fat) still scale linearly from OFF; only calories get label rounding for chip normalization
- Other chip products with different OFF densities may round up by up to ~7 kcal

### Recommended Commit Message

```text
BIQ-0117 Align Garden Fresh chip barcode calories to 130 cal label at 28g
```

---

## BIQ-0119 - Meal Photo AI Macro Estimate

Date: 2026-08-14  
Branch: main  
Status: Completed

### Summary

Added **Meal photo** in Nutrition → Add food: take or import a photo of a plate/bowl and AI estimates macros for each visible food item.

### Purpose

Let users log whole meals from a photo without typing descriptions or scanning barcodes — complements label OCR (packaged) and text AI estimate.

### Files Changed

- `lib/nutrition/mealPhotoEstimate.ts` — vision prompt, validation, response parsing
- `app/api/nutrition/scan-meal/route.ts` — authenticated POST with OpenAI vision
- `app/components/NutritionTracker.tsx` — meal photo upload UI, shared image encode helper, reuses AI result chips (Use / Log all)

### Database Changes

None.

### Testing Steps

1. Sign in → Nutrition → Add food → **Meal photo** → take or choose a photo of a plate with multiple foods
2. Confirm AI returns one or more items with calories and macros
3. **Use** prefills manual form; **Log all** logs every item to the selected meal
4. Test on iPhone PWA — camera capture should open from file input
5. Blurry / empty photo → friendly error message
6. Requires `OPENAI_API_KEY` on server (same as label OCR)

### Known Issues

- Estimates are approximate; hidden ingredients (oils, sauces) may be missed
- Very dark or crowded photos reduce accuracy — user should verify or edit before logging

### Recommended Commit Message

```text
BIQ-0119 Add meal photo AI macro estimation for plated foods
```

---

## BIQ-0120 - Nutrition Photo Picker Allows Photo Library

Date: 2026-08-14  
Branch: main  
Status: Completed

### Summary

Removed `capture="environment"` from meal photo and nutrition label file inputs so iPhone and other mobile browsers show the native chooser (Camera **or** Photo Library) instead of opening the camera only.

### Files Changed

- `app/components/NutritionTracker.tsx`
- `CHANGELOG.md`

### Testing Steps

1. Deploy or restart dev server
2. Nutrition → Add food → **Take or choose meal photo**
3. On iPhone: confirm options include **Photo Library** and **Take Photo**
4. Pick an existing photo → meal estimate runs as before

### Recommended Commit Message

```text
BIQ-0120 Allow photo library for meal and label nutrition uploads
```

---

## BIQ-0124 - Add Food Hub Screen (Method Picker)

Date: 2026-08-19  
Branch: develop  
Status: Completed

### Summary

Replaced the long scrollable Add food overlay with a **hub-first flow**: scan barcode, nutrition label, meal photo, find/estimate, or manual entry — each in its own sub-view with back navigation and meal-type tabs.

### Purpose

NUTR-4 — reduce cognitive load when logging food; match mobile-first patterns (one primary action per screen).

### Files Changed

- `app/components/nutrition/NutritionAddFoodPanel.tsx` (new)
- `app/components/nutrition/NutritionAddFoodTypes.ts` (new)
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Database Changes

None

### Testing Steps

1. Nutrition → **Add food** → confirm hub shows four method buttons + **Enter manually**
2. Tap each method → confirm sub-view opens with **← Back** and meal tabs (Breakfast/Lunch/Dinner/Snacks)
3. Barcode flow: open camera, scan or manual UPC, log or review manual
4. Label / meal photo: pick image → inline AI results appear
5. Find or estimate: search recent/saved/templates/catalog; AI describe still works
6. Manual entry: form logs to selected meal
7. Mobile: touch targets on hub grid and meal tabs feel usable

### Known Issues

- Hub does not auto-open barcode camera (user taps **Open camera scanner** on barcode view)

### Recommended Commit Message

```text
BIQ-0124 Add Food hub with dedicated logging method sub-views
```

---

## BIQ-0125 - Inline AI Estimate Results (Log / Edit)

Date: 2026-08-19  
Branch: develop  
Status: Completed

### Summary

AI results from label OCR, meal photo, and text estimate now show **inline Log and Edit** actions per item (plus **Log all** for multi-item meals) without forcing users into manual entry first.

### Purpose

NUTR-5 — faster logging after AI scans; edit remains one tap away.

### Files Changed

- `app/components/nutrition/NutritionAiEstimateResults.tsx` (new)
- `app/components/nutrition/NutritionAddFoodPanel.tsx`
- `app/components/NutritionTracker.tsx`
- `CHANGELOG.md`

### Database Changes

None

### Testing Steps

1. Add food → **AI meal photo** → upload photo with multiple foods → **Log** one item; **Log all** for remainder
2. Label scan → single item → **Log** logs directly; **Edit** opens manual form prefilled
3. Find or estimate → AI describe → same inline actions
4. Confirm successful log closes Add food panel and entries appear on day view

### Known Issues

None

### Recommended Commit Message

```text
BIQ-0125 Inline Log/Edit actions for AI nutrition estimates
```

---

## BIQ-0126 - Add Food Hub Auto-Launch and Split Find vs AI

Date: 2026-08-19  
Branch: develop  
Status: Completed

### Summary

Hub buttons now **open the scanner or photo picker immediately** (barcode camera, label photo, meal photo). Split **Find food** (saved meals, recent/saved foods, catalog search) from **AI estimate** (text-only describe flow).

### Files Changed

- `app/components/nutrition/NutritionAddFoodPanel.tsx`
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Testing Steps

1. Add food → **Scan barcode** → camera opens without extra tap
2. **Scan nutrition label** / **AI meal photo** → native photo picker opens (Camera or Library on iPhone)
3. **Find food** → saved meals list + recent/saved; search filters catalog
4. **AI estimate** → text box only; estimate → inline Log/Edit results

### Recommended Commit Message

```text
BIQ-0126 Auto-open scan/photo from Add Food hub; split Find food and AI estimate
```

---

## BIQ-0121 - Expandable Meal Headers with Calorie Totals

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

Each meal section (Breakfast, Lunch, Dinner, Snacks) shows **aggregate calories and macros** in a tappable header. Tap to expand or collapse the item list. Meals with logged food auto-expand when switching dates.

### Files Changed

- `app/components/NutritionTracker.tsx`
- `lib/nutrition/mealDisplay.ts` (new)
- `app/globals.css`
- `CHANGELOG.md`

### Testing Steps

1. Log food in multiple meals → each header shows calorie total + P/C/F
2. Tap header → list collapses; tap again → expands
3. Collapsed header still shows totals
4. Empty meals show `0 cal`
5. **+ Add to meal** works when collapsed
6. Change date → meals with entries expand; empty meals stay collapsed

### Recommended Commit Message

```text
BIQ-0121 Expandable meal headers with per-meal calorie totals
```

---

## BIQ-0122 - Per-Meal Calorie Share of Daily Goal

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

Meal headers include **% of daily calorie goal** (e.g. `420 cal · 24% of daily goal · 35P · 40C · 12F`). Uses total daily goal from saved nutrition goals; empty meals show `0% of daily goal`.

### Files Changed

- `lib/nutrition/mealDisplay.ts`
- `app/components/NutritionTracker.tsx`
- `CHANGELOG.md`

### Testing Steps

1. Set nutrition goals (e.g. 2000 cal)
2. Log ~500 cal breakfast → header shows ~25% of daily goal
3. Add/remove entries → percentage updates live
4. No goals set → shows calories and macros only (no %)

### Recommended Commit Message

```text
BIQ-0122 Show per-meal calorie share of daily goal on meal headers
```

---

## BIQ-0127 - Tap Nutrition Date to Open Calendar Picker

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

The date badge at the top of Nutrition is now **tappable** — opens the native calendar picker to jump to any date. Prev/next day arrows still work; weekly summary date taps unchanged.

### Files Changed

- `app/components/DateInput.tsx` (forwardRef + className)
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Testing Steps

1. Nutrition → tap the **date badge** → native calendar opens (iPhone Safari / PWA)
2. Pick a past date → that day's entries and totals load
3. Prev/next arrows still change day by one
4. Swipe on macro rings still changes day

### Recommended Commit Message

```text
BIQ-0127 Tap nutrition date badge to open calendar picker
```

---

## BIQ-0128 - Copy Food or Meal to Another Date

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

**Copy** on a food row opens a sheet to pick **target date** and **meal**. **Copy meal** on each meal section copies all items in that meal. Creates new entries without changing the source. Navigates to the target date when copying to a different day.

### Files Changed

- `app/components/nutrition/NutritionCopyFoodPanel.tsx` (new)
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Testing Steps

1. Log several items in Breakfast → **Copy meal** → pick tomorrow + Lunch → confirm → view jumps to tomorrow with copied items
2. **Copy** on a single row → change date/meal → confirm → entries appear on target day
3. Copy to same day/meal → duplicates appear (same macros snapshot)
4. **Copy yesterday** quick action still works unchanged

### Recommended Commit Message

```text
BIQ-0128 Copy food or whole meal to another date and meal
```

---

## BIQ-0130 - Per-Meal Calorie Targets on Meal Headers

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

Meal headers now show **logged vs allocated calories** for each meal (e.g. `420 / 625 cal`) instead of % of daily goal. Daily goal is split: Breakfast 25%, Lunch 35%, Dinner 35%, Snacks 5%.

### Example (2500 cal goal)

| Meal | Target |
|------|--------|
| Breakfast | 625 cal |
| Lunch | 875 cal |
| Dinner | 875 cal |
| Snacks | 125 cal |

### Files Changed

- `lib/nutrition/mealDisplay.ts`
- `app/components/NutritionTracker.tsx`
- `CHANGELOG.md`

### Recommended Commit Message

```text
BIQ-0130 Show per-meal calorie targets on nutrition meal headers
```

---

## BIQ-0131 - Remove "This Week" Summary Box from Nutrition

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

Removed the bottom **This week** metrics card (days logged, avg cal/day, week totals table). Weekly view is replaced by the new 7-day trend chart.

### Files Changed

- `app/components/NutritionTracker.tsx`
- `app/components/NutritionWeeklySummary.tsx` (removed)
- `CHANGELOG.md`

### Recommended Commit Message

```text
BIQ-0131 Remove legacy This week nutrition summary box
```

---

## BIQ-0132 - Weekly Macro Trend Chart with Metric Tabs

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

Added **7-day trend** chart at the bottom of Nutrition with tabs for **Calories | Protein | Carbs | Fat**. Shows the seven days ending on the selected date. Tap a bar to jump to that day. Daily goal line shown for the active metric.

### Files Changed

- `app/components/NutritionWeeklyTrendChart.tsx` (new)
- `lib/nutrition/weeklySummary.ts` (`buildSevenDayNutritionSummary`)
- `app/components/NutritionTracker.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Testing Steps

1. Log food across several days → chart bars update for each metric tab
2. Switch Calories / Protein / Carbs / Fat tabs → values and scale change
3. Tap a bar → navigates to that date
4. Goal hint and goal line visible when goals are set

### Recommended Commit Message

```text
BIQ-0132 Add 7-day nutrition trend chart with macro metric tabs
```

---

## BIQ-0133 - Multi-Series Line Chart for Weekly Nutrition Trend

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

Replaced the weekly bar chart with a **multi-series line chart** showing Calories, Protein, Carbs, and Fat together. Each line uses **% of daily goal** so all macros share one scale. Dashed line marks 100% goal; tap a point or day label to jump dates.

### Files Changed

- `app/components/NutritionWeeklyTrendChart.tsx`
- `app/globals.css`
- `CHANGELOG.md`

### Recommended Commit Message

```text
BIQ-0133 Weekly nutrition multi-series line chart by macro
```

---

## BIQ-0123 - Move Edit Nutrition Goals to Settings

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

Moved daily calorie and macro goal editing from the Nutrition tab to **Settings**. The Nutrition tab keeps read-only progress rings and a link to Settings; Mifflin-St Jeor profile-based suggestions remain available when editing goals.

### Purpose

Keep the Nutrition screen focused on logging and daily progress while grouping long-term preferences with other profile settings (NUTR-3).

### Files Changed

- `app/components/nutrition/NutritionGoalsSettings.tsx` (new)
- `app/components/NutritionTracker.tsx`
- `app/page.tsx`
- `app/globals.css`
- `docs/JIRA-NUTRITION-BACKLOG.md`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

- Open Nutrition tab — confirm macro rings show vs goals; no Edit goals button; read-only goals line with **Edit in Settings** link.
- Tap **Edit in Settings** — navigates to Settings with Nutrition goals card.
- In Settings, edit and save goals — confirm save succeeds.
- With profile weight/height/sex filled, confirm suggested goals banner and **Fill from profile suggestion** work.
- Return to Nutrition tab — confirm updated goals appear in rings and meal targets.
- Save goals in Settings — confirm Dashboard nutrition card updates.
- Test on mobile width — Settings goal form uses existing row layout.

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0123 Move nutrition goal editing to Settings
```

---

## BIQ-0134 - Unified Find Food Search for Saved Foods and Meal Templates

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

**Find food** now uses one search field for **My foods**, **recent items**, and **meal templates** together. Templates appear in the same results list (labeled “Meal template”) and match by template name or item names inside the template.

### Files Changed

- `lib/nutrition/findFoodSearch.ts` (new)
- `app/components/nutrition/NutritionAddFoodPanel.tsx`
- `app/components/NutritionTracker.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

- Add food → Find food — confirm single search and combined “Saved foods & meals” results.
- With meal templates saved, confirm they appear when search is empty and when name matches.
- Search for a food name inside a template — confirm template appears.
- My foods and recent items still add with **Add**; templates log with **Log meal**.
- Catalog search still appears below when typing matches system foods.

### Recommended Commit Message

```text
BIQ-0134 Unify Find food search for saved foods and meal templates
```

---

## BIQ-0135 - Faster Nutrition Tab Load and Remove Main-Tab Meal Templates

Date: 2026-08-20  
Branch: develop  
Status: Completed

### Summary

Nutrition tab initial load now fetches only **today’s entries**, **7-day chart data**, and **goals** (3 queries). Saved foods, recent history, and meal templates load **lazily** when opening Add food or My foods. Food catalog uses **server-side search** instead of downloading the full system catalog. Removed the **Meal templates** card from the main Nutrition day view — templates remain in **Find food**.

### Purpose

Reduce Nutrition tab time-to-interactive and keep the day view focused on logging, not template management.

### Files Changed

- `app/components/NutritionTracker.tsx`
- `app/components/nutrition/NutritionAddFoodPanel.tsx`
- `lib/nutrition/foodCatalogSearch.ts`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

- Open Nutrition tab — day view appears quickly without waiting for catalog/library.
- Swipe/change dates — only day + chart data refresh.
- Add food → Find food — saved foods, recent items, and templates load; catalog search works when typing.
- Save as template on a meal — still works; template appears in Find food (not on main tab).
- My foods panel — still loads saved/recent foods on open.

### Recommended Commit Message

```text
BIQ-0135 Speed up Nutrition tab load and remove main-tab meal templates
```

---

## BIQ-0136 - Program Design Shell (Phase 1)

Date: 2026-09-02  
Branch: develop  
Status: In progress

### Summary

Added **Program Design** as a primary destination for creating and organizing training programs. Planning now has its own home (Personal / Groups, program lists, create flow, Monday–Sunday health calendar, and activity types). **Training is unchanged** as the logging surface. Existing workout history and `st_workouts` / `st_set_logs` are preserved.

### Purpose

Separate program planning from daily execution so BuildIQ can grow into a physical health calendar without stuffing creation, scheduling, and logging into Training.

### Changes

- New **Programs** nav item opens Program Design
- Personal | Groups library with Active / Scheduled / Draft / Completed / Archived
- Guided create flow: name, Monday start, cycle length, automatic Sunday end date
- Weekly health calendar with multiple activities per day
- Activity types: Strength, Cardio, Mobility, Stretching, Recovery, Sport, Rest
- Copy week / copy to remaining weeks
- Draft / Scheduled / Active / Completed / Archived statuses (legacy `published` still valid)
- Dashboard **Set up program** and Training **Manage** open Program Design
- Existing Training Program Setup remains available for Groups and current logging

### Files Changed

- `app/components/layout/PrimaryNav.tsx`
- `app/page.tsx`
- `app/globals.css`
- `app/components/programDesign/ProgramDesignHome.tsx`
- `app/components/programDesign/CreateProgramFlow.tsx`
- `app/components/programDesign/ProgramCalendarEditor.tsx`
- `app/components/programDesign/WeeklyHealthCalendar.tsx`
- `app/components/programDesign/AddActivitySheet.tsx`
- `lib/programDesign/types.ts`
- `lib/programDesign/cycle.ts`
- `lib/programDesign/lifecycle.ts`
- `lib/programDesign/activityTypes.ts`
- `lib/programDesign/programDesignApi.ts`
- `lib/training/programStatus.ts`
- `lib/training/programFetch.ts`
- `supabase/migrations/20250902_042_program_design_foundation.sql`
- `DECISIONS.md`
- `ROADMAP.md`
- `CHANGELOG.md`

### Database Changes

Additive migration: `supabase/migrations/20250902_042_program_design_foundation.sql`

Run on **test** Supabase first, then live when promoting:

- `st_programs.end_date`
- `st_programs.cycle_length_weeks`
- `st_programs.record_kind` (`template` | `instance`)
- Expanded `status` check: `draft`, `published`, `scheduled`, `active`, `completed`, `archived`
- New `st_program_activities` (multiple ordered activities per day, optional `workout_id`)

No tables dropped. No `st_set_logs` or workout history changes.

Until the migration is applied, programs can still be created; calendar activities will not persist.

### Testing Steps

1. Sign in — confirm 6-item nav includes **Programs**
2. Programs → Personal — existing programs appear in the right lifecycle section
3. **+ Create Program** — name, non-Monday start snaps to Monday, cycle length updates end date
4. Continue — weekly calendar shows Mon–Sun and **+ Add activity**
5. Add two activities on the same day (e.g. Strength + Mobility)
6. Copy week / Copy to remaining weeks
7. Set as Active — confirm only one personal program is Active
8. Groups tab in Program Design — switch groups; **+ Create Group Program** for owners/managers
9. Training — existing published program still logs; history unchanged
10. Mobile width (~390px) — nav labels fit; calendar stacks cleanly
11. Error: create without a name is blocked; missing migration shows a calendar save note

### Known Issues

- Training still reads **published** programs, not the new Active status (Phase 3)
- Strength / cardio / mobility builders are not connected yet (Phase 2)
- Share, assign, Just Today / Rest of Program, and AI generation APIs are Phase 4–5
- Existing Training Program Setup is still in the app for Groups and current workflows

### Recommended Commit Message

```text
BIQ-0136 Add Program Design shell and health calendar
```

---

## BIQ-0137 - Fix Program Design Vercel Type Error

Date: 2026-09-02  
Branch: develop  
Status: Completed

### Summary

Fixed the Next.js production typecheck that failed on `fetchDesignPrograms` when Vercel ran `next build`. Dynamic Supabase `.select()` strings are typed as an error union; results are now cast through `unknown` first.

### Purpose

Unblock the Program Design deploy without changing program loading behavior.

### Files Changed

- `lib/programDesign/programDesignApi.ts`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Push and confirm Vercel `next build` completes
2. Open Programs after deploy — existing personal/group programs still list

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0137 Fix Program Design Vercel type error
```

---

## BIQ-0138 - Training Calendar, Follow Shared Programs

Date: 2026-09-02  
Branch: develop  
Status: Completed

### Summary

Training is now an execution calendar (Day or Week) with no Personal vs Group toggle. Users pick the program they follow in **Programs**, including programs shared by a group. Following a group program saves a personal copy so the original group plan is not edited.

### Purpose

Separate planning from daily training, and let one followed program drive Training — whether it started as a personal plan or a group share.

### Changes

- Training: **Day / Week** calendar, Today’s plan, Start Workout, Back to calendar
- Removed Personal vs Group from Training
- Programs: **Following**, **Shared with you**, Follow this program
- Follow copies a group program to the user’s library before Training uses it
- Share with group from a personal program
- Strength calendar activities create a matching workout so Start Workout can open the existing logger
- On-the-fly edit labels: **Just today** / **Rest of program**
- `createProgramFromPlan()` for future AI program creation (same objects as the manual builder)

### Files Changed

- `app/page.tsx`
- `app/globals.css`
- `app/components/training/TrainingExecution.tsx`
- `app/components/programDesign/ProgramDesignHome.tsx`
- `app/components/programDesign/ProgramCalendarEditor.tsx`
- `lib/programDesign/followProgram.ts`
- `lib/programDesign/trainingSchedule.ts`
- `lib/programDesign/aiProgramFactory.ts`
- `lib/programDesign/programDesignApi.ts`
- `supabase/migrations/20250903_043_followed_program.sql`
- `CHANGELOG.md`

### Database Changes

Additive: `st_profiles.followed_program_id`. No workout history changes.

Apply `20250902_042_program_design_foundation.sql` and `20250903_043_followed_program.sql` on test, then live.

### Testing Steps

See the testing plan in the BIQ-0138 handoff notes (Training day/week, Follow shared program, existing published plan still logs).

### Known Issues

- Full cardio/mobility movement builders are still simple fields
- Share is group-based, not a user-to-user invite link yet
- AI can create the same program objects; conversational generation is not wired in this change

### Recommended Commit Message

```text
BIQ-0138 Add Training calendar and follow shared programs
```

---

## BIQ-0139 - Fix Training Vercel Type Error

Date: 2026-09-02  
Branch: develop  
Status: Completed

### Summary

Fixed the Next.js production typecheck that failed on Training JSX: inside the `trainingSubNav === 'personal'` branch, comparing `trainingSubNav === 'setup'` has no overlap. The workout logger now shows when a session is open or an assigned workout is active.

### Purpose

Unblock the Training calendar deploy without changing how Day/Week or assigned workouts log.

### Files Changed

- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Push and confirm Vercel `next build` completes
2. Training → Start Workout — logger still opens
3. Open an assigned workout — logger still opens
4. Existing published plans still load

### Known Issues

None.

### Recommended Commit Message

```text
BIQ-0139 Fix Training Vercel type error
```

---

## BIQ-0140 - Training Month Calendar View

Date: 2026-09-02  
Branch: develop  
Status: Completed

### Summary

Training now has a month **Calendar** view next to Day and Week. Users can browse months, see planned activity dots on each day, and tap a day to open that day's plan.

### Purpose

Give Training a real calendar so the followed program is easy to scan beyond a single day or week strip.

### Changes

- Day / Week / Calendar toggle on Training
- Month grid (Monday–Sunday) with previous / this month / next
- Activity dots on planned days; tap a day to open Day view
- Selected day and today are highlighted; completed days keep a done mark
- No database changes; uses the followed program and existing calendar activities

### Files Changed

- `app/components/training/TrainingExecution.tsx`
- `app/page.tsx`
- `app/globals.css`
- `lib/programDesign/trainingSchedule.ts`
- `CHANGELOG.md`
- `ROADMAP.md`

### Database Changes

None.

### Testing Steps

1. Training → Calendar — month grid appears with Mon–Sun headers
2. Previous / This month / Next change the month
3. Days with activities show colored dots
4. Tap a day → Day view for that date, Start Workout still works
5. Week view still lists Mon–Sun for the program week
6. Mobile (~390px) — 7-day grid stays readable; titles hide, dots remain
7. No Personal vs Group control

### Known Issues

- Calendar activities still require `20250902_042` applied in Supabase
- Days outside the program cycle are shown faded with no activities

### Recommended Commit Message

```text
BIQ-0140 Add Training month calendar view
```

---

## BIQ-0141 - Fix Training Calendar Day Selection Drift

Date: 2026-09-03  
Branch: cursor/fix-training-calendar-day-click-f329  
Status: Completed

### Summary

Fixed Training Calendar day selection so tapping any date opens that exact date instead of sometimes drifting to the prior selected weekday.

### Purpose

Users reported that tapping a different weekday (for example Tuesday to Wednesday) could keep them on the wrong day, while tapping the same weekday in a different week worked. This made month navigation feel inconsistent.

### Changes

- Added a dedicated `onSelectTrainingDay` handler in `app/page.tsx`
- Updated day selection to compute week and active workout from the clicked date directly
- Removed the month-calendar dependency on `onWeekChange` (which preserves weekday by design for week navigation)
- Kept existing behavior to switch to Day view when selecting from Week view

### Files Changed

- `app/page.tsx`
- `CHANGELOG.md`

### Database Changes

None.

### Testing Steps

1. Open Training → Calendar.
2. Select a day with a different weekday than today (for example Tue → Wed).
3. Verify the selected state and day panel both match the clicked date.
4. Select same weekday in next week (for example Tue → next Tue) and verify it still works.
5. Switch to Week view and click a day; verify Day view opens on the exact clicked date.
6. Start Workout from a clicked day and confirm it opens the matching day workout.

### Known Issues

None identified for this fix.

### Recommended Commit Message

```text
BIQ-0141 Fix training calendar day click date drift
```
