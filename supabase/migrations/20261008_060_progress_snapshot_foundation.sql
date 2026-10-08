-- BIQ-0250: Progress snapshot foundation
-- Additive. Does not drop logs, rewrite existing snapshot text, or delete measurements.

alter table public.st_set_logs
  add column if not exists snapshot_movement_pattern text,
  add column if not exists snapshot_muscle_credits jsonb,
  add column if not exists snapshot_variant text,
  add column if not exists snapshot_provenance jsonb;

comment on column public.st_set_logs.snapshot_movement_pattern is
  'Movement pattern copied when the set was first logged.';
comment on column public.st_set_logs.snapshot_muscle_credits is
  'Resolved muscle credits copied when the set was first logged. Effective-set math treats these as estimates.';
comment on column public.st_set_logs.snapshot_variant is
  'Meaningful variant such as unilateral. Empty when the catalog exercise and equipment already identify the series.';
comment on column public.st_set_logs.snapshot_provenance is
  'Internal data-quality labels: snapshotted, backfilled, estimated, or unknown.';

-- Keep the catalog id that was logged even if that catalog row is later removed.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'st_set_logs'
      and con.contype = 'f'
      and pg_get_constraintdef(con.oid) ilike '%snapshot_catalog_exercise_id%'
  loop
    execute format('alter table public.st_set_logs drop constraint %I', constraint_name);
  end loop;
end $$;

-- Equipment options from the catalog. Distinct, case-insensitive.
create or replace function public.st_catalog_equipment_options(p_equipment text, p_meta jsonb)
returns text[]
language plpgsql
immutable
as $$
declare
  result text[] := '{}';
  item text;
  elem jsonb;
begin
  if p_equipment is not null and length(trim(p_equipment)) > 0 then
    result := array_append(result, trim(p_equipment));
  end if;
  if p_meta is null then
    return public.st_distinct_text(result);
  end if;

  if jsonb_typeof(p_meta->'default_equipment') = 'string' then
    item := nullif(trim(p_meta->>'default_equipment'), '');
    if item is not null then
      result := array_append(result, item);
    end if;
  elsif jsonb_typeof(p_meta->'default_equipment') = 'array' then
    for elem in select jsonb_array_elements(p_meta->'default_equipment')
    loop
      item := nullif(trim(elem #>> '{}'), '');
      if item is not null then
        result := array_append(result, item);
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_meta->'compatible_equipment') = 'array' then
    for elem in select jsonb_array_elements(p_meta->'compatible_equipment')
    loop
      item := nullif(trim(elem #>> '{}'), '');
      if item is not null then
        result := array_append(result, item);
      end if;
    end loop;
  elsif jsonb_typeof(p_meta->'compatible_equipment') = 'string' then
    item := nullif(trim(p_meta->>'compatible_equipment'), '');
    if item is not null then
      result := array_append(result, item);
    end if;
  end if;

  return public.st_distinct_text(result);
end;
$$;

create or replace function public.st_distinct_text(p_values text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(val order by lower(val)), '{}'::text[])
  from (
    select distinct on (lower(val)) val
    from unnest(coalesce(p_values, '{}'::text[])) as val
    where val is not null and length(trim(val)) > 0
    order by lower(val), val
  ) deduped;
$$;

-- Mirrors lib/progress/equipmentBackfill.ts. Do not guess an implement that the name does not name.
create or replace function public.st_infer_snapshot_equipment(
  p_existing text,
  p_name text,
  p_options text[]
)
returns jsonb
language plpgsql
immutable
as $$
declare
  existing text := nullif(trim(coalesce(p_existing, '')), '');
  name_l text := lower(coalesce(p_name, ''));
  opt text;
  hits text[] := '{}';
  longest text;
  contained boolean := true;
  other text;
begin
  if existing is not null then
    return jsonb_build_object('equipment', existing, 'provenance', 'snapshotted', 'detail', 'existing');
  end if;

  if p_options is not null then
    foreach opt in array p_options loop
      if opt is not null and length(trim(opt)) > 0 and position(lower(trim(opt)) in name_l) > 0 then
        hits := array_append(hits, trim(opt));
      end if;
    end loop;
  end if;

  if coalesce(cardinality(hits), 0) > 1 then
    select h into longest from unnest(hits) as h order by length(h) desc, h limit 1;
    foreach other in array hits loop
      if lower(other) <> lower(longest) and position(lower(other) in lower(longest)) = 0 then
        contained := false;
      end if;
    end loop;
    if contained then
      hits := array[longest];
    end if;
  end if;

  if coalesce(cardinality(hits), 0) = 1 then
    return jsonb_build_object('equipment', hits[1], 'provenance', 'backfilled', 'detail', 'logged_name');
  end if;

  if p_options is not null and cardinality(p_options) = 1 and length(trim(coalesce(p_options[1], ''))) > 0 then
    return jsonb_build_object('equipment', trim(p_options[1]), 'provenance', 'backfilled', 'detail', 'single_implement');
  end if;

  return jsonb_build_object('equipment', null, 'provenance', 'unknown', 'detail', 'unspecified');
end;
$$;

-- Weights must match SCIENCE_RULES_V1: primary 1, secondary 0.5, minor 0.25.
-- Explicit hypertrophy_volume_credits win. Name guesses are not applied here.
create or replace function public.st_estimated_muscle_credits(p_meta jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  credits jsonb := '[]'::jsonb;
  elem jsonb;
begin
  if p_meta is null then
    return null;
  end if;
  if jsonb_typeof(p_meta->'hypertrophy_volume_credits') = 'array'
     and jsonb_array_length(p_meta->'hypertrophy_volume_credits') > 0 then
    for elem in select jsonb_array_elements(p_meta->'hypertrophy_volume_credits')
    loop
      if nullif(elem->>'muscle', '') is not null and (elem->>'credit') ~ '^[0-9]+(\.[0-9]+)?$' then
        credits := credits || jsonb_build_array(jsonb_build_object(
          'muscle', elem->>'muscle',
          'contribution', (elem->>'credit')::numeric
        ));
      end if;
    end loop;
    if jsonb_array_length(credits) > 0 then
      return credits;
    end if;
  end if;

  credits := '[]'::jsonb;
  if jsonb_typeof(p_meta->'primary_muscles') = 'array' then
    for elem in select jsonb_array_elements(p_meta->'primary_muscles')
    loop
      if nullif(elem #>> '{}', '') is not null then
        credits := credits || jsonb_build_array(jsonb_build_object('muscle', elem #>> '{}', 'contribution', 1));
      end if;
    end loop;
  end if;
  if jsonb_typeof(p_meta->'secondary_muscles') = 'array' then
    for elem in select jsonb_array_elements(p_meta->'secondary_muscles')
    loop
      if nullif(elem #>> '{}', '') is not null
         and not exists (
           select 1 from jsonb_array_elements(credits) existing
           where lower(existing->>'muscle') = lower(elem #>> '{}')
         ) then
        credits := credits || jsonb_build_array(jsonb_build_object('muscle', elem #>> '{}', 'contribution', 0.5));
      end if;
    end loop;
  end if;
  if jsonb_typeof(p_meta->'minor_muscles') = 'array' then
    for elem in select jsonb_array_elements(p_meta->'minor_muscles')
    loop
      if nullif(elem #>> '{}', '') is not null
         and not exists (
           select 1 from jsonb_array_elements(credits) existing
           where lower(existing->>'muscle') = lower(elem #>> '{}')
         ) then
        credits := credits || jsonb_build_array(jsonb_build_object('muscle', elem #>> '{}', 'contribution', 0.25));
      end if;
    end loop;
  end if;
  if jsonb_array_length(credits) = 0 then
    return null;
  end if;
  return credits;
end;
$$;

-- Fill blanks only. Existing equipment, pattern, and credit snapshots stay as written.
update public.st_set_logs sl
set
  snapshot_equipment = case
    when nullif(trim(coalesce(sl.snapshot_equipment, '')), '') is not null then sl.snapshot_equipment
    else computed.inferred->>'equipment'
  end,
  snapshot_movement_pattern = coalesce(
    nullif(trim(sl.snapshot_movement_pattern), ''),
    nullif(trim(computed.movement_pattern), '')
  ),
  snapshot_muscle_credits = coalesce(sl.snapshot_muscle_credits, public.st_estimated_muscle_credits(computed.coaching_metadata)),
  snapshot_provenance = coalesce(sl.snapshot_provenance, '{}'::jsonb) || jsonb_build_object(
    'equipment', computed.inferred->>'provenance',
    'equipmentDetail', computed.inferred->>'detail',
    'movementPattern', case
      when nullif(trim(coalesce(sl.snapshot_movement_pattern, '')), '') is not null then 'snapshotted'
      when nullif(trim(coalesce(computed.movement_pattern, '')), '') is not null then 'estimated'
      else 'unknown'
    end,
    'muscleCredits', case
      when sl.snapshot_muscle_credits is not null then 'snapshotted'
      when public.st_estimated_muscle_credits(computed.coaching_metadata) is not null then 'estimated'
      else 'unknown'
    end,
    'variant', 'unknown'
  )
from (
  select
    source.id,
    c.movement_pattern,
    c.coaching_metadata,
    inference.inferred
  from public.st_set_logs source
  left join public.st_exercise_catalog c on c.id = source.snapshot_catalog_exercise_id
  cross join lateral (
    select public.st_infer_snapshot_equipment(
      source.snapshot_equipment,
      source.snapshot_exercise_name,
      public.st_catalog_equipment_options(c.equipment, c.coaching_metadata)
    ) as inferred
  ) inference
) computed
where sl.id = computed.id
  and (
    sl.snapshot_provenance is null
    or not (sl.snapshot_provenance ? 'equipment')
  );

-- After this trigger, an ordinary set update cannot rewrite snapshot identity.
-- A later conservative backfill may set st.allow_snapshot_backfill = on for that transaction.
create or replace function public.st_set_logs_preserve_snapshots()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('st.allow_snapshot_backfill', true), '') = 'on' then
    return new;
  end if;
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
  return new;
end;
$$;

drop trigger if exists st_set_logs_preserve_snapshots on public.st_set_logs;
create trigger st_set_logs_preserve_snapshots
  before update on public.st_set_logs
  for each row execute function public.st_set_logs_preserve_snapshots();

create or replace function public.st_progress_snapshot_provenance_counts()
returns table(field text, provenance text, detail text, sets bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select 'equipment'::text,
    snapshot_provenance->>'equipment',
    snapshot_provenance->>'equipmentDetail',
    count(*)
  from public.st_set_logs
  group by 2, 3
  union all
  select 'movement_pattern'::text,
    snapshot_provenance->>'movementPattern',
    null::text,
    count(*)
  from public.st_set_logs
  group by 2
  union all
  select 'muscle_credits'::text,
    snapshot_provenance->>'muscleCredits',
    null::text,
    count(*)
  from public.st_set_logs
  group by 2;
$$;

-- Body measurements. Existing weight and waist rows stay valid.
alter table public.st_body_measurements
  add column if not exists chest_inches numeric,
  add column if not exists arm_inches numeric,
  add column if not exists thigh_inches numeric,
  add column if not exists hip_inches numeric,
  add column if not exists neck_inches numeric,
  add column if not exists body_fat_percent numeric,
  add column if not exists measurement_extras jsonb;

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_has_value;

alter table public.st_body_measurements
  add constraint st_body_measurements_has_value check (
    weight_lbs is not null
    or waist_inches is not null
    or chest_inches is not null
    or arm_inches is not null
    or thigh_inches is not null
    or hip_inches is not null
    or neck_inches is not null
    or body_fat_percent is not null
    or (measurement_extras is not null and measurement_extras <> '{}'::jsonb)
  );

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_chest_positive;
alter table public.st_body_measurements
  add constraint st_body_measurements_chest_positive check (chest_inches is null or chest_inches > 0);

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_arm_positive;
alter table public.st_body_measurements
  add constraint st_body_measurements_arm_positive check (arm_inches is null or arm_inches > 0);

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_thigh_positive;
alter table public.st_body_measurements
  add constraint st_body_measurements_thigh_positive check (thigh_inches is null or thigh_inches > 0);

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_hip_positive;
alter table public.st_body_measurements
  add constraint st_body_measurements_hip_positive check (hip_inches is null or hip_inches > 0);

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_neck_positive;
alter table public.st_body_measurements
  add constraint st_body_measurements_neck_positive check (neck_inches is null or neck_inches > 0);

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_body_fat_range;
alter table public.st_body_measurements
  add constraint st_body_measurements_body_fat_range check (
    body_fat_percent is null or (body_fat_percent > 0 and body_fat_percent <= 100)
  );

comment on column public.st_body_measurements.measurement_extras is
  'Optional future measurements keyed by the body measurement registry. Standard fields stay in their own columns.';
