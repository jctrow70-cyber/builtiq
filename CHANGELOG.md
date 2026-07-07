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
Status: Planned

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

## BIQ-0002 - Codebase Review and Security Audit

Date: TBD  
Branch: develop  
Status: Planned

### Summary

Review the existing BuiltIQ Health codebase, Supabase setup, authentication flow, and database security rules.

### Purpose

Before adding more features, confirm the app is safe, stable, and structured correctly.

### Changes

- Review current app structure
- Review authentication
- Review Supabase tables
- Review row-level security policies
- Identify risky or duplicated code
- Identify needed refactoring

### Files Changed

TBD.

### Database Changes

TBD.

### Testing Steps

- Create test user account
- Log in and log out
- Confirm one user cannot see another user’s data
- Create workout
- Save workout
- View workout history
- Confirm database policies protect user data

### Known Issues

TBD.

### Recommended Commit Message

```text
BIQ-0002 Review codebase and security foundation
```

---

## BIQ-0003 - Workout History Stability

Date: TBD  
Branch: develop  
Status: Planned

### Summary

Improve workout history so completed workouts remain accurate even when templates or exercises change later.

### Purpose

Workout history must be reliable. A completed workout should represent exactly what the user did at that time.

### Changes

TBD.

### Files Changed

TBD.

### Database Changes

TBD.

### Testing Steps

- Create workout template
- Complete workout from template
- Save completed workout
- Edit original template
- Confirm saved workout history does not change
- Confirm old workout still displays correctly

### Known Issues

TBD.

### Recommended Commit Message

```text
BIQ-0003 Stabilize workout history behavior
```
