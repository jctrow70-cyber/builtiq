-- BIQ-0296 Planned set type corrections.
-- Not applied to hosted Supabase by this change.
-- A client cannot open the snapshot lock by setting a session flag.
-- The lock opens only while this function holds a nonce row for auth.uid().

begin;

create table if not exists public.st_set_type_correction_nonce (
  nonce uuid primary key,
  caller uuid not null,
  created_at timestamptz not null default now()
);

alter table public.st_set_type_correction_nonce enable row level security;
revoke all on table public.st_set_type_correction_nonce from public, anon, authenticated;

create or replace function public.st_set_type_correction_authorized()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.st_set_type_correction_nonce n
    where n.caller = auth.uid()
      and n.nonce::text = nullif(current_setting('st.set_type_correction_nonce', true), '')
  );
$$;

revoke all on function public.st_set_type_correction_authorized() from public, anon, authenticated;
grant execute on function public.st_set_type_correction_authorized() to authenticated;

create or replace function public.st_prevent_logged_planned_set_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if not public.st_planned_set_has_performance(old.id) then
    return new;
  end if;
  if (
    new.target_weight,
    new.target_reps,
    new.target_rpe,
    new.target_rir,
    new.rep_min,
    new.rep_max,
    new.rest_seconds,
    new.set_number
  ) is distinct from (
    old.target_weight,
    old.target_reps,
    old.target_rpe,
    old.target_rir,
    old.rep_min,
    old.rep_max,
    old.rest_seconds,
    old.set_number
  ) then
    raise exception 'Cannot rewrite a planned prescription after that set has been logged.';
  end if;
  if new.set_type is distinct from old.set_type
     and not public.st_set_type_correction_authorized() then
    raise exception 'Cannot rewrite a planned prescription after that set has been logged.';
  end if;
  return new;
end;
$$;

create or replace function public.st_set_logs_preserve_snapshots()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  incoming_set_type text;
begin
  if coalesce(current_setting('st.allow_snapshot_backfill', true), '') = 'on' then
    return new;
  end if;
  incoming_set_type := new.snapshot_set_type;
  new.snapshot_exercise_name := old.snapshot_exercise_name;
  new.snapshot_catalog_exercise_id := old.snapshot_catalog_exercise_id;
  new.snapshot_superset_group_id := old.snapshot_superset_group_id;
  new.snapshot_muscle_group := old.snapshot_muscle_group;
  new.snapshot_equipment := old.snapshot_equipment;
  new.snapshot_section := old.snapshot_section;
  new.snapshot_exercise_type := old.snapshot_exercise_type;
  new.snapshot_set_type := old.snapshot_set_type;
  new.snapshot_set_number := old.snapshot_set_number;
  new.snapshot_target_weight := old.snapshot_target_weight;
  new.snapshot_target_reps := old.snapshot_target_reps;
  new.snapshot_target_rpe := old.snapshot_target_rpe;
  new.snapshot_day_label := old.snapshot_day_label;
  new.snapshot_workout_type := old.snapshot_workout_type;
  new.snapshot_week := old.snapshot_week;
  new.snapshot_day_order := old.snapshot_day_order;
  new.snapshot_target_rir := old.snapshot_target_rir;
  new.snapshot_rep_min := old.snapshot_rep_min;
  new.snapshot_rep_max := old.snapshot_rep_max;
  new.snapshot_program_role := old.snapshot_program_role;
  new.snapshot_rest_seconds := old.snapshot_rest_seconds;
  new.snapshot_movement_pattern := old.snapshot_movement_pattern;
  new.snapshot_muscle_credits := old.snapshot_muscle_credits;
  new.snapshot_variant := old.snapshot_variant;
  new.snapshot_provenance := old.snapshot_provenance;
  if new.user_id = auth.uid() and public.st_set_type_correction_authorized() then
    new.snapshot_set_type := incoming_set_type;
  end if;
  return new;
end;
$$;

create or replace function public.st_require_planned_set_edit(p_planned_set_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  requested integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before changing sets. Nothing was changed.';
  end if;
  if p_planned_set_ids is null or cardinality(p_planned_set_ids) = 0 then
    raise exception 'Choose a set. Nothing was changed.';
  end if;
  if cardinality(p_planned_set_ids) > 100 then
    raise exception 'Too many sets in one change. Nothing was changed.';
  end if;
  select count(distinct wanted.id)
    into requested
  from unnest(p_planned_set_ids) as wanted(id);
  if exists (
    select 1
    from unnest(p_planned_set_ids) as wanted(id)
    where not exists (
      select 1
      from public.st_planned_sets ps
      join public.st_exercises e on e.id = ps.exercise_id
      join public.st_workouts w on w.id = e.workout_id
      where ps.id = wanted.id
        and public.st_user_can_edit_program(w.program_id)
    )
  ) or (
    select count(distinct ps.id)
    from public.st_planned_sets ps
    where ps.id = any(p_planned_set_ids)
  ) is distinct from requested then
    raise exception 'You cannot edit one of those sets. Nothing was changed.';
  end if;
end;
$$;

revoke all on function public.st_require_planned_set_edit(uuid[]) from public, anon, authenticated;

create or replace function public.st_correct_planned_set_type(
  p_planned_set_ids uuid[],
  p_set_type text,
  p_log_date date
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_nonce uuid;
begin
  if p_set_type not in ('warmup', 'working', 'backoff', 'dropset', 'amrap') then
    raise exception 'Choose a set type. Nothing was changed.';
  end if;
  perform public.st_require_planned_set_edit(p_planned_set_ids);
  v_nonce := pg_catalog.gen_random_uuid();
  insert into public.st_set_type_correction_nonce (nonce, caller)
  values (v_nonce, auth.uid());
  perform pg_catalog.set_config('st.set_type_correction_nonce', v_nonce::text, true);
  update public.st_planned_sets
    set set_type = p_set_type
    where id = any(p_planned_set_ids);
  if p_log_date is not null then
    update public.st_set_logs
      set snapshot_set_type = p_set_type
      where planned_set_id = any(p_planned_set_ids)
        and user_id = auth.uid()
        and log_date = p_log_date
        and coalesce(is_extra_set, false) = false;
  end if;
  delete from public.st_set_type_correction_nonce where nonce = v_nonce;
exception
  when others then
    raise;
end;
$$;

create or replace function public.st_soft_delete_planned_sets(p_planned_set_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.st_require_planned_set_edit(p_planned_set_ids);
  update public.st_planned_sets
    set is_deleted = true
    where id = any(p_planned_set_ids);
end;
$$;

revoke all on function public.st_correct_planned_set_type(uuid[], text, date) from public, anon, authenticated;
grant execute on function public.st_correct_planned_set_type(uuid[], text, date) to authenticated;
revoke all on function public.st_soft_delete_planned_sets(uuid[]) from public, anon, authenticated;
grant execute on function public.st_soft_delete_planned_sets(uuid[]) to authenticated;

comment on function public.st_correct_planned_set_type(uuid[], text, date) is
  'BIQ-0296. Changes set type for sets the caller can edit, and this caller''s log snapshot on the given date. One unauthorized id fails the whole call.';

comment on function public.st_soft_delete_planned_sets(uuid[]) is
  'BIQ-0296. Soft-deletes planned sets the caller can edit. Does not delete st_set_logs.';

commit;
