-- BIQ-0262 Phase 6 assigner visibility
-- Apply manually after 20261012_064_workout_reschedule.sql. Do not run this from the app.
-- An authorized assigner can already change another member's group schedule.
-- This lets that person read the group enrollment and group expectations needed to see the calendar.
-- Personal enrollments and personal expectations stay private.

drop policy if exists "training_enrollments_select" on public.st_training_enrollments;
create policy "training_enrollments_select" on public.st_training_enrollments
  for select using (
    user_id = auth.uid()
    or (team_id is not null and public.st_user_can_edit_team(team_id))
    or (
      source_kind = 'group'
      and source_key <> 'personal'
      and team_id is not null
      and public.st_user_can_assign_in_group(team_id)
    )
  );

drop policy if exists "training_expectations_select" on public.st_training_expectations;
create policy "training_expectations_select" on public.st_training_expectations
  for select using (
    user_id = auth.uid()
    or (team_id is not null and public.st_user_can_edit_team(team_id))
    or (
      source_key like 'group:%'
      and source_key <> 'personal'
      and public.st_user_can_edit_team(substring(source_key from 7)::uuid)
    )
    or (
      source_key like 'group:%'
      and source_key <> 'personal'
      and team_id is not null
      and public.st_user_can_assign_in_group(team_id)
    )
  );
