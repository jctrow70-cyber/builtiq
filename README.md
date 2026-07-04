# BuiltIQ v0.5.2 — Individual Lift History

This update fixes week-to-week strength tracking for team members.

## What changed
- Each user/team member sees their own previous logged weights and reps.
- Workout rows show previous values as placeholders:
  - `last 185`
  - `last 8`
- Each exercise shows a "Last time" summary.
- Progress tab displays individual lift history for the signed-in user.
- Team plan structure remains shared.
- Actual logs remain individual by user.

## Important
This does not overwrite anyone else's numbers. Jesse, wife, and son each log and view their own history.

## Database
No schema change from v0.5.1.

## Install
1. Replace repo files.
2. Commit/push.
3. Redeploy Vercel.
4. Hard refresh.
