-- BIQ-0239: Group program edits follow current membership, not st_programs.owner_user_id.
-- Personal programs, including just-me forks, stay with their personal owner.
-- Apply this if 20261005_054 was already applied before this policy correction.
-- A fresh apply of the revised 054 already contains the same program update policy.

create or replace function public.st_user_can_edit_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_programs p
    where p.id = p_program_id
      and (
        (p.visibility = 'personal' and p.owner_user_id = auth.uid())
        or (p.visibility = 'team' and public.st_user_can_edit_shared_program(p.team_id))
      )
  );
$$;

comment on function public.st_user_can_edit_program(uuid) is
  'Personal: the personal owner, including a just-me fork. Group template: current owner, manager, or a member whose group allows shared edits. st_programs.owner_user_id does not authorize a group template.';

drop policy if exists "programs_update_editor" on public.st_programs;
create policy "programs_update_editor" on public.st_programs
  for update
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_edit_shared_program(team_id))
  )
  with check (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_edit_shared_program(team_id))
  );

drop policy if exists "muscle_weekly_targets_write" on public.st_muscle_weekly_targets;
create policy "muscle_weekly_targets_write" on public.st_muscle_weekly_targets
  for insert
  with check (public.st_user_can_edit_program(program_id));
