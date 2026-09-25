# BuildIQ Health Decision Log

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
Updated: 2026-07-16  
Status: Accepted  
Category: Branding

### Decision

Use **BuildIQ Health** as the primary product name (replacing BuiltIQ / BuildIQ-only branding).

### Reason

The name supports the broader vision of helping users build themselves physically, mentally, and spiritually. It also leaves room for the product to expand beyond only exercise tracking.

### Alternatives Considered

- BuildIQ
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

Position BuildIQ Health as an AI Wellness Coach platform, not just a workout tracker.

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

The previous `if (!profile)` check ran before `loadProfile()` finished, causing a setup-screen flash on every login. Remembered email and browser password autofill improve daily sign-in. Richer profiles support future program generation and progress features aligned with BuildIQ_Context.md.

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

Introduce `st_exercise_catalog` as the canonical exercise library. BuildIQ seeds **system exercises** (`is_system = true`, `user_id = null`) available to all users. Users may create **custom exercises** (`is_system = false`, `user_id = auth.uid()`) visible only to themselves. Workout template rows (`st_exercises`) link via `catalog_exercise_id`. Set logs store both `snapshot_catalog_exercise_id` and `snapshot_exercise_name` at save time.

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

BuildIQ should present as a premium wellness product, not a builder tool. Most daily use is logging workouts and reviewing progress — not editing program structure. Separating configuration into Training reduces noise while preserving all existing functionality.

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

Do **not** expand BuildIQ by manually curating a small system exercise list. Evolve `st_exercise_catalog` into an **Exercise Intelligence Database** prepared for importing 1000+ exercises from external datasets. Store `external_source`, `external_id`, and `media_url` for idempotent imports. Add BuildIQ intelligence columns (`movement_pattern`, `training_goal`, `progression_type`, muscle volume percentages, `coaching_metadata` JSONB) and a substitution graph via `st_exercise_alternatives`.

### Reason

BuildIQ differentiation is smarter programming — movement classification, volume attribution, progression type, substitutions, and AI-ready metadata — not owning another exercise name list. External libraries already provide names, media, and instructions at scale.

### Alternatives Considered

- Continue hand-seeding SQL `INSERT` rows (does not scale; rejected)
- Replace catalog with runtime API calls to third parties (no offline intelligence layer; rejected)
- Flat JSON file in repo (no RLS, no user custom exercises; rejected)

### Impact

Migration `20250708_011` extends catalog schema without removing BIQ-0005 seeds. Import pipeline and UI browsing are follow-on work. `lib/training/exerciseIntelligence.ts` defines enums and normalization helpers. AI Coach and program generator will consume `coaching_metadata` and alternatives in future BIQs.

---

## Decision 023 - AI-Driven Program Generation

Date: 2026-07-09  
Status: Accepted  
Category: Program Design

### Decision

Program generation uses **OpenAI on the server** as the primary path. Users describe goals in natural language (e.g. baseball throw/hit power); the API loads profile + exercise catalog, returns validated JSON, and persists a periodized multi-week plan. Rule-based templates remain a secondary fallback (`generation_method: template`).

### Reason

Sport-specific goals are too varied for hardcoded profiles alone. Natural-language prompts let athletes and coaches express intent once; AI can vary exercises and rep schemes week to week while grounding picks in the BuildIQ catalog.

### Alternatives Considered

- Rule-based sport profiles only (rejected — too rigid, poor coverage)
- Client-side OpenAI calls (rejected — exposes API key)
- LLM without catalog grounding (rejected — invented exercise names, poor history matching)

### Impact

- `POST /api/programs/generate` with Supabase session auth
- `st_programs.generation_prompt`, `generation_method`, `program_summary`, `program_style`
- Program Setup UI: prompt textarea + **Generate with AI**
- Requires `OPENAI_API_KEY` in server environment (documented in `.env.example`)

---

## Decision 024 - Mobility, Cooldown Section, and Mobility Day Type

Date: 2026-07-09  
Status: Accepted  
Category: Workout Structure

### Decision

Extend workout structure with a third section **`cooldown`** (Cooldown / Stretch). Require AI-generated strength days to include **mobility/stretch items in warmup** and **static stretches in cooldown** by default. Add **`Mobility`** as a schedule day type (alongside Lower, Upper, Full Body, Cardio) for dedicated recovery/mobility sessions. Users can toggle cooldown inclusion at program review; mobility day inclusion follows the same Yes / No / Let AI decide pattern as cardio.

### Reason

Stretching is currently incidental. Athletes need predictable hip, shoulder, and rotational prep without repeating prompts. Separating cooldown from strength keeps logging clear and matches how coaches program (prep → work → restore). A mobility day supports high-frequency training without extra lifting volume.

### Alternatives Considered

- Prompt-only (“add stretches in your goals text”) — rejected; inconsistent
- Stretches only in warmup, no cooldown — rejected; post-workout flexibility is a distinct coaching need
- Mobility as exercise type only, no day type — rejected; does not support dedicated sessions

### Impact

- `SECTIONS` gains `cooldown`; AI JSON schema gains `cooldown` array
- Schedule wizard and `scheduleSuggestion.ts` gain Mobility day type
- `selectMobilityCatalogForAi()` biases stretch picks from imported catalog
- Documented in BIQ-0016

---

## Decision 025 - Program Week Calendar Alignment

Date: 2026-07-13  
Status: Accepted  
Category: Training UX

### Decision

Store `st_programs.start_date` as the calendar day Week 1 begins. Map log dates to week numbers with `floor((date - start_date) / 7) + 1`. Keep Training Date, Week, and day-of-week tabs synchronized so logging always targets the correct program week.

### Reason

Week numbers alone do not tell users which calendar days belong to Week 2 vs Week 3. Without alignment, last-session history and Copy last look broken when the selected date does not match the selected week.

### Alternatives Considered

- Use only `st_program_assignments.start_date` — deferred; personal programs also need an anchor on the program row
- Infer week from first logged set — rejected; too implicit and breaks empty weeks

### Impact

- New programs set `start_date` to generation day
- Existing programs backfill from `created_at`
- Documented in BIQ-0022

---

## Decision 026 - Group Training Platform (Personal vs Groups Split)

Date: 2026-07-17  
Status: Accepted  
Category: Product Architecture

### Decision

Rebrand user-facing **Team** to **Group** while keeping `st_teams` in the database for now. Split the product into:

- **Training** — unified workout logging (personal program today; assigned group workouts in Phase 4)
- **Groups** — management only (owners/managers: roster, compliance, assignments, member performance)

Roles are **Owner**, **Manager**, and **Member** in the UI. Managers may invite and remove members. DB role `editor` maps to Manager until a later migration.

Remove the legacy Team tab and Training → Team Training sub-tab immediately (no gradual deprecation).

### Reason

Team Training mixed logging and management in one surface. Members need a single place to log; managers need a dedicated hub without duplicating the workout logger.

### Alternatives Considered

- Keep Team tab alongside Groups — rejected; confusing duplicate surfaces
- Rename DB tables in Phase 1 — deferred; RLS and RPC stability first
- Coach terminology — rejected; use Owner / Manager / Member only

### Impact

- `lib/groups/permissions.ts` centralizes role checks
- BIQ-0043 phased epic; P1 nav, P2 schema (classifications, workout assignments, participation)
- Documented in BIQ-0043-P1 and BIQ-0043-P2

---

## Decision 027 - Test and Live Deployment Pipeline

Date: 2026-08-11  
Status: Accepted  
Category: Development Process

### Decision

Use **one GitHub repository** and **one Vercel project** (`builtiq`) with branch-based promotion:

- **`Develop`** → Vercel **Preview** deployment → test Supabase (via **Preview** environment variables)
- **`main`** → Vercel **Production** deployment → production Supabase (via **Production** environment variables)

Day-to-day work pushes to `Develop` and is verified on the preview URL before merging to `main` for live users. Database migrations run on test Supabase first, then on live Supabase when code is promoted.

Helper scripts: `buildiq-push-test.cmd`, `buildiq-promote-live.cmd`. Operator guide: `docs/ENVIRONMENTS.md`.

### Reason

The team builds and deploys through GitHub + Vercel without relying on local `npm`. Preview vs Production env scopes keep test and live databases separate on a single Vercel project.

### Alternatives Considered

- Second Vercel project (`builtiq-test`) — optional for a stable test domain; not required by default
- Separate test GitHub repository — optional; rejected as default due to sync overhead
- Local-only testing — rejected; user workflow is push-to-deploy

### Impact

- Vercel env vars must be set for both **Preview** (test Supabase) and **Production** (live Supabase)
- Production branch stays `main`; `Develop` pushes create preview deployments
- Every BIQ change with SQL must document test-then-live migration order

---

## Decision 028 - Premium Barcode Database (Nutritionix)

Date: 2026-08-13  
Status: **Rejected**  
Category: Product / Integrations

### Decision

~~Use Nutritionix as primary barcode API for Premium.~~ **Rejected** — ~$499/mo annual minimum is not justified at current scale.

### Reason

Cost vs user count; free/cheap paths can deliver trust via label verification and caching instead.

### Impact

Superseded by Decision 029 (trust-first verified barcode cache).

---

## Decision 029 - Trust-First Barcode (Verify Once, Trust Forever)

Date: 2026-08-13  
Status: Proposed  
Category: Product / Integrations

### Decision

Build scan trust without a paid nutrition API:

1. Barcode (Open Food Facts) identifies the **product** (name, brand, image).
2. **Label photo OCR** (or manual confirm) sets **trusted nutrition** when the user cares about accuracy.
3. Save verified barcode → macros in the user's library; **future scans use verified data first**.
4. Show **confidence in UI** — never present rough OFF estimates with the same certainty as label-verified values.

### Reason

Users lose trust when numbers are wrong, not when the flow asks them to verify once. Repeat scans must feel instant and accurate. This costs $0 beyond existing OFF + OpenAI label OCR.

### Alternatives Considered

- **Nutritionix / paid APIs** — rejected on cost (~$6k/year minimum)
- **OFF-only with more heuristics** — necessary but insufficient alone; heuristics can't fix all stale DB rows
- **Label OCR only (no barcode)** — accurate but slow; barcode still valuable for product ID

### Impact

- BIQ-0118 scoped in ROADMAP
- Requires `barcode` on food library or verified cache table
- Shifts product promise from "database is always right" to "we remember what's right for you"

---

## Decision 030 - Program Design vs Training Separation

Date: 2026-09-02  
Status: Accepted  
Category: Product Architecture

### Decision

Separate **program planning** from **daily execution**.

- **Program Design** owns what *should* happen: templates, assigned programs, Monday–Sunday health calendars, and planned activities.
- **Training** owns what *did* happen: today's plan, logging, substitutions, and completed history.
- **Health Calendar** is the shared schedule: strength, cardio, mobility, stretching, recovery, sport, and rest — not strength-only.

Reuse existing `st_programs`, `st_workouts`, `st_exercises`, `st_planned_sets`, and `st_set_logs`. Do not replace them. Add:

1. Lifecycle columns on `st_programs` (`end_date`, `cycle_length_weeks`, `record_kind`, expanded `status`).
2. `st_program_activities` for multiple ordered activities per day, with optional `workout_id` linking a strength activity to the existing workout tree.

Keep `published` as a legacy status so current Training programs keep working. New Program Design programs use `draft` / `scheduled` / `active` / `completed` / `archived`. Training continues to load **published** programs until Phase 3.

Template vs assigned copy: existing `source_program_id` plus `record_kind` (`template` | `instance`). Sharing and group assign (Phase 4) always duplicate into a personal instance.

### Reason

Training mixed program creation, group management, scheduling, and logging on one screen. That does not scale to a physical-health calendar, AI-generated weeks, or per-person copies of a shared program.

### Alternatives Considered

- Rebuild Training in one change — rejected; too much risk to workout history
- New program tables that replace `st_programs` — rejected; existing history and RLS depend on current IDs
- One activity per day on `st_workouts` — rejected; users need multiple activities per day

### Impact

- Phase 1 ships the Program Design shell and calendar without changing Training logging
- Phase 3 is when Training reads the **Active** program
- Planned data stays on programs/activities/workouts; actual data stays on `st_set_logs` and future activity-completion rows
- BIQ-0190: Training no longer hosts Program Setup. Users plan in **Programs** (For me / For [group]); Training only logs the followed plan. Groups wizard remains until a later slice.

---

## Decision 031 - Group vs Personal Follow and Role Enrollment

Date: 2026-09-04  
Status: Accepted  
Category: Program Design / Groups

### Decision

A user follows **one** program in Training at a time (personal or group-sourced — not both).

Role rules:

1. **Member** — automatically enrolled in the group's date-active **live template** (same `st_programs` id owners/editors edit). Training shows later template edits without a Push. Members may log sets; they cannot change the shared template. **Edit just for me** (BIQ-0181) is the explicit exception: Training follows a personal instance named `{plan} (just me)` and auto-enroll must not switch that copy back to live. Explicit unfollow clears Training and is respected until the member follows again or a *new* active group plan (no prior copy/marker) enrolls them. Leftover personal snapshots from before BIQ-0168 (no `(just me)` suffix) are not used for Training.
2. **Editor (Manager)** — sees group programs as available; **not** auto-enrolled. May **Use in Training** the live group template so Training follows the shared plan, or **Just me** from the group-plan editor for a private copy.
3. **Owner** — may create multiple dated group plans. Suggested start for a new plan is after the latest existing plan ends so members hand off cleanly by calendar date. Same live-edit vs just-me choice as editors when they follow the group plan.

Creating a **personal** program while following a group-sourced plan used to require an explicit unfollow prompt first. Superseded by Decision 071: create leaves Training on the current follow; the new plan is available until Use in Training.

Training loads **only** the program referenced by `followed_program_id`. When that field is null, Training shows the empty “choose a program” state — it must not fall back to the newest published personal program.

### Reason

Members should not hunt for Follow when the group schedule is the source of truth. Editors need visibility without being forced onto a plan they manage. Owners need multi-month sequencing without members manually switching programs. Unfollow must actually clear Training; silent re-pick / re-enroll made Unfollow feel broken.

### Alternatives Considered

- Always require Follow for everyone — rejected; too much friction for members
- Auto-enroll editors/owners — rejected; managers need to opt in before Training uses a plan
- Allow following personal and group at once — rejected; Training has a single calendar
- Re-enroll members on every Training load after unfollow — rejected (BIQ-0150); leftover copies meant unfollow never stuck
- Fall back to newest published when follow is null — rejected (BIQ-0150); hid unfollow

### Impact

- `lib/programDesign/enrollment.ts` + `syncMemberGroupEnrollment`
- Programs UI prompts unfollow before personal create
- Training `loadPrograms` syncs member enrollment by plan dates and honors null follow
- No new database tables; uses `followed_program_id`, `start_date`, `end_date`, `source_program_id`
- BIQ-0168: members follow the live group program id (not a duplicated snapshot) so owner/editor template edits appear in Training/Programs. Unfollow writes an archived personal marker so auto-enroll does not immediately reverse it.
- BIQ-0181: an explicit **Edit just for me** action duplicates the live template into a personal `(just me)` instance. Enrollment skips those copies (`personalized_copy`); leftover snapshots without the suffix still switch to live.

---

## Decision 032 - Science Engine Decides, AI Personalizes

Date: 2026-09-07  
Status: Accepted  
Category: Program Design

### Decision

BuiltIQ programs are generated by a versioned, deterministic science engine (`SCIENCE_ENGINE_VERSION = 1.0.0`). OpenAI may explain, coach, and choose among approved exercises. It may not change weekly volume, RIR limits, pain rules, deload decisions, warm-up fatigue limits, or hard restrictions.

Existing workout tables stay in place. New tables only store science versions, training preferences, progression decisions, and weekly reviews. `st_set_logs` remains the source of performed history.

### Reason

ChatGPT-authored workouts were inconsistent and hard to validate. Programming rules need to be evidence-informed, explainable, and stable across personal, group, and coach-assigned programs.

### Alternatives Considered

- Keep AI as the primary program author with a stricter prompt — rejected; prompts still invent structure
- Replace `st_programs` / `st_set_logs` with a new schema — rejected; history and RLS depend on current IDs
- Hard-code thresholds in UI components — rejected; rules must stay centralized and versioned

### Impact

- `POST /api/programs/generate` is science-first
- Programs store `science_version`
- Historical prescriptions and logs are never overwritten by later adjustments
- Originally labeled Decision 031 in BIQ-0141; renumbered to 032 so it does not collide with group enrollment
- Create Program in Program Design persists workouts onto the program just created (BIQ-0151)

---

## Decision 036 - AI Designs the Week Inside Science Constraints

Date: 2026-09-08  
Status: Accepted  
Category: Program Design

### Decision

Deterministic science remains the source of hard constraints: schedule, volume bands, exclusions, pain rules, duration, valid exercises, RIR bounds, and fallback if the model fails.

OpenAI is responsible for programming judgment when a key is present: session emphasis, exercise choice from a proven library, order, session-specific warm-ups, optional potentiation, and selective supersets. It designs the whole week in one call. Week 1 is the progression template for later weeks.

The model’s workout JSON is applied when it is structurally valid. Summary-only responses are no longer the intended path.

### Reason

Decision 032 made AI explain a slot-filled program. Users experienced repetitive full-body days and identical warm-ups. The previous generate route also dropped AI workouts because of a 1200-token cap.

### Alternatives Considered

- Keep science as the only author — rejected; sessions still feel like filled slots
- Let the model invent structure with no validator — rejected; history and safety depend on constraints
- Per-day API calls — rejected; the week must be designed together

### Impact

- `POST /api/programs/generate` still falls back to science
- Existing `st_exercises` / `st_set_logs` and superset columns are reused
- Science version is 1.1.0

---

## Decision 037 - Do Not Send Science Seed Lifts to the Designer

Date: 2026-09-08  
Status: Accepted  
Category: Program Design

### Decision

The program-designer model receives constraints and context, not the science engine's pre-picked exercise list. Context includes days, day types, suggested session emphasis, weekly muscle targets, equipment, limitations, a proven-exercise library, and a summary of recent completed lifts when available.

Science still builds a valid fallback program. If the model output is too thin, that fallback is saved. Week 1 remains the template copied across the cycle so progression from logs can be added later.

### Reason

Sending `science_seed_exercises` recreated slot-filling: the model tweaked a predetermined list instead of designing complementary sessions.

### Alternatives Considered

- Keep seeds as "suggestions" — rejected; the model treated them as the program
- Per-day generation with prior days attached — rejected; one weekly call is simpler and already in place
- Destructive catalog metadata migration — deferred until current adapter fields are used well

### Impact

- Science engine version 1.2.0
- Existing Program Design UI, persist path, and `st_set_logs` history unchanged
- Block JSON (`straight_sets`, `superset`, `tri_set`) maps onto existing superset columns

---

## Decision 038 - Structured Intake Is Canonical, Free Text Is Nuance

Date: 2026-09-08  
Status: Accepted  
Category: Program Design

### Decision

Program generation input is a hybrid: structured selections for goal, days, duration, split, experience, equipment, priorities, supersets, and variety; optional free text for nuance. Structured fields win over prompt parsing when `structuredIntake` is true.

Reusable defaults live on `st_training_profiles` (user-level). Each generate still stamps days, duration, and notes onto that program. Chat may later update the same structured object; it must not replace it.

### Reason

Free-text-only intake made the model guess facts the user can tap. Duration and split were the most common misses.

### Alternatives Considered

- Keep a single prompt box — rejected; too unreliable
- JSON blob on `st_programs` only — rejected for defaults; users would re-enter every time
- New table for every preference — deferred; additive columns on `st_training_profiles` match existing science profile

### Impact

- Program Design AI wizard is multi-step
- Migration `20250909_046` is additive
- History and existing programs unchanged
- Follow-up BIQ-0166: request intake wins over a stale profile; AI days apply if any succeed; unmatched names are kept

---

## Decision 039 - Apply Any Successful AI Day; Request Intake Wins

Date: 2026-09-08  
Status: Accepted  
Category: Program Design

### Decision

When the user submits structured intake, those request fields override the saved training profile for that generate. The AI week is applied if at least one day maps. Exercise names that are not in the catalog are still saved. The whole AI week is discarded only when zero days can be built. Programs with no set logs may be regenerated from intake; programs with logged sets stay 409.

### Reason

BIQ-0165 showed the intake and then saved the science slot template whenever catalog matching failed on enough days, or when a previous profile row beat the form.

### Alternatives Considered

- Keep the half-week apply threshold — rejected; one mismatched day wiped the design
- Drop unknown names — rejected; that emptied sessions and triggered fallback
- Always 409 when workouts exist — rejected for unused drafts; keep 409 when set logs exist

### Impact

- Science engine 1.3.1
- `st_set_logs` history unchanged

---

## Decision 041 - One Deadlift Variation Per Session

Date: 2026-09-10  
Status: Accepted  
Category: Program Design

### Decision

A single workout may include at most one deadlift variation (conventional, trap-bar, Romanian, stiff-leg, RDL, etc.). Full-body weeks may still use different hinge variations on different days (for example RDL on Day A and conventional on Day B).

### Reason

Users reported Conventional Deadlift and Romanian Deadlift in the same session. Science day templates only schedule one hinge slot, but the AI week rewrite could stack both because RDL and conventional were tracked as separate movement families for week variety.

### Alternatives Considered

- Treat all deadlifts as one family for the whole week — rejected; that would block intentional Day A RDL + Day B conventional variety
- Prompt-only guidance — rejected; the model still stacked both on one day
- Allow same-day RDL after conventional as “accessory” — rejected; lower-back fatigue is too high for most users

### Impact

- BIQ-0171
- Session conflict checks in exercise selection and AI apply
- Quality warning `SAME_DAY_DEADLIFTS`

---

## Decision 040 - Saved Cycle Length Controls Generation

Date: 2026-09-10  
Status: Accepted  
Category: Program Design

### Decision

When generating workouts onto an existing program, the saved cycle length (`weeks` / `cycle_length_weeks`) is authoritative. Do not fall back to 6 weeks if the program was created with a custom length (including 1 week). Keep `weeks`, `cycle_length_weeks`, and `end_date` in sync whenever length changes. Prefer `weeks` when the two length fields disagree, because Training edits historically updated only `weeks`.

### Reason

Users who chose Custom weeks still saw ~6 weeks of workouts. Generation used `Number(body.weeks) || 6` and Program Design preferred a stale `cycle_length_weeks` of 6 after Training length edits.

### Alternatives Considered

- Always trust the request body — rejected; the wizard default of 6 could override a 1-week program
- Prefer `cycle_length_weeks` forever — rejected while Training only patched `weeks`
- Generate only week 1 and leave the rest empty — deferred; multi-week programs still copy week 1 across the cycle for progression (Decision 032/033)

### Impact

- BIQ-0170
- Generation still caps at 12 weeks of workout rows

---

## Decision 033 - Calendar First, Programs Overlay Dates

Date: 2026-09-08  
Status: Accepted  
Category: Product Architecture

### Decision

Training owns a standing day / week / month calendar. A program is a dated overlay (start and end) that appears on that calendar when followed. Users can also add personal activities, including weekly repeats, that are not tied to a followed program.

Personal items live in `st_user_calendar_activities`. Program templates stay on `st_program_activities` / `st_workouts`. Logging history stays on `st_set_logs`.

### Reason

Users treat Training as a calendar first. Hiding the grid until a program is followed made the product feel empty, and blocked one-off or recurring life activities (cardio, mobility, sport).

### Alternatives Considered

- Keep the calendar hidden until Follow — rejected; users could not add anything
- Store personal events on a hidden “My Calendar” program — rejected; mixes overlay programs with the standing calendar
- Replace program activity tables — rejected; history and RLS depend on current IDs

### Impact

- Training calendar is always visible
- Programs apply by start/end dates
- Recurring personal activities are series-based in v1 (delete removes the series)
- BIQ-0170: weekly repeats can cover multiple weekdays (Mon/Wed/Fri, every day, etc.)

---

## Decision 034 - View the Plan Before Logging

Date: 2026-09-08  
Status: Accepted  
Category: Training UX

### Decision

A planned workout can be opened from the calendar or Dashboard as a read-only plan. Start Workout begins logging. Edit workout opens the existing exercise editor to change the template, and does not by itself start a logging session.

Completed set history still does not change when the template is edited later.

### Reason

Users need to see what they will do, and fix the plan, without pretending they have started the workout.

### Alternatives Considered

- Keep Start Workout as the only way to see exercises — rejected; it hid the plan
- Build a second editor only for calendar edits — rejected; the current exercise editor already updates templates

### Impact

- View and Start are separate actions
- Edit is available when the user can change the program

---

## Decision 035 - Generated Plans Open in Program Design

Date: 2026-09-08  
Status: Accepted  
Category: Program Design

### Decision

When workouts are generated, Program Design immediately shows the built plan (exercises and sets). Template edits happen there. Training remains for logging. Follow is optional after review and does not hide the plan.

### Reason

Users need to see what was built and fix it in the same place they created it. A Follow/Save gate and a calendar of day titles hid the work.

### Alternatives Considered

- Keep the Follow/Save finish screen — rejected; it never showed lifts
- Send people to Training to inspect the plan — rejected; Training is for logging
- Build a second full logger inside Programs — rejected; a focused plan editor is enough

### Impact

- Generate finishes on the Workouts tab
- Programs list → open program shows the same plan
- History still does not change when templates are edited
- Follow-up BIQ-0167: Programs template edits use the Training catalog/card editor (still not a logger)

---

## Decision 040 - Programs Template Edits Use the Training Editor Format

Date: 2026-09-08  
Status: Accepted  
Category: Program Design

### Decision

Editing a workout in Programs uses the same catalog search, exercise cards, supersets, and planned-set fields as Training. Programs does not start a logging session. Add and Change pick from `st_exercise_catalog`.

### Reason

A name-only add sheet was not usable. Users already know the Training editor, including picking lifts from the database.

### Alternatives Considered

- Keep the Programs name-only sheet — rejected; no catalog
- Send users to Training to edit — rejected; Program Design is where generated plans are reviewed
- Embed the full Training logger in Programs — rejected; logging stays on Training

### Impact

- Shared `AddExercisePanel` and `WorkoutTemplateEditor`
- `st_set_logs` history unchanged when the template is edited
- BIQ-0169: Programs exercise cards include ↑ ↓ reorder, matching Training

---

## Decision 041 - Group Members Follow the Live Template

Date: 2026-09-08  
Status: Accepted  
Category: Program Design / Groups

### Decision

Members train on the **live group program** (`visibility: team`), not a duplicated personal snapshot. Owner and editor template edits in Programs appear in every member's Training and Programs view on the next load. Members can log; they cannot edit the shared template. Unfollow still sticks: a leftover snapshot or an archived enrollment marker blocks silent re-enroll (BIQ-0150).

**Exception (BIQ-0181 / BIQ-0183 / BIQ-0184 / BIQ-0185 / BIQ-0193):** **Edit just for me** creates a personal instance named `(just me)` and follows it. Changing exercises or planned sets during a Training session does the same copy automatically. Logging sets does not. An older leftover snapshot you are still following (personal + `source_program_id`, no suffix) is adopted in place as just-me instead of rejected. On **Programs**, live group-plan edits default to **Everyone in [group]**. **Just me** there uses the same personal copy. For me and just-me copies have no audience toggle; owners/editors return to the live template by opening it from For [group]. That copy is fully editable by its owner. Auto-enroll must not switch it back to the live template. Snapshots without the suffix still switch to live until the user chooses just-me. Groups workspace template editors still change the shared plan.

### Reason

Copy-on-follow made group edits invisible to members. The copy existed to protect the template from member edits. Read-only follow of the live template protects it without hiding updates.

### Alternatives Considered

- Keep copies and require Push after every edit — rejected; members expected to see group edits immediately
- Re-copy the template on every Training load — rejected; extra writes and ID churn
- New `unfollowed_program_id` column — deferred; archived marker reuses `source_program_id`

### Impact

- `followProgram` / `syncMemberGroupEnrollment` point `followed_program_id` at the group program id
- Members already on a snapshot are switched to the live template
- Template edit UI is role-gated when `visibility` is `team`
- BIQ-0174: RLS lets members read team programs in `published | scheduled | active | completed` (not only legacy `published`), so live template edits are actually loadable
- BIQ-0181: optional personal `(just me)` follow so one person can edit without changing the shared template

---

## Decision 042 - Training Calendar Recurs; Programs Are Training Unless Inclusive

Date: 2026-09-10  
Status: Accepted  
Category: Program Design / Training

### Decision

Personal Training activities can repeat weekly on **one or more weekdays**, with an optional end date. Series still start on the add date (days earlier in that week are not backfilled). A single date can be edited or skipped without changing the rest of the series (`details.occurrence_overrides` and `details.exception_dates`). Series-wide save and remove remain available.

Programs default to **training only** (workouts and sets). During create — or later on the program — the author can opt into an **all-inclusive plan**, which also holds cardio, mobility, sport, and rest on the program week and can be pushed to a group with the training.

### Reason

A single weekday repeat is not a real calendar. Extra lifestyle activities should live on Training by default so Programs stay a training builder. Groups still need a way to send a full health week, not only lifts.

### Alternatives Considered

- Put all calendar events on the program template — rejected; Programs would stay a second calendar
- RRULE / Google-style split of the series — deferred; this-day overrides plus exception dates cover the common case
- Separate “lifestyle program” type — rejected; one flag on the existing program is enough

### Impact

- `details.recurrence_weekdays` on personal calendar rows
- `details.exception_dates` / `details.occurrence_overrides` for this-day edits
- `st_programs.inclusive_plan` (migration 046)
- Create Program asks Training only vs All-inclusive

---

## Decision 043 - Body Measurements Live Under Progress

Date: 2026-09-11  
Status: Accepted  
Category: Progress / Body Tracking

### Decision

Body composition check-ins (starting with **weight** and **waist circumference**) live under Progress → Body, not under Nutrition or Settings. Dashboard shows a Body card with quick-add for today’s values. Storage is `st_body_measurements` with one row per user per calendar day; values are stored in imperial canonical units (`weight_lbs`, `waist_inches`) to match `st_profiles`, and displayed using the profile units preference. Same-day updates merge so a blank field does not erase an earlier value that day.

### Reason

Users asked for body progress next to strength progress, plus a fast dashboard entry path. A separate top-level nav item would crowd the primary nav. Canonical imperial storage avoids unit drift across devices and matches existing profile fields.

### Alternatives Considered

- Store separate rows per metric type — deferred; day check-ins are simpler for quick-add of both values
- Put body tracking only on the Dashboard — rejected; history belongs under Progress
- Auto-update `st_profiles.weight_lbs` on every check-in — deferred; profile weight remains an onboarding/settings field for now

### Impact

- Progress has Strength | Body subsections
- Dashboard Body quick-add writes the same table as Progress
- Future metrics (hips, body fat %, etc.) can add nullable columns on the same table

---

## Decision 044 - On-the-Fly Strength Lives on a Personal Workout Container

Date: 2026-09-13  
Status: Accepted  
Category: Training / Program Design

### Decision

When a user adds a **Strength** activity on the Training calendar, BuildIQ creates a real `st_workouts` row and links it with `st_user_calendar_activities.workout_id`. Those workouts attach to an automatic personal container program (named **Personal workouts**, `generation_method = manual` so it passes `st_programs_generation_method_check`) that the user owns. They do not attach to a followed group program or rewrite an existing plan. After save, the user chooses **Generate with AI** (single-workout generate via the existing `/api/programs/generate` `targetWorkoutId` path) or **Create manually** (the existing Training catalog editor). Cardio, mobility, rest, and other types stay calendar-only. Programs lists hide this container by reserved name (and leftover `on_the_fly` rows, if any).

### Reason

Strength rows without a workout could not be started. Adding exercises onto the followed program would mutate a shared or published plan and could rewrite other days. A hidden personal container keeps on-the-fly sessions loggable without destroying the followed program or `st_set_logs` history.

### Alternatives Considered

- Attach the workout to the currently followed program — rejected; group members cannot edit those templates, and it would change the plan
- Call full-program generate on an existing program — rejected; that path deletes other workouts
- Require the user to create a personal program first — rejected; dead-ends the on-the-fly flow

### Impact

- Training Add activity for Strength always produces a Start-able workout
- Programs lists hide the on-the-fly container
- Single-workout AI generate fills one existing workout only
- Follow-up BIQ-0178: the free-text prompt sets that session’s day type and warm-up focus. The client must not hardcode Full Body when the user asked for chest (or another body part).

---

## Decision 046 - Single-Day Generate Honors Prompt Focus

Date: 2026-09-13  
Status: Accepted  
Category: Training / Science Engine

### Decision

On-the-fly / `targetWorkoutId` generate is one session. If the prompt names a body part (chest, back, legs, upper body), that becomes the structured day type and focus. If the prompt names a duration (90 minutes, 1.5 hours), that becomes the session length and the engine sizes the working-lift count to it. Warm-up then follows that session: Chest / Upper / Push / Pull / Shoulders / Arms use the upper-body prep list, not goblet squat or rear-lunge primers. Full Body / Lower still use those lower-body primers as general raise and integration.

Structured intake still wins for a **weekly** Program Design generate (Decision 038). Single-day Training generate has no day-type picker, so the prompt is the intake.

### Reason

Users asked for a chest day with a chest warm-up and received a Full Body science warm-up. That was leftover session typing, not a documented “always squat to warm up the chest” rule. Evidence in the engine only says dynamic warm-ups should prepare the work that follows.

### Alternatives Considered

- Keep Full Body and explain goblet squat as general temperature raise — rejected for an explicit chest request
- Filter warm-up only, leave main lifts as full body — rejected; the user asked for a chest workout
- New lightweight single-day model — deferred; reuse science + AI with the correct day type

### Impact

- Science engine 1.3.3
- Weekly program generate and `st_set_logs` history unchanged
- Follow-up BIQ-0179: do not hardcode 45 minutes from the Add activity duration default when the user asked for a longer session

---

## Decision 045 - Calendar Complete Does Not Rewrite Strength History

Date: 2026-09-13  
Status: Accepted  
Category: Training

### Decision

Personal calendar activities (cardio, mobility, sport, recovery, stretching, rest) can be marked complete for **one date** using `st_user_calendar_activities.details.completed_dates`. Weekly series store only that occurrence’s date. Program rest/cardio without a logger use a hidden user-owned ledger row (`details.completion_ledger`) so group templates are not mutated.

Strength items with a workout stay on the existing source of truth: every planned set has `st_set_logs.completed = true` for that `log_date`. The calendar Complete control opens the existing Start / logger flow. It does not write a second completed flag and does not change `st_set_logs` history. Undo is allowed for check-off items only.

### Reason

Users needed to mark lifestyle activities done without a set logger. Inventing a parallel “fake complete” for strength would disagree with Dashboard, Progress, and assigned-workout completion, which already infer status from set logs.

### Alternatives Considered

- New `completed` column or table — deferred; JSON details are enough and need no migration
- Mark all planned sets complete from the calendar — rejected; rewrites history and skips the logger
- Write completion onto `st_program_activities` — rejected; that is a shared template

### Impact

- Training day items show Complete / Completed
- Month/week “done” styling includes calendar check-offs as well as logged strength days
- `st_workouts` is not a completion record

---

## Decision 047 - Intake Notes Can Set Per-Day Muscle Counts

Date: 2026-09-13  
Status: Accepted  
Category: Program Design / Science Engine

### Decision

Structured intake still wins for days, duration, split, and priority muscles (Decision 038). When notes (or the generate prompt) specify a per-day count such as **2 glute / chest / bicep exercises per day**, that count is a hard session quota. Dedicated movements for that muscle fill it (glute: hip thrust, kickback, abduction; chest: press/fly; biceps: curls). A squat does not count as a glute exercise.

That muscle as a priority area without a note still adds two dedicated slots on days that train it (lower/full for glutes, upper/push/chest/full for chest, upper/pull/arms/full for biceps). 60-minute sessions keep accessories (about 5+ working lifts). Balanced and high variety do not lock the first preferred catalog lift every generate.

### Reason

Users selected glute focus, wrote the 2-per-day note, and set 60 minutes, then received a 3-lift day of the same squat/hinge/thrust trio. Notes were treated as AI flavor text only.

### Alternatives Considered

- Leave counts to the model — rejected; the last generate ignored them
- Count any lower-body lift as a glute exercise — rejected; that is how the note was skipped
- New intake stepper field for “exercises per muscle” — deferred; parse the note users already write

### Impact

- Science engine 1.3.4
- `st_set_logs` history unchanged

---

## Decision 048 - Training Just-Me Copies Stay Personal

Date: 2026-09-15  
Status: Accepted  
Category: Program Design / Groups / Training

### Decision

Training **Edit just for me** duplicates the live group program into a **personal instance** via `st_duplicate_program`. The copy is named `{source} (just me)` (no double suffix), `visibility: personal`, `team_id` null, `source_program_id` = live id, `record_kind: instance` when the column exists, and `status: published`. It is not an unfollow marker. The Training “from {group}” label is resolved from the source program or the user’s group, not by attaching the copy to the team.

Enrollment keeps that follow (`personalized_copy`). Leftover BIQ-0168 snapshots (personal + `source_program_id`, **no** `(just me)` in the name) still switch to the live template. Pure personal programs remain those with no `source_program_id`.

Owner/editor edits on the live team program still apply to all members. Members cannot edit the template; they personalize first. Completed `st_set_logs` are not rewritten onto the copy’s new workout ids.

**Programs (BIQ-0184 / BIQ-0193):** the live group-plan editor offers **Everyone in [group]** (default, live template) or **Just me** (same personal copy). For me and just-me copies have no audience toggle. Training session edits stay auto-personal (BIQ-0183).

**Training leftover plans (BIQ-0185):** a personal snapshot from before just-me that you are still following can be stamped `(just me)` so Training edits stay private. The calendar button does not require a selected workout.

### Reason

Live follow (Decision 041) made group edits visible, but there was no way to change “only what I see.” A name marker distinguishes intentional copies from leftover snapshots without a new table or column.

### Alternatives Considered

- Reuse leftover snapshots as the just-me copy — rejected; enrollment would still switch them to live
- New `personalized` column or table — rejected; name + existing lineage columns are enough
- Always duplicate on Follow — rejected; that hid owner/editor edits (BIQ-0168)

### Impact

- `customizeFollowedProgramForMe` + Training **Edit just for me**
- Programs **Everyone in [group] / Just me** on live group templates only (`programEditAudience`; BIQ-0193 hides it on For me)
- `shouldKeepPersonalizedFollow` / `isPersonalizedGroupFollow`
- No database migration

---

## Decision 049 - Training Day Moves Are Personal This-Time Overlays

Date: 2026-09-15  
Status: Accepted  
Category: Program Design / Training

### Decision

On-the-fly “I can’t train Wednesday, do it Thursday” is a **personal calendar overlay** for that occurrence. It does not change `st_workouts.day_label` or other members’ Training calendars.

Moves are stored on the existing user completion-ledger row as `workout_day_moves`. Calendar one-off rows change `activity_date`. Weekly calendar series skip the old date and insert a one-off on the new date.

### Reason

The live group template (Decision 041) must stay stable. A one-week life conflict should not rewrite the program, and completed history stays tied to the original workout ids and log dates.

### Alternatives Considered

- Update `day_label` on `st_workouts` — rejected; that would move the day for every week and every group member
- Auto-shift the rest of the week — rejected; the user may only need one or two days moved
- New table — rejected; details JSON already holds personal calendar exceptions

### Impact

- Training **Move** on day items
- `saveWorkoutDayMove` / `applyWorkoutDayMoves`
- Dashboard **Today’s Workout** uses the same overlay (BIQ-0200), not the template weekday
- No database migration

---

## Decision 050 - Programs Owns Planning; Training Does Not Host Setup

Date: 2026-09-17  
Status: Accepted  
Category: Program Design / UX

### Decision

**Programs** is the only place to create and switch plans. **Training** is for the calendar and logging.

- The Programs library filter is **For me** / **For [group]**, not Personal / Groups.
- The top of Programs shows **Training is using** so the followed plan is obvious.
- Training Program Setup is removed. Entry points (Manage program, drafts, leftover generate landing) go to Programs.
- Groups may keep a manager wizard this slice; it is not a second personal builder.
- BIQ-0191: Groups wizard is removed. Create/edit group plans in Programs → For [group]. Groups is roster and assign.
- BIQ-0194: leftover Program Setup markup in `page.tsx` is deleted.
- BIQ-0195: leftover unused generate/schedule helpers in `page.tsx` are deleted. Program create/generate stays in Programs.

### Reason

Users were asked the same who-is-this-for question in Training setup and Programs, with different labels and two builders.

### Alternatives Considered

- Keep Training setup for drafts only — rejected; two planners stay confusing
- Drop the For me / For group filter and mix all plans — rejected; group vs personal still matters
- Move Groups wizard into Programs in the same change — deferred to BIQ-0191 / Decision 051

### Impact

- BIQ-0190
- No database migration

---

## Decision 051 - Groups Is Roster and Assign, Not a Planner

Date: 2026-09-17  
Status: Accepted  
Category: Program Design / Groups

### Decision

**Groups** is for people: roster, roles, dates, and which member uses which plan.

**Programs → For [group]** is the only place to create or edit a group plan.

- Groups Programs tab lists plans for publish / assign / duplicate / delete.
- Create, generate, and edit workouts open Programs on that group.
- Generating a plan for one member also starts in Programs; assign them after from Groups.

### Reason

A second builder in Groups duplicated Programs and made “who is this for?” unclear after Training Program Setup was removed (Decision 050).

### Alternatives Considered

- Keep Groups generate for per-member plans — rejected; that is still a second builder
- Delete the Groups program list entirely — rejected; managers still need assign/publish in context of the roster

### Impact

- BIQ-0191
- BIQ-0194 deleted leftover unmounted wizard markup
- BIQ-0195 deleted leftover unused generate/schedule helpers in `page.tsx`
- No database migration

---

## Decision 052 - Programs Cards: Use in Training; Audience Only on Live Group Plans

Date: 2026-09-17  
Status: Accepted  
Category: Program Design / UX

### Decision

Each Programs library card has one extra action besides Open: **Use in Training**.

- Open is the row title (and the editor). Owners/editors still edit the live group template from Open.
- **Use in Training** follows the live group template (or the personal plan). It replaces Follow and Pull in & edit.
- Hide Use in Training when Training already uses that plan, and on draft / archived plans.
- **Everyone in [group] / Just me** only appears while editing a live group plan. For me and `(just me)` copies have no audience chooser. To edit the group plan again, Open it from For [group].

### Reason

Follow vs Pull in & edit vs Whole group on personal plans made Programs feel like two products. Training already shows which plan it uses.

### Alternatives Considered

- Keep Pull in & edit for owners so Open stays read-only — rejected; owners need Open to edit the live plan, and Pull in duplicated Follow
- Show Whole group / Just me on just-me copies so you can switch back in place — rejected; For [group] → Open is the return path (Decision 050 / 051)

### Impact

- BIQ-0193
- BIQ-0196: For me is sectioned as My plans / Just me copies / Older group copies
- No database migration

---

## Decision 053 - Dedicated Cardio and Mobility Days Are Intake Choices

Date: 2026-09-17  
Status: Accepted  
Category: Program Design / AI Intake

### Decision

Users can ask for a **dedicated cardio day** and a **dedicated mobility / recovery day** during program intake.

- Yes / No / Let BuildIQ Decide
- Yes adds the day on a free weekday when possible so lift days stay lift days
- Let BuildIQ Decide uses goal and style (fat loss, endurance, athletic, 5+ days, Mobility priority)
- Cardio and Mobility are real workout types in the science engine, not Full Body with a note

### Reason

Notes and leftover schedule suggestions could not reliably produce a conditioning or recovery day.

### Alternatives Considered

- Keep cardio/mobility only as calendar activities outside the program — rejected; users asked for it in generate
- Convert a lift day whenever cardio is requested — rejected unless all seven weekdays are already lift days

### Impact

- BIQ-0197
- Optional migration 049 on `st_training_profiles`

---

## Decision 054 - Master Library Replaces the GIF Dump by Archive, Not Delete

Date: 2026-09-20  
Status: Accepted  
Category: Exercise Catalog

### Decision

The live system catalog is the curated **BuildIQ Master Library** (`external_source = builtiq_master`): one card per movement, compatible equipment, optional later video + poster.

Cutover rules:

- Insert/upsert the master rows (248 from the spreadsheet plus Power Clean, Windmill, Side Bend, Pull-Up Work, Trunk Rotation, Plate Front Raise)
- Remap current program `catalog_exercise_id` and log `snapshot_catalog_exercise_id` from the household mapping
- Never rewrite `snapshot_exercise_name` or planned sets
- Archive old system catalog rows; do not delete them
- Leave user custom exercises alone

### Reason

The 1,300+ GIF library is hard to search and train from. Household history must stay accurate. Deleting catalog rows would null FKs (`ON DELETE SET NULL`) and lose thumbs on old plans.

### Alternatives Considered

- Delete unused catalog rows — rejected; breaks FKs and any unmapped plans
- Rewrite plan exercise names to the new master names — rejected for this cutover; names stay until the user edits
- Wait until every Veo video exists — rejected; empty media is fine

### Impact

- BIQ-0201
- Settings admin import
- Search and AI use active master rows after import

---

## Decision 055 - Workout Equipment Lives on the Plan Row, Not a Second Catalog Card

Date: 2026-09-20  
Status: Accepted  
Category: Exercise Catalog

### Decision

Keep one master card per movement. Store the chosen implement on `st_exercises.equipment` and snapshot it on `st_set_logs.snapshot_equipment` when a set is logged.

The picker options come from `coaching_metadata.compatible_equipment`. History names stay as logged.

### Reason

Power Clean is the same movement with barbell, dumbbell, or kettlebell. Separate catalog cards would undo the master-library cutover. Profile available-equipment only filters search; it does not record what was used on a day.

### Alternatives Considered

- New catalog row per implement — rejected; search and mapping explode again
- Store the implement only in `notes` — rejected; notes already mark warmup primers
- Wait for videos per implement — rejected; one form video per movement is enough

### Impact

- BIQ-0202
- Migration 050
- Training and program-design exercise cards

---

## Decision 056 - Exercise Swaps Ask This Week vs Remaining Weeks

Date: 2026-09-21  
Status: Accepted  
Category: Training

### Decision

When a user replaces a planned exercise from Training (catalog pick or name typeahead), show a small overlay: **This week only** or **All remaining weeks**. The change still runs on the personal just-me copy when they are following a group plan. Logged set history is not rewritten.

If only one remaining week of that weekday exists, skip the overlay and apply to that week.

### Reason

A swap in a live session used to update only the open workout. Users expected a choice: one session vs the rest of their plan. Group templates must stay unchanged unless a shared-template editor is editing the group plan on purpose.

### Alternatives Considered

- Always apply to all remaining weeks — rejected; a one-day swap (injury, missing equipment) would rewrite the rest of the cycle
- Always this workout only — rejected; users would re-swap every week
- Reuse the group-editor “Apply this change to” dropdown — rejected for Training; members should see a one-shot overlay at the moment of the swap

### Impact

- BIQ-0203
- `targetWorkoutsFrom` honors an explicit current/future override from the overlay
- Personal copy via `ensurePersonalCopyForTrainingEdit` is unchanged

---

## Decision 057 - Nutrition Trend Graph Is Calendar Weeks and Filterable

Date: 2026-09-21  
Status: Accepted  
Category: Nutrition

### Decision

The Nutrition tab graph is a Monday–Sunday calendar week. Users can page to earlier weeks without changing the daily log date. They can show all macros as % of goal, or one macro in grams/calories with a week average and vs-prior-week delta.

Tapping a day on the graph still opens that day’s log.

### Reason

A rolling last-7-days line is hard to compare week to week. Isolating one macro is the way to see whether protein (or another target) is trending.

### Alternatives Considered

- Keep a rolling 7 days ending on the selected date — rejected; “previous week” is unclear
- Swiping the graph also changes the daily date — rejected; users asked to inspect history on the graph
- A multi-month Progress chart instead of week paging — later; this change stays on the Nutrition tab

### Impact

- BIQ-0204
- `buildWeeklyNutritionSummary` is the chart source again
- Progress-tab longer nutrition trends remain a later item

---

## Decision 058 - Warm-up Sets Do Not Gate Workout Complete

Date: 2026-09-21  
Status: Accepted  
Category: Training

### Decision

Strength workout complete (Training Done badge and Dashboard Completed) requires every **loggable** planned set to have `st_set_logs.completed`. Warm-up / prep exercises are excluded because the session UI is prescription-only.

### Reason

Users can finish every lift and still look incomplete. Warm-up rows have planned sets but no set logger, so those IDs can never be checked off.

### Alternatives Considered

- Add a Done checkbox on warm-up cards — rejected for this fix; warm-up is guidance, not logging
- Also exclude cooldown — rejected for now; cooldown uses the normal logger
- Treat entered weight/reps as complete without the Done checkbox — separate issue; Progress already shows those rows

### Impact

- BIQ-0205
- Existing completed history is unchanged

---

## Decision 059 - AI Authors the Week; Science Calculates, Validates, and Falls Back

Date: 2026-09-22  
Status: Accepted  
Category: Program Design

### Decision

Phase 1 of the generation redesign (BIQ-0208) inverts Decision 032's authorship. The science engine calculates weekly working-set targets, exposure ranges, duration, RIR, equipment, and fatigue constraints. It does not send a pre-selected exercise seed to the model.

The model designs the whole week from those constraints and a filtered exercise-ID library. After a valid response, deterministic code may resolve exact IDs, compute metadata, validate, apply explicit progression rules, and add standard ramps only on eligible primaries. It may not pad with science-template lifts, replace warm-ups, auto-add potentiation, fuzzy-match names, or mix AI days with science days.

Invalid programming goes through at most two AI repair attempts, then science fallback. The validator judges bad duplication, competing heavy supersets, and insufficient stimulus — it does not ban 2×/week frequency, every primary superset, or a low exercise count by itself.

Production model stayed `gpt-4o-mini` until the OpenAI verification spike was accepted. Updated by Decision 060. Phase 2 and Phase 3 are not started.

### Reason

The science-first overlay produced cloned full-body days and silently rewrote AI output (including Push-Up becoming 6/side). Users need complementary weekly programming, not slot-filling plus local mutation.

### Alternatives Considered

- Keep science as author with a stricter prompt — rejected; the overlay still cloned days
- Auto-reject any repeated primary or any primary in a superset — rejected; frequency and low-fatigue pairings can be legitimate
- Require a minimum exercise count — rejected; stimulus depends on goal, duration, sets, and coverage
- Change the production model before the verification spike — rejected; keep gpt-4o-mini until Responses / Structured Outputs / reasoning / previous_response_id are confirmed for this key

### Impact

- `POST /api/programs/generate` uses `runGenerationPipeline`
- Science version 1.4.0, designer prompt `designer@2.0` (see Decision 060 for 1.4.1 / designer@2.1)
- New `st_generation_runs` observability table
- Supersedes Decision 032 for generation authorship; Decisions 036–037 remain the constraint/no-seed rules

---

## Decision 060 - Phase 1.1 Quality Pass Without Adaptive Coaching

Date: 2026-09-22  
Status: Accepted  
Category: Program Design

### Decision

Keep the Phase 1 architecture. Upgrade the program-generation client to a reasoning-capable model (`gpt-5.4` Responses API, `reasoning.effort=medium`) when the key supports it, with fallbacks. Tighten quality validation for roles, weekly volume severity, rest, fatigue composition, movement balance, superset preference, cooldown semantics, and why-field agreement.

Ramp eligibility comes from structured metadata and session role, not exercise-name lists. Duration is calculated deterministically. For progression, use option A: persist week 1 plus progression intent, and copy that template to later weeks without pretending they were already progressed.

Do not start Phase 2 adaptive coaching.

### Reason

The first live Phase 1 week passed the structural contract and still produced weak programming. The cheapest correct progression fix is honesty: week 1 is the template. Applying `weekly_rules` as fake load changes would look like coaching that has not been built.

### Alternatives Considered

- Stay on `gpt-4o-mini` — rejected after the verification spike showed Responses + reasoning models available
- Option B: materialize simple deterministic weekly progression now — rejected as larger than Phase 1.1 and easy to confuse with adaptive coaching
- Rewrite production catalog fatigue metadata — rejected until the live catalog is inspected; only FALLBACK inference was corrected
- Force potentiation or a superset into every session — rejected; decide intentionally, flag a week that ignores “sometimes”

### Impact

- Science engine 1.4.1, designer prompt `designer@2.1`
- Env: `OPENAI_PROGRAM_MODEL`, `OPENAI_PROGRAM_REASONING_EFFORT`
- Phase 2 / Phase 3 remain unstarted

---

## Decision 073 - Master Hypertrophy Credits Are Authoritative

Date: 2026-09-24  
Status: Accepted  
Category: Program Design

### Decision

For the 260 active master exercises, `coaching_metadata.hypertrophy_volume_credits` is the only volume map used in normal generation. Name inference and `muscle_targets` are legacy safety for incomplete, archived, or user-custom rows. Vertical pulls credit lats 1.0 and upper_back 0.5. Mid-back rows credit upper_back 1.0 and lats 0.5. Lat-biased Low Row / Meadows Row stay lat-primary. Do not give every pull lats 1.0 + upper_back 1.0. The intermediate major target of 10 equivalent sets for both `upper_back` and `lats` is unchanged.

### Reason

Generate was failing VOLUME_OFF because stored credits omitted upper_back on vertical pulls, enrichment treated many rows as lat-primary, and name-default merge was case-sensitive so it never fired on master names.

### Alternatives Considered

- Lower the upper_back target so a pull-only week passes — rejected; target and credits must use the same equivalent-set definition
- Give every pull lats 1.0 + upper_back 1.0 — rejected; that erases the lat vs mid-back distinction
- Keep merging NAME_DEFAULTS into explicit credits — rejected; the 260 must not depend on name inference

### Impact

- Science generation `1.4.6`
- 26 active master rows updated; rollback snapshot required before the write
- Science fallback can pick real catalog rows and will not stack Chin-Up with Pull-Up in one session
- Phase 2B is not started

---

## Decision 072 - One AI Design Call, Deterministic Repair, Persist Once

Date: 2026-09-24  
Status: Accepted  
Category: Program Design

### Decision

Generate Program uses one GPT-5.4 Responses call with `reasoning.effort=low`. The science engine validates and deterministically repairs ordinary violations, then persists the accepted week once. Science fallback is emergency-only when that single AI call fails or remains invalid after repair.

This supersedes Decision 059's two AI repair attempts and Decision 060's default `reasoning.effort=medium` for the design call. It reverts BIQ-0227 fallback-first persist. Phase 2A progression/adaptation and the 260-master catalog are unchanged. Phase 2B is not started.

### Reason

A diagnosis run showed medium reasoning took 131s and 8,795 reasoning tokens while still failing validation. Low reasoning took 39.5s with one validator error. AI repair inside the same 120s Vercel function is what killed Generate. The science engine already owns rest, laterality, duration, volume, cooldown eligibility, and ramps.

### Alternatives Considered

- Keep fallback-first persist as the normal path — rejected; the science template must not become the default Generate result
- Keep two GPT repair calls — rejected; a second 40–60s call does not fit the host budget
- Switch the model family — rejected until low reasoning plus deterministic repair is measured
- Raise Vercel `maxDuration` instead of fixing the request — rejected; that hides the architecture problem

### Impact

- Science generation `1.4.5`, designer prompt `designer@2.2`
- Env default: `OPENAI_PROGRAM_REASONING_EFFORT=low`, `OPENAI_PROGRAM_TIMEOUT_MS=75000`
- `ai_repaired` now means deterministic repair, not a second GPT call

---

## Decision 071 - Personal Create Does Not Require Unfollow

Date: 2026-09-24  
Status: Accepted  
Category: Program Design

### Decision

A user may create a For me plan while Training is already using another plan (including a group plan). Do not prompt unfollow first. The new program is added to My plans and stays available until they tap Use in Training. Training keeps the current followed program until they choose otherwise.

This supersedes the Decision 031 rule that personal create required an explicit unfollow.

### Reason

Building a personal plan is library work. Forcing unfollow just to draft or generate a plan interrupts Training and makes create feel blocked.

### Alternatives Considered

- Keep the unfollow prompt — rejected; the user asked to create without leaving the current Training plan
- Auto-follow the new plan after create — rejected; “available if I want to use it” means opt-in via Use in Training

### Impact

- `shouldPromptUnfollowForPersonalCreate` is always false
- Programs create flow no longer unfollows

---

## Decision 070 - Phase 2A.3 Is Live-Verified; Do Not Start 2B

Date: 2026-09-24  
Status: Accepted  
Category: Program Design

### Decision

Treat Phase 2A.3 as operationally verified on the live project after 053. Do not reapply 053. Do not start Phase 2B until that work is explicitly requested.

### Reason

The disposable closed-loop used the real evaluator and apply path, the unique success index rejected a duplicate mutation, and template week status stayed `template`.

### Impact

- Adaptive strength loop (log → decide → apply next exposure → ledger → explanation) is live
- Phase 2B remains unstarted

---

## Decision 069 - Template Prescription Prep and Version-Stable Apply Identity

Date: 2026-09-24  
Status: Accepted  
Category: Program Design

### Decision

A future `template` exposure may be the next comparable target when it is first, unperformed, same user/program/catalog, and not completed or locked. Writing the 2A.2 proposed load into that template is prescription preparation. `week_status` stays `template`. Do not activate the week and do not propagate to later template weeks.

`application_key` identifies the adaptation relationship (user + source workout/exercise + target workout/exercise + catalog + decision). Science version, adaptation engine version, and apply engine version are ledger metadata only. Changing a version must not mint a new key or restack a successful mutation.

A prior `not_applied` / stale row does not occupy the unique success slot. If the user restores the target so a fresh evaluation matches, the same identity may succeed once. After a successful row exists, retries return `ALREADY_APPLIED`.

Do not apply 053. Do not start Phase 2B.

### Reason

Skipping templates broke Friday → next-Monday progression. Including versions in the key would let a deploy rewrite 190 to 195.

### Alternatives Considered

- Activate Week 2 when writing 190 — rejected; week activation is a separate system
- New key per engine version — rejected; that is a duplicate mutation
- Treat stale `not_applied` as permanently blocking — rejected; the user must be able to restore and apply once

### Impact

- Apply engine version `2a3.0.1`
- Unique success index on 053 stays; comments updated
- Phase 2B remains unstarted

---

## Decision 068 - Phase 2A.3 Applies the Next Exposure Only

Date: 2026-09-24  
Status: Accepted  
Category: Program Design

### Decision

Phase 2A.3 applies a frozen 2A.2 decision to the first later eligible comparable exposure in the same user + active program. 2A.2 remains the authority for what should happen. 2A.3 only decides where and how that change is applied safely.

Automatically applicable: `progress_load`, `reduce_load`, `build_reps` when a real prescription change is required, and `hold` for record/explain. Never automatically rewrite for `review_required`, `insufficient_data`, or `pain_hold`.

Do not update every future occurrence. Do not activate template weeks. Do not recalculate increments. Use the exact 2A.2 `proposed_load`. Abort with `STALE_TARGET_PRESCRIPTION` if the target working-set fingerprint changed. Manual edits win before and after apply. The same source + target + decision + versions must never increment twice.

Classify each attempt as `mutated`, `recorded_no_change`, or `not_applied`. Persist an auditable `st_adaptation_events` row when appropriate. Additive migration 053 is required for source/target identity, application status, fingerprint, and a unique success key. Do not apply 053 until reviewed.

Do not start Phase 2B.

### Reason

Writing the next Friday bench to 190 is useful only if history, other users, other programs, warmups, and later manual edits stay untouched. Idempotency and a stale fingerprint keep a second save or a user edit from stacking load.

### Alternatives Considered

- Adapt every remaining bench in the cycle — rejected; evaluate after each performed exposure
- Recalculate +5 from the current target at apply time — rejected; would turn 190 into 195 on retry
- Activate next-week templates from 2A.3 — rejected; week activation is a separate system
- Overwrite a newer manual edit — rejected; the user wins

### Impact

- Apply engine version `2a3.0.0`
- Adaptation decision engine stays `2a2.1.0`
- Science generation stays `1.4.4`
- Phase 1 / 1.1 / 2A.1 / 2A.2 remain frozen
- Live ledger uniqueness waits on unapplied 053

---

## Decision 067 - Effort-Aware RIR Band, Reduction, and Could-Not-Complete

Date: 2026-09-24  
Status: Accepted  
Category: Program Design

### Decision

Keep Phase 2A.2 decision-only. Refine three rules:

1. Target-compatible RIR is the band `[target − 0.5, target + 1.5]`. Top-of-range work easier than that still progresses one increment, but as `PROG_LOAD_UNDERCHALLENGED`, not target-compatible RIR. No multi-increment jumps.
2. `reduce_load` requires repeated comparable underperformance **and** excessive-effort evidence. Below-range + high RIR, or below-range with unknown RIR, holds/reviews. Missing RIR is never invented to justify a cut.
3. `could_not_complete` is performance evidence, not a skip. First occurrence holds (`HOLD_COULD_NOT_COMPLETE`). Repeated CNC may reduce only with excessive effort; otherwise `review_required`.

Do not start Phase 2A.3.

### Reason

High RIR at the top of the range is not the same as hitting the prescribed effort. Low reps at high RIR do not prove the load is too heavy. Stopping short is not adherence.

### Alternatives Considered

- Treat every RIR above target as target-compatible — rejected; RIR 5 is not RIR 2
- Multi-increment jumps for underchallenged work — rejected for 2A.2
- Reduce after any two below-min exposures — rejected; effort must support it

### Impact

- Adaptation engine `2a2.1.0`
- Phase 2A.3 still unstarted

---

## Decision 066 - Phase 2A.2 Recommends Progression, 2A.3 Applies It

Date: 2026-09-24  
Status: Accepted  
Category: Program Design

### Decision

Phase 2A.2 is a pure deterministic decision engine. It may analyze completed performance and produce a typed next-exposure recommendation with reason codes. It must not mutate future `st_planned_sets`, activate or adapt future weeks, or insert adaptation-ledger rows until 2A.3 solves idempotency.

Missing RIR is never invented. High-confidence load progress requires top-of-range sets and actual RIR within 0.5 of target. Missing-RIR top-of-range work holds once and may progress after a second consecutive comparable exposure at the same load. One poor workout holds; two consecutive below-range exposures may reduce; extras/warmups/ramps never qualify. Unanswered pain is unknown, not “no pain.”

### Reason

Applying un-reviewed load changes to future weeks would rewrite prescriptions before the decision rules are trusted. A recommendation with an audit draft is enough to verify the rules.

### Alternatives Considered

- Write ledger events on every evaluation — rejected; viewing history would duplicate rows
- Apply decisions to next week in the same change — rejected; that is 2A.3
- Treat missing RIR as target RIR 2 — rejected; Decision 065
- Universal +5 lb — rejected; equipment-aware increments with user/gym override hooks

### Impact

- Science engine generation version stays 1.4.4
- Adaptation engine version is `2a2.0.0`
- Phase 1 / 1.1 / 2A.1 remain frozen
- Phase 2A.3 is unstarted

---

## Decision 065 - Phase 2A.1 Data Foundation Before Progression

Date: 2026-09-23  
Status: Accepted  
Category: Program Design

### Decision

Start Phase 2A.1 only. Persist the data the future deterministic engine needs: exercise `program_role` / `measurement_type` / `laterality`, planned-vs-performed snapshots on new logs, explicit session and exercise outcomes, extra sets on `st_set_logs` (`is_extra_set`, null `planned_set_id`), evidence-based week status, minimal workout feel + pain feedback, and an append-only `st_adaptation_events` ledger.

Protect a planned set's prescription fields only after that set has performance. Do not freeze the whole workout. Wholesale replace/import/generate remains blocked when performance exists. Unanswered pain is null; `none` is explicit.

Missing RIR is never treated as RIR 2. Load progression eligibility uses two confidence paths (high-confidence RIR vs two consecutive top-range performance-only exposures). Those rules are specified now and not applied to programs yet.

Do not apply the migration until reviewed. Do not start Phase 2A.2 automatic progression. Do not change Phase 1 week generation.

### Reason

BuiltIQ cannot learn from performed training until planned and performed data are distinguishable, skipped work is explicit, and logged workouts cannot have their prescriptions rewritten.

### Alternatives Considered

- Implement automatic double progression in the same change — rejected; 2A.1 is capture-only
- Infer skipped from empty logs — rejected; empty means not_started
- Store extra sets as additional planned rows — rejected; extras must not become the prescription
- Separate `st_extra_set_logs` table — rejected; one performed-set table
- Workout-wide planned-set trigger — rejected; it broke mid-session Training UX
- Permanent HOLD on missing RIR — rejected; two comparable top-range exposures may progress

### Impact

- Migration `20260923_052_phase2a1_training_foundation.sql` is review-only until applied
- Phase 1 / 1.1 generation remains frozen
- Science engine version stays 1.4.4

---

## Decision 064 - AI Generation Uses Only Active BuiltIQ Master Exercises

Date: 2026-09-23  
Status: Accepted  
Category: Program Design

### Decision

Automatic AI program generation may use only active `builtiq_master` system exercises. User-created exercises remain in the catalog for the owner's manual workout creation, history, and logging, but they are not AI-eligible yet. The filter is enforced in the generation pipeline so a service-role catalog dump cannot put User A's custom into User B's candidate library.

Do not start Phase 2 in this change.

### Reason

`is_archived = false` is a Training/history flag, not a generation-eligibility flag. The live 279-row catalog included 19 owner customs, and two of them were selected into a generated week.

### Alternatives Considered

- Allow the requesting user's customs automatically — rejected until explicit AI eligibility exists
- Rely on RLS / frontend filtering only — rejected; service-role live generation bypassed that
- Archive the 19 customs — rejected; they are still needed for logging and history

### Impact

- Science engine 1.4.4
- Phase 1 / Phase 1.1 generation foundation is complete
- Phase 2 remains unstarted

---

## Decision 063 - Apply Approved Enrichment To Active Master Rows Only

Date: 2026-09-23  
Status: Accepted  
Category: Program Design

### Decision

Apply the approved 260-row enrichment to active BuiltIQ master catalog rows only. Keep first-class columns within the existing movement-pattern constraint and store rich programming intelligence in `coaching_metadata`. Preserve unrelated metadata. Write a rollback snapshot first and abort the whole operation if validation or persistence checks fail.

The six review rows are applied with the approved overrides (Y-raise rep ranges, Copenhagen cooldown false, Jefferson Curl descriptive `loaded_spinal_flexion` demand, Overhead Carry unilateral/distance, Upright Row as shoulder abduction). Do not start Phase 2.

### Reason

The quality-pass artifact is now good enough for the programming engine, but only if generation actually reads the stored metadata.

### Alternatives Considered

- Expand the first-class movement-pattern check constraint now — rejected; store rich patterns in metadata until a later schema change
- Treat Jefferson Curl as a medical contraindication — rejected; descriptive demand characteristic only
- Apply to archived rows — rejected

### Impact

- Science engine 1.4.3
- Active master rows gain enrichment_version `BIQ-0213`
- First-class `movement_pattern` must stay inside `st_exercise_catalog_movement_pattern_check` (`squat`, `hinge`, `push_horizontal`, `push_vertical`, `pull_horizontal`, `pull_vertical`, `carry`, `rotation`, `isolation`, `cardio`). Rich patterns remain in `coaching_metadata.movement_pattern`.
- Phase 2 remains unstarted

---

## Decision 062 - Catalog Enrichment Quality Pass Is Review-Only

Date: 2026-09-23  
Status: Accepted  
Category: Program Design

### Decision

Keep catalog enrichment as a review artifact. Rewrite the deterministic classifier before any production write: exact/contextual mappings instead of ambiguous substrings; laterality that does not assume bilateral from a missing "single"; measurement types beyond reps; ramp eligibility for loaded/technical work only; fatigue as programming cost; primary-muscle assignment when one can reasonably be made; and a split between muscle involvement and conservative hypertrophy volume credit.

`review_required` means genuine ambiguity or programming risk. Missing old-database fatigue/skill fields are not a review reason. Do not apply accepted values to `st_exercise_catalog` in this change. Do not start Phase 2.

### Reason

The first 260-row artifact was useful and still wrong in the places that matter for programming: Jefferson Curl as elbow flexion, Nordic as a low-fatigue curl, jumps as squats, Side/Copenhagen Plank as anti-extension, Suitcase Carry as rotation, and every row flagged for review.

### Alternatives Considered

- Apply the first artifact to production and clean up later — rejected; classification errors would enter the programming engine
- Keep automatic 0.5 hypertrophy credit for every secondary muscle — rejected; involvement is not volume
- Start Phase 2 while enrichment is unfinished — rejected

### Impact

- Review CSV/JSON/MD regenerated from `qualityPass`
- Production generation still uses current catalog/adapter behavior
- Phase 2 remains unstarted

---

## Decision 061 - Proportional Session Duration and Contextual Patterns

Date: 2026-09-22  
Status: Accepted  
Category: Program Design

### Decision

AI session duration is judged as a percentage of the requested length: about 10% warning, 15% error, with minimum 5 / 8 minute floors so short sessions are not crushed by percentage math. Being shorter than requested is a warning at most; the model must not add filler to consume leftover time.

Movement-pattern validation stays contextual. Hypertrophy weeks are not required to include vertical pressing when horizontal/incline pressing and direct delt work already cover the goal.

Catalog metadata will be enriched later after review. This change does not rewrite `st_exercise_catalog`.

### Reason

The +15 minute allowance let a 60-minute request pass at 75 minutes. Vertical press is a programming option, not a checklist item.

### Alternatives Considered

- Keep +15 minutes — rejected; too loose for 60-minute sessions
- Error on any missing canonical pattern including vertical push — rejected; not required for hypertrophy
- Enrich the catalog in the same change — rejected; review the audit first

### Impact

- Science engine 1.4.2, designer prompt `designer@2.1.1`
- Phase 2 remains unstarted

---
