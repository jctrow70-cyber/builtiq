-- BIQ-0263 Quick Join trigger fix. Approved, not yet applied.
-- Run this whole file once in the Supabase SQL Editor. It is safe to run again.
-- It replaces trigger functions only. It does not update existing groups or Quick Join rows.
-- The foreign key st_group_quick_join_team_id_fkey is left immediate.

create or replace function public.st_teams_seal_quick_join_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_real text;
  v_decoy text;
  v_key text;
begin
  if new.id is null then
    raise exception 'Group id was not assigned';
  end if;
  v_real := upper(trim(new.invite_code));
  if v_real is null or v_real = '' then
    v_real := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  v_decoy := 'DQ' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14));
  v_key := 'st.qj_' || replace(new.id::text, '-', '');
  perform set_config(v_key, v_real, true);
  new.invite_code := v_decoy;
  return new;
end;
$$;

create or replace function public.st_teams_store_quick_join_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_code text;
begin
  if new.id is null then
    raise exception 'Group id was not assigned';
  end if;
  v_key := 'st.qj_' || replace(new.id::text, '-', '');
  v_code := current_setting(v_key, true);
  if coalesce(v_code, '') = '' then
    raise exception 'Quick Join code was not prepared for this group';
  end if;
  if v_code = new.invite_code then
    raise exception 'Quick Join code matched the public team code';
  end if;
  insert into public.st_group_quick_join (team_id, code, enabled)
  values (new.id, v_code, true);
  perform set_config(v_key, '', true);
  return null;
end;
$$;

revoke all on function public.st_teams_seal_quick_join_code() from public, anon, authenticated;
revoke all on function public.st_teams_store_quick_join_code() from public, anon, authenticated;

drop trigger if exists st_teams_seal_quick_join_code on public.st_teams;
create trigger st_teams_seal_quick_join_code
  before insert on public.st_teams
  for each row execute function public.st_teams_seal_quick_join_code();

drop trigger if exists st_teams_store_quick_join_code on public.st_teams;
create trigger st_teams_store_quick_join_code
  after insert on public.st_teams
  for each row execute function public.st_teams_store_quick_join_code();
