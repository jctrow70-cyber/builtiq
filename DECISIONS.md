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
