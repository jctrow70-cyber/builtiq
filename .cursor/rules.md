# Cursor Development Rules for BuiltIQ

You are the AI developer for the BuiltIQ Health application.

Before making code changes:
- Always read BUILTIQ_CONTEXT.md
- Understand the current architecture
- Understand existing Supabase schema
- Explain major changes before implementing them

---

# Development Workflow

Branch rules:

- develop = active development/testing
- main = production

All new work happens on develop first.

Never directly modify production without approval.

---

# Core Product Rules

BuiltIQ is an AI wellness platform.

The mission:
"Remove the thinking. Guide the user."

Prioritize:
- Simple user experience
- Mobile-first design
- Intelligent coaching
- Long-term progress tracking

---

# Data Protection Rules

NEVER:
- Delete existing user data
- Reset production tables
- Remove workout history
- Remove nutrition history
- Break existing users

Completed logs are permanent history.

Templates can change.
History cannot.

---

# Team Training Rules

Teams are shared training environments.

Team shared data:
- Programs
- Workout templates
- Exercise selection
- Exercise order
- Planned sets
- Target reps
- Target RPE

Individual user data:
- Weight lifted
- Actual reps completed
- Actual RPE
- Completion status
- Notes
- Progress
- Personal records

Never allow one user's workout log to overwrite another user's data.

---

# Permissions

Support roles:

Owner:
- Full control
- Invite members
- Remove members
- Assign editors
- Edit team plans

Editor:
- Modify shared workouts

Member:
- Complete workouts
- Track personal progress

---

# Database Rules

Supabase is the source of truth.

When changing database:

1. Do not edit randomly.
2. Create migration SQL.
3. Preserve existing data.
4. Maintain Row Level Security.
5. Test schema changes in development first.

Never assume tables can be dropped.

---

# Training Module Rules

Training priority order:

1. Make strength tracking stable
2. Improve workout editing
3. Add progression intelligence
4. Add AI coaching

Workout structure:

Mobility / Prep

then

Plyometrics / Power

then

Strength Training

then

Optional:
- Conditioning
- Cardio
- Core

---

# Exercise Rules

Exercises should support:

- Multiple muscle groups
- Primary muscle
- Secondary muscles
- Equipment
- Instructions
- Video links

Do not hard-code small exercise lists long term.

Design for a large exercise database.

---

# Set Tracking Rules

Support:

Warmup sets
Working sets
Backoff sets
Drop sets
AMRAP sets

Each set can have:

Planned:
- Weight
- Reps
- RPE

Actual:
- Weight
- Reps
- RPE

---

# Progression Rules

BuiltIQ should remember previous performance.

When opening a workout:

Show:
- Previous weight
- Previous reps
- Previous RPE

Recommend:
- Next weight
- Next target

Progression considers:
- Performance
- Goal
- Fatigue
- Recovery

---

# Nutrition Rules

Nutrition module should support:

- Calories
- Protein
- Carbs
- Fat
- Meals by date

Future AI should estimate foods naturally.

Example:

User:
"6 oz chicken breast and rice"

AI returns:
- Calories
- Protein
- Carbs
- Fat

---

# Dashboard Rules

Dashboard should eventually combine:

Training:
- Volume
- PRs
- Strength trends

Nutrition:
- Macro compliance
- Calories

Body:
- Weight
- Measurements
- Photos

Wearables:
- Steps
- Sleep
- Heart rate
- Recovery

---

# Integrations

Future support:

Apple Health
Garmin

Import:
- Steps
- Calories
- Sleep
- HRV
- Heart rate

---

# Coding Standards

Prefer:

- Small focused changes
- Clean components
- Reusable functions
- Clear database relationships

Avoid:

- Huge rewrites
- Duplicate logic
- Temporary hacks
- Breaking mobile layouts

---

# Testing Checklist

Before completing work:

Confirm:

1. Login works
2. Personal mode works
3. Team mode works
4. Owner permissions work
5. Member permissions work
6. Workout logs save
7. Data persists after refresh
8. Mobile layout works

---

# Final Rule

Build BuiltIQ like a real production fitness platform.

Every feature should answer:

"Does this help the user become healthier, stronger, and more consistent?"