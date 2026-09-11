-- BIQ-0174: Let group members read live program templates
-- Safe additive migration. Does not drop tables or delete data.
--
-- Programs lifecycle uses draft | published | scheduled | active | completed | archived.
-- Member RLS still only allowed status = 'published', so members could not load
-- active/scheduled/completed group plans that owners edit in Programs.
-- Draft and archived stay owner/editor-only for team programs.

create or replace function public.st_user_can_read_program(p_program_id uuid)
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
        or (
          p.visibility = 'team'
          and public.st_user_is_active_team_member(p.team_id)
          and (
            coalesce(p.status, 'published') in ('published', 'scheduled', 'active', 'completed')
            or public.st_user_can_edit_team(p.team_id)
          )
        )
      )
  );
$$;

comment on function public.st_user_can_read_program(uuid) is
  'True when the caller may read the program. Personal: owner only. Team: members see published/scheduled/active/completed; owners/editors also see draft/archived.';

drop policy if exists "programs_read" on public.st_programs;

create policy "programs_read" on public.st_programs
  for select
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (
      visibility = 'team'
      and public.st_user_is_active_team_member(team_id)
      and (
        coalesce(status, 'published') in ('published', 'scheduled', 'active', 'completed')
        or public.st_user_can_edit_team(team_id)
      )
    )
  );
