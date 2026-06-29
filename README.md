# BuiltIQ V4 Platform

This rebuild changes the app foundation.

## Major changes

- No forced household/team creation
- New user flow:
  - Start Personal
  - Join Exercise Team
  - Create Exercise Team
- Household renamed to Exercise Team
- Personal plans and Team plans are separate
- Team plans are visible to team members
- Each person logs their own sets/progress
- Team page with invite code and member list
- Training supports:
  - mobility warm-up
  - plyometric warm-up
  - strength
  - supersets through group labels
  - editable/removable exercises
  - editable/removable set rows
  - set type dropdown
  - cardio finisher
  - ab finisher
- Dashboard, Nutrition, Body Comp, Exercise Team, Settings

## Update steps

1. Unzip this package.
2. Replace the files in your GitHub repo root.
3. Commit and push.
4. In Supabase SQL Editor, run `supabase-v4-schema.sql`.
5. Redeploy in Vercel.
6. Hard refresh the app.
7. Existing users may need to go through the new Welcome screen once.

## Important

This version uses new tables:
- exercise_teams
- exercise_team_members

It no longer depends on households/household_members.
