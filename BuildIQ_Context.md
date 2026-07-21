# BuildIQ Health Application Context

## Product Vision

BuildIQ Health is an AI-powered health, fitness, and wellness platform.

The goal is not just workout tracking. BuildIQ Health should become a complete personal fitness operating system combining:

- Strength training
- Nutrition tracking
- Body composition
- Recovery
- Wearable data
- AI coaching
- Team/family training

The core philosophy:

"Remove the thinking. Guide the user."

The app should help beginners train correctly while still providing advanced features for experienced athletes.


---

# Current Architecture

Frontend:
- Next.js
- React
- TypeScript
- Mobile-first design

Backend:
- Supabase
- Authentication
- Postgres database
- Row Level Security enabled

Deployment:
- GitHub repository
- Vercel deployment

Branch strategy:

main
- Production
- Stable releases only

develop
- Testing environment
- All AI/development work happens here first


---

# Core Design Rules

## Never overwrite user history

Completed workouts are historical records.

If a workout template changes:
- Future workouts can change
- Completed logs remain unchanged


---

# User Structure

BuildIQ Health supports:

## Personal Mode

A user has:
- Their own programs
- Their own workout logs
- Their own progress


## Team Mode

Previously called Household.

A Team is a shared training environment.

Examples:
- Family
- Coach + athletes
- Friends
- Trainers + clients


---

# Team Rules

Team programs work like templates.

Shared:

- Program
- Workout days
- Exercise list
- Exercise order
- Target sets
- Target reps
- Target RPE
- Workout structure

Individual:

- Weight lifted
- Actual reps
- Actual RPE
- Completion status
- Notes
- Progress
- Personal records


Example:

Team workout:

Bench Press
3 sets x 8 reps

User results:

Jesse:
185 x 8
185 x 8
175 x 10

Member:
95 x 10
100 x 8
100 x 8


Never allow one member's logs to overwrite another member.


---

# Permissions

Team roles:

## Owner
Can:
- Create team
- Invite members
- Remove members
- Edit programs
- Assign editors
- View progress

## Editor
Can:
- Modify team workouts
- Adjust programming

## Member
Can:
- View workouts
- Log their own performance


---

# Training Module

Current priority:
Build a complete strength training MVP before expanding.

A workout contains:

## Mobility / Prep

Examples:
- Mobility drills
- Activation
- Correctives


## Plyometrics / Power

Examples:
- Box jumps
- Med ball throws
- Explosive movements


## Strength

Exercises contain:

- Exercise name
- Muscle groups
- Order
- Sets
- Set type
- Target reps
- Target weight
- Target RPE


Set types:

WU = Warm up
WK = Working
BO = Back off
DS = Drop set
AM = AMRAP


Users log:

- Actual weight
- Actual reps
- Actual RPE
- Notes


---

# Program Editing Rules

When changing a workout, always provide scope:

Options:

1. This workout only
2. This week only
3. This week and future weeks
4. Entire program


Default:

This week and future weeks


Applies to:

- Adding exercises
- Removing exercises
- Editing exercises
- Reordering
- Adding sets
- Removing sets


---

# Progression System

The system should remember previous performance.

When user opens a workout:

Show:

Previous:
Bench Press
185 x 8

Current suggestion:
190 x 8

Progression should consider:

- Previous performance
- Goal
- RPE
- Completion
- Recovery


---

# Workout Generation

AI generated plans should consider:

User profile:
- Age
- Gender
- Height
- Weight
- Goals
- Experience level
- Injuries
- Equipment available
- Schedule


Before workouts:

Ask readiness:

Examples:

How are you feeling?

Energy:
1-5

Soreness:
1-5

Injuries:
Yes/No

AI may adjust:

- Exercise choice
- Volume
- Intensity
- Load


---

# Dashboard Module

Future dashboard includes:

Training:
- Weekly volume
- Strength trends
- PRs
- Completed workouts

Nutrition:
- Calories
- Protein
- Carbs
- Fat

Body:
- Weight
- Measurements
- Photos
- Body composition

Wearables:
- Steps
- Heart rate
- Sleep
- Recovery


---

# Nutrition Module

Goal:
Replace original macro tracker.

Features:

Daily tracking:

- Calories
- Protein
- Carbs
- Fat


Meals:

- Breakfast
- Lunch
- Dinner
- Snacks


Future AI:

User enters:

"6 ounces chicken breast and rice"

AI estimates:

Calories
Protein
Carbs
Fat


Future:

- Barcode scanning
- Food database
- Saved foods
- Meal plans


---

# Wearable Integration

Future integrations:

Apple Health
Garmin

Import:

- Steps
- Calories burned
- Sleep
- HRV
- Heart rate
- Activity


---

# Development Rules For AI Agents

Before coding:

1. Understand existing database
2. Preserve existing data
3. Do not remove features without approval
4. Maintain mobile-first design
5. Keep team/personal separation
6. Keep UI simple


Prefer:

- Small updates
- Incremental commits
- Testing before production


Avoid:

- Large rewrites
- Breaking database schema
- Removing user history


---

# Product Goal

BuildIQ Health should feel like:

A personal trainer
A nutrition coach
A recovery coach

inside one app.

The user should never wonder:

"What should I do today?"

BuildIQ Health answers that.
