-- BIQ-0089: Own set logs always visible on Progress
-- Safe additive migration. Does not delete data.
--
-- Progress loads st_set_logs for the signed-in user. The previous SELECT policy
-- also required st_user_can_access_set_log(planned_set_id, snapshot_exercise_name).
-- After a group program replace, planned_set_id can be NULL and some older rows
-- may lack snapshots — those logs disappeared from Progress even though they
-- still belonged to the user. UPDATE already allowed user_id = auth.uid();
-- SELECT now matches that ownership rule.

drop policy if exists "set_logs_select" on public.st_set_logs;

create policy "set_logs_select" on public.st_set_logs
  for select
  using (
    user_id = auth.uid()
    or (
      public.st_user_can_coach_read_member_log(user_id)
      and (
        public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
        or coalesce(length(trim(snapshot_exercise_name)), 0) > 0
        or completed = true
        or coalesce(length(trim(actual_weight::text)), 0) > 0
        or coalesce(length(trim(actual_reps::text)), 0) > 0
      )
    )
  );

comment on policy "set_logs_select" on public.st_set_logs is
  'Users always read their own set logs; coaches read teammate logs with snapshot/performance evidence.';
