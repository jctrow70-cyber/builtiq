-- BIQ-0053 Program draft / publish lifecycle

alter table public.st_programs
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'published', 'archived'));

comment on column public.st_programs.status is
  'draft = owner/manager only; published = available for training and group default';

update public.st_programs set status = 'published' where status is null;

-- Draft team programs: only owners/managers may read; members see published only.
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
        or (p.visibility = 'team' and public.st_user_is_active_team_member(p.team_id))
      )
      and (
        coalesce(p.status, 'published') = 'published'
        or (p.visibility = 'personal' and p.owner_user_id = auth.uid())
        or (p.visibility = 'team' and public.st_user_can_edit_team(p.team_id))
      )
  );
$$;

drop policy if exists "programs_read" on public.st_programs;

create policy "programs_read" on public.st_programs
  for select
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (
      visibility = 'team'
      and public.st_user_is_active_team_member(team_id)
      and (
        coalesce(status, 'published') = 'published'
        or public.st_user_can_edit_team(team_id)
      )
    )
  );
