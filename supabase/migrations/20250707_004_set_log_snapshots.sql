-- BIQ-0003: Workout history stability via set log snapshots
-- Safe additive migration. Does not drop tables or delete data.

alter table public.st_set_logs
  add column if not exists snapshot_exercise_name text,
  add column if not exists snapshot_muscle_group text,
  add column if not exists snapshot_section text,
  add column if not exists snapshot_set_type text,
  add column if not exists snapshot_set_number int,
  add column if not exists snapshot_target_weight text,
  add column if not exists snapshot_target_reps text,
  add column if not exists snapshot_target_rpe text,
  add column if not exists snapshot_day_label text,
  add column if not exists snapshot_workout_type text;

-- Backfill snapshots for existing logs where the template chain still exists.
update public.st_set_logs sl
set
  snapshot_exercise_name = e.name,
  snapshot_muscle_group = e.muscle_group,
  snapshot_section = coalesce(e.section, 'strength'),
  snapshot_set_type = ps.set_type,
  snapshot_set_number = ps.set_number,
  snapshot_target_weight = ps.target_weight,
  snapshot_target_reps = ps.target_reps,
  snapshot_target_rpe = ps.target_rpe,
  snapshot_day_label = w.day_label,
  snapshot_workout_type = w.workout_type
from public.st_planned_sets ps
join public.st_exercises e on e.id = ps.exercise_id
join public.st_workouts w on w.id = e.workout_id
where sl.planned_set_id = ps.id
  and sl.snapshot_exercise_name is null;

-- Preserve completed logs when planned sets are removed from templates.
alter table public.st_set_logs drop constraint if exists st_set_logs_planned_set_id_fkey;
alter table public.st_set_logs alter column planned_set_id drop not null;
alter table public.st_set_logs
  add constraint st_set_logs_planned_set_id_fkey
  foreign key (planned_set_id) references public.st_planned_sets(id) on delete set null;

create or replace function public.st_user_can_access_set_log(
  p_planned_set_id uuid,
  p_snapshot_exercise_name text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      p_planned_set_id is not null
      and public.st_user_can_read_planned_set(p_planned_set_id)
    )
    or coalesce(length(trim(p_snapshot_exercise_name)), 0) > 0;
$$;

drop policy if exists "set_logs_select" on public.st_set_logs;
drop policy if exists "set_logs_insert" on public.st_set_logs;
drop policy if exists "set_logs_update" on public.st_set_logs;
drop policy if exists "set_logs_delete" on public.st_set_logs;

create policy "set_logs_select" on public.st_set_logs
  for select
  using (
    user_id = auth.uid()
    and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
  );

create policy "set_logs_insert" on public.st_set_logs
  for insert
  with check (
    user_id = auth.uid()
    and planned_set_id is not null
    and public.st_user_can_read_planned_set(planned_set_id)
    and coalesce(length(trim(snapshot_exercise_name)), 0) > 0
  );

create policy "set_logs_update" on public.st_set_logs
  for update
  using (
    user_id = auth.uid()
    and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
  )
  with check (
    user_id = auth.uid()
    and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
  );

create policy "set_logs_delete" on public.st_set_logs
  for delete
  using (
    user_id = auth.uid()
    and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
  );
