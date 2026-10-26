-- BIQ-0264 Phase 2B.2 group timezone.
-- Apply manually. Not applied to hosted Supabase by this change.
-- Do not edit migrations 068, 069, 070, or 071.
-- Existing groups stay null. There is no UTC backfill.
-- Group creation can omit the column. A later UI will require an IANA name for new groups.
-- The bulk schedule function in 072 requires a non-null value. Single-member schedule
-- functions do not read this column, so a null group timezone does not change them.

begin;

alter table public.st_teams
  add column if not exists timezone text;

comment on column public.st_teams.timezone is
  'IANA group calendar timezone. Null until an owner chooses one. UTC or an Area/City name in pg_timezone_names. Abbreviations are rejected. Bulk schedule changes require a value.';

create or replace function public.st_teams_reject_invalid_timezone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.timezone is null then
    return new;
  end if;
  if btrim(new.timezone) = '' then
    raise exception 'Invalid group timezone';
  end if;
  if new.timezone = 'UTC' then
    return new;
  end if;
  if position('/' in new.timezone) = 0
     or not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid group timezone';
  end if;
  return new;
end;
$$;

comment on function public.st_teams_reject_invalid_timezone() is
  'Rejects group timezone abbreviations and unknown names. Null remains allowed. Execute stays available to table writers because PostgreSQL requires it to fire the trigger.';

drop trigger if exists st_teams_reject_invalid_timezone on public.st_teams;
create trigger st_teams_reject_invalid_timezone
before insert or update of timezone on public.st_teams
for each row
execute function public.st_teams_reject_invalid_timezone();

commit;
