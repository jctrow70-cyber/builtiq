# BuiltIQ Health Decision Log

This file documents important product, technical, and business decisions.

Each decision should explain what was decided, why it was decided, and what alternatives were considered.

## Decision Format

```text
Decision Number:
Date:
Status:
Category:
Decision:
Reason:
Alternatives Considered:
Impact:
```

---

## Decision 001 - Product Name

Date: 2026-07-06  
Status: Proposed  
Category: Branding

### Decision

Use BuiltIQ Health as the primary product name.

### Reason

The name supports the broader vision of helping users build themselves physically, mentally, and spiritually. It also leaves room for the product to expand beyond only exercise tracking.

### Alternatives Considered

- BuiltIQ
- Exervise
- Other fitness-focused names

### Impact

The product can include workouts, nutrition, wellness habits, AI coaching, and future health-related features under one brand.

---

## Decision 002 - Product Positioning

Date: 2026-07-06  
Status: Proposed  
Category: Product Strategy

### Decision

Position BuiltIQ Health as an AI Wellness Coach platform, not just a workout tracker.

### Reason

The long-term product vision includes exercise, nutrition, habits, progress tracking, and AI coaching. This creates a larger market opportunity than a basic workout logger.

### Alternatives Considered

- Workout tracker only
- Nutrition tracker only
- AI trainer only

### Impact

The MVP should still stay simple, but the architecture should support nutrition, wellness, and AI coaching later.

---

## Decision 003 - Branch Strategy

Date: 2026-07-06  
Status: Proposed  
Category: Development Process

### Decision

Use `develop` for active coding and `main` as the stable testing environment.

### Reason

This protects the stable version of the app while allowing Cursor and GitHub changes to happen safely on a separate branch.

### Alternatives Considered

- Code directly on main
- Add production branch immediately

### Impact

New features should be built on `develop`, tested, then merged into `main` when stable.

---

## Decision 004 - Change Numbering

Date: 2026-07-06  
Status: Proposed  
Category: Development Process

### Decision

Use BIQ change numbers for all meaningful changes.

Example:

```text
BIQ-0001 Documentation Foundation
BIQ-0002 Security Review
BIQ-0003 Workout History Stability
```

### Reason

Change numbers make it easier to track what Cursor changed, what was tested, and what was committed to GitHub.

### Alternatives Considered

- No change numbers
- GitHub issue numbers only
- Date-based change labels

### Impact

Every meaningful change should update CHANGELOG.md and use a clear commit message.

---

## Decision 005 - Migration-Based RLS Hardening

Date: 2026-07-07  
Status: Accepted  
Category: Database Security

### Decision

Apply RLS policy changes through numbered SQL migration files in `supabase/migrations/` rather than editing `supabase-strength-team-schema.sql` in place.

### Reason

Production and develop databases already exist with user data. Incremental migrations preserve data, provide a clear run order, and document what must be executed in Supabase.

### Alternatives Considered

- Re-run the full base schema script (drops/recreates policies; risky on live data)
- App-only permission checks without RLS (insufficient security)

### Impact

All future database permission changes should add a new migration file. The base schema file remains the reference for fresh installs.

---

## Decision 006 - Exercise Section Column

Date: 2026-07-07  
Status: Accepted  
Category: Workout Data Model

### Decision

Add `st_exercises.section` with values `warmup` and `strength` instead of separate workout tables per section.

### Reason

Keeps the existing workout → exercise → planned set hierarchy intact while supporting grouped UI and section-scoped reorder. Minimal schema change; existing exercises default to `strength`.

### Alternatives Considered

- Separate tables per section (more joins, more complexity)
- Warmup sets only as set types on strength exercises (confusing UX; does not match product structure)

### Impact

Program generation and Training UI group by section. Future sections (e.g. plyometrics) can add new `section` values. Cross-week edit matching uses `section` + `sort_order` or `section` + `name`.

---

## Decision 007 - Set Log Snapshots on Save

Date: 2026-07-07  
Status: Accepted  
Category: Workout History

### Decision

When a user logs a set, store snapshot fields on `st_set_logs` (exercise name, muscle, section, set details, workout day/type). Change `planned_set_id` to `ON DELETE SET NULL` instead of cascade delete.

### Reason

Logs were tied to live template rows. Deleting or renaming exercises could destroy or distort history. Snapshot-on-write preserves what the user actually did while still linking to the template when it exists.

### Alternatives Considered

- Separate immutable `st_completed_workouts` table (more complete, more scope)
- Keep cascade delete and forbid template deletes (too restrictive)

### Impact

Progress and Training history read snapshot fields first. Template edits no longer delete completed logs. New logs must include `snapshot_exercise_name` on insert (enforced by RLS).

---

## Decision 009 - Auth Loading State and Expanded Profiles

Date: 2026-07-07  
Status: Accepted  
Category: Authentication / User Profile

### Decision

Separate auth boot from profile onboarding. Show a loading state while session + profile fetch complete instead of rendering the setup screen when `profile` is temporarily null. Expand `st_profiles` with height, weight, birth year, sex, experience level, primary goal, units preference, and `profile_completed`. New accounts collect profile data during signup; returning users skip onboarding when `profile_completed = true`.

### Reason

The previous `if (!profile)` check ran before `loadProfile()` finished, causing a setup-screen flash on every login. Remembered email and browser password autofill improve daily sign-in. Richer profiles support future program generation and progress features aligned with BuiltIQ_Context.md.

### Alternatives Considered

- Auto-create minimal profile on first login (skips intentional onboarding)
- Store profile only in localStorage (not durable or secure)
- Store passwords in localStorage (unsafe; rejected)

### Impact

Sign-in uses standard form autofill attributes. Email remembered in localStorage only. Settings saves full profile to Supabase. Existing users with display names are backfilled as onboarded.

---

## Decision 008 - Exercise Catalog (System + User)

Date: 2026-07-07  
Status: Accepted  
Category: Workout Data Model

### Decision

Introduce `st_exercise_catalog` as the canonical exercise library. BuiltIQ seeds **system exercises** (`is_system = true`, `user_id = null`) available to all users. Users may create **custom exercises** (`is_system = false`, `user_id = auth.uid()`) visible only to themselves. Workout template rows (`st_exercises`) link via `catalog_exercise_id`. Set logs store both `snapshot_catalog_exercise_id` and `snapshot_exercise_name` at save time.

### Reason

Progress accuracy requires a stable exercise identity across programs, renames, and template edits. Name-only matching splits history and blocks reliable PR tracking. Snapshots preserve what the user saw when logging; catalog IDs enable aggregation.

### Alternatives Considered

- Name-only snapshots without catalog (insufficient for cross-program progress)
- Per-program exercise libraries (duplicated data, no reuse)
- Shared user-created exercises across teams (privacy/complexity; deferred)

### Impact

Training search reads system + own custom exercises. Settings manages custom exercise lifecycle (edit, archive). History keys prefer catalog ID with legacy name fallback. System exercises are read-only for normal users. Future PR charts and muscle-group analytics can use catalog metadata (`muscle_group`, `equipment`, `movement_pattern`).

---

## Decision 010 - Dashboard-First UX Layout

Date: 2026-07-07  
Status: Accepted  
Category: Product UX

### Decision

Replace the sidebar configuration layout with a top-nav, dashboard-first experience. Dashboard becomes the default landing view with wellness summary cards. Program generation and team/program controls move into Training. Teams management moves into Settings. Top navigation items: Dashboard, Training, Nutrition, Progress, AI Coach, Settings.

### Reason

BuiltIQ should present as a premium wellness product, not a builder tool. Most daily use is logging workouts and reviewing progress — not editing program structure. Separating configuration into Training reduces noise while preserving all existing functionality.

### Alternatives Considered

- Keep sidebar for power users (adds permanent clutter on mobile)
- Remove Teams entirely from nav (would drop existing team MVP features)

### Impact

No database changes. All BIQ-0005 catalog and training flows preserved. AI Coach and Nutrition remain placeholders until future BIQ work.

---

## Decision 011 - Exercise Supersets via Group ID

Date: 2026-07-07  
Status: Accepted  
Category: Workout Data Model

### Decision

Group supersets using a shared nullable `superset_group_id` (UUID) on adjacent `st_exercises` rows within the same workout section. Each superset contains 2–3 exercises. Program templates express supersets as `{ superset: [ exerciseTuple, ... ] }` alongside single-exercise tuples. Set logs snapshot `snapshot_superset_group_id` at save time.

### Reason

Supersets are a presentation and programming grouping, not a separate entity type. A shared group ID keeps sort order intact, works with existing future-week sync via `sort_order` + catalog matching, and avoids a new join table for MVP.

### Alternatives Considered

- Dedicated `st_supersets` table with ordered child rows (more normalized; heavier MVP scope)
- JSON array on a single exercise row (breaks per-exercise set logging model)
- Name-prefix convention like "SS: A / B" (fragile, no structured UI)

### Impact

Training renders contiguous same-group exercises as a visual superset block. Users can break groups or build new ones from catalog search. Lower/Upper Body templates ship with example supersets. Full-body template remains all singles for now.

---

## Decision 012 - Team Progress and Per-Member Training Plans

Date: 2026-07-07  
Status: Accepted  
Category: Team Training Model

### Decision

Each team membership stores `training_source` (`team` | `personal`). Team default program is `st_teams.default_program_id`. Set logs store optional `team_id` when logging against a team program. Owners/editors may read (not write) teammate programs and set logs via expanded RLS; members choose their own training source via RPC.

### Reason

Coaches need visibility into compliance and performance without sharing login credentials. Some athletes follow the team block; others keep individualized work while remaining on the roster. Snapshots + per-user log rows preserve history integrity.

### Alternatives Considered

- Separate coach dashboard service (heavier MVP)
- Copy team program per member (duplicated templates, harder sync)
- Global Personal/Team toggle only (no per-member plan assignment)

### Impact

Training shows team roster with 7-day set counts. Clicking a member opens read-only plan + logs for owners/editors. Members toggle team vs personal plan without leaving team mode.

---

## Decision 013 - Confirm-Before-Add Exercise Flow

Date: 2026-07-07  
Status: Accepted  
Category: Training UX

### Decision

Replace immediate catalog-to-workout insertion with a two-step **Add Exercise** panel: (1) search or create exercise, (2) configure type (normal/superset), superset group, and starting set prescription, then confirm. No database write until the user clicks **Add Exercise**.

### Reason

Current typeahead + SS checkbox feels like exercises are added before setup is complete. A confirm step makes intent clear, reduces mistaken adds, and gives room for sets/reps/weight defaults before the exercise appears in the workout.

### Alternatives Considered

- Keep inline typeahead with delayed save (still feels auto-added)
- Separate superset builder screen (BIQ-0008 legacy; rejected as too much space)
- Modal vs slide-over panel (implementation choice; panel preferred for mobile)

### Impact

Preserves BIQ-0005 catalog search and BIQ-0008 superset group IDs. Slightly more taps per add, but clearer flow. Custom exercises still created from the same panel.

---

## Decision 014 - Training Root with Personal/Team Sub-Navigation

Date: 2026-07-07  
Status: Accepted  
Category: Information Architecture

### Decision

Make **Training** the primary training hub with sub-tabs **Personal Training** and **Team Training**. Team selection, roster, and member context live under Team Training without forcing navigation to a separate top-level Team tab for daily workout use.

### Reason

Users currently bounce Team tab → Training, which feels disconnected. Sub-navigation keeps workout logging in one mental “place” while still supporting team programs (BIQ-0009).

### Alternatives Considered

- Remove Team top-level nav entirely (compliance summary still useful on Dashboard / Team admin view)
- Global Personal/Team toggle only in header (insufficient for roster + member dashboard)
- Separate coach app (out of MVP scope)

### Impact

Team top-level tab may remain for compliance and settings-style team admin, but day-to-day team workouts start from Training → Team Training. `training_source` and coach permissions unchanged.

---

## Decision 015 - Rule-Based Progression Engine (v1)

Date: 2026-07-07  
Status: Accepted  
Category: Workout Intelligence

### Decision

Introduce a dedicated progression module that reads completed set logs (with snapshots) and returns **last performance**, **next target**, and a **plain-language note** using transparent rules: increase weight when reps hit, increase reps when weight stalls, repeat on miss, reduce load on multiple misses. Future workouts display recommendations; logs remain user-entered actuals.

### Reason

Users expect week-ahead workouts to reflect what they did last time. Centralizing logic in `lib/training/progression.ts` allows rule-based MVP now and AI replacement later without rewriting Training UI.

### Alternatives Considered

- Store next targets on `st_planned_sets` automatically (mutates templates; conflicts with BIQ-0003 history integrity)
- AI-only progression (too heavy for current phase)
- Progress tab only, no in-workout hints (does not solve future-week confusion)

### Impact

Requires querying historical logs by exercise key (catalog id + name fallback). Optional difficulty/RPE field may return as optional input to improve rules. Display-only recommendations on future weeks.

---

## Decision 016 - Muscle Focus Program Generation

Date: 2026-07-07  
Status: Accepted  
Category: Program Design

### Decision

Extend program generation with multi-select **focus muscles**, persisted on `st_programs.focus_muscles`. A rule-based generator allocates ~10–15 weekly working sets per focus muscle, spreads volume across days, and balances opposing groups using catalog muscle_group mappings and template expansion—not LLM generation in v1.

### Reason

Users want programs that reflect priorities (e.g. chest + hamstrings) without manual template editing. Hypertrophy volume landmarks provide a defensible, explainable starting point before AI Coach (Phase 6).

### Alternatives Considered

- Manual template only (no personalization)
- Full AI program writer (Phase 6; premature)
- Per-exercise sliders for volume (too complex for MVP)

### Impact

Generate screen shows focus picker + weekly volume summary. WORKOUT_TEMPLATES and catalog drive exercise selection adjustments. Documented in BIQ-0011 testing checklist.

---

## Decision 017 - Exercise Type and Adaptive Logging Fields

Date: 2026-07-08  
Status: Proposed  
Category: Workout Data Model

### Decision

Add `exercise_type` (`strength` | `cardio` | `mobility` | `bodyweight` | `timed` | `custom`) on catalog and workout exercises. Logging UI and saved snapshots adapt by type: strength uses sets/reps/weight/RPE/rest; cardio uses duration/distance/pace/HR/calories/notes without requiring weight.

### Reason

Single grid for all exercises blocks cardio use cases and forces fake weight entries. Type-driven fields keep history accurate and UI simple.

### Alternatives Considered

- Separate cardio app section (fragments Training UX)
- One JSON blob only, no typed columns (harder to query progress)
- Always optional weight column (confusing for runners)

### Impact

Requires migration, catalog seed updates for cardio examples, snapshot extensions. Progression module applies primarily to `strength` in v1; cardio shows last session metrics.

---

## Decision 018 - Program Assignments Table

Date: 2026-07-08  
Status: Proposed  
Category: Team Training Model

### Decision

Introduce `st_program_assignments` linking `user_id`, optional `team_id`, `program_id`, `assignment_type` (`personal` | `team` | `individual_team` | `manual`), `assigned_by`, `start_date`, and `is_active`. Replaces binary `training_source` alone for coach workflows while remaining compatible with BIQ-0009.

### Reason

Coaches need four assignment modes: shared team plan, member personal plan, generated individual plan, and manual build. A dedicated assignment row supports history, start dates, and multiple inactive assignments.

### Alternatives Considered

- Only `st_team_members.training_source` enum extension (insufficient for individual_team + manual)
- Copy program per member always (sync nightmare)
- External coach spreadsheet (out of product)

### Impact

Member dashboard reads active assignment. RPCs for assign/generate. RLS scoped by team membership and role.

---

## Decision 019 - Labeled Superset Groups

Date: 2026-07-08  
Status: Proposed  
Category: Training UX

### Decision

Superset blocks display user-visible labels (e.g. "Superset A") with sub-labels (1A, 1B). Store `superset_label` and `superset_order` on exercises sharing `superset_group_id`. Support rename, reorder within group, add/remove from group in UI.

### Reason

BIQ-0011/0008 group by UUID only; coaches and athletes need readable labels matching gym notation. Extends existing group id model without new entity table for MVP.

### Alternatives Considered

- Separate `st_supersets` table (heavier; defer if labels on exercises suffice)
- Letter-only sort order without label field (no rename)

### Impact

Template generator assigns default labels. Break/remove flows update orphan groups. Mobile-friendly grouped cards.

---

## Decision 020 - Three-Tab Training Navigation

Date: 2026-07-08  
Status: Proposed  
Category: Information Architecture

### Decision

Training sub-nav becomes **Personal Training**, **Team Training**, and **Program Setup** (three tabs). Program creation, muscle focus, and assignment live under Program Setup; execution and logging under Personal/Team.

### Reason

BIQ-0011 added two tabs but left program setup embedded in Personal/Team flow. Separating setup reduces confusion and matches user mental model.

### Alternatives Considered

- Program Setup only in Settings (too far from Training)
- Keep collapsible setup panel (clutter)

### Impact

Refactor `app/page.tsx` nav state. Team top-level tab optional for compliance-only views.

---

## Decision 021 - Coach and Member Co-Logging

Date: 2026-07-08  
Status: Proposed  
Category: Permissions

### Decision

Owners/editors may create and update `st_set_logs` for team members on assigned programs. Members always log their own `user_id`. Members cannot edit team master program templates unless promoted to editor/owner.

### Reason

Sideline coaching and remote teams require coach-entered results. Members still need self-logging from their account.

### Alternatives Considered

- Coach-only logging (blocks athlete self-service)
- Shared login (security anti-pattern)
- Impersonation sessions (overkill for MVP)

### Impact

RLS policies on `st_set_logs` INSERT/UPDATE for coach+member pairs. UI indicates who logged each set.

---

## Decision 022 - Exercise Intelligence Database (Not Manual Catalog Growth)

Date: 2026-07-08  
Status: Accepted  
Category: Workout Data Model

### Decision

Do **not** expand BuiltIQ by manually curating a small system exercise list. Evolve `st_exercise_catalog` into an **Exercise Intelligence Database** prepared for importing 1000+ exercises from external datasets. Store `external_source`, `external_id`, and `media_url` for idempotent imports. Add BuiltIQ intelligence columns (`movement_pattern`, `training_goal`, `progression_type`, muscle volume percentages, `coaching_metadata` JSONB) and a substitution graph via `st_exercise_alternatives`.

### Reason

BuiltIQ differentiation is smarter programming — movement classification, volume attribution, progression type, substitutions, and AI-ready metadata — not owning another exercise name list. External libraries already provide names, media, and instructions at scale.

### Alternatives Considered

- Continue hand-seeding SQL `INSERT` rows (does not scale; rejected)
- Replace catalog with runtime API calls to third parties (no offline intelligence layer; rejected)
- Flat JSON file in repo (no RLS, no user custom exercises; rejected)

### Impact

Migration `20250708_011` extends catalog schema without removing BIQ-0005 seeds. Import pipeline and UI browsing are follow-on work. `lib/training/exerciseIntelligence.ts` defines enums and normalization helpers. AI Coach and program generator will consume `coaching_metadata` and alternatives in future BIQs.
