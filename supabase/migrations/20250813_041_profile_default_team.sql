-- BIQ-0116: Remember preferred group when user belongs to multiple teams

alter table public.st_profiles
  add column if not exists default_team_id uuid references public.st_teams (id) on delete set null;

comment on column public.st_profiles.default_team_id is
  'Preferred group for Training and Groups when the user belongs to multiple teams.';

create index if not exists st_profiles_default_team_idx
  on public.st_profiles (default_team_id)
  where default_team_id is not null;
