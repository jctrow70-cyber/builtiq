-- BIQ-0076: Allow owners/editors to delete personal and team programs

drop policy if exists "programs_delete" on public.st_programs;

create policy "programs_delete" on public.st_programs
  for delete
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and team_id is not null and public.st_user_can_edit_team(team_id))
  );
